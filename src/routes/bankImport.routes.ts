import { Router } from 'express';
import { getById, list, listTransactions } from '../controllers/bankImport.controller.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { bankImportIdSchema, bankTransactionFiltersSchema } from '../schemas/bankImport.schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authRequired);
router.get('/', asyncHandler(list));
router.get('/:id', validate({ params: bankImportIdSchema }), asyncHandler(getById));
router.get(
  '/:id/transactions',
  validate({ params: bankImportIdSchema, query: bankTransactionFiltersSchema }),
  asyncHandler(listTransactions)
);

export default router;
