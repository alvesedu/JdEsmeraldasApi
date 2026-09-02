import type { FilterQuery, Types } from 'mongoose';
import { AccountPayable } from '../models/AccountPayable.js';
import { ExpenseCategory } from '../models/ExpenseCategory.js';
import { ExpensePaymentAllocation } from '../models/ExpensePaymentAllocation.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from './audit.service.js';

export type AccountPayableStatus = 'PENDING' | 'PARTIAL' | 'PAID' | 'CANCELLED';

type CreateAccountPayableInput = {
  description: string;
  categoryId: string;
  subcategory?: string | null;
  beneficiaryName: string;
  competence: string;
  expectedAmount: number;
  dueDate?: Date | null;
  notes?: string | null;
};

type UpdateAccountPayableInput = Partial<CreateAccountPayableInput>;

type AccountPayableFilters = {
  competence?: string;
  status?: AccountPayableStatus;
  categoryId?: string;
  beneficiaryName?: string;
};

type ManualPaymentInput = {
  amount: number;
  paymentDate: Date;
  notes?: string | null;
};

export function deriveAccountPayableFinancials(expectedAmount: number, paidAmount: number) {
  if (!Number.isSafeInteger(expectedAmount) || expectedAmount <= 0) {
    throw new AppError('Expected amount must be positive integer cents', 400);
  }
  if (!Number.isSafeInteger(paidAmount) || paidAmount < 0) {
    throw new AppError('Paid amount must be non-negative integer cents', 400);
  }

  const outstandingAmount = Math.max(expectedAmount - paidAmount, 0);
  const status: Exclude<AccountPayableStatus, 'CANCELLED'> =
    paidAmount === 0 ? 'PENDING' : paidAmount < expectedAmount ? 'PARTIAL' : 'PAID';

  return { paidAmount, outstandingAmount, status };
}

export function assertManualPaymentAllowed(
  status: AccountPayableStatus,
  amount: number,
  outstandingAmount: number
) {
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError('Payment must be positive integer cents', 400);
  }
  if (status === 'CANCELLED') {
    throw new AppError('Cancelled accounts cannot receive payments', 409);
  }
  if (amount > outstandingAmount) {
    throw new AppError('Payment exceeds the outstanding amount', 409);
  }
}

export function assertAccountCanBeCancelled(paidAmount: number) {
  if (paidAmount > 0) {
    throw new AppError('Reverse existing payments before cancelling the account', 409);
  }
}

export function deriveCancelledStatus(paidAmount: number): Extract<AccountPayableStatus, 'CANCELLED'> {
  assertAccountCanBeCancelled(paidAmount);
  return 'CANCELLED';
}

export function buildAccountPayableFilter(filters: AccountPayableFilters) {
  const query: FilterQuery<unknown> = {};
  if (filters.competence) query.competence = filters.competence;
  if (filters.status) query.status = filters.status;
  if (filters.categoryId) query.categoryId = filters.categoryId;
  if (filters.beneficiaryName) {
    query.beneficiaryName = { $regex: escapeRegExp(filters.beneficiaryName), $options: 'i' };
  }
  return query;
}

export async function listAccountsPayable(filters: AccountPayableFilters) {
  const items = await AccountPayable.find(buildAccountPayableFilter(filters))
    .populate('categoryId')
    .sort({ dueDate: 1, createdAt: -1 });
  const activeItems = items.filter((item) => item.status !== 'CANCELLED');

  return {
    items,
    summary: {
      expectedAmount: activeItems.reduce((sum, item) => sum + item.expectedAmount, 0),
      paidAmount: activeItems.reduce((sum, item) => sum + item.paidAmount, 0),
      outstandingAmount: activeItems.reduce((sum, item) => sum + item.outstandingAmount, 0)
    }
  };
}

export async function getAccountPayable(id: string) {
  const item = await AccountPayable.findById(id).populate('categoryId');
  if (!item) throw new AppError('Account payable not found', 404);

  const payments = await ExpensePaymentAllocation.find({ accountPayableId: item._id })
    .populate('createdBy', 'name')
    .populate('reversedBy', 'name')
    .sort({ paymentDate: -1, createdAt: -1 });

  return { item, payments };
}

export async function createAccountPayable(input: CreateAccountPayableInput, userId: Types.ObjectId) {
  await ensureCategoryExists(input.categoryId);
  const financials = deriveAccountPayableFinancials(input.expectedAmount, 0);
  const item = await AccountPayable.create({
    ...input,
    ...financials,
    createdBy: userId
  });

  await writeAudit({
    userId,
    action: 'ACCOUNT_PAYABLE_CREATED',
    entityType: 'AccountPayable',
    entityId: String(item._id),
    after: item.toObject()
  });
  return item.populate('categoryId');
}

