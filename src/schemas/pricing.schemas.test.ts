import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPricingRuleSchema, updatePricingRuleSchema } from './pricing.schemas.js';

describe('pricing rule schemas', () => {
  it('accepts a CASA value in integer cents', () => {
    assert.deepEqual(createPricingRuleSchema.parse({
      unitType: 'CASA',
      amount: 25_000,
      effectiveFrom: '2026-11-01',
      effectiveTo: null
    }), {
      unitType: 'CASA',
      amount: 25_000,
      effectiveFrom: '2026-11-01',
      effectiveTo: null
    });
  });

  it('accepts a partial update for a LOTE rule', () => {
    assert.deepEqual(updatePricingRuleSchema.parse({ amount: 18_000, active: true }), {
      amount: 18_000,
      active: true
    });
  });

  it('rejects invalid amount, date and unknown fields', () => {
    assert.throws(() => createPricingRuleSchema.parse({
      unitType: 'CASA',
      amount: 250.5,
      effectiveFrom: '2026/11/01'
    }));
    assert.throws(() => updatePricingRuleSchema.parse({ monthlyValue: 25000 }), /Unrecognized key/);
  });
});
