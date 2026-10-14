import { Schema, model } from 'mongoose';

const quickEntryItemSchema = new Schema(
  {
    lineNumber: { type: Number, required: true, min: 1 },
    rawText: { type: String, required: true, trim: true, maxlength: 1000 },
    sequence: { type: String, default: null, trim: true },
    payerName: { type: String, default: '', trim: true, maxlength: 300 },
    paid: { type: Boolean, required: true },
    amountCents: { type: Number, default: null, min: 0 },
    amountText: { type: String, default: null, trim: true },
    periodHints: [{ type: String, trim: true }],
    notes: { type: String, default: '', trim: true, maxlength: 1000 },
    confidence: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW'], required: true },
    suggestedResidentId: { type: Schema.Types.ObjectId, ref: 'Resident', default: null },
    suggestedUnitId: { type: Schema.Types.ObjectId, ref: 'Unit', default: null },
    suggestionConfidence: { type: String, enum: ['HIGH', 'MEDIUM', 'LOW', null], default: null },
    suggestionReason: { type: String, default: null, trim: true },
    confirmedChargeId: { type: Schema.Types.ObjectId, ref: 'Charge', default: null },
    confirmedPaymentAllocationId: { type: Schema.Types.ObjectId, ref: 'PaymentAllocation', default: null },
    confirmedAt: { type: Date, default: null }
  },
  { _id: false }
);

const quickEntryTotalsSchema = new Schema(
  {
    lines: { type: Number, required: true, min: 0 },
    paid: { type: Number, required: true, min: 0 },
    unpaid: { type: Number, required: true, min: 0 },
    withAmount: { type: Number, required: true, min: 0 },
    withoutAmount: { type: Number, required: true, min: 0 },
    amountCents: { type: Number, required: true, min: 0 }
  },
  { _id: false }
);

const quickEntryRunSchema = new Schema(
  {
    label: { type: String, required: true, trim: true, maxlength: 120 },
    rawText: { type: String, required: true, maxlength: 100_000 },
    items: { type: [quickEntryItemSchema], required: true },
    totals: { type: quickEntryTotalsSchema, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    archivedAt: { type: Date, default: null, index: true },
    archivedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

quickEntryRunSchema.index({ createdAt: -1 });
quickEntryRunSchema.index({ archivedAt: 1, createdAt: -1 });

export const QuickEntryRun = model('QuickEntryRun', quickEntryRunSchema);
