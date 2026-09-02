import type { Request, Response } from 'express';
import { listAuditLogsSchema } from '../schemas/audit.schemas.js';
import { listAuditLogs } from '../services/auditLog.service.js';

export async function list(req: Request, res: Response) {
  const filters = listAuditLogsSchema.parse(req.query);
  res.json(await listAuditLogs(filters));
}
