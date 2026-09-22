import { ExpenseCategory } from '../models/ExpenseCategory.js';
import type { Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';

export async function listCategories(_req: Request, res: Response) {
  const items = await ExpenseCategory.find().sort({ name: 1 });
  res.json({ items });
}

export async function createCategory(req: Request, res: Response) {
  try {
    const item = await ExpenseCategory.create(req.body);
    res.status(201).json({ item });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new AppError('Category name already exists', 409);
    throw error;
  }
}

export async function updateCategory(req: Request, res: Response) {
  try {
    const item = await ExpenseCategory.findByIdAndUpdate(req.params.id, req.body, {
      new: true,
      runValidators: true
    });
    if (!item) throw new AppError('Category not found', 404);
    res.json({ item });
  } catch (error) {
    if (isDuplicateKeyError(error)) throw new AppError('Category name already exists', 409);
    throw error;
  }
}

function isDuplicateKeyError(error: unknown) {
  return typeof error === 'object'
    && error !== null
    && 'code' in error
    && error.code === 11000;
}
