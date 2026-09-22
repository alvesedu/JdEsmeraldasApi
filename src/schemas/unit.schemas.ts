import { z } from 'zod';

export const unitIdSchema = z.object({ id: z.string().min(1) });

export const createUnitSchema = z.object({
  quadra: z.string().trim().min(1),
  numero: z.string().trim().min(1),
  tipo: z.enum(['CASA', 'LOTE']),
  status: z.enum(['ATIVA', 'INATIVA']).optional()
}).strict();

export const updateUnitSchema = z.object({
  status: z.enum(['ATIVA', 'INATIVA'])
}).strict();

export type UpdateUnitInput = z.infer<typeof updateUnitSchema>;
