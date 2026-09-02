import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');

export const bankImportIdSchema = z.object({ id: objectId });

export const bankTransactionFiltersSchema = z.object({
  direction: z.enum(['CREDIT', 'DEBIT']).optional(),
  transactionType: z.enum(['PIX_RECEIVED', 'PIX_SENT', 'TRANSFER_RECEIVED', 'TRANSFER_SENT', 'OTHER']).optional()
});
