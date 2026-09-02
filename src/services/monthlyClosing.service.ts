import type { FilterQuery, Types } from 'mongoose';
import { BankImport } from '../models/BankImport.js';
import { BankTransaction } from '../models/BankTransaction.js';
import { MonthlyClosing } from '../models/MonthlyClosing.js';
import { AppError } from '../utils/AppError.js';
import { competenceToDateRange } from '../utils/date.js';
import { writeAudit } from './audit.service.js';
import { buildDashboard } from './dashboard.service.js';

type ClosingFilters = { competence?: string; status?: 'OPEN' | 'CLOSED' };

export async function listMonthlyClosings(filters: ClosingFilters) {
  const query: FilterQuery<unknown> = {};
  if (filters.competence) query.competence = filters.competence;
  if (filters.status) query.status = filters.status;
  const items = await MonthlyClosing.find(query).sort({ competence: -1 });
  return { items };
}

export async function getMonthlyClosing(competence: string) {
  const item = await MonthlyClosing.findOne({ competence });
  if (!item) throw new AppError('Monthly closing not found', 404);
  return { item };
}

export async function upsertMonthlyClosing(competence: string, notes: string | null, userId: Types.ObjectId) {
  const [snapshot, bankSnapshot] = await Promise.all([
    buildDashboard(competence),
    buildBankSnapshot(competence)
  ]);
  const existing = await MonthlyClosing.findOne({ competence });
  const before = existing?.toObject() ?? null;
  const item = existing ?? new MonthlyClosing({ competence });
  item.set({
    status: item.status ?? 'OPEN',
    revenueForecast: snapshot.revenueForecast,
    revenueReceived: snapshot.revenueReceived,
    revenueReceivedBeforeRef: snapshot.revenueReceivedBeforeRef,
    revenueReceivedAfterRef: snapshot.revenueReceivedAfterRef,
    revenuePending: snapshot.revenuePending,
    pendingUnitsCount: snapshot.pendingUnitsCount,
    expenseForecast: snapshot.openCommitments + snapshot.expensePaid,
    expensePaid: bankSnapshot.bankOutflow,
    openingBankBalance: bankSnapshot.openingBankBalance,
    bankInflow: bankSnapshot.bankInflow,
    bankOutflow: bankSnapshot.bankOutflow,
    closingBankBalance: bankSnapshot.closingBankBalance,
    openCommitments: snapshot.openCommitments,
    availableBalance: bankSnapshot.closingBankBalance - snapshot.openCommitments,
    notes
  });
  await item.save();
  await writeAudit({
    userId,
    action: before ? 'MONTHLY_CLOSING_UPDATED' : 'MONTHLY_CLOSING_CREATED',
    entityType: 'MonthlyClosing',
    entityId: String(item._id),
    before,
    after: item.toObject()
  });
  return { item };
}

async function buildBankSnapshot(competence: string) {
  const { start, end } = competenceToDateRange(competence);
  const [transactions, openingImport, closingImport] = await Promise.all([
    BankTransaction.find({
      $or: [
        { operationDate: { $gte: start, $lte: end } },
        { operationDate: null, postingDate: { $gte: start, $lte: end } }
      ]
    }).lean(),
    BankImport.findOne({
      periodStart: { $lte: start },
      periodEnd: { $gte: start },
      openingBalance: { $ne: null }
    }).sort({ periodStart: 1 }).lean(),
    BankImport.findOne({
      periodStart: { $lte: end },
      periodEnd: { $gte: end },
      closingBalance: { $ne: null }
    }).sort({ periodEnd: -1 }).lean()
  ]);
  const bankInflow = transactions
    .filter((transaction) => transaction.direction === 'CREDIT')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const bankOutflow = transactions
    .filter((transaction) => transaction.direction === 'DEBIT')
    .reduce((sum, transaction) => sum + transaction.amount, 0);
  const openingBankBalance = openingImport?.openingBalance ?? 0;
  const calculatedClosingBalance = openingBankBalance + bankInflow - bankOutflow;
  return {
    openingBankBalance,
    bankInflow,
    bankOutflow,
    closingBankBalance: closingImport?.closingBalance ?? calculatedClosingBalance
  };
}

export async function updateMonthlyClosing(competence: string, input: { status?: 'OPEN' | 'CLOSED'; notes?: string | null }, userId: Types.ObjectId) {
  const item = await MonthlyClosing.findOne({ competence });
  if (!item) throw new AppError('Monthly closing not found', 404);
  const before = item.toObject();
  item.set(input);
  await item.save();
  await writeAudit({
    userId,
    action: 'MONTHLY_CLOSING_UPDATED',
    entityType: 'MonthlyClosing',
    entityId: String(item._id),
    before,
    after: item.toObject()
  });
  return { item };
}
