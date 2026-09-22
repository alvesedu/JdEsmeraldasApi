import { Resident } from '../models/Resident.js';
import { createResidentSchema, residentIdSchema, updateResidentSchema } from '../schemas/resident.schemas.js';
import { AppError } from '../utils/AppError.js';
import type { NextFunction, Request, Response } from 'express';

export async function listResidents(_req: Request, res: Response) {
  const items = await Resident.find().populate('unitId');
  res.json({ items });
}

export async function createResident(req: Request, res: Response, next: NextFunction) {
  try {
    const body = createResidentSchema.parse(req.body);
    const item = await Resident.create(body);
    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
}

export async function updateResident(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = residentIdSchema.parse(req.params);
    const body = updateResidentSchema.parse(req.body);
    const item = await Resident.findByIdAndUpdate(id, body, { new: true, runValidators: true });
    if (!item) throw new AppError('Resident not found', 404);
    res.json({ item });
  } catch (error) {
    next(error);
  }
}
