import { PricingRule } from '../models/PricingRule.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from './audit.service.js';
import type { Types } from 'mongoose';

export const defaultPricingInCents = {
  CASA: 25_000,
  LOTE: 15_000
} as const;

export async function getCurrentPricingValue(unitType: 'CASA' | 'LOTE', referenceDate: Date) {
  const rule = await PricingRule.findOne({
    unitType,
    active: true,
    effectiveFrom: { $lte: referenceDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: referenceDate } }]
  }).sort({ effectiveFrom: -1 });

  return rule?.amount ?? defaultPricingInCents[unitType];
}

export async function listPricingRules() {
  return PricingRule.find().sort({ unitType: 1, effectiveFrom: -1 }).lean();
}

export type PricingRuleInput = {
  unitType: 'CASA' | 'LOTE';
  amount: number;
  effectiveFrom: string;
  effectiveTo?: string | null;
  active?: boolean;
};
type PricingRuleDateRange = { effectiveFrom: Date; effectiveTo?: Date | null };

export async function createPricingRule(input: PricingRuleInput, userId: Types.ObjectId) {
  const dates = parseDates(input);
  const activeRules = await PricingRule.find({ unitType: input.unitType, active: true }).sort({ effectiveFrom: -1 });
  closePreviousRule(activeRules, dates.from);
  ensureNoFutureOverlap(activeRules, dates.from, dates.to);
  const previous = activeRules.find((rule) => rule.effectiveFrom.getTime() < dates.from.getTime() && isOpenAt(rule.effectiveFrom, rule.effectiveTo, dates.from));
  if (previous) {
    previous.effectiveTo = dayBefore(dates.from);
    await previous.save();
  }
  const item = await PricingRule.create({
    unitType: input.unitType,
    amount: input.amount,
    effectiveFrom: dates.from,
    effectiveTo: dates.to,
    active: input.active ?? true
  });
  await writeAudit({ userId, action: 'PRICING_RULE_CREATED', entityType: 'PricingRule', entityId: String(item._id), after: item.toObject() });
  return item;
}

export async function updatePricingRule(id: string, input: Partial<PricingRuleInput>, userId: Types.ObjectId) {
  const item = await PricingRule.findById(id);
  if (!item) throw new AppError('Pricing rule not found', 404);
  const before = item.toObject();
  const next = {
    unitType: input.unitType ?? item.unitType,
    amount: input.amount ?? item.amount,
    effectiveFrom: input.effectiveFrom ?? item.effectiveFrom.toISOString().slice(0, 10),
    effectiveTo: input.effectiveTo === undefined ? formatDate(item.effectiveTo ?? null) : input.effectiveTo,
    active: input.active ?? item.active
  } satisfies PricingRuleInput;
  const dates = parseDates(next);
  const activeRules = await PricingRule.find({ unitType: next.unitType, active: true, _id: { $ne: item._id } });
  ensureNoOverlap(activeRules, dates.from, dates.to);
  item.set({ unitType: next.unitType, amount: next.amount, effectiveFrom: dates.from, effectiveTo: dates.to, active: next.active });
  await item.save();
  await writeAudit({ userId, action: 'PRICING_RULE_UPDATED', entityType: 'PricingRule', entityId: id, before, after: item.toObject() });
  return item;
}

export async function deactivatePricingRule(id: string, userId: Types.ObjectId) {
  const item = await PricingRule.findById(id);
  if (!item) throw new AppError('Pricing rule not found', 404);
  const before = item.toObject();
  item.active = false;
  item.effectiveTo = item.effectiveTo ?? new Date();
  await item.save();
  await writeAudit({ userId, action: 'PRICING_RULE_DEACTIVATED', entityType: 'PricingRule', entityId: id, before, after: item.toObject() });
  return item;
}

function parseDates(input: PricingRuleInput) {
  const from = parseDate(input.effectiveFrom);
  const to = input.effectiveTo ? parseDate(input.effectiveTo) : null;
  if (to && to.getTime() < from.getTime()) throw new AppError('Pricing rule end date must be after start date', 400);
  if (!Number.isInteger(input.amount) || input.amount <= 0) throw new AppError('Pricing rule amount must be a positive integer in cents', 400);
  return { from, to };
}

function parseDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError('Pricing rule dates must use YYYY-MM-DD', 400);
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) throw new AppError('Pricing rule date is invalid', 400);
  return date;
}

function closePreviousRule(rules: PricingRuleDateRange[], from: Date) {
  return rules.find((rule) => rule.effectiveFrom.getTime() < from.getTime() && isOpenAt(rule.effectiveFrom, rule.effectiveTo, from));
}

function ensureNoFutureOverlap(rules: PricingRuleDateRange[], from: Date, to: Date | null) {
  const futureRules = rules.filter((rule) => rule.effectiveFrom.getTime() >= from.getTime());
  ensureNoOverlap(futureRules, from, to);
}

function ensureNoOverlap(rules: PricingRuleDateRange[], from: Date, to: Date | null) {
  const end = to?.getTime() ?? Number.POSITIVE_INFINITY;
  if (rules.some((rule) => rule.effectiveFrom.getTime() <= end && (rule.effectiveTo?.getTime() ?? Number.POSITIVE_INFINITY) >= from.getTime())) {
    throw new AppError('Pricing rule period overlaps another active rule', 409);
  }
}

function isOpenAt(from: Date, to: Date | null | undefined, date: Date) {
  return from.getTime() <= date.getTime() && (to?.getTime() ?? Number.POSITIVE_INFINITY) >= date.getTime();
}

function dayBefore(date: Date) {
  return new Date(date.getTime() - 86_400_000);
}

function formatDate(date: Date | null) {
  return date?.toISOString().slice(0, 10) ?? null;
}
