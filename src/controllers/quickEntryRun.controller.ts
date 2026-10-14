import type { Request, Response } from 'express';
import {
  archiveQuickEntryRun,
  confirmQuickEntryRunItem,
  createQuickEntryRun,
  getQuickEntryRun,
  listQuickEntryRuns
} from '../services/quickEntryRun.service.js';
import { listQuickEntryRunsSchema } from '../schemas/quickEntryRun.schemas.js';
import { AppError } from '../utils/AppError.js';

export async function list(req: Request, res: Response) {
  const query = listQuickEntryRunsSchema.parse(req.query);
  res.json(await listQuickEntryRuns(query));
}

export async function getById(req: Request, res: Response) {
  res.json(await getQuickEntryRun(String(req.params.id)));
}

export async function create(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  res.status(201).json(await createQuickEntryRun(req.body, req.user._id));
}

export async function confirmItem(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  res.json(await confirmQuickEntryRunItem(
    String(req.params.id),
    Number(req.params.lineNumber),
    req.body,
    req.user._id
  ));
}

export async function archive(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  res.json(await archiveQuickEntryRun(String(req.params.id), req.user._id));
}
