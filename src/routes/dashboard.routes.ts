import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { getDashboard } from '../controllers/dashboard.controller.js';

const router = Router();

router.use(authRequired);
router.get('/', getDashboard);

export default router;
