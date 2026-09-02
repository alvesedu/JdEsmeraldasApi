import { Router } from 'express';
import { list } from '../controllers/audit.controller.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { listAuditLogsSchema } from '../schemas/audit.schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authRequired);
router.get('/', validate({ query: listAuditLogsSchema }), asyncHandler(list));

export default router;
