import { z } from 'zod';

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD');
const amount = z.number().int().positive();

export const pricingRuleIdSchema = z.object({ id: z.string().min(1) });

export const createPricingRuleSchema = z.object({
  unitType: z.enum(['CASA', 'LOTE']),
  amount,
  effectiveFrom: date,
  effectiveTo: date.nullable().optional(),
  active: z.boolean().optional()
}).strict();

export const updatePricingRuleSchema = createPricingRuleSchema.partial().strict().refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');
