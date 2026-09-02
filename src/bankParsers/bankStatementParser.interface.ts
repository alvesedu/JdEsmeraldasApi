import type { BankParserInput, ParsedBankStatement } from './types.js';

export interface BankStatementParser {
  readonly bank: string;
  canParse(input: BankParserInput): boolean;
  parse(input: BankParserInput): Promise<ParsedBankStatement>;
}