export async function updateAccountPayable(id: string, input: UpdateAccountPayableInput, userId: Types.ObjectId) {
  const item = await AccountPayable.findById(id);
  if (!item) throw new AppError('Account payable not found', 404);
  if (item.status === 'CANCELLED') throw new AppError('Cancelled accounts cannot be edited', 409);
  if (input.categoryId) await ensureCategoryExists(input.categoryId);
  if (input.expectedAmount !== undefined && input.expectedAmount < item.paidAmount) {
    throw new AppError('Expected amount cannot be lower than the amount already paid', 409);
  }

  const before = item.toObject();
  item.set(input);
  const financials = deriveAccountPayableFinancials(item.expectedAmount, item.paidAmount);
  item.set(financials);
  await item.save();

  await writeAudit({
    userId,
    action: 'ACCOUNT_PAYABLE_UPDATED',
    entityType: 'AccountPayable',
    entityId: String(item._id),
    before,
    after: item.toObject()
  });
  return item.populate('categoryId');
}

export async function cancelAccountPayable(id: string, userId: Types.ObjectId) {
  const item = await AccountPayable.findById(id);
  if (!item) throw new AppError('Account payable not found', 404);
  if (item.status === 'CANCELLED') return item;

  const before = item.toObject();
  item.status = deriveCancelledStatus(item.paidAmount);
  await item.save();
  await writeAudit({
    userId,
    action: 'ACCOUNT_PAYABLE_CANCELLED',
    entityType: 'AccountPayable',
    entityId: String(item._id),
    before,
    after: item.toObject()
  });
  return item;
}

export async function registerManualPayment(
  id: string,
  input: ManualPaymentInput,
  userId: Types.ObjectId
) {
  const item = await AccountPayable.findById(id);
  if (!item) throw new AppError('Account payable not found', 404);
  assertManualPaymentAllowed(item.status, input.amount, item.outstandingAmount);

  const before = item.toObject();
  const payment = await ExpensePaymentAllocation.create({
    accountPayableId: item._id,
    bankTransactionId: null,
    amount: input.amount,
    source: 'MANUAL',
    paymentDate: input.paymentDate,
    notes: input.notes ?? null,
    createdBy: userId
  });

  try {
    const updated = await recalculateAccountPayable(item._id);
    await writeAudit({
      userId,
      action: 'ACCOUNT_PAYABLE_PAYMENT_REGISTERED',
      entityType: 'AccountPayable',
      entityId: String(item._id),
      before,
      after: { accountPayable: updated.toObject(), payment: payment.toObject() }
    });
    return { item: updated, payment };
  } catch (error) {
    await ExpensePaymentAllocation.deleteOne({ _id: payment._id });
    throw error;
  }
}

export async function reverseManualPayment(
  accountPayableId: string,
  paymentId: string,
  reason: string | null,
  userId: Types.ObjectId
) {
  const item = await AccountPayable.findById(accountPayableId);
  if (!item) throw new AppError('Account payable not found', 404);
  const payment = await ExpensePaymentAllocation.findOne({
    _id: paymentId,
    accountPayableId: item._id,
    source: 'MANUAL'
  });
  if (!payment) throw new AppError('Manual payment not found', 404);
  if (payment.reversedAt) throw new AppError('Payment is already reversed', 409);

  const before = { accountPayable: item.toObject(), payment: payment.toObject() };
  payment.reversedAt = new Date();
  payment.reversedBy = userId;
  payment.reversalReason = reason;
  await payment.save();
  const updated = await recalculateAccountPayable(item._id);

  await writeAudit({
    userId,
    action: 'ACCOUNT_PAYABLE_PAYMENT_REVERSED',
    entityType: 'AccountPayable',
    entityId: String(item._id),
    before,
    after: { accountPayable: updated.toObject(), payment: payment.toObject() }
  });
  return { item: updated, payment };
}

async function recalculateAccountPayable(accountPayableId: Types.ObjectId) {
  const item = await AccountPayable.findById(accountPayableId);
  if (!item) throw new AppError('Account payable not found', 404);

  const [result] = await ExpensePaymentAllocation.aggregate<{ total: number }>([
    { $match: { accountPayableId, reversedAt: null } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);
  const paidAmount = result?.total ?? 0;
  if (paidAmount > item.expectedAmount) {
    throw new AppError('Payment allocations exceed the expected amount', 409);
  }

  item.set(deriveAccountPayableFinancials(item.expectedAmount, paidAmount));
  await item.save();
  return item;
}

async function ensureCategoryExists(categoryId: string) {
  if (!(await ExpenseCategory.exists({ _id: categoryId, active: true }))) {
    throw new AppError('Expense category not found', 400);
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
