import { z } from 'zod';

export const transactionIdSchema = z.object({ id: z.string().min(1) });

export const creditFiltersSchema = z.object({
  importId: z.string().min(1).optional(),
  competence: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  status: z.enum(['UNMATCHED', 'PARTIALLY_MATCHED', 'MATCHED']).optional(),
  counterparty: z.string().trim().min(1).optional()
});

export const allocateCreditSchema = z.object({
  unitId: z.string().min(1),
  allocations: z.array(z.object({
    chargeId: z.string().min(1),
    amount: z.number().int().positive()
  })).min(1),
  saveAlias: z.boolean().optional()
});

export const linkManualAllocationSchema = z.object({
  allocationId: z.string().min(1)
});

export const reverseAllocationSchema = z.object({ reason: z.string().trim().min(3).max(500) });
