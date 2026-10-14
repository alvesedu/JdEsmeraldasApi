import type { Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { PaymentAllocation } from '../models/PaymentAllocation.js';
import { QuickEntryRun } from '../models/QuickEntryRun.js';
import { Resident } from '../models/Resident.js';
import { Unit } from '../models/Unit.js';
import { AppError } from '../utils/AppError.js';

export type QuickEntryConfidence = 'HIGH' | 'MEDIUM' | 'LOW';

export type QuickEntryRunItem = {
  lineNumber: number;
  rawText: string;
  sequence: string | null;
  payerName: string;
  paid: boolean;
  amountCents: number | null;
  amountText: string | null;
  periodHints: string[];
  notes: string;
  confidence: QuickEntryConfidence;
  suggestedResidentId?: Types.ObjectId | string | null;
  suggestedUnitId?: Types.ObjectId | string | null;
  suggestionConfidence?: QuickEntryConfidence | null;
  suggestionReason?: string | null;
};

export type QuickEntryRunTotals = {
  lines: number;
  paid: number;
  unpaid: number;
  withAmount: number;
  withoutAmount: number;
  amountCents: number;
};

export type CreateQuickEntryRunInput = {
  label?: string | null;
  rawText: string;
  items: QuickEntryRunItem[];
};

export function summarizeQuickEntryItems(items: QuickEntryRunItem[]): QuickEntryRunTotals {
  return items.reduce(
    (acc, item) => ({
      lines: acc.lines + 1,
      paid: acc.paid + (item.paid ? 1 : 0),
      unpaid: acc.unpaid + (item.paid ? 0 : 1),
      withAmount: acc.withAmount + (item.amountCents === null ? 0 : 1),
      withoutAmount: acc.withoutAmount + (item.amountCents === null ? 1 : 0),
      amountCents: acc.amountCents + (item.amountCents ?? 0)
    }),
    { lines: 0, paid: 0, unpaid: 0, withAmount: 0, withoutAmount: 0, amountCents: 0 }
  );
}

export async function listQuickEntryRuns(filters: { limit: number; includeArchived: boolean }) {
  const items = await QuickEntryRun.find(filters.includeArchived ? {} : { archivedAt: null })
    .select('label totals createdBy createdAt updatedAt archivedAt')
    .populate('createdBy', 'name email')
    .sort({ createdAt: -1 })
    .limit(filters.limit)
    .lean();

  return { items };
}

export async function getQuickEntryRun(id: string) {
  const run = await QuickEntryRun.findById(id)
    .populate('createdBy', 'name email')
    .populate('items.suggestedResidentId', 'name phone email active')
    .populate('items.suggestedUnitId', 'quadra numero tipo unitKey residentCurrentId')
    .populate('items.confirmedChargeId', 'competence valueOriginal valuePaid openBalance status')
    .populate('items.confirmedPaymentAllocationId', 'amount source paymentDate bankTransactionId')
    .lean();
  if (!run) throw new AppError('Quick entry run not found', 404);
  return run;
}

export async function createQuickEntryRun(input: CreateQuickEntryRunInput, userId: Types.ObjectId) {
  const items = await enrichItemsWithSuggestions(input.items.map(normalizeItem));
  const totals = summarizeQuickEntryItems(items);
  const label = input.label?.trim() || defaultRunLabel();

  const run = await QuickEntryRun.create({
    label,
    rawText: input.rawText,
    items,
    totals,
    createdBy: userId
  });

  await AuditLog.create({
    userId,
    action: 'QUICK_ENTRY_RUN_CREATED',
    entityType: 'QuickEntryRun',
    entityId: String(run._id),
    before: null,
    after: { label, totals }
  });

  return run.toObject();
}

export async function confirmQuickEntryRunItem(
  runId: string,
  lineNumber: number,
  input: { chargeId: string; paymentAllocationId: string },
  userId: Types.ObjectId
) {
  const run = await QuickEntryRun.findById(runId);
  if (!run) throw new AppError('Quick entry run not found', 404);
  if (run.archivedAt) throw new AppError('Archived quick entry run cannot be updated', 409);

  const item = run.items.find((entry) => entry.lineNumber === lineNumber);
  if (!item) throw new AppError('Quick entry run item not found', 404);

  const allocation = await PaymentAllocation.findById(input.paymentAllocationId).lean();
  if (!allocation) throw new AppError('Payment allocation not found', 404);
  if (allocation.source !== 'MANUAL') throw new AppError('Only manual payment allocations can confirm a quick entry item', 409);
  if (String(allocation.chargeId) !== input.chargeId) {
    throw new AppError('Payment allocation does not belong to the informed charge', 409);
  }

  const before = run.toObject();
  item.set({
    confirmedChargeId: input.chargeId,
    confirmedPaymentAllocationId: input.paymentAllocationId,
    confirmedAt: new Date()
  });
  await run.save();

  await AuditLog.create({
    userId,
    action: 'QUICK_ENTRY_RUN_ITEM_CONFIRMED',
    entityType: 'QuickEntryRun',
    entityId: String(run._id),
    before: { item: before.items.find((entry) => entry.lineNumber === lineNumber) ?? null },
    after: { lineNumber, chargeId: input.chargeId, paymentAllocationId: input.paymentAllocationId }
  });

  return run.toObject();
}

export async function archiveQuickEntryRun(id: string, userId: Types.ObjectId) {
  const run = await QuickEntryRun.findById(id);
  if (!run) throw new AppError('Quick entry run not found', 404);
  if (run.archivedAt) return run.toObject();

  const before = run.toObject();
  run.set({ archivedAt: new Date(), archivedBy: userId });
  await run.save();

  await AuditLog.create({
    userId,
    action: 'QUICK_ENTRY_RUN_ARCHIVED',
    entityType: 'QuickEntryRun',
    entityId: String(run._id),
    before: { archivedAt: before.archivedAt ?? null },
    after: { archivedAt: run.archivedAt }
  });

  return run.toObject();
}

function normalizeItem(item: QuickEntryRunItem): QuickEntryRunItem {
  return {
    lineNumber: item.lineNumber,
    rawText: item.rawText.trim(),
    sequence: item.sequence?.trim() || null,
    payerName: item.payerName.trim(),
    paid: item.paid,
    amountCents: item.amountCents,
    amountText: item.amountText?.trim() || null,
    periodHints: Array.from(new Set(item.periodHints.map((hint) => hint.trim()).filter(Boolean))),
    notes: item.notes.trim(),
    confidence: item.confidence,
    suggestedResidentId: item.suggestedResidentId ?? null,
    suggestedUnitId: item.suggestedUnitId ?? null,
    suggestionConfidence: item.suggestionConfidence ?? null,
    suggestionReason: item.suggestionReason ?? null
  };
}

async function enrichItemsWithSuggestions(items: QuickEntryRunItem[]) {
  const residents = await Resident.find({ active: true }).lean();
  const units = await Unit.find({ status: 'ATIVA' }).select('quadra numero tipo residentCurrentId unitKey').lean();

  return items.map<QuickEntryRunItem>((item) => {
    if (item.suggestedResidentId || item.suggestedUnitId) return item;
    const payer = normalizeName(item.payerName);
    if (!payer || payer.length < 3) return item;

    const matches = residents.filter((resident) => {
      const residentName = normalizeName(resident.name);
      return residentName.length >= 3 && (residentName.includes(payer) || payer.includes(residentName));
    });
    if (matches.length !== 1) return item;

    const [match] = matches;
    const residentUnits = units.filter((unit) => String(unit.residentCurrentId ?? '') === String(match._id));
    const [unit] = residentUnits;

    const suggestionConfidence: QuickEntryConfidence = residentUnits.length === 1 ? 'HIGH' : 'MEDIUM';
    return {
      ...item,
      suggestedResidentId: match._id,
      suggestedUnitId: residentUnits.length === 1 ? unit?._id ?? null : null,
      suggestionConfidence,
      suggestionReason: residentUnits.length === 1 ? 'Nome do morador com unidade ativa única' : 'Nome do morador encontrado com múltiplas/nenhuma unidade ativa'
    };
  });
}

function normalizeName(value: string) {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function defaultRunLabel() {
  return `Rodada ${new Date().toISOString().slice(0, 10)}`;
}
