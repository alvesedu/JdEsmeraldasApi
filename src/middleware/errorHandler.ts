import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../utils/AppError.js';

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  const error = err instanceof AppError ? err : new AppError('Internal server error');
  return res.status(error.statusCode).json({
    error: {
      message: error.message
    }
  });
}
