import { Schema, model, type HydratedDocument, type InferSchemaType } from 'mongoose';

const integerMoney = {
  type: Number,
  default: null,
  validate: { validator: (value: number | null) => value === null || Number.isSafeInteger(value), message: 'Money values must be integer cents' }
};

const bankImportSchema = new Schema(
  {
    originalFileName: { type: String, required: true, trim: true },
    periodStart: { type: Date, default: null },
    periodEnd: { type: Date, default: null },
    bank: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    fileHash: { type: String, required: true, unique: true, index: true },
    openingBalance: integerMoney,
    closingBalance: integerMoney,
    totalCredits: { type: Number, default: 0, min: 0 },
    totalDebits: { type: Number, default: 0, min: 0 },
    transactionCount: { type: Number, default: 0, min: 0 },
    insertedTransactions: { type: Number, default: 0, min: 0 },
    duplicateTransactions: { type: Number, default: 0, min: 0 },
    ignoredTransactions: { type: Number, default: 0, min: 0 },
    invalidTransactions: { type: Number, default: 0, min: 0 },
    transactionFingerprints: { type: [String], default: [], select: false },
    validationValid: { type: Boolean, default: null },
    validationDifference: integerMoney,
    processingStatus: {
      type: String,
      enum: ['UPLOADED', 'PROCESSING', 'PROCESSED', 'REVIEW_REQUIRED', 'FAILED'],
      default: 'UPLOADED'
    },
    processingErrors: [
      {
        _id: false,
        type: { type: String, required: true },
        message: { type: String, required: true },
        rawData: { type: Schema.Types.Mixed, default: null }
      }
    ],
    processedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

export const BankImport = model('BankImport', bankImportSchema);
export type BankImportDocument = HydratedDocument<InferSchemaType<typeof bankImportSchema>>;
