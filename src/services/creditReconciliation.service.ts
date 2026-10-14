import mongoose, { type ClientSession, type FilterQuery, type Types } from 'mongoose';
import { BankAlias } from '../models/BankAlias.js';
import { BankTransaction } from '../models/BankTransaction.js';
import { Charge } from '../models/Charge.js';
import { PaymentAllocation } from '../models/PaymentAllocation.js';
import { Unit } from '../models/Unit.js';
import { normalizeBankName } from '../utils/normalize.js';
import { AppError } from '../utils/AppError.js';
import { getDatabaseReadiness } from '../config/db.js';
import { writeAudit } from './audit.service.js';
import { assertCompetenceOpen, assertCompetencesOpen, assertDatesOpen } from './financialPeriod.service.js';

export type ReconciliationStatus = 'UNMATCHED' | 'PARTIALLY_MATCHED' | 'MATCHED';
export type ChargeFinancialStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'PAID_AFTER_REFERENCE_DATE';

type AllocationInput = { chargeId: string; amount: number };
type CreditFilters = {
  importId?: string;
  competence?: string;
  date?: string;
  status?: ReconciliationStatus;
  counterparty?: string;
};

export function deriveTransactionFinancials(amount: number, allocatedAmount: number) {
  assertIntegerAmount(amount, 'Transaction amount');
  if (!Number.isSafeInteger(allocatedAmount) || allocatedAmount < 0) {
    throw new AppError('Allocated amount must be non-negative integer cents', 400);
  }
  if (allocatedAmount > amount) throw new AppError('Allocations exceed the transaction amount', 409);

  const remainingAmount = amount - allocatedAmount;
  const status: ReconciliationStatus =
    allocatedAmount === 0 ? 'UNMATCHED' : remainingAmount === 0 ? 'MATCHED' : 'PARTIALLY_MATCHED';
  return { allocatedAmount, remainingAmount, status };
}

export function deriveChargeFinancials(
  valueOriginal: number,
  paidAmount: number,
  referenceDate: Date,
  completionDate: Date | null
) {
  assertIntegerAmount(valueOriginal, 'Charge amount');
  if (!Number.isSafeInteger(paidAmount) || paidAmount < 0) {
    throw new AppError('Paid amount must be non-negative integer cents', 400);
  }
  if (paidAmount > valueOriginal) throw new AppError('Allocations exceed the charge amount', 409);

  const outstandingAmount = valueOriginal - paidAmount;
  let status: ChargeFinancialStatus = paidAmount === 0 ? 'PENDING' : 'PARTIAL';
  if (outstandingAmount === 0) {
    status = completionDate && utcDateKey(completionDate) > utcDateKey(referenceDate)
      ? 'PAID_AFTER_REFERENCE_DATE'
      : 'PAID';
  }
  return { paidAmount, outstandingAmount, status };
}

export function suggestAllocations(
  charges: Array<{ _id: Types.ObjectId | string; outstandingAmount: number }>,
  availableAmount: number
) {
  let remaining = availableAmount;
  return charges.flatMap((charge) => {
    if (remaining <= 0 || charge.outstandingAmount <= 0) return [];
    const amount = Math.min(remaining, charge.outstandingAmount);
    remaining -= amount;
    return [{ chargeId: String(charge._id), amount }];
  });
}

export function validateAllocationRequest(
  transactionAmount: number,
  alreadyAllocated: number,
  allocations: AllocationInput[]
) {
  if (allocations.length === 0) throw new AppError('At least one allocation is required', 400);
  const chargeIds = allocations.map((allocation) => allocation.chargeId);
  if (new Set(chargeIds).size !== chargeIds.length) {
    throw new AppError('A charge cannot be repeated in the same allocation request', 409);
  }
  for (const allocation of allocations) assertIntegerAmount(allocation.amount, 'Allocation amount');
  const requested = allocations.reduce((sum, allocation) => sum + allocation.amount, 0);
  const { remainingAmount } = deriveTransactionFinancials(transactionAmount, alreadyAllocated);
  if (remainingAmount === 0) throw new AppError('Transaction is already fully allocated', 409);
  if (requested > remainingAmount) throw new AppError('Allocations exceed the transaction remaining amount', 409);
  return requested;
}

