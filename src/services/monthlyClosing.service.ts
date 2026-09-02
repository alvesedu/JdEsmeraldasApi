import type { FilterQuery, Types } from 'mongoose';
import { MonthlyClosing } from '../models/MonthlyClosing.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from './audit.service.js';
import { buildDashboard } from './dashboard.service.js';

type ClosingFilters = { competence?: string; status?: 'OPEN' | 'CLOSED' };

export async function listMonthlyClosings(filters: ClosingFilters) {
  const query: FilterQuery<unknown> = {};
  if (filters.competence) query.competence = filters.competence;
  if (filters.status) query.status = filters.status;
  const items = await MonthlyClosing.find(query).sort({ competence: -1 });
  return { items };
}

export async function getMonthlyClosing(competence: string) {
  const item = await MonthlyClosing.findOne({ competence });
  if (!item) throw new AppError('Monthly closing not found', 404);
  return { item };
}

export async function upsertMonthlyClosing(competence: string, notes: string | null, userId: Types.ObjectId) {
  const snapshot = await buildDashboard(competence);
  const existing = await MonthlyClosing.findOne({ competence });
  const before = existing?.toObject() ?? null;
  const item = existing ?? new MonthlyClosing({ competence });
  item.set({
    status: item.status ?? 'OPEN',
    revenueForecast: snapshot.revenueForecast,
    revenueReceived: snapshot.revenueReceived,
    revenueReceivedBeforeRef: snapshot.revenueReceived,
    revenueReceivedAfterRef: 0,
    revenuePending: snapshot.revenuePending,
    pendingUnitsCount: snapshot.pendingUnitsCount,
    expenseForecast: snapshot.openCommitments + snapshot.expensePaid,
    expensePaid: snapshot.expensePaid,
    openingBankBalance: 0,
    bankInflow: snapshot.bankBalance > 0 ? snapshot.bankBalance : 0,
    bankOutflow: snapshot.bankBalance < 0 ? Math.abs(snapshot.bankBalance) : 0,
    closingBankBalance: snapshot.bankBalance,
    openCommitments: snapshot.openCommitments,
    availableBalance: snapshot.availableBalance,
    notes
  });
  await item.save();
  await writeAudit({
    userId,
    action: before ? 'MONTHLY_CLOSING_UPDATED' : 'MONTHLY_CLOSING_CREATED',
    entityType: 'MonthlyClosing',
    entityId: String(item._id),
    before,
    after: item.toObject()
  });
  return { item };
}

export async function updateMonthlyClosing(competence: string, input: { status?: 'OPEN' | 'CLOSED'; notes?: string | null }, userId: Types.ObjectId) {
  const item = await MonthlyClosing.findOne({ competence });
  if (!item) throw new AppError('Monthly closing not found', 404);
  const before = item.toObject();
  item.set(input);
  await item.save();
  await writeAudit({
    userId,
    action: 'MONTHLY_CLOSING_UPDATED',
    entityType: 'MonthlyClosing',
    entityId: String(item._id),
    before,
    after: item.toObject()
  });
  return { item };
}
