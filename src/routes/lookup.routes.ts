import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { createCategory, listCategories } from '../controllers/lookup.controller.js';

const router = Router();

router.use(authRequired);
router.get('/categories', listCategories);
router.post('/categories', createCategory);

export default router;
