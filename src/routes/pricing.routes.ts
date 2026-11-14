import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { asyncHandler } from '../utils/asyncHandler.js';
import { createPricingRuleSchema, pricingRuleIdSchema, updatePricingRuleSchema } from '../schemas/pricing.schemas.js';
import { createPricingRuleController, deactivatePricingRuleController, listPricingRulesController, updatePricingRuleController } from '../controllers/pricing.controller.js';

const router = Router();

router.use(authRequired);
router.get('/', asyncHandler(listPricingRulesController));
router.post('/', validate({ body: createPricingRuleSchema }), asyncHandler(createPricingRuleController));
router.patch('/:id', validate({ params: pricingRuleIdSchema, body: updatePricingRuleSchema }), asyncHandler(updatePricingRuleController));
router.delete('/:id', validate({ params: pricingRuleIdSchema }), asyncHandler(deactivatePricingRuleController));

export default router;
