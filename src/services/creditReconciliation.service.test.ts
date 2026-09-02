import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import {
  assertChargeAllocation,
  assertCreditTransaction,
  deriveChargeFinancials,
  deriveTransactionFinancials,
  executeAtomic,
  suggestAllocations,
  validateAllocationRequest
} from './creditReconciliation.service.js';
import { normalizeBankName } from '../utils/normalize.js';

const referenceDate = new Date('2026-08-10T00:00:00.000Z');

describe('credit reconciliation financial rules', () => {
  it('allocates a R$ 250 credit to one house charge', () => {
    assert.deepEqual(deriveTransactionFinancials(25_000, 25_000), { allocatedAmount: 25_000, remainingAmount: 0, status: 'MATCHED' });
    assert.equal(deriveChargeFinancials(25_000, 25_000, referenceDate, new Date('2026-08-10T00:00:00Z')).status, 'PAID');
  });

  it('allocates a R$ 150 credit to one lot charge', () => {
    assert.equal(deriveChargeFinancials(15_000, 15_000, referenceDate, referenceDate).status, 'PAID');
  });

  it('suggests R$ 750 across three house charges', () => {
    const suggestions = suggestAllocations(charges(3, 25_000), 75_000);
    assert.deepEqual(suggestions.map((item) => item.amount), [25_000, 25_000, 25_000]);
  });

  it('suggests R$ 600 across four lot charges', () => {
    const suggestions = suggestAllocations(charges(4, 15_000), 60_000);
    assert.deepEqual(suggestions.map((item) => item.amount), [15_000, 15_000, 15_000, 15_000]);
  });

  it('keeps a R$ 100 payment partial on a house charge', () => {
    assert.deepEqual(deriveChargeFinancials(25_000, 10_000, referenceDate, null), { paidAmount: 10_000, outstandingAmount: 15_000, status: 'PARTIAL' });
  });

  it('keeps the transaction remaining amount in integer cents', () => {
    assert.deepEqual(deriveTransactionFinancials(50_000, 25_000), { allocatedAmount: 25_000, remainingAmount: 25_000, status: 'PARTIALLY_MATCHED' });
  });

  it('rejects allocations above the transaction remaining amount', () => {
    assert.throws(() => validateAllocationRequest(25_000, 10_000, [{ chargeId: 'one', amount: 15_001 }]), /remaining amount/);
  });

  it('rejects allocations above the charge outstanding amount', () => {
    assert.throws(() => assertChargeAllocation('unit', { unitId: 'unit', openBalance: 5_000, status: 'PARTIAL' }, 5_001), /outstanding amount/);
  });

  it('rejects a charge from another unit', () => {
    assert.throws(() => assertChargeAllocation('unit-a', { unitId: 'unit-b', openBalance: 25_000, status: 'PENDING' }, 25_000), /another unit/);
  });

  it('rejects debit transactions', () => {
    assert.throws(() => assertCreditTransaction('DEBIT'), /Debit transactions/);
  });

  it('normalizes an alias consistently for later suggestions', () => {
    assert.equal(normalizeBankName('  Eduárdo  Ribeiro Alves '), 'EDUARDO RIBEIRO ALVES');
  });

  it('allows multiple normalized aliases to identify the same unit', () => {
    const unitId = new Types.ObjectId();
    const aliases = ['MARIA ALVES', 'EMPRESA ALVES'].map((name) => ({ normalizedName: normalizeBankName(name), unitId }));
    assert.equal(new Set(aliases.map((alias) => String(alias.unitId))).size, 1);
    assert.equal(new Set(aliases.map((alias) => alias.normalizedName)).size, 2);
  });

  it('returns transaction value after a logical reversal removes the allocation total', () => {
    assert.deepEqual(deriveTransactionFinancials(25_000, 0), { allocatedAmount: 0, remainingAmount: 25_000, status: 'UNMATCHED' });
  });

  it('returns a charge to pending after its payment is reversed', () => {
    assert.equal(deriveChargeFinancials(25_000, 0, referenceDate, null).status, 'PENDING');
  });

  it('classifies completion after day 10 using the bank operation date', () => {
    assert.equal(deriveChargeFinancials(25_000, 25_000, referenceDate, new Date('2026-08-18T00:00:00Z')).status, 'PAID_AFTER_REFERENCE_DATE');
  });

  it('treats any time on reference day 10 as paid on time', () => {
    assert.equal(deriveChargeFinancials(25_000, 25_000, referenceDate, new Date('2026-08-10T23:59:59Z')).status, 'PAID');
  });

  it('classifies a fully allocated transaction as matched', () => {
    assert.equal(deriveTransactionFinancials(60_000, 60_000).status, 'MATCHED');
  });

  it('classifies a partly allocated transaction as partially matched', () => {
    assert.equal(deriveTransactionFinancials(30_000, 25_000).status, 'PARTIALLY_MATCHED');
  });

  it('classifies a transaction without active allocations as unmatched', () => {
    assert.equal(deriveTransactionFinancials(30_000, 0).status, 'UNMATCHED');
  });

  it('rejects duplicate charges in one multi-allocation request', () => {
    assert.throws(() => validateAllocationRequest(50_000, 0, [{ chargeId: 'same', amount: 25_000 }, { chargeId: 'same', amount: 25_000 }]), /cannot be repeated/);
  });

  it('executes all N allocations inside one atomic callback', async () => {
    let transactionCalls = 0;
    const withTransaction = async (work: () => Promise<void>) => {
      transactionCalls += 1;
      await work();
      return {};
    };
    const result = await executeAtomic(withTransaction, async () => ['allocation-1', 'allocation-2', 'allocation-3']);
    assert.equal(transactionCalls, 1);
    assert.deepEqual(result, ['allocation-1', 'allocation-2', 'allocation-3']);
  });
});

function charges(count: number, outstandingAmount: number) {
  return Array.from({ length: count }, () => ({ _id: new Types.ObjectId(), outstandingAmount }));
}
