import type { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { AppError } from '../utils/AppError.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const error = err instanceof AppError
    ? err
    : err instanceof multer.MulterError
      ? new AppError(err.code === 'LIMIT_FILE_SIZE' ? 'PDF exceeds the 10 MB limit' : err.message, 400)
      : new AppError('Internal server error');
  return res.status(error.statusCode).json({
    error: {
      message: error.message
    }
  });
}
