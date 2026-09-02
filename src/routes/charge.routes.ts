import { Router } from 'express';
import { z } from 'zod';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { generateCharges, listCharges } from '../controllers/charge.controller.js';

const router = Router();

router.use(authRequired);
router.get('/', listCharges);
router.post(
  '/generate',
  validate({
    body: z.object({ competence: z.string().regex(/^\d{4}-\d{2}$/) })
  }),
  generateCharges
);

export default router;
