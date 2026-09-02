import { Schema, model } from 'mongoose';

const expensePaymentAllocationSchema = new Schema(
  {
    accountPayableId: { type: Schema.Types.ObjectId, ref: 'AccountPayable', required: true, index: true },
    bankTransactionId: { type: Schema.Types.ObjectId, ref: 'BankTransaction', default: null, index: true },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: 'Amount must be integer cents' }
    },
    source: { type: String, enum: ['BANK_TRANSACTION', 'MANUAL'], required: true },
    paymentDate: { type: Date, required: true },
    notes: { type: String, default: null, trim: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reversedAt: { type: Date, default: null },
    reversedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reversalReason: { type: String, default: null, trim: true }
  },
  { timestamps: true }
);

expensePaymentAllocationSchema.index({ accountPayableId: 1, reversedAt: 1, paymentDate: -1 });

export const ExpensePaymentAllocation = model('ExpensePaymentAllocation', expensePaymentAllocationSchema);
