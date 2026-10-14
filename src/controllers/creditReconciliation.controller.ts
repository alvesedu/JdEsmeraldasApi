import type { Request, Response } from 'express';
import {
  allocateCredit,
  getCreditReconciliation,
  linkManualPaymentToCredit,
  listCreditTransactions,
  reversePaymentAllocation
} from '../services/creditReconciliation.service.js';
import { AppError } from '../utils/AppError.js';

export async function listCredits(req: Request, res: Response) {
  res.json({ items: await listCreditTransactions(req.query) });
}

export async function getReconciliation(req: Request, res: Response) {
  res.json(await getCreditReconciliation(String(req.params.id)));
}

export async function allocate(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  const result = await allocateCredit(String(req.params.id), req.body, req.user._id);
  res.status(201).json(result);
}

export async function linkManualPayment(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  res.json(await linkManualPaymentToCredit(String(req.params.id), req.body.allocationId, req.user._id));
}

export async function reverse(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  res.json(await reversePaymentAllocation(String(req.params.id), req.body.reason, req.user._id));
}
