import { Charge } from '../models/Charge.js';
import { generateMonthlyCharges, listDefaultingCharges, registerManualChargePayment } from '../services/charge.service.js';
import { AppError } from '../utils/AppError.js';
import type { NextFunction, Request, Response } from 'express';

export async function listCharges(req: Request, res: Response) {
  const filter: Record<string, unknown> = {};
  if (req.query.competence) filter.competence = req.query.competence;
  if (req.query.status) filter.status = req.query.status;
  const items = await Charge.find(filter).populate('unitId').sort({ createdAt: -1 });
  res.json({ items });
}

export async function listDefaulters(req: Request, res: Response) {
  const asOf = typeof req.query.asOf === 'string'
    ? new Date(`${req.query.asOf}T00:00:00.000Z`)
    : new Date();
  res.json({ items: await listDefaultingCharges(asOf) });
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

export async function registerManualPayment(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const result = await registerManualChargePayment(String(req.params.id), req.body, req.user._id);
  res.status(201).json(result);
}
