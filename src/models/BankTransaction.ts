import { Schema, model } from 'mongoose';

const bankTransactionSchema = new Schema(
  {
    bankImportId: { type: Schema.Types.ObjectId, ref: 'BankImport', required: true, index: true },
    bank: { type: String, required: true, default: 'BANCO_DO_BRASIL' },
    postingDate: { type: Date, required: true },
    operationDate: { type: Date, default: null },
    operationTime: { type: String, default: null, match: /^([01]\d|2[0-3]):[0-5]\d$/ },
    lot: { type: String, default: null },
    document: { type: String, default: null },
    description: { type: String, required: true },
    counterpartyOriginalName: { type: String, default: null },
    counterpartyNormalizedName: { type: String, default: null, index: true },
    counterpartyDocument: { type: String, default: null },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: { validator: Number.isSafeInteger, message: 'Amount must be integer cents' }
    },
    direction: { type: String, enum: ['CREDIT', 'DEBIT'], required: true },
    transactionType: {
      type: String,
      enum: ['PIX_RECEIVED', 'PIX_SENT', 'TRANSFER_RECEIVED', 'TRANSFER_SENT', 'OTHER'],
      default: 'OTHER'
    },
    fingerprint: { type: String, required: true, unique: true, index: true },
    rawData: { type: Schema.Types.Mixed, default: null },
    processingStatus: {
      type: String,
      enum: ['UNMATCHED', 'PARTIALLY_MATCHED', 'MATCHED'],
      default: 'UNMATCHED',
      index: true
    }
  },
  { timestamps: true }
);

export const BankTransaction = model('BankTransaction', bankTransactionSchema);
