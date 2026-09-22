import { z } from 'zod';

const nullableText = z.string().trim().transform((value) => value || null).nullable().optional();

export const categoryIdSchema = z.object({
  id: z.string().min(1)
});

export const createCategorySchema = z.object({
  name: z.string().trim().min(1),
  defaultCounterpartyPattern: nullableText
}).strict();

export const updateCategorySchema = z.object({
  name: z.string().trim().min(1).optional(),
  defaultCounterpartyPattern: nullableText,
  active: z.boolean().optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');

