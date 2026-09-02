import { AppError } from '../utils/AppError.js';
import type { Request, Response } from 'express';
import { processBankImport } from '../services/bankImport.service.js';

export async function uploadBankImport(req: Request, res: Response) {
  if (!req.file) throw new AppError('PDF file is required', 400);
  if (!req.user) throw new AppError('Unauthorized', 401);
  const result = await processBankImport(req.file, req.user._id);
  res.status(result.duplicateFile ? 200 : 201).json(result);
}
