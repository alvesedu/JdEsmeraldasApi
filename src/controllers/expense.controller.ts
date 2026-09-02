import type { Request, Response } from 'express';
import {
  createExpenseSchema,
  expenseIdSchema,
  listExpensesSchema,
  updateExpenseSchema
} from '../schemas/expense.schemas.js';
import {
  createExpense,
  deleteExpense,
  listExpenses,
  updateExpense
} from '../services/expense.service.js';
import { AppError } from '../utils/AppError.js';

export async function list(req: Request, res: Response) {
  const filters = listExpensesSchema.parse(req.query);
  res.json(await listExpenses(filters));
}

export async function create(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const body = createExpenseSchema.parse(req.body);
  res.status(201).json({ item: await createExpense(body, req.user._id) });
}

export async function update(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { id } = expenseIdSchema.parse(req.params);
  const body = updateExpenseSchema.parse(req.body);
  res.json({ item: await updateExpense(id, body, req.user._id) });
}

export async function remove(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const { id } = expenseIdSchema.parse(req.params);
  res.json(await deleteExpense(id, req.user._id));
}
