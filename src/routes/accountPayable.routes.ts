import { Router } from 'express';
import {
  addManualPayment,
  cancel,
  create,
  getById,
  list,
  reversePayment,
  update
} from '../controllers/accountPayable.controller.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  accountPayableIdSchema,
  accountPayablePaymentIdSchema,
  createAccountPayableSchema,
  listAccountsPayableSchema,
  manualPaymentSchema,
  reversePaymentSchema,
  updateAccountPayableSchema
} from '../schemas/accountPayable.schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authRequired);
router.get('/', validate({ query: listAccountsPayableSchema }), asyncHandler(list));
router.get('/:id', validate({ params: accountPayableIdSchema }), asyncHandler(getById));
router.post('/', validate({ body: createAccountPayableSchema }), asyncHandler(create));
router.patch(
  '/:id',
  validate({ params: accountPayableIdSchema, body: updateAccountPayableSchema }),
  asyncHandler(update)
);
router.post('/:id/cancel', validate({ params: accountPayableIdSchema }), asyncHandler(cancel));
router.post(
  '/:id/payments',
  validate({ params: accountPayableIdSchema, body: manualPaymentSchema }),
  asyncHandler(addManualPayment)
);
router.post(
  '/:id/payments/:paymentId/reverse',
  validate({ params: accountPayablePaymentIdSchema, body: reversePaymentSchema }),
  asyncHandler(reversePayment)
);

export default router;
