import type { Request, Response } from 'express';
import { bankImportIdSchema, bankTransactionFiltersSchema } from '../schemas/bankImport.schemas.js';
import {
  getBankImport,
  listBankImports,
  listBankImportTransactions
} from '../services/bankImport.service.js';

export async function list(_req: Request, res: Response) {
  res.json({ items: await listBankImports() });
}

export async function getById(req: Request, res: Response) {
  const { id } = bankImportIdSchema.parse(req.params);
  res.json({ item: await getBankImport(id) });
}

export async function listTransactions(req: Request, res: Response) {
  const { id } = bankImportIdSchema.parse(req.params);
  const filters = bankTransactionFiltersSchema.parse(req.query);
  res.json({ items: await listBankImportTransactions(id, filters) });
}
