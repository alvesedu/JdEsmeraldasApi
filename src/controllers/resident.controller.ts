import { Resident } from '../models/Resident.js';
import { Unit } from '../models/Unit.js';
import { AppError } from '../utils/AppError.js';
import type { NextFunction, Request, Response } from 'express';

export async function listResidents(_req: Request, res: Response) {
  const items = await Resident.find().populate('unitId');
  res.json({ items });
}

export async function createResident(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await Resident.create(req.body);
    if (req.body.unitId) {
      await Unit.findByIdAndUpdate(req.body.unitId, {
        residentCurrentId: item._id,
        $push: { residentHistory: { residentId: item._id, startedAt: new Date(), endedAt: null } }
      });
    }
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
}

export async function updateResident(req: Request, res: Response, next: NextFunction) {
  try {
    const item = await Resident.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!item) throw new AppError('Resident not found', 404);
    res.json({ item });
  } catch (error) {
    next(error);
  }
}
