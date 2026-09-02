import { z } from 'zod';

const competence = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Competence must use YYYY-MM');
const optionalText = z.string().trim().transform((value) => value || null).nullable().optional();

export const monthlyClosingParamsSchema = z.object({ competence });
export const listMonthlyClosingsSchema = z.object({ competence: competence.optional(), status: z.enum(['OPEN', 'CLOSED']).optional() });
export const upsertMonthlyClosingSchema = z.object({ competence, notes: optionalText });
export const updateMonthlyClosingSchema = z.object({ notes: optionalText, status: z.enum(['OPEN', 'CLOSED']).optional() }).refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be provided'
);
