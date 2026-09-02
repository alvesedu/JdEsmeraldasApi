import { Schema, model } from 'mongoose';

const paymentAllocationSchema = new Schema(
  {
    bankTransactionId: { type: Schema.Types.ObjectId, ref: 'BankTransaction', required: true, index: true },
    chargeId: { type: Schema.Types.ObjectId, ref: 'Charge', required: true, index: true },
    amount: { type: Number, required: true, min: 0 }
  },
  { timestamps: true }
);

paymentAllocationSchema.index({ bankTransactionId: 1, chargeId: 1 }, { unique: true });

export const PaymentAllocation = model('PaymentAllocation', paymentAllocationSchema);
