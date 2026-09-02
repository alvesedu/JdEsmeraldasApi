import { Schema, model } from 'mongoose';

const residentSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    phone: { type: String, default: null, trim: true },
    email: { type: String, default: null, trim: true, lowercase: true },
    unitId: { type: Schema.Types.ObjectId, ref: 'Unit', default: null },
    active: { type: Boolean, default: true }
  },
  { timestamps: true }
);

residentSchema.index({ name: 1, unitId: 1 });

export const Resident = model('Resident', residentSchema);
