import { Charge } from '../models/Charge.js';
import { generateMonthlyCharges } from '../services/charge.service.js';
import { AppError } from '../utils/AppError.js';
import type { NextFunction, Request, Response } from 'express';

export async function listCharges(req: Request, res: Response) {
  const filter: Record<string, unknown> = {};
  if (req.query.competence) filter.competence = req.query.competence;
  if (req.query.status) filter.status = req.query.status;
  const items = await Charge.find(filter).populate('unitId').sort({ createdAt: -1 });
  res.json({ items });
}

export async function generateCharges(req: Request, res: Response, next: NextFunction) {
  try {
    const { competence } = req.body;
    if (!competence) throw new AppError('Competence is required', 400);
    const result = await generateMonthlyCharges(competence);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
