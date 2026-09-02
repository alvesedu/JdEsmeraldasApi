import { Charge } from '../models/Charge.js';
import { AccountPayable } from '../models/AccountPayable.js';
import { BankTransaction } from '../models/BankTransaction.js';
import { MonthlyClosing } from '../models/MonthlyClosing.js';
import { PaymentAllocation } from '../models/PaymentAllocation.js';
import { Unit } from '../models/Unit.js';

export async function buildDashboard(competence: string) {
  const [units, charges, payables, bankTx, closing] = await Promise.all([
    Unit.find(),
    Charge.find({ competence }),
    AccountPayable.find({ competence }),
    BankTransaction.find(),
    MonthlyClosing.findOne({ competence })
  ]);

  const revenueForecast = charges.reduce((sum, item) => sum + item.valueOriginal, 0);
  const revenueReceived = charges.reduce((sum, item) => sum + item.valuePaid, 0);
  const chargeIds = charges.map((item) => item._id);
  const allocations = chargeIds.length
    ? await PaymentAllocation.find({ chargeId: { $in: chargeIds }, reversedAt: null }).lean()
    : [];
  const referenceDateByChargeId = new Map(charges.map((item) => [String(item._id), item.referenceDate]));
  const revenueByReference = allocations.reduce(
    (totals, allocation) => {
      const referenceDate = referenceDateByChargeId.get(String(allocation.chargeId));
      if (referenceDate && allocation.paymentDate.getTime() <= referenceDate.getTime()) {
        totals.beforeRef += allocation.amount;
      } else {
        totals.afterRef += allocation.amount;
      }
      return totals;
    },
    { beforeRef: 0, afterRef: 0 }
  );
  const pendingUnitsCount = charges.filter((item) => item.openBalance > 0).length;
  const expensePaid = payables
    .filter((item) => item.status !== 'CANCELLED')
    .reduce((sum, item) => sum + item.paidAmount, 0);
  const bankBalance = bankTx.reduce((sum, item) => sum + (item.direction === 'CREDIT' ? item.amount : -item.amount), 0);
  const openCommitments = payables
    .filter((item) => item.status !== 'PAID' && item.status !== 'CANCELLED')
    .reduce((sum, item) => sum + item.outstandingAmount, 0);

  return {
    competence,
    unitsCount: units.length,
    revenueForecast,
    revenueReceived,
    revenueReceivedBeforeRef: revenueByReference.beforeRef || charges
      .filter((item) => item.status === 'PAID')
      .reduce((sum, item) => sum + item.valuePaid, 0),
    revenueReceivedAfterRef: revenueByReference.afterRef || charges
      .filter((item) => item.status === 'PAID_AFTER_REFERENCE_DATE')
      .reduce((sum, item) => sum + item.valuePaid, 0),
    revenuePending: revenueForecast - revenueReceived,
    pendingUnitsCount,
    expensePaid,
    openCommitments,
    bankBalance,
    availableBalance: bankBalance - openCommitments,
    closing
  };
}
