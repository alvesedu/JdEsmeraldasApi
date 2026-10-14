import { z } from 'zod';

export const unitIdSchema = z.object({ id: z.string().min(1) });

export const createUnitSchema = z.object({
  quadra: z.string().trim().min(1).transform((value) => value.toLocaleUpperCase('pt-BR')),
  numero: z.string().trim().min(1),
  tipo: z.enum(['CASA', 'LOTE']),
  status: z.enum(['ATIVA', 'INATIVA']).optional()
}).strict();

export const updateUnitSchema = z.object({
  status: z.enum(['ATIVA', 'INATIVA'])
}).strict();

export const changeUnitResidentSchema = z.object({
  residentId: z.string().min(1).nullable().optional(),
  effectiveDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional()
}).strict();

export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
export type ChangeUnitResidentInput = z.infer<typeof changeUnitResidentSchema>;
