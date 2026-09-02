import type { Request, Response } from 'express';
import {
  listMonthlyClosingsSchema,
  monthlyClosingParamsSchema,
  updateMonthlyClosingSchema,
  upsertMonthlyClosingSchema
} from '../schemas/monthlyClosing.schemas.js';
import {
  getMonthlyClosing,
  listMonthlyClosings,
  updateMonthlyClosing,
  upsertMonthlyClosing
} from '../services/monthlyClosing.service.js';
import { AppError } from '../utils/AppError.js';

export async function list(req: Request, res: Response) {
  const filters = listMonthlyClosingsSchema.parse(req.query);
  res.json(await listMonthlyClosings(filters));
}

export async function getByCompetence(req: Request, res: Response) {
  const { competence } = monthlyClosingParamsSchema.parse(req.params);
  res.json(await getMonthlyClosing(competence));
}

export async function upsert(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const body = upsertMonthlyClosingSchema.parse(req.body);
  res.status(201).json(await upsertMonthlyClosing(body.competence, body.notes ?? null, req.user._id));
}

export async function update(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { competence } = monthlyClosingParamsSchema.parse(req.params);
  const body = updateMonthlyClosingSchema.parse(req.body);
  res.json(await updateMonthlyClosing(competence, body, req.user._id));
}
