import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
const moneyInCents = z.number().int().positive().safe();
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
const optionalText = z.string().trim().transform((value) => value || null).nullable().optional();

export const chargeIdSchema = z.object({ id: objectId });

export const defaulterQuerySchema = z.object({
  asOf: dateString.optional()
});

export const manualChargePaymentSchema = z.object({
  amount: moneyInCents,
  paymentDate: dateString,
  paymentMethod: z.enum(['PIX', 'CASH', 'BANK_TRANSFER', 'BOLETO', 'OTHER']),
  notes: optionalText,
  quickEntryRunId: objectId.optional(),
  quickEntryLineNumber: z.number().int().positive().optional()
});
