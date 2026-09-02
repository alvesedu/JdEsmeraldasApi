import type { BankStatementParser } from './bankStatementParser.interface.js';
import type {
  BankDirection,
  BankParserError,
  BankParserInput,
  BankTransactionType,
  ParsedBankStatement,
  ParsedBankTransaction
} from './types.js';
import { normalizeBankName, normalizeText, stripControlCharacters } from '../utils/normalize.js';

const transactionStartPattern =
  /^(\d{2}\/\d{2}\/\d{4})\b.*?((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*(\(\s*[+-]\s*\)|[CD])\s*$/i;
const operationPattern = /\b(\d{2})\/(\d{2})(?:\/(\d{4}))?\s+([0-2]\d:[0-5]\d)\b(.*)$/;
const documentPattern = /\b(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/;

export class BancoBrasilParser implements BankStatementParser {
  readonly bank = 'BANCO_DO_BRASIL';

  canParse(input: BankParserInput) {
    const normalized = normalizeText(input.text);
    return normalized.includes('BANCO DO BRASIL') && normalized.includes('EXTRATO');
  }

  async parse(input: BankParserInput): Promise<ParsedBankStatement> {
    const lines = cleanLines(input.text);
    const blocks = groupTransactionBlocks(lines);
    const transactions: ParsedBankTransaction[] = [];
    const errors: BankParserError[] = lines
      .filter((line) => /^\d{2}\/\d{2}\/\d{4}\b/.test(line) && !detectTransactionStart(line))
      .map((line) => ({
        type: 'UNRECOGNIZED_TRANSACTION_LINE',
        message: 'A dated line could not be interpreted as a transaction',
        rawData: { line }
      }));

    for (const block of blocks) {
      try {
        transactions.push(parseTransactionBlock(block));
      } catch (error) {
        errors.push({
          type: 'INVALID_TRANSACTION_BLOCK',
          message: error instanceof Error ? error.message : 'Unable to parse transaction block',
          rawData: { lines: block }
        });
      }
    }

    return {
      bank: this.bank,
      period: parsePeriod(lines),
      account: parseAccount(lines),
      balances: {
        openingBalance: parseBalance(lines, ['SALDO ANTERIOR', 'SALDO INICIAL']),
        closingBalance: parseBalance(lines, ['SALDO FINAL'])
      },
      transactions,
      errors,
      rawMetadata: {
        sourceFileName: input.originalFileName,
        extractedLineCount: lines.length,
        transactionBlockCount: blocks.length
      }
    };
  }
}

export function cleanLines(text: string) {
  return text
    .split(/\r?\n/)
    .map((line) => stripControlCharacters(line).trim().replace(/\s+/g, ' '))
    .filter((line) => line && !/^--\s*\d+\s+of\s+\d+\s*--$/i.test(line));
}

export function parsePeriod(lines: string[]) {
  const text = lines.join(' ');
  const match = /PER[IÍ]ODO\s*:?\s*(\d{2}\/\d{2}\/\d{4})\s*(?:A|AT[EÉ]|-)\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text);
  return {
    startDate: match ? brazilianDateToIso(match[1]) : null,
    endDate: match ? brazilianDateToIso(match[2]) : null
  };
}

export function parseAccount(lines: string[]) {
  const holderLine = lines.find((line) => /^CLIENTE\s*:/i.test(line));
  const joined = lines.join(' ');
  const branch = /AG[EÊ]NCIA\s*:?\s*([\d.-]+)/i.exec(joined)?.[1] ?? null;
  const accountNumber = /CONTA(?:\s+CORRENTE)?\s*:?\s*([\d.-]+)/i.exec(joined)?.[1] ?? null;
  return {
    holderName: holderLine?.replace(/^CLIENTE\s*:\s*/i, '').trim() || null,
    branch,
    accountNumber
  };
}

export function detectTransactionStart(line: string) {
  return transactionStartPattern.test(line) && !normalizeText(line).includes('SALDO');
}

export function groupTransactionBlocks(lines: string[]) {
  const blocks: string[][] = [];
  let current: string[] | null = null;

  for (const line of lines) {
    if (detectTransactionStart(line)) {
      if (current) blocks.push(current);
      current = [line];
      continue;
    }
    if (current && isTransactionBoundary(line)) {
      blocks.push(current);
      current = null;
      continue;
    }
    if (current) current.push(line);
  }
  if (current) blocks.push(current);
  return blocks;
}

export function parseTransactionBlock(lines: string[]): ParsedBankTransaction {
  const firstLine = lines[0];
  const start = transactionStartPattern.exec(firstLine);
  if (!start) throw new Error('Transaction start line is invalid');

  const postingDate = brazilianDateToIso(start[1]);
  const originalValue = `${start[2]} ${start[3]}`;
  const amount = parseAmount(start[2]);
  const direction = parseDirection(start[3]);
  const middle = firstLine.slice(start[1].length, firstLine.lastIndexOf(start[2])).trim();
  const tokens = middle.split(/\s+/).filter(Boolean);
  const lot = tokens.shift() ?? null;
  const document = tokens.shift() ?? null;
  const inlineDescription = tokens.join(' ');
  const operation = parseOperation(lines.slice(1), postingDate);
  const descriptionLines = lines.slice(1).filter((line) => !operationPattern.test(line));
  const description = descriptionLines[0] || inlineDescription || middle;
  if (!description) throw new Error('Transaction description was not found');

  const counterpartyDocument = operation?.counterpartyLine.match(documentPattern)?.[0].replace(/\D/g, '') ?? null;
  const counterpartyOriginalName = operation
    ? cleanCounterparty(operation.counterpartyLine.replace(documentPattern, ''))
    : null;

  return {
    postingDate,
    operationDate: operation?.date ?? null,
    operationTime: operation?.time ?? null,
    lot,
    document,
    description,
    transactionType: normalizeTransactionType(description),
    counterpartyOriginalName,
    counterpartyNormalizedName: counterpartyOriginalName ? normalizeBankName(counterpartyOriginalName) : null,
    counterpartyDocument,
    amount,
    direction,
    rawData: {
      lines,
      originalDescription: description,
      originalValue
    }
  };
}

export function parseAmount(value: string) {
  const normalized = value.replace(/\./g, '');
  const match = /^(\d+),(\d{2})$/.exec(normalized);
  if (!match) throw new Error(`Invalid Brazilian amount: ${value}`);
  const amount = Number(match[1]) * 100 + Number(match[2]);
  if (!Number.isSafeInteger(amount)) throw new Error('Amount exceeds safe integer range');
  return amount;
}

export function normalizeTransactionType(description: string): BankTransactionType {
  const normalized = normalizeText(description);
  if (normalized.includes('PIX') && /(RECEBID|CREDITO)/.test(normalized)) return 'PIX_RECEIVED';
  if (normalized.includes('PIX') && /(ENVIAD|DEBITO|PAGAMENTO)/.test(normalized)) return 'PIX_SENT';
  if (/(TRANSFERENCIA|TED|DOC)/.test(normalized) && /(RECEBID|CREDITO)/.test(normalized)) {
    return 'TRANSFER_RECEIVED';
  }
  if (/(TRANSFERENCIA|TED|DOC)/.test(normalized) && /(ENVIAD|DEBITO)/.test(normalized)) {
    return 'TRANSFER_SENT';
  }
  return 'OTHER';
}

function parseBalance(lines: string[], labels: string[]) {
  const line = lines.find((candidate) => labels.some((label) => normalizeText(candidate).includes(label)));
  if (!line) return null;
  const match = /(-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*(\(\s*[+-]\s*\)|[CD])?\s*$/i.exec(line);
  if (!match) return null;
  const amount = parseAmount(match[1].replace('-', ''));
  const negative = match[1].startsWith('-') || /-|D/i.test(match[2] ?? '');
  return negative ? -amount : amount;
}

function parseDirection(marker: string): BankDirection {
  return /-|D/i.test(marker) ? 'DEBIT' : 'CREDIT';
}

function parseOperation(lines: string[], postingDate: string) {
  for (let index = 0; index < lines.length; index += 1) {
    const match = operationPattern.exec(lines[index]);
    if (!match) continue;
    const counterpartyLine = match[5].trim() || lines[index + 1] || '';
    return {
      date: inferOperationDate(Number(match[1]), Number(match[2]), match[3], postingDate),
      time: match[4],
      counterpartyLine
    };
  }
  return null;
}

function inferOperationDate(day: number, month: number, explicitYear: string | undefined, postingDate: string) {
  const posting = new Date(`${postingDate}T00:00:00.000Z`);
  let year = explicitYear ? Number(explicitYear) : posting.getUTCFullYear();
  let candidate = new Date(Date.UTC(year, month - 1, day));
  if (!explicitYear && candidate.getTime() - posting.getTime() > 31 * 86_400_000) {
    year -= 1;
    candidate = new Date(Date.UTC(year, month - 1, day));
  }
  return candidate.toISOString().slice(0, 10);
}

function cleanCounterparty(value: string) {
  return value
    .replace(/^(?:NOME|FAVORECIDO|REMETENTE|DESTINAT[AÁ]RIO)\s*:?\s*/i, '')
    .replace(/^[-–—:]+/, '')
    .trim() || null;
}

function isTransactionBoundary(line: string) {
  const normalized = normalizeText(line);
  return normalized.includes('SALDO FINAL') || normalized.startsWith('RESUMO') || normalized.startsWith('TOTAIS');
}

function brazilianDateToIso(value: string) {
  const [day, month, year] = value.split('/');
  return `${year}-${month}-${day}`;
}
