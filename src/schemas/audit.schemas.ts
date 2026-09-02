import { z } from 'zod';

const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid identifier');
const dateString = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must use YYYY-MM-DD');

export const listAuditLogsSchema = z.object({
  userId: objectId.optional(),
  action: z.string().trim().min(1).optional(),
  entityType: z.string().trim().min(1).optional(),
  entityId: z.string().trim().min(1).optional(),
  from: dateString.optional(),
  to: dateString.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});
