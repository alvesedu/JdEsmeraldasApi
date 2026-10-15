import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import mongoose, { type Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { BankImport } from '../models/BankImport.js';
import { BankTransaction } from '../models/BankTransaction.js';
import { Charge } from '../models/Charge.js';
import { PaymentAllocation } from '../models/PaymentAllocation.js';
import { Resident } from '../models/Resident.js';
import { Unit } from '../models/Unit.js';
import { User } from '../models/User.js';
import { getDatabaseReadiness } from '../config/db.js';
import { changeUnitResident } from './unit.service.js';

const testUri = process.env.MONGODB_TEST_URI;
const runIntegration = Boolean(testUri);

describe('unit resident change MongoDB transactions', { concurrency: false, skip: runIntegration ? false : 'Set MONGODB_TEST_URI to run MongoDB transaction integration tests' }, () => {
  let userId: Types.ObjectId;

  before(async () => {
    assert.ok(testUri);
    assertSafeTestDatabase(testUri);
    await mongoose.connect(testUri);

    const readiness = await getDatabaseReadiness();
    assert.equal(readiness.supportsTransactions, true, 'MongoDB test URI must point to a PRIMARY replica set');

    await mongoose.connection.dropDatabase();
    userId = (await User.create({ name: 'Admin Teste', email: 'admin.unitresident@test.local', passwordHash: 'hash', role: 'ADMIN' }))._id;
  });

  after(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it('changes resident without rewriting financial history', async () => {
    const { unit, joao, carlos, charge, allocation } = await seedUnitResidentCase('success', userId);

    await changeUnitResident(String(unit._id), {
      residentId: String(carlos._id),
      effectiveDate: '2026-08-01'
    }, userId);

    const updatedUnit = await Unit.findById(unit._id).lean();
    const updatedJoao = await Resident.findById(joao._id).lean();
    const updatedCarlos = await Resident.findById(carlos._id).lean();
    const unchangedCharge = await Charge.findById(charge._id).lean();
    const unchangedAllocation = await PaymentAllocation.findById(allocation._id).lean();

    assert.equal(String(updatedUnit?.residentCurrentId), String(carlos._id));
    assert.equal(updatedUnit?.residentHistory.length, 2);
    assert.equal(updatedUnit?.residentHistory.filter((entry) => !entry.endedAt).length, 1);
    assert.equal(updatedJoao?.unitId, null);
    assert.equal(String(updatedCarlos?.unitId), String(unit._id));
    assert.equal(String(unchangedCharge?.unitId), String(unit._id));
    assert.equal(unchangedCharge?.competence, '2026-07');
    assert.equal(unchangedCharge?.valueOriginal, 25_000);
    assert.equal(unchangedCharge?.valuePaid, 10_000);
    assert.equal(unchangedCharge?.openBalance, 15_000);
    assert.equal(String(unchangedAllocation?.unitId), String(unit._id));
    assert.equal(unchangedAllocation?.amount, 10_000);
    assert.equal(await AuditLog.countDocuments({ action: 'UNIT_RESIDENT_CHANGED' }), 1);
  });

  it('rolls back the whole resident change when audit write fails', async () => {
    const { unit, joao, carlos } = await seedUnitResidentCase('rollback', userId);

    try {
      await mongoose.connection.db?.command({
        collMod: AuditLog.collection.collectionName,
        validator: { action: { $ne: 'UNIT_RESIDENT_CHANGED' } },
        validationLevel: 'strict',
        validationAction: 'error'
      });

      await assert.rejects(
        changeUnitResident(String(unit._id), {
          residentId: String(carlos._id),
          effectiveDate: '2026-08-01'
        }, userId),
        /Document failed validation/
      );
    } finally {
      await mongoose.connection.db?.command({ collMod: AuditLog.collection.collectionName, validator: {} });
    }

    const unchangedUnit = await Unit.findById(unit._id).lean();
    const unchangedJoao = await Resident.findById(joao._id).lean();
    const unchangedCarlos = await Resident.findById(carlos._id).lean();

    assert.equal(String(unchangedUnit?.residentCurrentId), String(joao._id));
    assert.equal(unchangedUnit?.residentHistory.length, 1);
    assert.equal(unchangedUnit?.residentHistory[0]?.endedAt, null);
    assert.equal(String(unchangedJoao?.unitId), String(unit._id));
    assert.equal(unchangedCarlos?.unitId, null);
  });
});

function assertSafeTestDatabase(uri: string) {
  const databaseName = new URL(uri).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'MONGODB_TEST_URI must target a database whose name contains "test"');
}

async function seedUnitResidentCase(prefix: string, uploadedBy: Types.ObjectId) {
  const joao = await Resident.create({ name: `Joao ${prefix}`, active: true });
  const carlos = await Resident.create({ name: `Carlos ${prefix}`, active: true });
  const unit = await Unit.create({
    quadra: `E-${prefix}`,
    numero: '19',
    tipo: 'CASA',
    status: 'ATIVA',
    monthlyValue: 25_000,
    unitKey: `E-${prefix}-19-CASA`,
    residentCurrentId: joao._id,
    residentHistory: [{ residentId: joao._id, startedAt: new Date('2026-01-01T00:00:00.000Z'), endedAt: null }]
  });
  joao.unitId = unit._id;
  await joao.save();

  const bankImport = await BankImport.create({
    originalFileName: `${prefix}.pdf`,
    bank: 'BANCO_DO_BRASIL',
    uploadedBy,
    fileHash: `unit-resident-hash-${prefix}`,
    processingStatus: 'PROCESSED'
  });
  const transaction = await BankTransaction.create({
    bankImportId: bankImport._id,
    bank: 'BANCO_DO_BRASIL',
    postingDate: new Date('2026-07-08T00:00:00.000Z'),
    operationDate: new Date('2026-07-08T00:00:00.000Z'),
    description: `PIX RECEBIDO ${prefix}`,
    amount: 10_000,
    direction: 'CREDIT',
    transactionType: 'PIX_RECEIVED',
    fingerprint: `unit-resident-fingerprint-${prefix}`,
    processingStatus: 'PARTIALLY_MATCHED'
  });
  const charge = await Charge.create({
    unitId: unit._id,
    competence: '2026-07',
    valueOriginal: 25_000,
    valuePaid: 10_000,
    openBalance: 15_000,
    referenceDate: new Date('2026-07-10T00:00:00.000Z'),
    status: 'PARTIAL'
  });
  const allocation = await PaymentAllocation.create({
    bankTransactionId: transaction._id,
    chargeId: charge._id,
    unitId: unit._id,
    amount: 10_000,
    paymentDate: new Date('2026-07-08T00:00:00.000Z'),
    createdBy: uploadedBy
  });

  return { unit, joao, carlos, charge, allocation };
}
