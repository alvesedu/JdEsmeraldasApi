import { Schema, model } from 'mongoose';

const paymentAllocationSchema = new Schema(
  {
    bankTransactionId: { type: Schema.Types.ObjectId, ref: 'BankTransaction', default: null, index: true },
    chargeId: { type: Schema.Types.ObjectId, ref: 'Charge', required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: 'Amount must be integer cents' }
    },
    source: { type: String, enum: ['BANK_TRANSACTION', 'MANUAL'], default: 'BANK_TRANSACTION', index: true },
    paymentMethod: { type: String, enum: ['PIX', 'CASH', 'BANK_TRANSFER', 'BOLETO', 'OTHER', null], default: null },
    paymentDate: { type: Date, required: true },
    notes: { type: String, default: null, trim: true },
    quickEntryRunId: { type: Schema.Types.ObjectId, ref: 'QuickEntryRun', default: null, index: true },
    quickEntryLineNumber: { type: Number, default: null },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reversalReason: { type: String, default: null, trim: true }
  },
  { timestamps: true }
);

paymentAllocationSchema.index(
  { bankTransactionId: 1, chargeId: 1 },
  { unique: true, partialFilterExpression: { bankTransactionId: { $type: 'objectId' } } }
);
paymentAllocationSchema.index({ chargeId: 1, reversedAt: 1, paymentDate: 1 });

export const PaymentAllocation = model('PaymentAllocation', paymentAllocationSchema);
