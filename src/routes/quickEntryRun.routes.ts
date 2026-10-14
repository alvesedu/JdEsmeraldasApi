import { Router } from 'express';
import { archive, confirmItem, create, getById, list } from '../controllers/quickEntryRun.controller.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import {
  createQuickEntryRunSchema,
  confirmQuickEntryRunItemSchema,
  listQuickEntryRunsSchema,
  quickEntryRunItemParamsSchema,
  quickEntryRunParamsSchema
} from '../schemas/quickEntryRun.schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authRequired);
router.get('/', validate({ query: listQuickEntryRunsSchema }), asyncHandler(list));
router.get('/:id', validate({ params: quickEntryRunParamsSchema }), asyncHandler(getById));
router.post('/', validate({ body: createQuickEntryRunSchema }), asyncHandler(create));
router.patch('/:id/archive', validate({ params: quickEntryRunParamsSchema }), asyncHandler(archive));
router.patch(
  '/:id/items/:lineNumber/confirmation',
  validate({ params: quickEntryRunItemParamsSchema, body: confirmQuickEntryRunItemSchema }),
  asyncHandler(confirmItem)
);

export default router;
