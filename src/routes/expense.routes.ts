import { Router } from 'express';
import multer from 'multer';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { attachFile, create, list, remove, update } from '../controllers/expense.controller.js';
import { createExpenseSchema, expenseIdSchema, listExpensesSchema, updateExpenseSchema } from '../schemas/expense.schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 }
});
const router = Router();

router.use(authRequired);
router.get('/', validate({ query: listExpensesSchema }), asyncHandler(list));
router.post('/', validate({ body: createExpenseSchema }), asyncHandler(create));
router.patch('/:id', validate({ params: expenseIdSchema, body: updateExpenseSchema }), asyncHandler(update));
router.post('/:id/attachment', validate({ params: expenseIdSchema }), upload.single('file'), asyncHandler(attachFile));
router.delete('/:id', validate({ params: expenseIdSchema }), asyncHandler(remove));

export default router;
