import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
const competence = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Competence must use YYYY-MM');
const optionalText = z.string().trim().transform((value) => value || null).nullable().optional();

export const expenseIdSchema = z.object({ id: objectId });

export const listExpensesSchema = z.object({
  competence: competence.optional(),
  categoryId: objectId.optional(),
  classificationStatus: z.enum(['PENDING', 'SUGGESTED', 'CONFIRMED']).optional(),
  beneficiary: z.string().trim().min(1).optional()
});

export const createExpenseSchema = z.object({
  bankTransactionId: objectId.optional().nullable(),
  categoryId: objectId,
  beneficiary: z.string().trim().min(1),
  description: z.string().trim().min(1),
  competence,
  notes: optionalText,
  attachmentUrl: optionalText,
  classificationStatus: z.enum(['PENDING', 'SUGGESTED', 'CONFIRMED']).optional()
});

export const updateExpenseSchema = createExpenseSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be provided'
);
