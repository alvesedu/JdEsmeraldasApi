import { Schema, model } from 'mongoose';

const accountPayableSchema = new Schema(
  {
    description: { type: String, required: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
    beneficiary: { type: String, required: true },
    competence: { type: String, required: true },
    expectedValue: { type: Number, required: true },
    dueDate: { type: Date, default: null },
    status: { type: String, enum: ['PENDING', 'PARTIAL', 'PAID', 'CANCELLED'], default: 'PENDING' },
    paidValue: { type: Number, default: 0 },
    bankTransactionId: { type: Schema.Types.ObjectId, ref: 'BankTransaction', default: null }
  },
  { timestamps: true }
);

export const AccountPayable = model('AccountPayable', accountPayableSchema);
