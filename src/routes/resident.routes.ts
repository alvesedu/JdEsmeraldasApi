import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { createResident, listResidents, updateResident } from '../controllers/resident.controller.js';
import { validate } from '../middleware/validate.js';
import { createResidentSchema, residentIdSchema, updateResidentSchema } from '../schemas/resident.schemas.js';

const router = Router();

router.use(authRequired);
router.get('/', listResidents);
router.post('/', validate({ body: createResidentSchema }), createResident);
router.put('/:id', validate({ params: residentIdSchema, body: updateResidentSchema }), updateResident);

export default router;