export function assertCreditTransaction(direction: string) {
  if (direction !== 'CREDIT') throw new AppError('Debit transactions cannot pay resident charges', 409);
}

export function assertChargeAllocation(
  selectedUnitId: string,
  charge: { unitId: Types.ObjectId | string; openBalance: number; status: string },
  amount: number
) {
  assertIntegerAmount(amount, 'Allocation amount');
  if (String(charge.unitId) !== selectedUnitId) throw new AppError('Charge belongs to another unit', 409);
  if (!['PENDING', 'PARTIAL'].includes(charge.status)) throw new AppError('Charge is not open for payment', 409);
  if (amount > charge.openBalance) throw new AppError('Allocation exceeds the charge outstanding amount', 409);
}

export async function listCreditTransactions(filters: CreditFilters) {
  const query: FilterQuery<unknown> = { direction: 'CREDIT' };
  if (filters.importId) query.bankImportId = filters.importId;
  if (filters.counterparty) {
    query.counterpartyNormalizedName = { $regex: escapeRegExp(normalizeBankName(filters.counterparty)), $options: 'i' };
  }
  if (filters.date) {
    const start = new Date(`${filters.date}T00:00:00.000Z`);
    const end = new Date(`${filters.date}T23:59:59.999Z`);
    query.$or = [{ operationDate: { $gte: start, $lte: end } }, { operationDate: null, postingDate: { $gte: start, $lte: end } }];
  } else if (filters.competence) {
    const [year, month] = filters.competence.split('-').map(Number);
    const start = new Date(Date.UTC(year, month - 1, 1));
    const end = new Date(Date.UTC(year, month, 0, 23, 59, 59, 999));
    query.$or = [{ operationDate: { $gte: start, $lte: end } }, { operationDate: null, postingDate: { $gte: start, $lte: end } }];
  }

  const transactions = await BankTransaction.find(query).sort({ operationDate: -1, postingDate: -1, createdAt: -1 }).lean();
  const totals = await allocatedTotals(transactions.map((transaction) => transaction._id));
  const items = transactions.map((transaction) => ({
    ...transaction,
    ...deriveTransactionFinancials(transaction.amount, totals.get(String(transaction._id)) ?? 0)
  }));
  return filters.status ? items.filter((item) => item.status === filters.status) : items;
}

export async function getCreditReconciliation(id: string) {
  const transaction = await BankTransaction.findById(id).lean();
  if (!transaction) throw new AppError('Bank transaction not found', 404);
  if (transaction.direction !== 'CREDIT') throw new AppError('Only credit transactions can be reconciled', 409);

  const allocations = await PaymentAllocation.find({ bankTransactionId: transaction._id })
    .populate('chargeId')
    .populate('unitId', 'quadra numero tipo unitKey')
    .populate('createdBy', 'name')
    .populate('reversedBy', 'name')
    .sort({ createdAt: 1 })
    .lean();
  const activeTotal = allocations.reduce((sum, allocation) => sum + (allocation.reversedAt ? 0 : allocation.amount), 0);
  const financials = deriveTransactionFinancials(transaction.amount, activeTotal);
  const alias = transaction.counterpartyNormalizedName
    ? await BankAlias.findOne({ bankName: transaction.bank, normalizedName: transaction.counterpartyNormalizedName, status: 'CONFIRMED' })
      .populate({ path: 'unitId', populate: { path: 'residentCurrentId', select: 'name' } })
      .lean()
    : null;
  const suggestedUnitId = alias ? String(alias.unitId._id) : null;
  const openCharges = suggestedUnitId ? await getUnitOpenCharges(suggestedUnitId) : [];

  return {
    transaction: { ...transaction, ...financials },
    suggestedUnit: alias?.unitId ?? null,
    suggestionReason: alias ? 'BANK_ALIAS' : null,
    aliases: alias ? [alias] : [],
    openCharges,
    suggestedAllocations: suggestAllocations(openCharges, financials.remainingAmount),
    manualPaymentCandidates: await getManualPaymentCandidates(financials.remainingAmount, suggestedUnitId),
    allocations,
    ...financials
  };
}

