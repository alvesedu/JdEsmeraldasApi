import { Schema, model } from 'mongoose';

const bankImportSchema = new Schema(
  {
    originalFileName: { type: String, required: true },
    period: { type: String, default: null },
    bank: { type: String, default: 'BANCO_DO_BRASIL' },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fileHash: { type: String, required: true, unique: true, index: true },
    processingStatus: { type: String, default: 'PENDING' },
    transactionsCount: { type: Number, default: 0 },
    processingErrors: [{ type: String }]
  },
  { timestamps: true }
);

export const BankImport = model('BankImport', bankImportSchema);
