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

const trailingAmountPattern =
  /^(\d{2}\/\d{2}\/\d{4})\b.*?((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*(\(\s*[+-]\s*\)|[CD])\s*$/i;
const leadingAmountPattern =
  /^(\d{2}\/\d{2}\/\d{4})\s+((?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*(\(\s*[+-]\s*\)|[CD])(?:\s+(.*))?$/i;
const operationPattern = /\b(\d{2})\/(\d{2})(?:\/(\d{4}))?\s+([0-2]\d:[0-5]\d)\b(.*)$/;
const documentPattern = /\b(?:\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\b/;

export class BancoBrasilParser implements BankStatementParser {
  readonly bank = 'BANCO_DO_BRASIL';

  canParse(input: BankParserInput) {
    const normalized = normalizeText(input.text);
    const explicitBankName = normalized.includes('BANCO DO BRASIL');
    const recognizableLayout =
      normalized.includes('EXTRATO DE CONTA CORRENTE') &&
      normalized.includes('LANCAMENTOS') &&
      normalized.includes('DOCUMENTO VALOR LOTE HISTORICO');
    return explicitBankName ? normalized.includes('EXTRATO') : recognizableLayout;
  }

  async parse(input: BankParserInput): Promise<ParsedBankStatement> {
    const lines = cleanLines(input.text);
    const blocks = groupTransactionBlocks(lines);
    const transactions: ParsedBankTransaction[] = [];
    const errors: BankParserError[] = lines
      .filter(
        (line) =>
          /^\d{2}\/\d{2}\/\d{4}\b/.test(line) &&
          !detectTransactionStart(line) &&
          !isStatementSummaryLine(line)
      )
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
        closingBalance:
          parseBalance(lines, ['SALDO FINAL', 'S A L D O'], true) ?? parseBalance(lines, ['SALDO DO DIA'], true)
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
  const fullMatch = /PER[IÍ]ODO\s*:?\s*(\d{2}\/\d{2}\/\d{4})\s*(?:A|AT[EÉ]|-)\s*(\d{2}\/\d{2}\/\d{4})/i.exec(text);
  const compactMatch = /PER[IÍ]ODO\s*:?\s*(\d{2})\s*(?:A|AT[EÉ]|-)\s*(\d{2})\/(\d{2})\/(\d{4})/i.exec(text);
  return {
    startDate: fullMatch
      ? brazilianDateToIso(fullMatch[1])
      : compactMatch
        ? `${compactMatch[4]}-${compactMatch[3]}-${compactMatch[1]}`
        : null,
    endDate: fullMatch
      ? brazilianDateToIso(fullMatch[2])
      : compactMatch
        ? `${compactMatch[4]}-${compactMatch[3]}-${compactMatch[2]}`
        : null
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
  return matchTransactionStart(line) !== null && !isStatementSummaryLine(line);
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
  const start = matchTransactionStart(firstLine);
  if (!start) throw new Error('Transaction start line is invalid');

  const postingDate = brazilianDateToIso(start.postingDate);
  const originalValue = `${start.amount} ${start.marker}`;
  const amount = parseAmount(start.amount);
  const direction = parseDirection(start.marker);
  const tokens = start.fields.split(/\s+/).filter(Boolean);
  const lot = tokens.shift() ?? null;
  const document = tokens.shift() ?? null;
  const inlineDescription = tokens.join(' ');
  const operation = parseOperation(lines.slice(1), postingDate);
  const descriptionLines = lines.slice(1).filter((line) => !operationPattern.test(line));
  const description = descriptionLines[0] || inlineDescription || start.fields;
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

function parseBalance(lines: string[], labels: string[], useLast = false) {
  const candidates = lines.filter((candidate) =>
    labels.some((label) => normalizeText(candidate).includes(label))
  );
  const line = useLast ? candidates.at(-1) : candidates[0];
  if (!line) return null;
  const match = /(-?(?:\d{1,3}(?:\.\d{3})*|\d+),\d{2})\s*(\(\s*[+-]\s*\)|[CD])?/i.exec(line);
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
  return normalized.includes('SALDO FINAL') ||
    normalized.includes('SALDO DO DIA') ||
    normalized === 'LANCAMENTOS' ||
    normalized.startsWith('RESUMO') ||
    normalized.startsWith('TOTAIS');
}

function isStatementSummaryLine(line: string) {
  const normalized = normalizeText(line);
  const compact = normalized.replace(/\s+/g, '');
  return normalized.includes('SALDO') ||
    compact.includes('SALDO') ||
    normalized.includes('TOTAL APLICACOES FINANCEIRAS');
}

function matchTransactionStart(line: string) {
  const leading = leadingAmountPattern.exec(line);
  if (leading) {
    return {
      postingDate: leading[1],
      amount: leading[2],
      marker: leading[3],
      fields: leading[4]?.trim() ?? ''
    };
  }
  const trailing = trailingAmountPattern.exec(line);
  if (!trailing) return null;
  return {
    postingDate: trailing[1],
    amount: trailing[2],
    marker: trailing[3],
    fields: line.slice(trailing[1].length, line.lastIndexOf(trailing[2])).trim()
  };
}

function brazilianDateToIso(value: string) {
  const [day, month, year] = value.split('/');
  return `${year}-${month}-${day}`;
}