async function getManualPaymentCandidates(remainingAmount: number, unitId: string | null) {
  if (remainingAmount <= 0) return [];
  return PaymentAllocation.find({
    source: 'MANUAL',
    bankTransactionId: null,
    reversedAt: null,
    amount: { $lte: remainingAmount },
    ...(unitId ? { unitId } : {})
  })
    .populate('chargeId', 'competence valueOriginal valuePaid openBalance status')
    .populate('unitId', 'quadra numero tipo unitKey')
    .populate('createdBy', 'name email')
    .sort({ paymentDate: -1, createdAt: -1 })
    .limit(50)
    .lean();
}

export async function getUnitOpenCharges(unitId: string, filters: { competence?: string } = {}) {
  if (!(await Unit.exists({ _id: unitId }))) throw new AppError('Unit not found', 404);
  const charges = await Charge.find({
    unitId,
    openBalance: { $gt: 0 },
    ...(filters.competence ? { competence: filters.competence } : {})
  }).sort({ competence: 1 }).lean();
  return charges.map((charge) => ({
    ...charge,
    paidAmount: charge.valuePaid,
    outstandingAmount: charge.openBalance
  }));
}

export async function allocateCredit(
  transactionId: string,
  input: { unitId: string; allocations: AllocationInput[]; saveAlias?: boolean },
  userId: Types.ObjectId
) {
  return runInTransaction(async (session) => {
    const transaction = await BankTransaction.findById(transactionId).session(session);
    if (!transaction) throw new AppError('Bank transaction not found', 404);
    assertCreditTransaction(transaction.direction);
    await assertDatesOpen([transaction.operationDate ?? transaction.postingDate]);

    const unit = await Unit.findOne({ _id: input.unitId, status: 'ATIVA' }).session(session);
    if (!unit) throw new AppError('Active unit not found', 404);
    const existingTotal = await activeAllocatedTotal(transaction._id, session);
    validateAllocationRequest(transaction.amount, existingTotal, input.allocations);

    const chargeIds = input.allocations.map((allocation) => allocation.chargeId);
    const charges = await Charge.find({ _id: { $in: chargeIds } }).session(session);
    if (charges.length !== chargeIds.length) throw new AppError('One or more charges were not found', 404);
    const existingPairs = await PaymentAllocation.exists({ bankTransactionId: transaction._id, chargeId: { $in: chargeIds } }).session(session);
    if (existingPairs) throw new AppError('An allocation already exists for this transaction and charge', 409);

    const paymentDate = transaction.operationDate ?? transaction.postingDate;
    await assertCompetencesOpen(charges.map((charge) => charge.competence));
    for (const allocation of input.allocations) {
      const charge = charges.find((item) => String(item._id) === allocation.chargeId);
      if (!charge) throw new AppError('Charge not found', 404);
      assertChargeAllocation(input.unitId, charge, allocation.amount);
    }

    const created = await PaymentAllocation.create(
      input.allocations.map((allocation) => ({
        bankTransactionId: transaction._id,
        chargeId: allocation.chargeId,
        unitId: unit._id,
        amount: allocation.amount,
        paymentDate,
        createdBy: userId
      })),
      { session, ordered: true }
    );

    const updatedCharges = [];
    for (const charge of charges) updatedCharges.push(await recalculateCharge(charge._id, session));
    const totalAfter = existingTotal + created.reduce((sum, allocation) => sum + allocation.amount, 0);
    const transactionFinancials = deriveTransactionFinancials(transaction.amount, totalAfter);
    const transactionBefore = transaction.toObject();
    transaction.processingStatus = transactionFinancials.status;
    await transaction.save({ session });

    let alias = null;
    if (input.saveAlias && transaction.counterpartyNormalizedName && transaction.counterpartyOriginalName) {
      const existingAlias = await BankAlias.findOne({
        bankName: transaction.bank,
        normalizedName: transaction.counterpartyNormalizedName
      }).session(session);
      const before = existingAlias?.toObject() ?? null;
      alias = existingAlias ?? new BankAlias({
        bankName: transaction.bank,
        normalizedName: transaction.counterpartyNormalizedName,
        originalName: transaction.counterpartyOriginalName,
        createdBy: userId
      });
      alias.set({
        unitId: unit._id,
        originalName: transaction.counterpartyOriginalName,
        status: 'CONFIRMED',
        createdBy: alias.createdBy ?? userId,
        updatedBy: userId
      });
      await alias.save({ session });
      await writeAudit({
        userId,
        action: before ? 'BANK_ALIAS_UPDATED' : 'BANK_ALIAS_CREATED',
        entityType: 'BankAlias',
        entityId: String(alias._id),
        before,
        after: alias.toObject(),
        session
      });
    }

    for (const allocation of created) {
      await writeAudit({
        userId,
        action: 'PAYMENT_ALLOCATED',
        entityType: 'PaymentAllocation',
        entityId: String(allocation._id),
        after: allocation.toObject(),
        session
      });
    }
    await writeAudit({
      userId,
      action: 'CREDIT_RECONCILED',
      entityType: 'BankTransaction',
      entityId: String(transaction._id),
      before: { processingStatus: transactionBefore.processingStatus, allocatedAmount: existingTotal },
      after: { processingStatus: transaction.processingStatus, allocatedAmount: totalAfter },
      session
    });

    return { transaction: { ...transaction.toObject(), ...transactionFinancials }, allocations: created, charges: updatedCharges, alias };
  });
}

