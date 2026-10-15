import type { Types } from 'mongoose';
import { BankTransaction } from '../models/BankTransaction.js';
import { Charge } from '../models/Charge.js';
import { Expense } from '../models/Expense.js';
import { AppError } from '../utils/AppError.js';

type Period = { from: string; to: string; months: string[]; start: Date; end: Date };
type PopulatedUnit = {
  _id: Types.ObjectId;
  quadra: string;
  numero: string;
  tipo: 'CASA' | 'LOTE';
  residentCurrentId: { name: string } | Types.ObjectId | null;
};
type ReportCharge = {
  _id: Types.ObjectId;
  unitId: PopulatedUnit | Types.ObjectId;
  competence: string;
  valueOriginal: number;
  valuePaid: number;
  openBalance: number;
  referenceDate: Date;
  status: string;
};
type ReportExpense = {
  categoryId: { _id: Types.ObjectId; name: string } | Types.ObjectId;
  bankTransactionId: { amount: number; direction: 'DEBIT' | 'CREDIT' } | Types.ObjectId | null;
  competence: string;
};
type ReportBankTransaction = {
  postingDate: Date;
  amount: number;
  direction: 'CREDIT' | 'DEBIT';
  processingStatus: 'UNMATCHED' | 'PARTIALLY_MATCHED' | 'MATCHED';
};

export async function buildFinancialReports(from?: string, to?: string) {
  const period = buildPeriod(from, to);
  const [charges, expenses, transactions] = await Promise.all([
    Charge.find({ competence: { $gte: period.from, $lte: period.to } })
      .populate({
        path: 'unitId',
        select: 'quadra numero tipo residentCurrentId',
        populate: { path: 'residentCurrentId', select: 'name' }
      })
      .lean<ReportCharge[]>(),
    Expense.find({ competence: { $gte: period.from, $lte: period.to } })
      .populate('categoryId', 'name')
      .populate('bankTransactionId', 'amount direction')
      .lean<ReportExpense[]>(),
    BankTransaction.find({ postingDate: { $gte: period.start, $lt: period.end } }).lean<ReportBankTransaction[]>()
  ]);

  return {
    period: { from: period.from, to: period.to, months: period.months },
    revenue: buildRevenueReport(charges, period.months),
    delinquency: buildDelinquencyReport(charges),
    unitPosition: buildUnitPositionReport(charges),
    expenses: buildExpenseReport(expenses),
    cashFlow: buildCashFlowReport(transactions, period.months),
    reconciliation: buildReconciliationReport(transactions)
  };
}

function buildRevenueReport(charges: ReportCharge[], months: string[]) {
  const byMonth = new Map(months.map((month) => [month, { month, forecast: 0, received: 0, pending: 0 }]));
  const totals = { forecast: 0, received: 0, pending: 0 };
  for (const charge of charges) {
    const month = byMonth.get(charge.competence);
    if (month) {
      month.forecast += charge.valueOriginal;
      month.received += charge.valuePaid;
      month.pending += charge.openBalance;
    }
    totals.forecast += charge.valueOriginal;
    totals.received += charge.valuePaid;
    totals.pending += charge.openBalance;
  }
  return { totals, byMonth: [...byMonth.values()] };
}

function buildDelinquencyReport(charges: ReportCharge[]) {
  const now = Date.now();
  const overdue = charges.filter((charge) => charge.openBalance > 0 && charge.referenceDate.getTime() < now);
  const byResident = new Map<string, { residentName: string; unitLabel: string; charges: number; amount: number; maxDaysOverdue: number }>();
  for (const charge of overdue) {
    const unit = populatedUnit(charge.unitId);
    const residentName = unit ? residentNameOf(unit) : 'Sem unidade';
    const unitLabel = unit ? unitLabelOf(unit) : 'Unidade não identificada';
    const key = `${residentName}|${unitLabel}`;
    const entry = byResident.get(key) ?? { residentName, unitLabel, charges: 0, amount: 0, maxDaysOverdue: 0 };
    entry.charges += 1;
    entry.amount += charge.openBalance;
    entry.maxDaysOverdue = Math.max(entry.maxDaysOverdue, daysOverdue(charge.referenceDate, now));
    byResident.set(key, entry);
  }
  const items = [...byResident.values()].sort((left, right) => right.amount - left.amount);
  return {
    totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
    peopleCount: items.length,
    chargesCount: overdue.length,
    items
  };
}

function buildUnitPositionReport(charges: ReportCharge[]) {
  const byUnit = new Map<string, { unitId: string; unitLabel: string; residentName: string; forecast: number; received: number; pending: number }>();
  for (const charge of charges) {
    const unit = populatedUnit(charge.unitId);
    if (!unit) continue;
    const key = String(unit._id);
    const entry = byUnit.get(key) ?? {
      unitId: key,
      unitLabel: unitLabelOf(unit),
      residentName: residentNameOf(unit),
      forecast: 0,
      received: 0,
      pending: 0
    };
    entry.forecast += charge.valueOriginal;
    entry.received += charge.valuePaid;
    entry.pending += charge.openBalance;
    byUnit.set(key, entry);
  }
  return [...byUnit.values()].sort((left, right) => right.pending - left.pending);
}

