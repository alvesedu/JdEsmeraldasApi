import type { Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';
import { createPricingRule, deactivatePricingRule, listPricingRules, updatePricingRule } from '../services/pricing.service.js';

export async function listPricingRulesController(_req: Request, res: Response) {
  res.json({ items: await listPricingRules() });
}

export async function createPricingRuleController(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  res.status(201).json({ item: await createPricingRule(req.body, req.user._id) });
}

export async function updatePricingRuleController(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  res.json({ item: await updatePricingRule(String(req.params.id), req.body, req.user._id) });
}

export async function deactivatePricingRuleController(req: Request, res: Response) {
  if (!req.user) throw new AppError('Unauthorized', 401);
  res.json({ item: await deactivatePricingRule(String(req.params.id), req.user._id) });
}
