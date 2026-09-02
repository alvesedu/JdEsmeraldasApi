import { Schema, model } from 'mongoose';

const paymentAllocationSchema = new Schema(
  {
    bankTransactionId: { type: Schema.Types.ObjectId, ref: 'BankTransaction', required: true, index: true },
    chargeId: { type: Schema.Types.ObjectId, ref: 'Charge', required: true, index: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: 'Amount must be integer cents' }
    },
    paymentDate: { type: Date, required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reversalReason: { type: String, default: null, trim: true }
  },
  { timestamps: true }
);

paymentAllocationSchema.index({ bankTransactionId: 1, chargeId: 1 }, { unique: true });
paymentAllocationSchema.index({ chargeId: 1, reversedAt: 1, paymentDate: 1 });

export const PaymentAllocation = model('PaymentAllocation', paymentAllocationSchema);
