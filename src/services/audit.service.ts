import type { ClientSession, Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';

type AuditInput = {
  userId: Types.ObjectId;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  session?: ClientSession;
};

export async function writeAudit(input: AuditInput) {
  await AuditLog.create([{
    userId: input.userId,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId,
    before: input.before ?? null,
    after: input.after ?? null
  }], { session: input.session });
}
