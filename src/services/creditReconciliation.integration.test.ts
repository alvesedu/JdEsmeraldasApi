import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import mongoose, { Schema, model, type Types } from 'mongoose';
import { AuditLog } from '../models/AuditLog.js';
import { BankImport } from '../models/BankImport.js';
import { BankTransaction } from '../models/BankTransaction.js';
import { Charge } from '../models/Charge.js';
import { PaymentAllocation } from '../models/PaymentAllocation.js';
import '../models/Resident.js';
import { Unit } from '../models/Unit.js';
import { User } from '../models/User.js';
import { getDatabaseReadiness } from '../config/db.js';
import { allocateCredit, getCreditReconciliation, reversePaymentAllocation } from './creditReconciliation.service.js';

const testUri = process.env.MONGODB_TEST_URI;
const runIntegration = Boolean(testUri);

type TransactionProbeDocument = { name: string; value: number };
const transactionProbeSchema = new Schema<TransactionProbeDocument>({ name: { type: String, required: true }, value: { type: Number, required: true } });
const TransactionProbe = mongoose.models.TransactionProbe ?? model<TransactionProbeDocument>('TransactionProbe', transactionProbeSchema);

describe('credit reconciliation MongoDB transactions', { concurrency: false, skip: runIntegration ? false : 'Set MONGODB_TEST_URI to run MongoDB transaction integration tests' }, () => {
  let userId: Types.ObjectId;

  before(async () => {
    assert.ok(testUri);
    assertSafeTestDatabase(testUri);
    await mongoose.connect(testUri);

    const readiness = await getDatabaseReadiness();
    assert.equal(readiness.supportsTransactions, true, 'MongoDB test URI must point to a PRIMARY replica set');

    await mongoose.connection.dropDatabase();
    userId = (await User.create({ name: 'Admin Teste', email: 'admin.integration@test.local', passwordHash: 'hash', role: 'ADMIN' }))._id;
  });

  after(async () => {
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase();
      await mongoose.disconnect();
    }
  });

  it('commits and rolls back writes inside withTransaction', async () => {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        await TransactionProbe.create([{ name: 'commit-a', value: 1 }, { name: 'commit-b', value: 2 }], { session, ordered: true });
      });

      assert.equal(await TransactionProbe.countDocuments(), 2);

      await assert.rejects(
        session.withTransaction(async () => {
          await TransactionProbe.updateOne({ name: 'commit-a' }, { $set: { value: 99 } }, { session });
          await TransactionProbe.create([{ name: 'rollback-c', value: 3 }], { session, ordered: true });
          throw new Error('simulated failure');
        }),
        /simulated failure/
      );

      const committedProbe = await TransactionProbe.findOne({ name: 'commit-a' }).lean() as TransactionProbeDocument | null;
      assert.equal(committedProbe?.value, 1);
      assert.equal(await TransactionProbe.exists({ name: 'rollback-c' }), null);
    } finally {
      await session.endSession();
    }
  });

  it('reconciles R$ 500 across two charges, reverses one allocation and writes audit logs', async () => {
    const { unit, charges, transaction } = await seedReconciliationCase('success', 50_000, ['2026-06', '2026-07'], userId);

    const result = await allocateCredit(String(transaction._id), {
      unitId: String(unit._id),
      allocations: charges.map((charge) => ({ chargeId: String(charge._id), amount: 25_000 })),
      saveAlias: true
    }, userId);

    assert.equal(result.transaction.status, 'MATCHED');
    assert.equal(result.transaction.remainingAmount, 0);
    assert.equal(result.allocations.length, 2);

    const paidCharges = await Charge.find({ _id: { $in: charges.map((charge) => charge._id) } }).sort({ competence: 1 }).lean();
    assert.deepEqual(paidCharges.map((charge) => [charge.competence, charge.status, charge.openBalance]), [
      ['2026-06', 'PAID', 0],
      ['2026-07', 'PAID', 0]
    ]);
    assert.equal((await BankTransaction.findById(transaction._id).lean())?.processingStatus, 'MATCHED');

    const reconciliation = await getCreditReconciliation(String(transaction._id));
    assert.equal(reconciliation.remainingAmount, 0);

    assert.equal(await AuditLog.countDocuments({ action: 'PAYMENT_ALLOCATED' }), 2);
    assert.equal(await AuditLog.countDocuments({ action: 'CREDIT_RECONCILED' }), 1);
    assert.equal(await AuditLog.countDocuments({ action: 'BANK_ALIAS_CREATED' }), 1);

    const reversed = await reversePaymentAllocation(String(result.allocations[0]._id), 'Teste de estorno atomico', userId);
    assert.equal(reversed.transaction.status, 'PARTIALLY_MATCHED');
    assert.equal(reversed.transaction.remainingAmount, 25_000);
    assert.equal(reversed.charge.status, 'PENDING');
    assert.equal(reversed.charge.openBalance, 25_000);
    assert.equal(await AuditLog.countDocuments({ action: 'PAYMENT_ALLOCATION_REVERSED' }), 1);
  });

  it('rolls back all financial writes when a late audit write fails', async () => {
    const { unit, charges, transaction } = await seedReconciliationCase('rollback', 50_000, ['2026-08', '2026-09'], userId);

    try {
      await mongoose.connection.db?.command({
        collMod: AuditLog.collection.collectionName,
        validator: { action: { $ne: 'PAYMENT_ALLOCATED' } },
        validationLevel: 'strict',
        validationAction: 'error'
      });

      await assert.rejects(
        allocateCredit(String(transaction._id), {
          unitId: String(unit._id),
          allocations: charges.map((charge) => ({ chargeId: String(charge._id), amount: 25_000 }))
        }, userId),
        /Document failed validation/
      );
    } finally {
      await mongoose.connection.db?.command({ collMod: AuditLog.collection.collectionName, validator: {} });
    }

    assert.equal(await PaymentAllocation.countDocuments({ bankTransactionId: transaction._id }), 0);
    assert.equal((await BankTransaction.findById(transaction._id).lean())?.processingStatus, 'UNMATCHED');

    const unchangedCharges = await Charge.find({ _id: { $in: charges.map((charge) => charge._id) } }).sort({ competence: 1 }).lean();
    assert.deepEqual(unchangedCharges.map((charge) => [charge.competence, charge.status, charge.valuePaid, charge.openBalance]), [
      ['2026-08', 'PENDING', 0, 25_000],
      ['2026-09', 'PENDING', 0, 25_000]
    ]);
  });
});

