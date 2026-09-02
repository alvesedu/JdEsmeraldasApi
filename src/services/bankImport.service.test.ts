import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { ParsedBankTransaction } from '../bankParsers/types.js';
import {
  calculateTransactionTotals,
  canReprocessImport,
  determineImportStatus,
  isDuplicateFileHash,
  prepareTransactionBatch,
  validateStatementBalance
} from './bankImport.service.js';

const baseTransaction: ParsedBankTransaction = {
  postingDate: '2026-08-03',
  operationDate: '2026-08-01',
  operationTime: '08:59',
  lot: '0000',
  document: '123456',
  description: 'Pix - Recebido',
  transactionType: 'PIX_RECEIVED',
  counterpartyOriginalName: 'Pessoa Exemplo',
  counterpartyNormalizedName: 'PESSOA EXEMPLO',
  counterpartyDocument: null,
  amount: 25_000,
  direction: 'CREDIT',
  rawData: { lines: [], originalDescription: 'Pix - Recebido', originalValue: '250,00 (+)' }
};

describe('bank import rules', () => {
  it('recognizes the same uploaded file hash', () => {
    assert.equal(isDuplicateFileHash('hash-a', 'hash-a'), true);
    assert.equal(isDuplicateFileHash('hash-a', 'hash-b'), false);
    assert.equal(canReprocessImport('FAILED'), true);
    assert.equal(canReprocessImport('PROCESSED'), false);
  });

  it('does not insert transactions already found in an overlapping statement', () => {
    const transactions = [
      { ...baseTransaction, fingerprint: 'existing' },
      { ...baseTransaction, document: 'new', fingerprint: 'new' }
    ];
    const batch = prepareTransactionBatch(transactions, new Set(['existing']));
    assert.deepEqual(batch.toInsert.map((item) => item.fingerprint), ['new']);
    assert.equal(batch.existingCount, 1);
    assert.equal(batch.ignoredWithinFile, 0);
  });

  it('ignores duplicate transaction blocks inside the same extracted file', () => {
    const transaction = { ...baseTransaction, fingerprint: 'repeated' };
    const batch = prepareTransactionBatch([transaction, transaction], new Set());
    assert.equal(batch.toInsert.length, 1);
    assert.equal(batch.ignoredWithinFile, 1);
  });

  it('sums credits and debits and validates the final balance', () => {
    const totals = calculateTransactionTotals([
      baseTransaction,
      { ...baseTransaction, amount: 181_000, direction: 'DEBIT' }
    ]);
    assert.deepEqual(totals, { totalCredits: 25_000, totalDebits: 181_000 });
    assert.deepEqual(validateStatementBalance(100_000, -56_000, 25_000, 181_000), {
      valid: true,
      difference: 0,
      expectedClosingBalance: -56_000
    });
  });

  it('marks balance divergence for manual review', () => {
    const validation = validateStatementBalance(100_000, -55_900, 25_000, 181_000);
    assert.equal(validation.valid, false);
    assert.equal(validation.difference, 100);
    assert.equal(determineImportStatus(2, 0, validation.valid), 'REVIEW_REQUIRED');
  });
});
