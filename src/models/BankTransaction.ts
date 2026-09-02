import { Schema, model } from 'mongoose';

const bankTransactionSchema = new Schema(
  {
    bankImportId: { type: Schema.Types.ObjectId, ref: 'BankImport', required: true, index: true },
    bank: { type: String, required: true, default: 'BANCO_DO_BRASIL' },
    postingDate: { type: Date, required: true },
    operationDate: { type: Date, default: null },
    lot: { type: String, default: null },
    document: { type: String, default: null },
    description: { type: String, required: true },
    counterpartyOriginalName: { type: String, default: null },
    amount: { type: Number, required: true },
    direction: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    transactionType: { type: String, default: null },
    fingerprint: { type: String, required: true, unique: true, index: true },
    rawData: { type: Schema.Types.Mixed, default: null },
    processingStatus: { type: String, enum: ['PENDING', 'SUGGESTED', 'CONFIRMED'], default: 'PENDING' }
  },
  { timestamps: true }
);

export const BankTransaction = model('BankTransaction', bankTransactionSchema);
