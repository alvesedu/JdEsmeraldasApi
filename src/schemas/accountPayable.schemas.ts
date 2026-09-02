import { z } from 'zod';

const competence = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Competence must use YYYY-MM');
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
const moneyInCents = z.number().int().positive().safe();
const optionalText = z.string().trim().transform((value) => value || null).nullable().optional();
const dateString = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD')
  .refine(
    (value) => {
      const parsed = new Date(`${value}T00:00:00.000Z`);
      return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
    },
    'Invalid calendar date'
  );
const optionalDate = dateString.nullable().optional();

export const accountPayableIdSchema = z.object({ id: objectId });

export const accountPayablePaymentIdSchema = z.object({
  id: objectId,
  paymentId: objectId
});

export const listAccountsPayableSchema = z.object({
  competence: competence.optional(),
  status: z.enum(['PENDING', 'PARTIAL', 'PAID', 'CANCELLED']).optional(),
  categoryId: objectId.optional(),
  beneficiaryName: z.string().trim().min(1).optional()
});

export const createAccountPayableSchema = z.object({
  description: z.string().trim().min(1),
  categoryId: objectId,
  subcategory: optionalText,
  beneficiaryName: z.string().trim().min(1),
  competence,
  expectedAmount: moneyInCents,
  dueDate: optionalDate,
  notes: optionalText
});

export const updateAccountPayableSchema = createAccountPayableSchema.partial().refine(
  (value) => Object.keys(value).length > 0,
  'At least one field must be provided'
);

export const manualPaymentSchema = z.object({
  amount: moneyInCents,
  paymentDate: dateString,
  notes: optionalText
});

export const reversePaymentSchema = z.object({
  reason: optionalText
});
