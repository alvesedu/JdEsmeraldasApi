import { Unit } from '../models/Unit.js';
import { Resident } from '../models/Resident.js';
import { buildUnitKey } from '../utils/normalize.js';
import { getCurrentPricingValue } from '../services/pricing.service.js';
import { AppError } from '../utils/AppError.js';
import { getUnitOpenCharges } from '../services/creditReconciliation.service.js';
import { changeUnitResident, updateUnitAdministrative } from '../services/unit.service.js';
import { changeUnitResidentSchema } from '../schemas/unit.schemas.js';
import type { NextFunction, Request, Response } from 'express';

export async function listUnits(_req: Request, res: Response) {
  const units = await Unit.find().populate('residentCurrentId');
  res.json({ items: units });
}

export async function createUnit(req: Request, res: Response, next: NextFunction) {
  try {
    const { quadra, numero, tipo, status } = req.body;
    const existingUnit = await Unit.findOne({
      quadra: normalizedAddressPart(quadra),
      numero: normalizedAddressPart(numero)
    }).select('_id');
    if (existingUnit) throw new AppError('Unit with this quadra and number already exists', 409);

    const referenceDate = new Date();
    const monthlyValue = await getCurrentPricingValue(tipo, referenceDate);
    const unitKey = buildUnitKey(quadra, numero, tipo);
    const unit = await Unit.create({ quadra, numero, tipo, status, monthlyValue, unitKey });
    res.status(201).json({ item: unit });
  } catch (error) {
    next(error);
  }
}

function normalizedAddressPart(value: string) {
  return value.trim().toLocaleUpperCase('pt-BR');
}

export async function updateUnit(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const unit = await updateUnitAdministrative(String(req.params.id), req.body, req.user._id);
    res.json({ item: unit });
  } catch (error) {
    next(error);
  }
}

export async function getUnit(req: Request, res: Response, next: NextFunction) {
  try {
    const unit = await Unit.findById(req.params.id)
      .populate('residentCurrentId')
      .populate('residentHistory.residentId');
    if (!unit) throw new AppError('Unit not found', 404);
    const residents = await Resident.find({ unitId: unit._id }).sort({ createdAt: -1 });
    res.json({ item: unit, residents });
  } catch (error) {
    next(error);
  }
}

export async function listOpenCharges(req: Request, res: Response) {
  const competence = typeof req.query.competence === 'string' ? req.query.competence : undefined;
  res.json({ items: await getUnitOpenCharges(String(req.params.id), { competence }) });
}

export async function changeResident(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.user) throw new AppError('Unauthorized', 401);
    const body = changeUnitResidentSchema.parse(req.body);
    const result = await changeUnitResident(String(req.params.id), body, req.user._id);
    res.json(result);
  } catch (error) {
    next(error);
  }
}
