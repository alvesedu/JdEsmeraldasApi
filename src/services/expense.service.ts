import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { FilterQuery, Types } from 'mongoose';
import { env } from '../config/env.js';
import { BankTransaction } from '../models/BankTransaction.js';
import { Expense } from '../models/Expense.js';
import { ExpenseCategory } from '../models/ExpenseCategory.js';
import { AppError } from '../utils/AppError.js';
import { sha256 } from '../utils/hash.js';
import { writeAudit } from './audit.service.js';

type ExpenseFilters = {
  competence?: string;
  categoryId?: string;
  classificationStatus?: 'PENDING' | 'SUGGESTED' | 'CONFIRMED';
  beneficiary?: string;
};

type ExpenseInput = {
  bankTransactionId?: string | null;
  categoryId?: string;
  beneficiary?: string;
  description?: string;
  competence?: string;
  notes?: string | null;
  attachmentUrl?: string | null;
  classificationStatus?: 'PENDING' | 'SUGGESTED' | 'CONFIRMED';
};

type UploadedAttachment = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

const maximumAttachmentSize = 10 * 1024 * 1024;
const acceptedAttachmentTypes = new Map([
  ['application/pdf', '.pdf'],
  ['image/jpeg', '.jpg'],
  ['image/png', '.png'],
  ['image/webp', '.webp']
]);

export async function listExpenses(filters: ExpenseFilters) {
  const query: FilterQuery<unknown> = {};
  if (filters.competence) query.competence = filters.competence;
  if (filters.categoryId) query.categoryId = filters.categoryId;
  if (filters.classificationStatus) query.classificationStatus = filters.classificationStatus;
  if (filters.beneficiary) query.beneficiary = { $regex: escapeRegExp(filters.beneficiary), $options: 'i' };

  const items = await Expense.find(query)
    .populate('categoryId')
    .populate('bankTransactionId')
    .populate('classifiedBy', 'name')
    .sort({ competence: -1, createdAt: -1 });
  const summary = items.reduce((acc, item) => {
    const transaction = populatedBankTransaction(item.bankTransactionId);
    const amount = transaction?.amount ?? 0;
    return {
      total: acc.total + amount,
      confirmed: acc.confirmed + (item.classificationStatus === 'CONFIRMED' ? amount : 0),
      pendingCount: acc.pendingCount + (item.classificationStatus === 'CONFIRMED' ? 0 : 1)
    };
  }, { total: 0, confirmed: 0, pendingCount: 0 });

  return { items, summary };
}

export async function createExpense(input: Required<Pick<ExpenseInput, 'categoryId' | 'beneficiary' | 'description' | 'competence'>> & ExpenseInput, userId: Types.ObjectId) {
  await ensureCategory(input.categoryId);
  await ensureDebitTransaction(input.bankTransactionId ?? null);
  await ensureAvailableTransaction(input.bankTransactionId ?? null);
  const item = await Expense.create({
    ...input,
    bankTransactionId: input.bankTransactionId ?? null,
    notes: input.notes ?? null,
    attachmentUrl: input.attachmentUrl ?? null,
    classificationStatus: input.classificationStatus ?? 'CONFIRMED',
    classifiedBy: userId,
    classifiedAt: new Date()
  });
  await writeAudit({ userId, action: 'EXPENSE_CREATED', entityType: 'Expense', entityId: String(item._id), after: item.toObject() });
  return item.populate(['categoryId', 'bankTransactionId', { path: 'classifiedBy', select: 'name' }]);
}

export async function updateExpense(id: string, input: ExpenseInput, userId: Types.ObjectId) {
  const item = await Expense.findById(id);
  if (!item) throw new AppError('Expense not found', 404);
  if (input.categoryId) await ensureCategory(input.categoryId);
  if (input.bankTransactionId !== undefined) await ensureDebitTransaction(input.bankTransactionId);
  if (input.bankTransactionId !== undefined) await ensureAvailableTransaction(input.bankTransactionId, id);

  const before = item.toObject();
  item.set({
    ...input,
    classifiedBy: userId,
    classifiedAt: new Date()
  });
  await item.save();
  await writeAudit({ userId, action: 'EXPENSE_UPDATED', entityType: 'Expense', entityId: String(item._id), before, after: item.toObject() });
  return item.populate(['categoryId', 'bankTransactionId', { path: 'classifiedBy', select: 'name' }]);
}

export async function deleteExpense(id: string, userId: Types.ObjectId) {
  const item = await Expense.findById(id);
  if (!item) throw new AppError('Expense not found', 404);
  await Expense.deleteOne({ _id: item._id });
  await writeAudit({ userId, action: 'EXPENSE_DELETED', entityType: 'Expense', entityId: String(item._id), before: item.toObject() });
  return { deleted: true };
}

export async function attachExpenseFile(id: string, file: UploadedAttachment, userId: Types.ObjectId) {
  validateAttachment(file);
  const item = await Expense.findById(id);
  if (!item) throw new AppError('Expense not found', 404);

  const before = item.toObject();
  const extension = acceptedAttachmentTypes.get(file.mimetype) ?? path.extname(file.originalname).toLowerCase();
  const fileHash = sha256(file.buffer);
  const directory = path.resolve(env.uploadDir, 'expenses');
  const storedFileName = `${fileHash}${extension}`;
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, storedFileName), file.buffer, { flag: 'wx' }).catch((error: unknown) => {
    if (!isExistingFileError(error)) throw error;
  });

  item.set({
    attachmentUrl: `/uploads/expenses/${storedFileName}`,
    classifiedBy: userId,
    classifiedAt: new Date()
  });
  await item.save();
  await writeAudit({
    userId,
    action: 'EXPENSE_ATTACHMENT_UPLOADED',
    entityType: 'Expense',
    entityId: String(item._id),
    before,
    after: item.toObject()
  });
  return item.populate(['categoryId', 'bankTransactionId', { path: 'classifiedBy', select: 'name' }]);
}

async function ensureCategory(categoryId: string) {
  if (!(await ExpenseCategory.exists({ _id: categoryId, active: true }))) {
    throw new AppError('Expense category not found', 400);
  }
}

async function ensureDebitTransaction(bankTransactionId?: string | null) {
  if (!bankTransactionId) return;
  const transaction = await BankTransaction.findById(bankTransactionId);
  if (!transaction) throw new AppError('Bank transaction not found', 404);
  if (transaction.direction !== 'DEBIT') throw new AppError('Only debit transactions can be classified as expenses', 409);
}

async function ensureAvailableTransaction(bankTransactionId?: string | null, expenseId?: string) {
  if (!bankTransactionId) return;
  const existing = await Expense.exists({
    bankTransactionId,
    ...(expenseId ? { _id: { $ne: expenseId } } : {})
  });
  if (existing) throw new AppError('Bank transaction already classified as an expense', 409);
}

function populatedBankTransaction(value: unknown) {
  return value && typeof value === 'object' && 'amount' in value ? value as { amount: number } : null;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function validateAttachment(file: UploadedAttachment) {
  if (!acceptedAttachmentTypes.has(file.mimetype)) {
    throw new AppError('Only PDF, JPG, PNG and WebP attachments are accepted', 400);
  }
  if (file.size <= 0 || file.size > maximumAttachmentSize) {
    throw new AppError('Attachment must be between 1 byte and 10 MB', 413);
  }
}

function isExistingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}
