import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createExpenseSchema } from './expense.schemas.js';
import { upsertMonthlyClosingSchema } from './monthlyClosing.schemas.js';

describe('expense and monthly closing schemas', () => {
  it('accepts an expense classification payload without monetary strings', () => {
    const parsed = createExpenseSchema.parse({
      bankTransactionId: '507f1f77bcf86cd799439012',
      categoryId: '507f1f77bcf86cd799439011',
      beneficiary: 'Fornecedor',
      description: 'Despesa de manutencao',
      competence: '2026-09',
      notes: '',
      attachmentUrl: '',
      classificationStatus: 'CONFIRMED'
    });

    assert.equal(parsed.notes, null);
    assert.equal(parsed.attachmentUrl, null);
  });

  it('requires monthly closing competence in YYYY-MM format', () => {
    assert.deepEqual(upsertMonthlyClosingSchema.parse({ competence: '2026-09', notes: 'Ok' }), {
      competence: '2026-09',
      notes: 'Ok'
    });
    assert.throws(() => upsertMonthlyClosingSchema.parse({ competence: '09/2026' }), /YYYY-MM/);
  });
});
