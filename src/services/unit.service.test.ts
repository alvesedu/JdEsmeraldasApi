import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { Types } from 'mongoose';
import { updateUnitSchema } from '../schemas/unit.schemas.js';
import { updateResidentSchema } from '../schemas/resident.schemas.js';
import { applyResidentChange, assertResidentCanBeLinked, updateUnitAdministrative } from './unit.service.js';
import type { AuditInput } from './audit.service.js';

type UnitStatus = 'ATIVA' | 'INATIVA';

class FakeUnit {
  _id = new Types.ObjectId();
  quadra = 'E';
  numero = '19';
  tipo = 'CASA';
  status: UnitStatus = 'ATIVA';
  monthlyValue = 25_000;
  unitKey = 'E-19-CASA';
  residentCurrentId = new Types.ObjectId();
  residentHistory = [{ residentId: new Types.ObjectId(), startedAt: new Date('2026-01-01T00:00:00.000Z'), endedAt: null }];
  saveCount = 0;

  set(input: { status: UnitStatus }) {
    this.status = input.status;
  }

  async save() {
    this.saveCount += 1;
  }

  toObject(): Record<string, unknown> {
    return {
      _id: this._id,
      quadra: this.quadra,
      numero: this.numero,
      tipo: this.tipo,
      status: this.status,
      monthlyValue: this.monthlyValue,
      unitKey: this.unitKey,
      residentCurrentId: this.residentCurrentId,
      residentHistory: this.residentHistory
    };
  }
}

describe('unit patrimonial identity protection', () => {
  it('allows updating an administratively editable field', async () => {
    const unit = new FakeUnit();
    const audits: AuditInput[] = [];

    await updateUnitAdministrative(String(unit._id), { status: 'INATIVA' }, new Types.ObjectId(), {
      unitRepository: { findById: async () => unit },
      auditWriter: async (input) => { audits.push(input); }
    });

    assert.equal(unit.status, 'INATIVA');
    assert.equal(unit.saveCount, 1);
    assert.equal(audits.length, 1);
  });

  it('rejects unitKey in the common update contract', () => {
    assert.throws(() => updateUnitSchema.parse({ status: 'INATIVA', unitKey: 'F-22-LOTE' }), /unitKey|Unrecognized/i);
  });

  it('rejects residentHistory in the common update contract', () => {
    assert.throws(() => updateUnitSchema.parse({ status: 'INATIVA', residentHistory: [] }), /residentHistory|Unrecognized/i);
  });

  it('rejects residentCurrentId in the common update contract', () => {
    assert.throws(() => updateUnitSchema.parse({ status: 'INATIVA', residentCurrentId: String(new Types.ObjectId()) }), /residentCurrentId|Unrecognized/i);
  });

  it('rejects unknown fields in the common update contract', () => {
    assert.throws(() => updateUnitSchema.parse({ status: 'INATIVA', unexpected: true }), /unexpected|Unrecognized/i);
  });

  it('rejects attempts to alter patrimonial identity fields', () => {
    assert.throws(() => updateUnitSchema.parse({ status: 'INATIVA', quadra: 'F' }), /quadra|Unrecognized/i);
    assert.throws(() => updateUnitSchema.parse({ status: 'INATIVA', numero: '22' }), /numero|Unrecognized/i);
    assert.throws(() => updateUnitSchema.parse({ status: 'INATIVA', tipo: 'LOTE' }), /tipo|Unrecognized/i);
  });

  it('keeps the Unit document when inactivating it', async () => {
    const unit = new FakeUnit();
    let findByIdCalls = 0;

    const updated = await updateUnitAdministrative(String(unit._id), { status: 'INATIVA' }, new Types.ObjectId(), {
      unitRepository: {
        findById: async () => {
          findByIdCalls += 1;
          return unit;
        }
      },
      auditWriter: async () => {}
    });

    assert.equal(findByIdCalls, 1);
    assert.equal(updated, unit);
    assert.equal(unit.status, 'INATIVA');
  });

  it('does not remove Charges when inactivating a Unit', async () => {
    const unit = new FakeUnit();
    const charges = [{ unitId: unit._id, competence: '2026-09', openBalance: 25_000 }];

    await updateUnitAdministrative(String(unit._id), { status: 'INATIVA' }, new Types.ObjectId(), {
      unitRepository: { findById: async () => unit },
      auditWriter: async () => {}
    });

    assert.deepEqual(charges, [{ unitId: unit._id, competence: '2026-09', openBalance: 25_000 }]);
  });

  it('does not remove PaymentAllocations when inactivating a Unit', async () => {
    const unit = new FakeUnit();
    const allocations = [{ unitId: unit._id, amount: 25_000, reversedAt: null }];

    await updateUnitAdministrative(String(unit._id), { status: 'INATIVA' }, new Types.ObjectId(), {
      unitRepository: { findById: async () => unit },
      auditWriter: async () => {}
    });

    assert.deepEqual(allocations, [{ unitId: unit._id, amount: 25_000, reversedAt: null }]);
  });

  it('writes an AuditLog payload for a valid change', async () => {
    const unit = new FakeUnit();
    const userId = new Types.ObjectId();
    const audits: AuditInput[] = [];

    await updateUnitAdministrative(String(unit._id), { status: 'INATIVA' }, userId, {
      unitRepository: { findById: async () => unit },
      auditWriter: async (input) => { audits.push(input); }
    });

    assert.equal(audits[0]?.userId, userId);
    assert.equal(audits[0]?.action, 'UNIT_UPDATED');
    assert.equal(audits[0]?.entityType, 'Unit');
    assert.equal(audits[0]?.entityId, String(unit._id));
    assert.deepEqual(audits[0]?.before, { status: 'ATIVA', unitKey: 'E-19-CASA' });
    assert.deepEqual(audits[0]?.after, { status: 'INATIVA', unitKey: 'E-19-CASA' });
  });

  it('does not mutate the Unit when validation fails before the service call', () => {
    const unit = new FakeUnit();

    assert.throws(() => updateUnitSchema.parse({ status: 'INATIVA', unitKey: 'F-22-LOTE' }));

    assert.equal(unit.status, 'ATIVA');
    assert.equal(unit.unitKey, 'E-19-CASA');
    assert.equal(unit.saveCount, 0);
  });

  it('keeps existing financial history intact after update', async () => {
    const unit = new FakeUnit();
    const before = unit.toObject();

    await updateUnitAdministrative(String(unit._id), { status: 'INATIVA' }, new Types.ObjectId(), {
      unitRepository: { findById: async () => unit },
      auditWriter: async () => {}
    });

    assert.equal(unit.quadra, before.quadra);
    assert.equal(unit.numero, before.numero);
    assert.equal(unit.tipo, before.tipo);
    assert.equal(unit.monthlyValue, before.monthlyValue);
    assert.equal(unit.unitKey, before.unitKey);
    assert.deepEqual(unit.residentHistory, before.residentHistory);
  });
});

