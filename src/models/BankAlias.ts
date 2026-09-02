import { Schema, model } from 'mongoose';

const bankAliasSchema = new Schema(
  {
    bankName: { type: String, required: true, index: true },
    normalizedName: { type: String, required: true, index: true },
    originalName: { type: String, required: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    status: { type: String, enum: ['PENDING', 'SUGGESTED', 'CONFIRMED'], default: 'CONFIRMED' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

bankAliasSchema.index({ bankName: 1, normalizedName: 1 }, { unique: true });

export const BankAlias = model('BankAlias', bankAliasSchema);
