import { PricingRule } from '../models/PricingRule.js';

export const defaultPricingInCents = {
  CASA: 25_000,
  LOTE: 15_000
} as const;

export async function getCurrentPricingValue(unitType: 'CASA' | 'LOTE', referenceDate: Date) {
  const rule = await PricingRule.findOne({
    unitType,
    effectiveFrom: { $lte: referenceDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: referenceDate } }]
  }).sort({ effectiveFrom: -1 });

  return rule?.amount ?? defaultPricingInCents[unitType];
}
