import { Schema, model } from 'mongoose';
import { buildUnitKey } from '../utils/normalize.js';

const unitSchema = new Schema(
  {
    quadra: { type: String, required: true, trim: true },
    numero: { type: String, required: true, trim: true },
    tipo: { type: String, enum: ['CASA', 'LOTE'], required: true },
    status: { type: String, enum: ['ATIVA', 'INATIVA'], default: 'ATIVA' },
    monthlyValue: { type: Number, required: true, min: 0 },
    residentCurrentId: { type: Schema.Types.ObjectId, ref: 'Resident', default: null },
    residentHistory: [
      {
        residentId: { type: Schema.Types.ObjectId, ref: 'Resident' },
        startedAt: { type: Date, required: true },
        endedAt: { type: Date, default: null }
      }
    ],
    unitKey: { type: String, required: true, unique: true, index: true }
  },
  { timestamps: true }
);

unitSchema.pre('validate', function (next) {
  if (!this.unitKey) {
    this.unitKey = buildUnitKey(this.quadra, this.numero, this.tipo);
  }
  next();
});

unitSchema.index({ quadra: 1, numero: 1 }, { unique: true });

export const Unit = model('Unit', unitSchema);
