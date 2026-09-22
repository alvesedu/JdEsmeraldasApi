import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createCategorySchema, updateCategorySchema } from './lookup.schemas.js';

describe('lookup category schemas', () => {
  it('accepts category creation and normalizes empty counterparty pattern', () => {
    const parsed = createCategorySchema.parse({
      name: ' Manutencao ',
      defaultCounterpartyPattern: ''
    });

    assert.deepEqual(parsed, {
      name: 'Manutencao',
      defaultCounterpartyPattern: null
    });
  });

  it('accepts category update with active status', () => {
    assert.deepEqual(updateCategorySchema.parse({
      name: 'Jardinagem',
      active: false
    }), {
      name: 'Jardinagem',
      active: false
    });
  });

  it('rejects empty and unknown category updates', () => {
    assert.throws(() => updateCategorySchema.parse({}), /At least one field/);
    assert.throws(() => updateCategorySchema.parse({ unitId: 'blocked' }), /Unrecognized key/);
  });
});
