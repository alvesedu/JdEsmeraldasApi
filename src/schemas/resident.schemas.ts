import { z } from 'zod';

const nullableText = z.string().trim().transform((value) => value || null).nullable().optional();

export const residentIdSchema = z.object({ id: z.string().min(1) });

export const createResidentSchema = z.object({
  name: z.string().trim().min(1),
  phone: nullableText,
  email: nullableText,
  active: z.boolean().optional()
}).strict();

export const updateResidentSchema = z.object({
  name: z.string().trim().min(1).optional(),
  phone: nullableText,
  email: nullableText,
  active: z.boolean().optional()
}).strict().refine((value) => Object.keys(value).length > 0, 'At least one field must be provided');
