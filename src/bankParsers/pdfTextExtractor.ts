import { PDFParse } from 'pdf-parse';
import { AppError } from '../utils/AppError.js';

export async function extractPdfText(buffer: Buffer) {
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText();
    if (!result.text.trim()) throw new AppError('PDF does not contain extractable text', 422);
    return result.text;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Unable to extract text from PDF', 422);
  } finally {
    await parser.destroy();
  }
}