function buildExpenseReport(expenses: ReportExpense[]) {
  const byCategory = new Map<string, { categoryId: string; categoryName: string; amount: number; count: number }>();
  let amountUnavailableCount = 0;
  for (const expense of expenses) {
    const category = populatedCategory(expense.categoryId);
    const transaction = populatedTransaction(expense.bankTransactionId);
    if (!transaction) {
      amountUnavailableCount += 1;
      continue;
    }
    const key = category ? String(category._id) : 'uncategorized';
    const entry = byCategory.get(key) ?? {
      categoryId: category ? String(category._id) : key,
      categoryName: category?.name ?? 'Sem categoria',
      amount: 0,
      count: 0
    };
    entry.amount += transaction.amount;
    entry.count += 1;
    byCategory.set(key, entry);
  }
  const items = [...byCategory.values()].sort((left, right) => right.amount - left.amount);
  return { totalAmount: items.reduce((sum, item) => sum + item.amount, 0), amountUnavailableCount, items };
}

function buildCashFlowReport(transactions: ReportBankTransaction[], months: string[]) {
  const byMonth = new Map(months.map((month) => [month, { month, credits: 0, debits: 0, net: 0 }]));
  let totalCredits = 0;
  let totalDebits = 0;
  for (const transaction of transactions) {
    const month = byMonth.get(transaction.postingDate.toISOString().slice(0, 7));
    if (transaction.direction === 'CREDIT') {
      totalCredits += transaction.amount;
      if (month) month.credits += transaction.amount;
    } else {
      totalDebits += transaction.amount;
      if (month) month.debits += transaction.amount;
    }
    if (month) month.net = month.credits - month.debits;
  }
  return { totalCredits, totalDebits, net: totalCredits - totalDebits, byMonth: [...byMonth.values()] };
}

function buildReconciliationReport(transactions: ReportBankTransaction[]) {
  const byStatus = new Map(['UNMATCHED', 'PARTIALLY_MATCHED', 'MATCHED'].map((status) => [status, { status, count: 0, amount: 0 }]));
  for (const transaction of transactions) {
    const entry = byStatus.get(transaction.processingStatus);
    if (entry) {
      entry.count += 1;
      entry.amount += transaction.amount;
    }
  }
  return {
    totalTransactions: transactions.length,
    totalCredits: sumTransactions(transactions, 'CREDIT'),
    totalDebits: sumTransactions(transactions, 'DEBIT'),
    byStatus: [...byStatus.values()]
  };
}

function buildPeriod(from?: string, to?: string): Period {
  const current = new Date().toISOString().slice(0, 7);
  const startMonth = from ?? shiftMonth(current, -5);
  const endMonth = to ?? current;
  assertCompetenceFormat(startMonth);
  assertCompetenceFormat(endMonth);
  if (startMonth > endMonth) throw new AppError('Report start competence must be before end competence', 400);
  const months: string[] = [];
  for (let month = startMonth; month <= endMonth; month = shiftMonth(month, 1)) months.push(month);
  return {
    from: startMonth,
    to: endMonth,
    months,
    start: new Date(`${startMonth}-01T00:00:00.000Z`),
    end: new Date(`${shiftMonth(endMonth, 1)}-01T00:00:00.000Z`)
  };
}

function shiftMonth(value: string, offset: number) {
  const [year, month] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1 + offset, 1));
  return date.toISOString().slice(0, 7);
}

function assertCompetenceFormat(value: string) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new AppError('Report competence must use YYYY-MM format', 400);
}

function populatedUnit(value: ReportCharge['unitId']) {
  return value && typeof value === 'object' && 'quadra' in value ? value as PopulatedUnit : null;
}

function populatedCategory(value: ReportExpense['categoryId']) {
  return value && typeof value === 'object' && 'name' in value ? value as { _id: Types.ObjectId; name: string } : null;
}

function populatedTransaction(value: ReportExpense['bankTransactionId']) {
  return value && typeof value === 'object' && 'amount' in value ? value as { amount: number; direction: 'DEBIT' | 'CREDIT' } : null;
}

function residentNameOf(unit: PopulatedUnit) {
  return unit.residentCurrentId && typeof unit.residentCurrentId === 'object' && 'name' in unit.residentCurrentId
    ? unit.residentCurrentId.name
    : 'Sem morador';
}

function unitLabelOf(unit: PopulatedUnit) {
  return `${unit.quadra} ${unit.tipo === 'CASA' ? 'Casa' : 'Lote'} ${unit.numero}`;
}

function daysOverdue(referenceDate: Date, now: number) {
  return Math.max(0, Math.floor((now - referenceDate.getTime()) / 86_400_000));
}

function sumTransactions(transactions: ReportBankTransaction[], direction: ReportBankTransaction['direction']) {
  return transactions.reduce((sum, transaction) => sum + (transaction.direction === direction ? transaction.amount : 0), 0);
}
