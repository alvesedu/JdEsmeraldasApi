import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { changeResident, createUnit, getUnit, listOpenCharges, listUnits, updateUnit } from '../controllers/unit.controller.js';
import { changeUnitResidentSchema, createUnitSchema, unitIdSchema, updateUnitSchema } from '../schemas/unit.schemas.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

router.use(authRequired);
router.get('/', listUnits);
router.get('/:id/open-charges', asyncHandler(listOpenCharges));
router.get('/:id', getUnit);
router.post(
  '/',
  validate({ body: createUnitSchema }),
  createUnit
);
router.put('/:id', validate({ params: unitIdSchema, body: updateUnitSchema }), updateUnit);
router.post('/:id/resident', validate({ params: unitIdSchema, body: changeUnitResidentSchema }), asyncHandler(changeResident));

export default router;
