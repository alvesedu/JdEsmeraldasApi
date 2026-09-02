import { Router } from 'express';
import multer from 'multer';
import path from 'node:path';
import { authRequired } from '../middleware/auth.js';
import { uploadBankImport } from '../controllers/upload.controller.js';
import { AppError } from '../utils/AppError.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024, files: 1 },
  fileFilter: (_req, file, callback) => {
    const valid = file.mimetype === 'application/pdf' && path.extname(file.originalname).toLowerCase() === '.pdf';
    if (!valid) return callback(new AppError('Only PDF files are accepted', 400));
    callback(null, true);
  }
});
const router = Router();

router.use(authRequired);
router.post('/bank-import', upload.single('file'), asyncHandler(uploadBankImport));

export default router;