function assertSafeTestDatabase(uri: string) {
  const databaseName = new URL(uri).pathname.replace(/^\//, '');
  assert.match(databaseName, /test/i, 'MONGODB_TEST_URI must target a database whose name contains "test"');
}

async function seedReconciliationCase(prefix: string, transactionAmount: number, competences: string[], uploadedBy: Types.ObjectId) {
  const unit = await Unit.create({
    quadra: `Q-${prefix}`,
    numero: '01',
    tipo: 'CASA',
    status: 'ATIVA',
    monthlyValue: 25_000,
    unitKey: `${prefix}-unit`
  });
  const bankImport = await BankImport.create({
    originalFileName: `${prefix}.pdf`,
    storedFilePath: `/tmp/${prefix}.pdf`,
    bank: 'BANCO_DO_BRASIL',
    uploadedBy,
    fileHash: `hash-${prefix}`,
    processingStatus: 'PROCESSED'
  });
  const transaction = await BankTransaction.create({
    bankImportId: bankImport._id,
    bank: 'BANCO_DO_BRASIL',
    postingDate: new Date('2026-06-08T00:00:00.000Z'),
    operationDate: new Date('2026-06-08T00:00:00.000Z'),
    description: `PIX RECEBIDO ${prefix}`,
    counterpartyOriginalName: `Morador ${prefix}`,
    counterpartyNormalizedName: `MORADOR ${prefix.toUpperCase()}`,
    amount: transactionAmount,
    direction: 'CREDIT',
    transactionType: 'PIX_RECEIVED',
    fingerprint: `fingerprint-${prefix}`
  });
  const charges = await Charge.create(competences.map((competence) => ({
    unitId: unit._id,
    competence,
    valueOriginal: 25_000,
    valuePaid: 0,
    openBalance: 25_000,
    referenceDate: new Date(`${competence}-10T00:00:00.000Z`),
    status: 'PENDING'
  })));

  return { unit, charges, transaction };
}
