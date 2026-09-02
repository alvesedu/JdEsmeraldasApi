import { Schema, model } from 'mongoose';

const expenseCategorySchema = new Schema(
  {
    name: { type: String, required: true, unique: true, trim: true },
    active: { type: Boolean, default: true },
    defaultCounterpartyPattern: { type: String, default: null }
  },
  { timestamps: true }
);

export const ExpenseCategory = model('ExpenseCategory', expenseCategorySchema);
