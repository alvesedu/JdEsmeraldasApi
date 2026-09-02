import dotenv from 'dotenv';

dotenv.config();

const required = ['JWT_SECRET', 'MONGODB_URI'] as const;

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

function parseDurationInSeconds(value: string) {
  const match = /^(\d+)(s|m|h|d)$/.exec(value);
  if (!match) {
    throw new Error('JWT_EXPIRES_IN must use the format 30s, 15m, 12h or 7d');
  }

  const amount = Number(match[1]);
  switch (match[2]) {
    case 's': return amount;
    case 'm': return amount * 60;
    case 'h': return amount * 3_600;
    case 'd': return amount * 86_400;
    default: throw new Error('Unsupported JWT expiration unit');
  }
}

function parsePositiveInteger(value: string | undefined, fallback: number, label: string) {
  const parsed = Number(value ?? fallback);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive integer`);
  }
  return parsed;
}

export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  jwtSecret: process.env.JWT_SECRET as string,
  jwtExpiresInSeconds: parseDurationInSeconds(process.env.JWT_EXPIRES_IN ?? '1d'),
  mongoUri: process.env.MONGODB_URI as string,
  mongoReadyTimeoutMs: parsePositiveInteger(process.env.MONGODB_READY_TIMEOUT_MS, 30_000, 'MONGODB_READY_TIMEOUT_MS'),
  uploadDir: process.env.UPLOAD_DIR ?? 'uploads'
};
