import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { Types } from 'mongoose';
import { parseBankStatement } from '../bankParsers/parserRegistry.js';
import type { BankParserError, ParsedBankTransaction } from '../bankParsers/types.js';
import { env } from '../config/env.js';
import { BankImport, type BankImportDocument } from '../models/BankImport.js';
import { BankTransaction } from '../models/BankTransaction.js';
import { AppError } from '../utils/AppError.js';
import { buildTransactionFingerprint, sha256 } from '../utils/hash.js';

const maximumPdfSize = 10 * 1024 * 1024;

type UploadedPdf = {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
};

type TransactionWithFingerprint = ParsedBankTransaction & { fingerprint: string };

export async function processBankImport(file: UploadedPdf, userId: Types.ObjectId) {
  validatePdf(file);
  const fileHash = sha256(file.buffer);
  const existing = await BankImport.findOne({ fileHash }).select('+storedFilePath');
  if (
    existing &&
    isDuplicateFileHash(fileHash, existing.fileHash) &&
    !canReprocessImport(existing.processingStatus)
  ) {
    return { ...serializeBankImport(existing), duplicateFile: true, reprocessed: false };
  }

  const uploadDirectory = path.resolve(env.uploadDir);
  const storedFilePath = path.join(uploadDirectory, `${fileHash}.pdf`);
  await mkdir(uploadDirectory, { recursive: true });
  await writeFile(storedFilePath, file.buffer, { flag: 'wx' }).catch(async (error: unknown) => {
    if (!isExistingFileError(error)) throw error;
  });

  const reprocessed = Boolean(existing);
  const item =
    existing ??
    (await BankImport.create({
      originalFileName: path.basename(file.originalname),
      storedFilePath,
      bank: 'UNKNOWN',
      uploadedBy: userId,
      fileHash,
      processingStatus: 'PROCESSING',
      processingErrors: []
    }));
  if (existing) {
    item.set({ processingStatus: 'PROCESSING', processingErrors: [], processedAt: null });
    await item.save();
  }

  try {
    const statement = await parseBankStatement(file.buffer, file.originalname);
    const transactions = statement.transactions.map((transaction) => ({
      ...transaction,
      fingerprint: buildTransactionFingerprint({ bank: statement.bank, ...transaction })
    }));
    const fingerprints = [...new Set(transactions.map((transaction) => transaction.fingerprint))];
    const existingTransactions = await BankTransaction.find({ fingerprint: { $in: fingerprints } })
      .select('fingerprint')
      .lean();
    const batch = prepareTransactionBatch(
      transactions,
      new Set(existingTransactions.map((transaction) => transaction.fingerprint))
    );

    const insertResult = batch.toInsert.length
      ? await BankTransaction.bulkWrite(
          batch.toInsert.map((transaction) => ({
            updateOne: {
              filter: { fingerprint: transaction.fingerprint },
              update: {
                $setOnInsert: {
                  bankImportId: item._id,
                  bank: statement.bank,
                  postingDate: isoDate(transaction.postingDate),
                  operationDate: transaction.operationDate ? isoDate(transaction.operationDate) : null,
                  operationTime: transaction.operationTime,
                  lot: transaction.lot,
                  document: transaction.document,
                  description: transaction.description,
                  counterpartyOriginalName: transaction.counterpartyOriginalName,
                  counterpartyNormalizedName: transaction.counterpartyNormalizedName,
                  counterpartyDocument: transaction.counterpartyDocument,
                  amount: transaction.amount,
                  direction: transaction.direction,
                  transactionType: transaction.transactionType,
                  fingerprint: transaction.fingerprint,
                  rawData: transaction.rawData,
                  processingStatus: 'PENDING'
                }
              },
              upsert: true
            }
          })),
          { ordered: false }
        )
      : null;

    const insertedTransactions = insertResult?.upsertedCount ?? 0;
    const totals = calculateTransactionTotals(transactions);
    const validation = validateStatementBalance(
      statement.balances.openingBalance,
      statement.balances.closingBalance,
      totals.totalCredits,
      totals.totalDebits
    );
    const processingErrors: BankParserError[] = [...statement.errors];
    if (validation.valid === false) {
      processingErrors.push({
        type: 'BALANCE_DIVERGENCE',
        message: `Closing balance differs by ${validation.difference} cents`,
        rawData: { expectedClosingBalance: validation.expectedClosingBalance }
      });
    }

    item.set({
      bank: statement.bank,
      periodStart: statement.period.startDate ? isoDate(statement.period.startDate) : null,
      periodEnd: statement.period.endDate ? isoDate(statement.period.endDate) : null,
      openingBalance: statement.balances.openingBalance,
      closingBalance: statement.balances.closingBalance,
      totalCredits: totals.totalCredits,
      totalDebits: totals.totalDebits,
      transactionCount: transactions.length,
      insertedTransactions,
      duplicateTransactions:
        batch.existingCount + Math.max(batch.toInsert.length - insertedTransactions, 0),
      ignoredTransactions: batch.ignoredWithinFile,
      invalidTransactions: statement.errors.length,
      transactionFingerprints: fingerprints,
      validationValid: validation.valid,
      validationDifference: validation.difference,
      processingErrors,
      processingStatus: determineImportStatus(
        transactions.length,
        processingErrors.length,
        validation.valid
      ),
      processedAt: new Date()
    });
    await item.save();
    return { ...serializeBankImport(item), duplicateFile: false, reprocessed };
  } catch (error) {
    item.set({
      processingStatus: 'FAILED',
      processedAt: new Date(),
      processingErrors: [
        {
          type: 'PARSING_FAILED',
          message: error instanceof Error ? error.message : 'Unknown parsing failure',
          rawData: null
        }
      ]
    });
    await item.save();
    return { ...serializeBankImport(item), duplicateFile: false, reprocessed };
  }
}

