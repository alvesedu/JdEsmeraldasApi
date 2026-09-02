import { Charge } from '../models/Charge.js';
import { AccountPayable } from '../models/AccountPayable.js';
import { BankTransaction } from '../models/BankTransaction.js';
import { MonthlyClosing } from '../models/MonthlyClosing.js';
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
  const pendingUnitsCount = charges.filter((item) => item.openBalance > 0).length;
  const expensePaid = payables.filter((item) => item.status === 'PAID').reduce((sum, item) => sum + item.paidValue, 0);
  const bankBalance = bankTx.reduce((sum, item) => sum + (item.direction === 'CREDIT' ? item.amount : -item.amount), 0);
  const openCommitments = payables
    .filter((item) => item.status !== 'PAID' && item.status !== 'CANCELLED')
    .reduce((sum, item) => sum + Math.max(item.expectedValue - item.paidValue, 0), 0);

  return {
    competence,
    unitsCount: units.length,
    revenueForecast,
    revenueReceived,
    revenuePending: revenueForecast - revenueReceived,
    pendingUnitsCount,
    expensePaid,
    openCommitments,
    bankBalance,
    availableBalance: bankBalance - openCommitments,
    closing
  };
}
