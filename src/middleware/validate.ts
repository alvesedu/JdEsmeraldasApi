import type { NextFunction, Request, Response } from 'express';
import type { ZodTypeAny } from 'zod';
import { AppError } from '../utils/AppError.js';

export function validate(schema: { body?: ZodTypeAny; query?: ZodTypeAny; params?: ZodTypeAny }) {
  return (req: Request, _res: Response, next: NextFunction) => {
    try {
      if (schema.body) req.body = schema.body.parse(req.body);
      if (schema.query) replaceRecord(req.query, schema.query.parse(req.query));
      if (schema.params) replaceRecord(req.params, schema.params.parse(req.params));
      next();
    } catch (error) {
      next(new AppError(error instanceof Error ? error.message : 'Validation error', 400));
    }
  };
}

function replaceRecord(target: Record<string, unknown>, parsed: unknown) {
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new AppError('Validated request data must be an object', 400);
  }

  for (const key of Object.keys(target)) delete target[key];
  Object.assign(target, parsed);
}