export async function listBankImports() {
  const items = await BankImport.find().sort({ uploadedAt: -1 });
  return items.map(serializeBankImport);
}

export async function getBankImport(id: string) {
  const item = await BankImport.findById(id);
  if (!item) throw new AppError('Bank import not found', 404);
  return serializeBankImport(item);
}

export async function listBankImportTransactions(
  id: string,
  filters: { direction?: 'CREDIT' | 'DEBIT'; transactionType?: string }
) {
  const bankImport = await BankImport.findById(id).select('+transactionFingerprints');
  if (!bankImport) throw new AppError('Bank import not found', 404);
  const query: Record<string, unknown> = bankImport.transactionFingerprints.length
    ? { fingerprint: { $in: bankImport.transactionFingerprints } }
    : { bankImportId: bankImport._id };
  if (filters.direction) query.direction = filters.direction;
  if (filters.transactionType) query.transactionType = filters.transactionType;
  return BankTransaction.find(query).sort({ postingDate: 1, createdAt: 1 }).lean();
}

export function prepareTransactionBatch(
  transactions: TransactionWithFingerprint[],
  existingFingerprints: Set<string>
) {
  const seen = new Set<string>();
  const unique: TransactionWithFingerprint[] = [];
  let ignoredWithinFile = 0;
  for (const transaction of transactions) {
    if (seen.has(transaction.fingerprint)) {
      ignoredWithinFile += 1;
      continue;
    }
    seen.add(transaction.fingerprint);
    unique.push(transaction);
  }
  return {
    toInsert: unique.filter((transaction) => !existingFingerprints.has(transaction.fingerprint)),
    existingCount: unique.filter((transaction) => existingFingerprints.has(transaction.fingerprint)).length,
    ignoredWithinFile
  };
}

export function isDuplicateFileHash(fileHash: string, existingFileHash: string | null) {
  return existingFileHash !== null && fileHash === existingFileHash;
}

export function canReprocessImport(status: string) {
  return status === 'FAILED';
}

export function calculateTransactionTotals(transactions: Pick<ParsedBankTransaction, 'amount' | 'direction'>[]) {
  return transactions.reduce(
    (totals, transaction) => {
      if (transaction.direction === 'CREDIT') totals.totalCredits += transaction.amount;
      else totals.totalDebits += transaction.amount;
      return totals;
    },
    { totalCredits: 0, totalDebits: 0 }
  );
}

export function validateStatementBalance(
  openingBalance: number | null,
  closingBalance: number | null,
  totalCredits: number,
  totalDebits: number
) {
  if (openingBalance === null || closingBalance === null) {
    return { valid: null, difference: null, expectedClosingBalance: null };
  }
  const expectedClosingBalance = openingBalance + totalCredits - totalDebits;
  const difference = closingBalance - expectedClosingBalance;
  return { valid: difference === 0, difference, expectedClosingBalance };
}

export function determineImportStatus(
  transactionCount: number,
  processingErrorCount: number,
  validationValid: boolean | null
) {
  if (transactionCount === 0) return 'FAILED' as const;
  if (processingErrorCount > 0 || validationValid === false) return 'REVIEW_REQUIRED' as const;
  return 'PROCESSED' as const;
}

function validatePdf(file: UploadedPdf) {
  if (file.mimetype !== 'application/pdf' || path.extname(file.originalname).toLowerCase() !== '.pdf') {
    throw new AppError('Only PDF files are accepted', 400);
  }
  if (file.size <= 0 || file.size > maximumPdfSize) {
    throw new AppError('PDF must be between 1 byte and 10 MB', 413);
  }
  if (file.buffer.subarray(0, 5).toString('ascii') !== '%PDF-') {
    throw new AppError('File content is not a valid PDF', 400);
  }
}

function serializeBankImport(item: BankImportDocument) {
  return {
    importId: String(item._id),
    originalFileName: item.originalFileName,
    bank: item.bank,
    period: { startDate: item.periodStart, endDate: item.periodEnd },
    status: item.processingStatus,
    transactionCount: item.transactionCount,
    foundTransactions: item.transactionCount,
    insertedTransactions: item.insertedTransactions,
    duplicateTransactions: item.duplicateTransactions,
    ignoredTransactions: item.ignoredTransactions,
    invalidTransactions: item.invalidTransactions,
    totalCredits: item.totalCredits,
    totalDebits: item.totalDebits,
    openingBalance: item.openingBalance,
    closingBalance: item.closingBalance,
    validation: { valid: item.validationValid, difference: item.validationDifference },
    processingErrors: item.processingErrors,
    uploadedAt: item.uploadedAt,
    processedAt: item.processedAt
  };
}

function isoDate(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function isExistingFileError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && 'code' in error && error.code === 'EEXIST';
}
