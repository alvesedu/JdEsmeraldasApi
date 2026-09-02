import { Schema, model } from 'mongoose';

const expenseSchema = new Schema(
  {
    bankTransactionId: { type: Schema.Types.ObjectId, ref: 'BankTransaction', default: null },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
    beneficiary: { type: String, required: true },
    description: { type: String, required: true },
    competence: { type: String, required: true },
    notes: { type: String, default: null },
    attachmentUrl: { type: String, default: null },
    classificationStatus: { type: String, enum: ['PENDING', 'SUGGESTED', 'CONFIRMED'], default: 'PENDING' },
    classifiedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    classifiedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const Expense = model('Expense', expenseSchema);
