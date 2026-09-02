import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { createResident, listResidents, updateResident } from '../controllers/resident.controller.js';

const router = Router();

router.use(authRequired);
router.get('/', listResidents);
router.post('/', createResident);
router.put('/:id', updateResident);

export default router;
