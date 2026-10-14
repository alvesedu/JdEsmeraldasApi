import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { assertPeriodOpenStatus } from './financialPeriod.service.js';

describe('financial period lock', () => {
  it('allows mutations in an open competence', () => {
    assert.doesNotThrow(() => assertPeriodOpenStatus('OPEN', '2026-09'));
  });

  it('rejects mutations in a closed competence', () => {
    assert.throws(
      () => assertPeriodOpenStatus('CLOSED', '2026-09'),
      (error: unknown) => error instanceof Error
        && error.message.includes('2026-09')
        && 'statusCode' in error
        && error.statusCode === 409
    );
  });
});
