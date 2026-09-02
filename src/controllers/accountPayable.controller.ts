import type { Request, Response } from 'express';
import {
  accountPayableIdSchema,
  accountPayablePaymentIdSchema,
  createAccountPayableSchema,
  listAccountsPayableSchema,
  manualPaymentSchema,
  reversePaymentSchema,
  updateAccountPayableSchema
} from '../schemas/accountPayable.schemas.js';
import {
  cancelAccountPayable,
  createAccountPayable,
  getAccountPayable,
  listAccountsPayable,
  registerManualPayment,
  reverseManualPayment,
  updateAccountPayable
} from '../services/accountPayable.service.js';
import { AppError } from '../utils/AppError.js';

export async function list(req: Request, res: Response) {
  const filters = listAccountsPayableSchema.parse(req.query);
  res.json(await listAccountsPayable(filters));
}

export async function getById(req: Request, res: Response) {
  const { id } = accountPayableIdSchema.parse(req.params);
  res.json(await getAccountPayable(id));
}

export async function create(req: Request, res: Response) {
  const userId = authenticatedUserId(req);
  const body = createAccountPayableSchema.parse(req.body);
  const input = {
    ...body,
    dueDate:
      body.dueDate === null || body.dueDate === undefined
        ? body.dueDate
        : new Date(`${body.dueDate}T00:00:00.000Z`)
  };
  res.status(201).json({ item: await createAccountPayable(input, userId) });
}

export async function update(req: Request, res: Response) {
  const userId = authenticatedUserId(req);
  const { id } = accountPayableIdSchema.parse(req.params);
  const body = updateAccountPayableSchema.parse(req.body);
  const input = {
    ...body,
    dueDate:
      body.dueDate === null || body.dueDate === undefined
        ? body.dueDate
        : new Date(`${body.dueDate}T00:00:00.000Z`)
  };
  res.json({ item: await updateAccountPayable(id, input, userId) });
}

export async function cancel(req: Request, res: Response) {
  const userId = authenticatedUserId(req);
  const { id } = accountPayableIdSchema.parse(req.params);
  res.json({ item: await cancelAccountPayable(id, userId) });
}

export async function addManualPayment(req: Request, res: Response) {
  const userId = authenticatedUserId(req);
  const { id } = accountPayableIdSchema.parse(req.params);
  const body = manualPaymentSchema.parse(req.body);
  const input = { ...body, paymentDate: new Date(`${body.paymentDate}T00:00:00.000Z`) };
  res.status(201).json(await registerManualPayment(id, input, userId));
}

export async function reversePayment(req: Request, res: Response) {
  const userId = authenticatedUserId(req);
  const { id, paymentId } = accountPayablePaymentIdSchema.parse(req.params);
  const { reason } = reversePaymentSchema.parse(req.body);
  res.json(await reverseManualPayment(id, paymentId, reason ?? null, userId));
}

function authenticatedUserId(req: Request) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  return req.user._id;
}
