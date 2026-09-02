import { Schema, model } from 'mongoose';

const chargeSchema = new Schema(
  {
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', required: true, index: true },
    competence: { type: String, required: true, trim: true },
    valueOriginal: { type: Number, required: true, min: 0 },
    valuePaid: { type: Number, default: 0, min: 0 },
    openBalance: { type: Number, required: true, min: 0 },
    referenceDate: { type: Date, required: true },
    status: {
      type: String,
      enum: ['PENDING', 'PARTIAL', 'PAID', 'PAID_AFTER_REFERENCE_DATE'],
      default: 'PENDING'
    }
  },
  { timestamps: true }
);

chargeSchema.index({ unitId: 1, competence: 1 }, { unique: true });

export const Charge = model('Charge', chargeSchema);
