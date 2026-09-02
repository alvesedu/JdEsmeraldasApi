import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { getByCompetence, list, update, upsert } from '../controllers/monthlyClosing.controller.js';
import {
  listMonthlyClosingsSchema,
  monthlyClosingParamsSchema,
  updateMonthlyClosingSchema,
  upsertMonthlyClosingSchema
} from '../schemas/monthlyClosing.schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authRequired);
router.get('/', validate({ query: listMonthlyClosingsSchema }), asyncHandler(list));
router.get('/:competence', validate({ params: monthlyClosingParamsSchema }), asyncHandler(getByCompetence));
router.post('/', validate({ body: upsertMonthlyClosingSchema }), asyncHandler(upsert));
router.patch('/:competence', validate({ params: monthlyClosingParamsSchema, body: updateMonthlyClosingSchema }), asyncHandler(update));

export default router;
