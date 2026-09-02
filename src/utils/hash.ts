import crypto from 'crypto';

export function sha256(value: string) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function buildTransactionFingerprint(input: {
  bank: string;
  postingDate: string;
  lot?: string | null;
  document?: string | null;
  amount: number;
  direction: string;
  counterparty?: string | null;
}) {
  return sha256(
    [
      input.bank,
      input.postingDate,
      input.lot ?? '',
      input.document ?? '',
      String(input.amount),
      input.direction,
      input.counterparty ?? ''
    ].join('|')
  );
}
