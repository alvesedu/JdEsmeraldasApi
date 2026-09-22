import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { createCategory, listCategories, updateCategory } from '../controllers/lookup.controller.js';
import { validate } from '../middleware/validate.js';
import { createCategorySchema, categoryIdSchema, updateCategorySchema } from '../schemas/lookup.schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authRequired);
router.get('/categories', asyncHandler(listCategories));
router.post('/categories', validate({ body: createCategorySchema }), asyncHandler(createCategory));
router.patch('/categories/:id', validate({ params: categoryIdSchema, body: updateCategorySchema }), asyncHandler(updateCategory));

export default router;
