import { Router } from 'express';
import { login, me } from '../controllers/auth.controller.js';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { z } from 'zod';

const router = Router();

router.post(
  '/login',
  validate({
    body: z.object({
      email: z.string().email(),
      password: z.string().min(6)
    })
  }),
  login
);

router.get('/me', authRequired, me);

export default router;
