import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/User.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/AppError.js';

export async function login(req: Request, res: Response, next: NextFunction) {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user || !user.active) {
      throw new AppError('Invalid credentials', 401);
    }

    const matches = await bcrypt.compare(password, user.passwordHash);
    if (!matches) {
      throw new AppError('Invalid credentials', 401);
    }

    const token = jwt.sign({ role: user.role }, env.jwtSecret, {
      subject: String(user._id),
      expiresIn: env.jwtExpiresInSeconds
    });

    res.json({
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role
      }
    });
  } catch (error) {
    next(error);
  }
}

export async function me(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return next(new AppError('Unauthorized', 401));

  res.json({
    user: {
      id: req.user._id,
      name: req.user.name,
      email: req.user.email,
      role: req.user.role
    }
  });
}

export async function ensureDefaultAdmin() {
  const existing = await User.countDocuments();
  if (existing > 0) return;

  const name = process.env.ADMIN_NAME ?? 'Administrador';
  const email = process.env.ADMIN_EMAIL ?? 'admin@condominio.local';
  const password = process.env.ADMIN_PASSWORD ?? 'admin123';
  const passwordHash = await bcrypt.hash(password, 10);

  await User.create({ name, email, passwordHash, role: 'ADMIN', active: true });
}
