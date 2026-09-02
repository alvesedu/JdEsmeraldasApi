import { Router } from 'express';
import {
  allocate,
  getReconciliation,
  listCredits,
  reverse
} from '../controllers/creditReconciliation.controller.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  allocateCreditSchema,
  creditFiltersSchema,
  reverseAllocationSchema,
  transactionIdSchema
} from '../schemas/creditReconciliation.schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

export const bankTransactionRouter = Router();
bankTransactionRouter.use(authRequired);
bankTransactionRouter.get('/credits/unmatched', validate({ query: creditFiltersSchema }), asyncHandler(listCredits));
bankTransactionRouter.get('/:id/reconciliation', validate({ params: transactionIdSchema }), asyncHandler(getReconciliation));
bankTransactionRouter.post(
  '/:id/allocate',
  validate({ params: transactionIdSchema, body: allocateCreditSchema }),
  asyncHandler(allocate)
);

export const paymentAllocationRouter = Router();
paymentAllocationRouter.use(authRequired);
paymentAllocationRouter.post(
  '/:id/reverse',
  validate({ params: transactionIdSchema, body: reverseAllocationSchema }),
  asyncHandler(reverse)
);
