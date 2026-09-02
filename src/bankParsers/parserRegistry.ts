import { AppError } from '../utils/AppError.js';
import { BancoBrasilParser } from './bancoBrasil.parser.js';
import { extractPdfText } from './pdfTextExtractor.js';
import type { BankStatementParser } from './bankStatementParser.interface.js';

const parsers: BankStatementParser[] = [new BancoBrasilParser()];

export async function parseBankStatement(buffer: Buffer, originalFileName: string) {
  const text = await extractPdfText(buffer);
  const input = { buffer, text, originalFileName };
  const parser = parsers.find((candidate) => candidate.canParse(input));
  if (!parser) throw new AppError('PDF is not a supported bank statement', 422);
  return parser.parse(input);
}
