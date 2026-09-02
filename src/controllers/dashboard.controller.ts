import { buildDashboard } from '../services/dashboard.service.js';
import type { Request, Response } from 'express';

export async function getDashboard(req: Request, res: Response) {
  const competence = String(req.query.competence ?? new Date().toISOString().slice(0, 7));
  const data = await buildDashboard(competence);
  res.json(data);
}
