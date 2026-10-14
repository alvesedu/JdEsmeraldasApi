import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { summarizeQuickEntryItems, type QuickEntryRunItem } from './quickEntryRun.service.js';

describe('quick entry run summaries', () => {
  it('summarizes paid, unpaid and detected amounts from parsed items', () => {
    const items: QuickEntryRunItem[] = [
      quickItem({ paid: true, amountCents: 25_000 }),
      quickItem({ paid: false, amountCents: null }),
      quickItem({ paid: true, amountCents: null })
    ];

    assert.deepEqual(summarizeQuickEntryItems(items), {
      lines: 3,
      paid: 2,
      unpaid: 1,
      withAmount: 1,
      withoutAmount: 2,
      amountCents: 25_000
    });
  });
});

function quickItem(overrides: Partial<QuickEntryRunItem>): QuickEntryRunItem {
  return {
    lineNumber: 1,
    rawText: '1 - Morador',
    sequence: '1',
    payerName: 'Morador',
    paid: false,
    amountCents: null,
    amountText: null,
    periodHints: [],
    notes: 'Morador',
    confidence: 'MEDIUM',
    ...overrides
  };
}
