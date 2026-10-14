import { Router } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generateCharges, listCharges, listDefaulters, registerManualPayment } from '../controllers/charge.controller.js';
import { chargeIdSchema, defaulterQuerySchema, manualChargePaymentSchema } from '../schemas/charge.schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authRequired);
router.get('/', listCharges);
router.get('/defaulters', validate({ query: defaulterQuerySchema }), asyncHandler(listDefaulters));
router.post(
  '/:id/manual-payments',
  validate({ params: chargeIdSchema, body: manualChargePaymentSchema }),
  asyncHandler(registerManualPayment)
);
router.post(
  '/generate',
  validate({
    body: z.object({ competence: z.string().regex(/^\d{4}-\d{2}$/) })
  }),
  generateCharges
);

export default router;
