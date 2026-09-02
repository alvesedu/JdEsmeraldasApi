import { Router } from 'express';
import multer from 'multer';
import { authRequired } from '../middleware/auth.js';
import { uploadBankImport } from '../controllers/upload.controller.js';

const upload = multer({ dest: '/tmp' });
const router = Router();

router.use(authRequired);
router.post('/bank-import', upload.single('file'), uploadBankImport);

export default router;
