import fs from 'fs';
import path from 'path';
import { env } from '../config/env.js';
import { sha256 } from '../utils/hash.js';
import { BankImport } from '../models/BankImport.js';
import { AppError } from '../utils/AppError.js';
import type { NextFunction, Request, Response } from 'express';

export async function uploadBankImport(req: Request, res: Response, next: NextFunction) {
  try {
    const file = req.file;
    if (!file) throw new AppError('PDF file is required', 400);
    if (!req.user) throw new AppError('Unauthorized', 401);

    fs.mkdirSync(env.uploadDir, { recursive: true });
    const filePath = path.join(env.uploadDir, file.filename);
    const buffer = fs.readFileSync(file.path);
    fs.writeFileSync(filePath, buffer);
    fs.unlinkSync(file.path);

    const fileHash = sha256(buffer.toString('base64'));
    const item = await BankImport.create({
      originalFileName: file.originalname,
      period: req.body.period ?? null,
      bank: 'BANCO_DO_BRASIL',
      uploadedBy: req.user._id,
      fileHash,
      processingStatus: 'PENDING',
      transactionsCount: 0,
      processingErrors: []
    });

    res.status(201).json({ item });
  } catch (error) {
    next(error);
  }
}