describe('unit resident history changes', () => {
  it('links the first resident and keeps the history open', () => {
    const unitId = new Types.ObjectId();
    const joaoId = new Types.ObjectId();
    const unit = fakeResidentUnit(unitId);
    const joao = fakeResident(joaoId);
    const startedAt = new Date('2026-01-01T00:00:00.000Z');

    applyResidentChange(unit, null, joao, startedAt);

    assert.equal(String(unit.residentCurrentId), String(joaoId));
    assert.equal(String(joao.unitId), String(unitId));
    assert.equal(unit.residentHistory.length, 1);
    assert.equal(String(unit.residentHistory[0]?.residentId), String(joaoId));
    assert.equal(unit.residentHistory[0]?.startedAt, startedAt);
    assert.equal(unit.residentHistory[0]?.endedAt, null);
  });

  it('switches Joao to Carlos preserving both history entries', () => {
    const unitId = new Types.ObjectId();
    const joaoId = new Types.ObjectId();
    const carlosId = new Types.ObjectId();
    const startedAt = new Date('2025-01-01T00:00:00.000Z');
    const changedAt = new Date('2026-08-01T00:00:00.000Z');
    const unit = fakeResidentUnit(unitId, joaoId, [{ residentId: joaoId, startedAt, endedAt: null }]);
    const joao = fakeResident(joaoId, unitId);
    const carlos = fakeResident(carlosId);

    applyResidentChange(unit, joao, carlos, changedAt);

    assert.equal(unit.residentHistory.length, 2);
    assert.equal(unit.residentHistory[0]?.endedAt, changedAt);
    assert.equal(String(unit.residentHistory[1]?.residentId), String(carlosId));
    assert.equal(unit.residentHistory[1]?.startedAt, changedAt);
    assert.equal(unit.residentHistory[1]?.endedAt, null);
    assert.equal(String(unit.residentCurrentId), String(carlosId));
    assert.equal(joao.unitId, null);
    assert.equal(String(carlos.unitId), String(unitId));
  });

  it('removes the current resident while preserving previous history', () => {
    const unitId = new Types.ObjectId();
    const joaoId = new Types.ObjectId();
    const startedAt = new Date('2025-01-01T00:00:00.000Z');
    const endedAt = new Date('2026-07-31T00:00:00.000Z');
    const unit = fakeResidentUnit(unitId, joaoId, [{ residentId: joaoId, startedAt, endedAt: null }]);
    const joao = fakeResident(joaoId, unitId);

    applyResidentChange(unit, joao, null, endedAt);

    assert.equal(unit.residentCurrentId, null);
    assert.equal(joao.unitId, null);
    assert.equal(unit.residentHistory.length, 1);
    assert.equal(unit.residentHistory[0]?.endedAt, endedAt);
  });

  it('rejects moving a resident already linked to another unit', () => {
    const targetUnitId = new Types.ObjectId();
    const anotherUnitId = new Types.ObjectId();

    assert.throws(() => assertResidentCanBeLinked({ unitId: anotherUnitId }, String(targetUnitId)), /already linked/);
  });

  it('rejects unitId in generic resident update', () => {
    assert.throws(() => updateResidentSchema.parse({ name: 'Joao', unitId: String(new Types.ObjectId()) }), /unitId|Unrecognized/i);
  });

  it('rejects unknown fields in generic resident update', () => {
    assert.throws(() => updateResidentSchema.parse({ name: 'Joao', unexpected: true }), /unexpected|Unrecognized/i);
  });

  it('keeps financial history objects intact after resident change', () => {
    const unitId = new Types.ObjectId();
    const joaoId = new Types.ObjectId();
    const carlosId = new Types.ObjectId();
    const unit = fakeResidentUnit(unitId, joaoId, [{ residentId: joaoId, startedAt: new Date('2026-01-01T00:00:00.000Z'), endedAt: null }]);
    const joao = fakeResident(joaoId, unitId);
    const carlos = fakeResident(carlosId);
    const charges = [{ unitId, competence: '2026-07', valueOriginal: 25_000, valuePaid: 0, openBalance: 25_000 }];
    const allocations = [{ unitId, amount: 10_000, reversedAt: null }];

    applyResidentChange(unit, joao, carlos, new Date('2026-08-01T00:00:00.000Z'));

    assert.deepEqual(charges, [{ unitId, competence: '2026-07', valueOriginal: 25_000, valuePaid: 0, openBalance: 25_000 }]);
    assert.deepEqual(allocations, [{ unitId, amount: 10_000, reversedAt: null }]);
  });

  it('does not mutate state when a pre-change validation fails', () => {
    const unitId = new Types.ObjectId();
    const joaoId = new Types.ObjectId();
    const anotherUnitId = new Types.ObjectId();
    const unit = fakeResidentUnit(unitId);
    const snapshot = structuredClone({
      residentCurrentId: unit.residentCurrentId,
      residentHistory: unit.residentHistory
    });

    assert.throws(() => assertResidentCanBeLinked({ unitId: anotherUnitId }, String(unitId)), /already linked/);

    assert.equal(unit.residentCurrentId, snapshot.residentCurrentId);
    assert.deepEqual(unit.residentHistory, snapshot.residentHistory);
    assert.notEqual(String(joaoId), String(unit.residentCurrentId));
  });
});

function fakeResidentUnit(
  unitId: Types.ObjectId,
  residentCurrentId: Types.ObjectId | null = null,
  residentHistory: Array<{ residentId: Types.ObjectId; startedAt: Date; endedAt: Date | null }> = []
) {
  return {
    _id: unitId,
    residentCurrentId,
    residentHistory
  };
}

function fakeResident(residentId: Types.ObjectId, unitId: Types.ObjectId | null = null) {
  return {
    _id: residentId,
    unitId
  };
}
