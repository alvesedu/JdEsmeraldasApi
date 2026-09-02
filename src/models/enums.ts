export const UnitType = {
  CASA: 'CASA',
  LOTE: 'LOTE'
} as const;

export const UnitStatus = {
  ATIVA: 'ATIVA',
  INATIVA: 'INATIVA'
} as const;

export const ChargeStatus = {
  PENDING: 'PENDING',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  PAID_AFTER_REFERENCE_DATE: 'PAID_AFTER_REFERENCE_DATE'
} as const;

export const BankDirection = {
  CREDIT: 'CREDIT',
  DEBIT: 'DEBIT'
} as const;

export const ProcessingStatus = {
  PENDING: 'PENDING',
  SUGGESTED: 'SUGGESTED',
  CONFIRMED: 'CONFIRMED'
} as const;

export const AccountPayableStatus = {
  PENDING: 'PENDING',
  PARTIAL: 'PARTIAL',
  PAID: 'PAID',
  CANCELLED: 'CANCELLED'
} as const;

export const MonthlyClosingStatus = {
  OPEN: 'OPEN',
  CLOSED: 'CLOSED'
} as const;
