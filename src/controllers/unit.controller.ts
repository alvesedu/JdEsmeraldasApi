import { Unit } from '../models/Unit.js';
import { Resident } from '../models/Resident.js';
import { buildUnitKey } from '../utils/normalize.js';
import { getCurrentPricingValue } from '../services/pricing.service.js';
import { AppError } from '../utils/AppError.js';
import type { NextFunction, Request, Response } from 'express';

export async function listUnits(_req: Request, res: Response) {
  const units = await Unit.find().populate('residentCurrentId');
  res.json({ items: units });
}

export async function createUnit(req: Request, res: Response, next: NextFunction) {
  try {
    const { quadra, numero, tipo, status } = req.body;
    const referenceDate = new Date();
    const monthlyValue = await getCurrentPricingValue(tipo, referenceDate);
    const unitKey = buildUnitKey(quadra, numero, tipo);
    const unit = await Unit.create({ quadra, numero, tipo, status, monthlyValue, unitKey });
    res.status(201).json({ item: unit });
  } catch (error) {
    next(error);
  }
}

export async function updateUnit(req: Request, res: Response, next: NextFunction) {
  try {
    const unit = await Unit.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!unit) throw new AppError('Unit not found', 404);
    res.json({ item: unit });
  } catch (error) {
    next(error);
  }
}

export async function getUnit(req: Request, res: Response, next: NextFunction) {
  try {
    const unit = await Unit.findById(req.params.id).populate('residentCurrentId');
    if (!unit) throw new AppError('Unit not found', 404);
    const residents = await Resident.find({ unitId: unit._id }).sort({ createdAt: -1 });
    res.json({ item: unit, residents });
  } catch (error) {
    next(error);
  }
}
