import type { Request, Response } from 'express';
import { buildFinancialReports } from '../services/report.service.js';

export async function getFinancialReports(req: Request, res: Response) {
  const from = typeof req.query.from === 'string' ? req.query.from : undefined;
  const to = typeof req.query.to === 'string' ? req.query.to : undefined;
  res.json(await buildFinancialReports(from, to));
}
