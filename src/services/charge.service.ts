import { Charge } from '../models/Charge.js';
import { PaymentAllocation } from '../models/PaymentAllocation.js';
import { Unit } from '../models/Unit.js';
import { competenceReferenceDate } from '../utils/date.js';
import { AppError } from '../utils/AppError.js';
import { writeAudit } from './audit.service.js';
import { deriveChargeFinancials } from './creditReconciliation.service.js';
import { getCurrentPricingValue } from './pricing.service.js';
import { confirmQuickEntryRunItem } from './quickEntryRun.service.js';
import { assertCompetenceOpen } from './financialPeriod.service.js';
import type { Types } from 'mongoose';

type ManualChargePaymentInput = {
  amount: number;
  paymentDate: string;
  paymentMethod: 'PIX' | 'CASH' | 'BANK_TRANSFER' | 'BOLETO' | 'OTHER';
  notes?: string | null;
  quickEntryRunId?: string;
  quickEntryLineNumber?: number;
};

export async function generateMonthlyCharges(competence: string) {
  await assertCompetenceOpen(competence);
  const referenceDate = competenceReferenceDate(competence);
  const units = await Unit.find({ status: 'ATIVA' });
  const created: string[] = [];

  for (const unit of units) {
    const monthlyValue = await getCurrentPricingValue(unit.tipo, referenceDate);
    const result = await Charge.updateOne(
      { unitId: unit._id, competence },
      {
        $setOnInsert: {
          unitId: unit._id,
          competence,
          valueOriginal: monthlyValue,
          valuePaid: 0,
          openBalance: monthlyValue,
          referenceDate,
          status: 'PENDING'
        }
      },
      { upsert: true }
    );

    if (result.upsertedCount > 0) {
      created.push(String(unit._id));
    }
  }

  return { generated: created.length, totalUnits: units.length };
}

export async function listDefaultingCharges(asOf = new Date()) {
  const charges = await Charge.find({
    openBalance: { $gt: 0 },
    referenceDate: { $lt: startOfUtcDay(asOf) }
  })
    .populate({ path: 'unitId', populate: { path: 'residentCurrentId', select: 'name phone email active' } })
    .sort({ referenceDate: 1, competence: 1 })
    .lean();

  return charges
    .map((charge) => ({
      ...charge,
      daysOverdue: calculateDaysOverdue(charge.referenceDate, asOf)
    }))
    .filter((charge) => charge.daysOverdue > 0);
}

export async function registerManualChargePayment(
  chargeId: string,
  input: ManualChargePaymentInput,
  userId: Types.ObjectId
) {
  const charge = await Charge.findById(chargeId);
  if (!charge) throw new AppError('Charge not found', 404);
  await assertCompetenceOpen(charge.competence);
  assertManualChargePaymentAllowed(charge.status, input.amount, charge.openBalance);

  const before = charge.toObject();
  const payment = await PaymentAllocation.create({
    bankTransactionId: null,
    chargeId: charge._id,
    unitId: charge.unitId,
    amount: input.amount,
    source: 'MANUAL',
    paymentMethod: input.paymentMethod,
    paymentDate: new Date(`${input.paymentDate}T00:00:00.000Z`),
    notes: input.notes ?? null,
    quickEntryRunId: input.quickEntryRunId ?? null,
    quickEntryLineNumber: input.quickEntryLineNumber ?? null,
    createdBy: userId
  });

  try {
    const updated = await recalculateChargeFromAllocations(charge._id);
    if (input.quickEntryRunId && input.quickEntryLineNumber) {
      await confirmQuickEntryRunItem(
        input.quickEntryRunId,
        input.quickEntryLineNumber,
        { chargeId: String(charge._id), paymentAllocationId: String(payment._id) },
        userId
      );
    }
    await writeAudit({
      userId,
      action: 'CHARGE_MANUAL_PAYMENT_REGISTERED',
      entityType: 'Charge',
      entityId: String(charge._id),
      before,
      after: { charge: updated.toObject(), payment: payment.toObject() }
    });
    return { item: updated, payment };
  } catch (error) {
    await PaymentAllocation.deleteOne({ _id: payment._id });
    await recalculateChargeFromAllocations(charge._id);
    throw error;
  }
}

async function recalculateChargeFromAllocations(chargeId: Types.ObjectId) {
  const charge = await Charge.findById(chargeId);
  if (!charge) throw new AppError('Charge not found', 404);

  const active = await PaymentAllocation.find({ chargeId, reversedAt: null }).sort({ paymentDate: 1 });
  const paidAmount = active.reduce((sum, allocation) => sum + allocation.amount, 0);
  const completionDate = paidAmount === charge.valueOriginal && active.length > 0
    ? active[active.length - 1]?.paymentDate ?? null
    : null;
  const financials = deriveChargeFinancials(charge.valueOriginal, paidAmount, charge.referenceDate, completionDate);
  charge.set({ valuePaid: financials.paidAmount, openBalance: financials.outstandingAmount, status: financials.status });
  await charge.save();
  return charge;
}

export function assertManualChargePaymentAllowed(status: string, amount: number, openBalance: number) {
  if (!['PENDING', 'PARTIAL'].includes(status)) throw new AppError('Charge is not open for payment', 409);
  if (!Number.isSafeInteger(amount) || amount <= 0) throw new AppError('Payment amount must be positive integer cents', 400);
  if (amount > openBalance) throw new AppError('Payment exceeds the charge outstanding amount', 409);
}

export function calculateDaysOverdue(referenceDate: Date, asOf: Date) {
  const diff = startOfUtcDay(asOf).getTime() - startOfUtcDay(referenceDate).getTime();
  return Math.max(0, Math.floor(diff / 86_400_000));
}

function startOfUtcDay(value: Date) {
  return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
}
