import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertManualChargePaymentAllowed, calculateDaysOverdue } from './charge.service.js';
import { deriveChargeFinancials } from './creditReconciliation.service.js';

describe('manual charge payment rules', () => {
  it('allows partial and full monthly fee payments in integer cents', () => {
    assertManualChargePaymentAllowed('PENDING', 15_000, 25_000);
    const partial = deriveChargeFinancials(25_000, 15_000, new Date('2026-09-10T00:00:00.000Z'), null);
    assert.deepEqual(partial, { paidAmount: 15_000, outstandingAmount: 10_000, status: 'PARTIAL' });

    assertManualChargePaymentAllowed('PARTIAL', 10_000, 10_000);
    const paid = deriveChargeFinancials(
      25_000,
      25_000,
      new Date('2026-09-10T00:00:00.000Z'),
      new Date('2026-09-08T00:00:00.000Z')
    );
    assert.deepEqual(paid, { paidAmount: 25_000, outstandingAmount: 0, status: 'PAID' });
  });

  it('blocks overpayment, invalid cents and already closed charges', () => {
    assert.throws(() => assertManualChargePaymentAllowed('PENDING', 25_001, 25_000), /exceeds/);
    assert.throws(() => assertManualChargePaymentAllowed('PENDING', 0, 25_000), /positive integer cents/);
    assert.throws(() => assertManualChargePaymentAllowed('PAID', 1, 0), /not open/);
  });

  it('counts overdue days only after the monthly reference day', () => {
    const referenceDate = new Date('2026-09-10T00:00:00.000Z');
    assert.equal(calculateDaysOverdue(referenceDate, new Date('2026-09-09T12:00:00.000Z')), 0);
    assert.equal(calculateDaysOverdue(referenceDate, new Date('2026-09-10T23:59:59.999Z')), 0);
    assert.equal(calculateDaysOverdue(referenceDate, new Date('2026-09-11T00:00:00.000Z')), 1);
    assert.equal(calculateDaysOverdue(referenceDate, new Date('2026-09-28T00:00:00.000Z')), 18);
  });
});