export async function linkManualPaymentToCredit(transactionId: string, allocationId: string, userId: Types.ObjectId) {
  return runInTransaction(async (session) => {
    const transaction = await BankTransaction.findById(transactionId).session(session);
    if (!transaction) throw new AppError('Bank transaction not found', 404);
    assertCreditTransaction(transaction.direction);
    await assertDatesOpen([transaction.operationDate ?? transaction.postingDate]);

    const allocation = await PaymentAllocation.findById(allocationId).session(session);
    if (!allocation) throw new AppError('Payment allocation not found', 404);
    if (allocation.reversedAt) throw new AppError('Payment allocation is reversed', 409);
    if (allocation.source !== 'MANUAL') throw new AppError('Only manual payment allocations can be linked', 409);
    if (allocation.bankTransactionId) throw new AppError('Manual payment allocation is already linked to a bank transaction', 409);
    const charge = await Charge.findById(allocation.chargeId).session(session);
    if (!charge) throw new AppError('Charge not found', 404);
    await assertCompetenceOpen(charge.competence);

    const existingTotal = await activeAllocatedTotal(transaction._id, session);
    const { remainingAmount } = deriveTransactionFinancials(transaction.amount, existingTotal);
    if (allocation.amount > remainingAmount) throw new AppError('Manual payment exceeds the transaction remaining amount', 409);

    const beforeAllocation = allocation.toObject();
    allocation.bankTransactionId = transaction._id;
    await allocation.save({ session });

    const transactionBefore = transaction.toObject();
    const totalAfter = existingTotal + allocation.amount;
    const transactionFinancials = deriveTransactionFinancials(transaction.amount, totalAfter);
    transaction.processingStatus = transactionFinancials.status;
    await transaction.save({ session });

    await writeAudit({
      userId,
      action: 'MANUAL_PAYMENT_LINKED_TO_BANK_TRANSACTION',
      entityType: 'PaymentAllocation',
      entityId: String(allocation._id),
      before: beforeAllocation,
      after: allocation.toObject(),
      session
    });
    await writeAudit({
      userId,
      action: 'CREDIT_RECONCILED_WITH_MANUAL_PAYMENT',
      entityType: 'BankTransaction',
      entityId: String(transaction._id),
      before: { processingStatus: transactionBefore.processingStatus, allocatedAmount: existingTotal },
      after: { processingStatus: transaction.processingStatus, allocatedAmount: totalAfter },
      session
    });

    return { transaction: { ...transaction.toObject(), ...transactionFinancials }, allocation };
  });
}

