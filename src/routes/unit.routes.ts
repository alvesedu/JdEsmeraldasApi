import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';
import { createUnit, getUnit, listOpenCharges, listUnits, updateUnit } from '../controllers/unit.controller.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authRequired);
router.get('/', listUnits);
router.get('/:id/open-charges', asyncHandler(listOpenCharges));
router.get('/:id', getUnit);
router.post(
  '/',
  validate({
    body: z.object({
      quadra: z.string().min(1),
      numero: z.string().min(1),
      tipo: z.enum(['CASA', 'LOTE']),
      status: z.enum(['ATIVA', 'INATIVA']).optional()
    })
  }),
  createUnit
);
router.put('/:id', updateUnit);

export default router;
