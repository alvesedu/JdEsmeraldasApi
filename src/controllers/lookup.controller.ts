import { ExpenseCategory } from '../models/ExpenseCategory.js';
import type { Request, Response } from 'express';

export async function listCategories(_req: Request, res: Response) {
  const items = await ExpenseCategory.find().sort({ name: 1 });
  res.json({ items });
}

export async function createCategory(req: Request, res: Response) {
  const item = await ExpenseCategory.create(req.body);
  res.status(201).json({ item });
}