export async function reversePaymentAllocation(id: string, reason: string, userId: Types.ObjectId) {
  return runInTransaction(async (session) => {
    const allocation = await PaymentAllocation.findById(id).session(session);
    if (!allocation) throw new AppError('Payment allocation not found', 404);
    if (allocation.reversedAt) throw new AppError('Payment allocation is already reversed', 409);
    const chargeForReversal = await Charge.findById(allocation.chargeId).session(session);
    if (!chargeForReversal) throw new AppError('Charge not found', 404);
    await assertCompetenceOpen(chargeForReversal.competence);

    const before = allocation.toObject();
    allocation.set({ reversedAt: new Date(), reversedBy: userId, reversalReason: reason });
    await allocation.save({ session });
    const charge = await recalculateCharge(allocation.chargeId, session);
    let transactionResult = null;
    if (allocation.bankTransactionId) {
      const transaction = await BankTransaction.findById(allocation.bankTransactionId).session(session);
      if (!transaction) throw new AppError('Bank transaction not found', 404);
      await assertDatesOpen([transaction.operationDate ?? transaction.postingDate]);
      const allocatedAmount = await activeAllocatedTotal(transaction._id, session);
      const financials = deriveTransactionFinancials(transaction.amount, allocatedAmount);
      transaction.processingStatus = financials.status;
      await transaction.save({ session });
      transactionResult = { ...transaction.toObject(), ...financials };
    }

    await writeAudit({
      userId,
      action: 'PAYMENT_ALLOCATION_REVERSED',
      entityType: 'PaymentAllocation',
      entityId: String(allocation._id),
      before,
      after: allocation.toObject(),
      session
    });
    return { allocation, charge, transaction: transactionResult };
  });
}

async function recalculateCharge(chargeId: Types.ObjectId, session: ClientSession) {
  const charge = await Charge.findById(chargeId).session(session);
  if (!charge) throw new AppError('Charge not found', 404);
  const active = await PaymentAllocation.find({ chargeId, reversedAt: null }).sort({ paymentDate: 1 }).session(session);
  const paidAmount = active.reduce((sum, allocation) => sum + allocation.amount, 0);
  const completionDate = paidAmount === charge.valueOriginal && active.length > 0
    ? active[active.length - 1]?.paymentDate ?? null
    : null;
  const financials = deriveChargeFinancials(charge.valueOriginal, paidAmount, charge.referenceDate, completionDate);
  charge.set({ valuePaid: financials.paidAmount, openBalance: financials.outstandingAmount, status: financials.status });
  await charge.save({ session });
  return charge;
}

async function activeAllocatedTotal(transactionId: Types.ObjectId, session: ClientSession) {
  const [result] = await PaymentAllocation.aggregate<{ total: number }>([
    { $match: { bankTransactionId: transactionId, reversedAt: null } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]).session(session);
  return result?.total ?? 0;
}

async function allocatedTotals(transactionIds: Types.ObjectId[]) {
  const totals = await PaymentAllocation.aggregate<{ _id: Types.ObjectId; total: number }>([
    { $match: { bankTransactionId: { $in: transactionIds }, reversedAt: null } },
    { $group: { _id: '$bankTransactionId', total: { $sum: '$amount' } } }
  ]);
  return new Map(totals.map((item) => [String(item._id), item.total]));
}

async function runInTransaction<T>(work: (session: ClientSession) => Promise<T>) {
  const readiness = await getDatabaseReadiness();
  if (!readiness.supportsTransactions) {
    throw new AppError('Atomic reconciliation requires MongoDB configured as a PRIMARY replica set with transaction support', 503);
  }
  const session = await mongoose.startSession();
  try {
    return await executeAtomic((callback) => session.withTransaction(callback), () => work(session));
  } finally {
    await session.endSession();
  }
}

export async function executeAtomic<T>(
  withTransaction: (callback: () => Promise<void>) => Promise<unknown>,
  work: () => Promise<T>
) {
  let result: T | undefined;
  await withTransaction(async () => {
    result = await work();
  });
  if (result === undefined) throw new AppError('Atomic reconciliation did not complete', 500);
  return result;
}

function assertIntegerAmount(amount: number, label: string) {
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new AppError(`${label} must be positive integer cents`, 400);
}

function utcDateKey(value: Date) {
  return value.toISOString().slice(0, 10);
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
