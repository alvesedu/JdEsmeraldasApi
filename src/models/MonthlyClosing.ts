import { Schema, model } from 'mongoose';

const monthlyClosingSchema = new Schema(
  {
    competence: { type: String, required: true, unique: true, index: true },
    status: { type: String, enum: ['OPEN', 'CLOSED'], default: 'OPEN' },
    revenueForecast: { type: Number, default: 0 },
    revenueReceived: { type: Number, default: 0 },
    revenueReceivedBeforeRef: { type: Number, default: 0 },
    revenueReceivedAfterRef: { type: Number, default: 0 },
    revenuePending: { type: Number, default: 0 },
    pendingUnitsCount: { type: Number, default: 0 },
    expenseForecast: { type: Number, default: 0 },
    expensePaid: { type: Number, default: 0 },
    openingBankBalance: { type: Number, default: 0 },
    bankInflow: { type: Number, default: 0 },
    bankOutflow: { type: Number, default: 0 },
    closingBankBalance: { type: Number, default: 0 },
    openCommitments: { type: Number, default: 0 },
    availableBalance: { type: Number, default: 0 },
    notes: { type: String, default: null }
  },
  { timestamps: true }
);

export const MonthlyClosing = model('MonthlyClosing', monthlyClosingSchema);
