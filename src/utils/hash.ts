import crypto from 'crypto';
import { normalizeText } from './normalize.js';

export function sha256(value: string | Buffer) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function buildTransactionFingerprint(input: {
  bank: string;
  postingDate: string;
  operationDate?: string | null;
  operationTime?: string | null;
  lot?: string | null;
  document?: string | null;
  amount: number;
  direction: string;
  counterpartyOriginalName?: string | null;
  description: string;
}) {
  return sha256(
    [
      input.bank,
      input.postingDate,
      input.operationDate ?? '',
      input.operationTime ?? '',
      input.lot ?? '',
      input.document ?? '',
      String(input.amount),
      input.direction,
      normalizeText(input.counterpartyOriginalName ?? ''),
      normalizeText(input.description)
    ].join('|')
  );
}
