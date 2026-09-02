import { Schema, model } from 'mongoose';

const pricingRuleSchema = new Schema(
  {
    unitType: { type: String, enum: ['CASA', 'LOTE'], required: true },
    amount: { type: Number, required: true, min: 0 },
    effectiveFrom: { type: Date, required: true },
    effectiveTo: { type: Date, default: null },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

pricingRuleSchema.index({ unitType: 1, effectiveFrom: -1 });

export const PricingRule = model('PricingRule', pricingRuleSchema);
