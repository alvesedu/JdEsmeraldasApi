import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  assertAccountCanBeCancelled,
  assertManualPaymentAllowed,
  buildAccountPayableFilter,
  deriveCancelledStatus,
  deriveAccountPayableFinancials
} from './accountPayable.service.js';

describe('accounts payable financial rules', () => {
  it('starts a R$ 2.100 account as pending with all values in cents', () => {
    const state = deriveAccountPayableFinancials(210_000, 0);

    assert.deepEqual(state, {
      paidAmount: 0,
      outstandingAmount: 210_000,
      status: 'PENDING'
    });
  });

  it('becomes partial after R$ 1.810 and paid after another R$ 290', () => {
    const partial = deriveAccountPayableFinancials(210_000, 181_000);
    assert.deepEqual(partial, {
      paidAmount: 181_000,
      outstandingAmount: 29_000,
      status: 'PARTIAL'
    });

    assertManualPaymentAllowed(partial.status, 29_000, partial.outstandingAmount);
    const paid = deriveAccountPayableFinancials(210_000, partial.paidAmount + 29_000);
    assert.deepEqual(paid, {
      paidAmount: 210_000,
      outstandingAmount: 0,
      status: 'PAID'
    });
  });

  it('returns to partial when the R$ 290 allocation is reversed', () => {
    const afterReversal = deriveAccountPayableFinancials(210_000, 210_000 - 29_000);
    assert.equal(afterReversal.status, 'PARTIAL');
    assert.equal(afterReversal.paidAmount, 181_000);
    assert.equal(afterReversal.outstandingAmount, 29_000);
  });

  it('allows cancelling a pending account and blocks payments after cancellation', () => {
    assert.equal(deriveCancelledStatus(0), 'CANCELLED');
    assert.throws(() => assertAccountCanBeCancelled(1), /Reverse existing payments/);
    assert.throws(
      () => assertManualPaymentAllowed('CANCELLED', 10_000, 210_000),
      /Cancelled accounts cannot receive payments/
    );
  });

  it('blocks overpayment, non-positive values and non-integer cents', () => {
    assert.throws(() => assertManualPaymentAllowed('PENDING', 210_001, 210_000), /exceeds/);
    assert.throws(() => assertManualPaymentAllowed('PENDING', 0, 210_000), /positive integer cents/);
    assert.throws(() => deriveAccountPayableFinancials(210_000.5, 0), /integer cents/);
  });

  it('builds competence and status filters without mixing financial rules', () => {
    assert.deepEqual(buildAccountPayableFilter({ competence: '2026-09' }), { competence: '2026-09' });
    assert.deepEqual(buildAccountPayableFilter({ status: 'PARTIAL' }), { status: 'PARTIAL' });
  });
});
