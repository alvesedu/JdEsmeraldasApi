import { Schema, model } from 'mongoose';

const auditLogSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null }
  },
  { timestamps: true }
);

export const AuditLog = model('AuditLog', auditLogSchema);
