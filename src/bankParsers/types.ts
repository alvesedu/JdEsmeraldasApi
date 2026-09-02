export type BankDirection = 'CREDIT' | 'DEBIT';
export type BankTransactionType = 'PIX_RECEIVED' | 'PIX_SENT' | 'TRANSFER_RECEIVED' | 'TRANSFER_SENT' | 'OTHER';

export type BankParserInput = {
  buffer: Uint8Array;
  text: string;
  originalFileName: string;
};

export type ParsedBankTransaction = {
  postingDate: string;
  operationDate: string | null;
  operationTime: string | null;
  lot: string | null;
  document: string | null;
  description: string;
  transactionType: BankTransactionType;
  counterpartyOriginalName: string | null;
  counterpartyNormalizedName: string | null;
  counterpartyDocument: string | null;
  amount: number;
  direction: BankDirection;
  rawData: {
    lines: string[];
    originalDescription: string;
    originalValue: string;
  };
};

export type BankParserError = {
  type: string;
  message: string;
  rawData: unknown;
};

export type ParsedBankStatement = {
  bank: string;
  period: { startDate: string | null; endDate: string | null };
  account: {
    holderName: string | null;
    branch: string | null;
    accountNumber: string | null;
  };
  balances: { openingBalance: number | null; closingBalance: number | null };
  transactions: ParsedBankTransaction[];
  errors: BankParserError[];
  rawMetadata: Record<string, unknown>;
};
