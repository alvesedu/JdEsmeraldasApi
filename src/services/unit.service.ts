import mongoose, { type ClientSession, type Types } from 'mongoose';
import { getDatabaseReadiness } from '../config/db.js';
import { Resident } from '../models/Resident.js';
import { Unit } from '../models/Unit.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit, type AuditInput } from './audit.service.js';
import type { ChangeUnitResidentInput, UpdateUnitInput } from '../schemas/unit.schemas.js';

type UnitDocumentLike = {
  _id: unknown;
  status: 'ATIVA' | 'INATIVA';
  set(input: UpdateUnitInput): void;
  save(): Promise<unknown>;
  toObject(): Record<string, unknown>;
  populate?(path: string): Promise<UnitDocumentLike>;
};

type UnitRepository = {
  findById(id: string): Promise<UnitDocumentLike | null>;
};

type UnitUpdateDependencies = {
  unitRepository: UnitRepository;
  auditWriter(input: AuditInput): Promise<void>;
};

const defaultDependencies: UnitUpdateDependencies = {
  unitRepository: {
    findById: (id) => Unit.findById(id).exec() as Promise<UnitDocumentLike | null>
  },
  auditWriter: writeAudit
};

type ResidentHistoryEntry = {
  residentId: Types.ObjectId | string;
  startedAt: Date;
  endedAt: Date | null;
};

type ChangeResidentState = {
  _id: Types.ObjectId | string;
  residentCurrentId: Types.ObjectId | string | null;
  residentHistory: ResidentHistoryEntry[];
};

type ResidentRecordState = {
  _id: Types.ObjectId | string;
  unitId: Types.ObjectId | string | null;
};

export async function updateUnitAdministrative(
  id: string,
  input: UpdateUnitInput,
  userId: Types.ObjectId,
  dependencies: UnitUpdateDependencies = defaultDependencies
) {
  const unit = await dependencies.unitRepository.findById(id);
  if (!unit) throw new AppError('Unit not found', 404);

  const before = unit.toObject();
  unit.set({ status: input.status });
  await unit.save();
  const after = unit.toObject();

  await dependencies.auditWriter({
    userId,
    action: 'UNIT_UPDATED',
    entityType: 'Unit',
    entityId: String(unit._id),
    before: pickUnitAuditFields(before),
    after: pickUnitAuditFields(after)
  });

  return unit.populate ? unit.populate('residentCurrentId') : unit;
}

export async function changeUnitResident(
  unitId: string,
  input: ChangeUnitResidentInput,
  userId: Types.ObjectId
) {
  return runInTransaction(async (session) => {
    const effectiveDate = input.effectiveDate ? new Date(`${input.effectiveDate}T00:00:00.000Z`) : new Date();
    const unit = await Unit.findById(unitId).session(session);
    if (!unit) throw new AppError('Unit not found', 404);

    const nextResidentId = input.residentId ?? null;
    const previousResidentId = unit.residentCurrentId ? String(unit.residentCurrentId) : null;
    const before = unit.toObject();

    let nextResident = null;
    if (nextResidentId) {
      nextResident = await Resident.findById(nextResidentId).session(session);
      if (!nextResident) throw new AppError('Resident not found', 404);
    }

    if (previousResidentId === nextResidentId) {
      return { item: await unit.populate('residentCurrentId') };
    }

    applyResidentChange(
      unit as unknown as ChangeResidentState,
      null,
      nextResident as unknown as ResidentRecordState | null,
      effectiveDate
    );
    assertSingleOpenResidentHistory(unit.residentHistory as unknown as ResidentHistoryEntry[]);

    await unit.save({ session });
    await syncResidentLegacyUnitId(previousResidentId, session);
    await syncResidentLegacyUnitId(nextResidentId, session);

    await writeAudit({
      userId,
      action: 'UNIT_RESIDENT_CHANGED',
      entityType: 'Unit',
      entityId: String(unit._id),
      before: pickResidentChangeAuditFields(before),
      after: pickResidentChangeAuditFields(unit.toObject()),
      session
    });

    return { item: await unit.populate('residentCurrentId') };
  });
}

export function applyResidentChange(
  unit: ChangeResidentState,
  _previousResident: ResidentRecordState | null,
  nextResident: ResidentRecordState | null,
  effectiveDate: Date
) {
  const previousResidentId = unit.residentCurrentId ? String(unit.residentCurrentId) : null;
  const nextResidentId = nextResident ? String(nextResident._id) : null;
  if (previousResidentId === nextResidentId) return;

  for (const entry of unit.residentHistory) {
    if (!entry.endedAt) entry.endedAt = effectiveDate;
  }

  if (nextResident) {
    unit.residentHistory.push({ residentId: nextResident._id, startedAt: effectiveDate, endedAt: null });
    unit.residentCurrentId = nextResident._id;
  } else {
    unit.residentCurrentId = null;
  }
}

function assertSingleOpenResidentHistory(history: ResidentHistoryEntry[]) {
  const openCount = history.filter((entry) => !entry.endedAt).length;
  if (openCount > 1) throw new AppError('Unit cannot have more than one current resident history entry', 409);
}

function pickUnitAuditFields(value: Record<string, unknown>) {
  return {
    status: value.status,
    unitKey: value.unitKey
  };
}

function pickResidentChangeAuditFields(value: Record<string, unknown>) {
  return {
    residentCurrentId: value.residentCurrentId ?? null,
    residentHistory: value.residentHistory ?? []
  };
}

async function runInTransaction<T>(work: (session: ClientSession) => Promise<T>) {
  const readiness = await getDatabaseReadiness();
  if (!readiness.supportsTransactions) {
    throw new AppError('Atomic resident changes require MongoDB configured as a PRIMARY replica set with transaction support', 503);
  }
  const session = await mongoose.startSession();
  try {
    let result: T | undefined;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    if (result === undefined) throw new AppError('Atomic resident change did not complete', 500);
    return result;
  } finally {
    await session.endSession();
  }
}

async function syncResidentLegacyUnitId(residentId: string | null, session: ClientSession) {
  if (!residentId) return;
  const fallbackUnit = await Unit.findOne({ residentCurrentId: residentId })
    .select('_id')
    .sort({ quadra: 1, numero: 1, tipo: 1 })
    .session(session);

  await Resident.updateOne(
    { _id: residentId },
    { $set: { unitId: fallbackUnit?._id ?? null } },
    { session }
  );
}
