import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { defaultPricingInCents } from './pricing.service.js';

describe('pricing defaults', () => {
  it('keeps default monthly values in integer cents', () => {
    assert.equal(defaultPricingInCents.CASA, 25_000);
    assert.equal(defaultPricingInCents.LOTE, 15_000);
  });
});
