import type { Types } from 'mongoose';
import { Unit } from '../models/Unit.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit, type AuditInput } from './audit.service.js';
import type { UpdateUnitInput } from '../schemas/unit.schemas.js';

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

function pickUnitAuditFields(value: Record<string, unknown>) {
  return {
    status: value.status,
    unitKey: value.unitKey
  };
}
