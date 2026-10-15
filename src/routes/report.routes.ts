import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { getFinancialReports } from '../controllers/report.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authRequired);
router.get('/', asyncHandler(getFinancialReports));

export default router;
