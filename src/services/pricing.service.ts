import { PricingRule } from '../models/PricingRule.js';

export async function getCurrentPricingValue(unitType: 'CASA' | 'LOTE', referenceDate: Date) {
  const rule = await PricingRule.findOne({
    unitType,
    effectiveFrom: { $lte: referenceDate },
    $or: [{ effectiveTo: null }, { effectiveTo: { $gte: referenceDate } }]
  }).sort({ effectiveFrom: -1 });

  return rule?.amount ?? (unitType === 'CASA' ? 250 : 150);
}
