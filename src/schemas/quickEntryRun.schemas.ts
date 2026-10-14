import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
const nullableTrimmedText = z.string().trim().transform((value) => value || null).nullable().optional();

export const quickEntryRunParamsSchema = z.object({
  id: objectId
});

export const quickEntryRunItemParamsSchema = z.object({
  id: objectId,
  lineNumber: z.coerce.number().int().positive()
});

export const listQuickEntryRunsSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
  includeArchived: z.coerce.boolean().default(false)
});

export const quickEntryItemSchema = z.object({
  lineNumber: z.number().int().positive(),
  rawText: z.string().trim().min(1).max(1000),
  sequence: nullableTrimmedText,
  payerName: z.string().trim().max(300).default(''),
  paid: z.boolean(),
  amountCents: z.number().int().min(0).safe().nullable(),
  amountText: nullableTrimmedText,
  periodHints: z.array(z.string().trim().min(1).max(40)).max(12).default([]),
  notes: z.string().trim().max(1000).default(''),
  confidence: z.enum(['HIGH', 'MEDIUM', 'LOW'])
});

export const createQuickEntryRunSchema = z.object({
  label: nullableTrimmedText,
  rawText: z.string().trim().min(1).max(100_000),
  items: z.array(quickEntryItemSchema).min(1).max(500)
});

export const confirmQuickEntryRunItemSchema = z.object({
  chargeId: objectId,
  paymentAllocationId: objectId
});
