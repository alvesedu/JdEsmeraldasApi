import type { FilterQuery } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';

type AuditLogFilters = {
  userId?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
  limit: number;
};

export async function listAuditLogs(filters: AuditLogFilters) {
  const query: FilterQuery<unknown> = {};
  if (filters.userId) query.userId = filters.userId;
  if (filters.action) query.action = { $regex: escapeRegExp(filters.action), $options: 'i' };
  if (filters.entityType) query.entityType = { $regex: escapeRegExp(filters.entityType), $options: 'i' };
  if (filters.entityId) query.entityId = filters.entityId;
  if (filters.from || filters.to) {
    query.createdAt = {
      ...(filters.from ? { $gte: new Date(`${filters.from}T00:00:00.000Z`) } : {}),
      ...(filters.to ? { $lte: new Date(`${filters.to}T23:59:59.999Z`) } : {})
    };
  }

  const items = await AuditLog.find(query)
    .populate('userId', 'name email')
    .sort({ createdAt: -1 })
    .limit(filters.limit)
    .lean();
  return { items };
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
