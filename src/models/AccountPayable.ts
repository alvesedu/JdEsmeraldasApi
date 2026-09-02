import { Schema, model } from 'mongoose';

const moneyField = {
  type: Number,
  required: true,
  min: 0,
  validate: { validator: Number.isSafeInteger, message: 'Money values must be integer cents' }
};

const accountPayableSchema = new Schema(
  {
    description: { type: String, required: true, trim: true },
    categoryId: { type: Schema.Types.ObjectId, ref: 'ExpenseCategory', required: true },
    subcategory: { type: String, default: null, trim: true },
    beneficiaryName: { type: String, required: true, trim: true },
    competence: { type: String, required: true, match: /^\d{4}-(0[1-9]|1[0-2])$/ },
    expectedAmount: { ...moneyField, min: 1 },
    paidAmount: { ...moneyField, default: 0 },
    outstandingAmount: { ...moneyField },
    dueDate: { type: Date, default: null },
    notes: { type: String, default: null, trim: true },
    status: { type: String, enum: ['PENDING', 'PARTIAL', 'PAID', 'CANCELLED'], default: 'PENDING' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

accountPayableSchema.index({ competence: 1, status: 1 });
accountPayableSchema.index({ categoryId: 1, competence: 1 });

export const AccountPayable = model('AccountPayable', accountPayableSchema);
