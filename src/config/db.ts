import mongoose from 'mongoose';
import { env } from './env.js';

type MongoHello = {
  setName?: string;
  isWritablePrimary?: boolean;
  logicalSessionTimeoutMinutes?: number;
};

export type DatabaseReadiness = {
  connected: boolean;
  replicaSetName: string | null;
  isPrimary: boolean;
  supportsTransactions: boolean;
};

export async function connectDatabase() {
  mongoose.set('strictQuery', true);
  const deadline = Date.now() + env.mongoReadyTimeoutMs;
  let lastError: unknown;

  while (Date.now() < deadline) {
    try {
      await mongoose.connect(env.mongoUri, { serverSelectionTimeoutMS: Math.min(3_000, Math.max(1_000, deadline - Date.now())) });
      await waitForReplicaSetPrimary(deadline);
      return;
    } catch (error) {
      lastError = error;
      await mongoose.disconnect().catch(() => undefined);
      await delay(1_000);
    }
  }

  throw new Error(`MongoDB replica set did not become PRIMARY within ${env.mongoReadyTimeoutMs}ms: ${errorMessage(lastError)}`);
}

export async function getDatabaseReadiness(): Promise<DatabaseReadiness> {
  if (mongoose.connection.readyState !== 1 || !mongoose.connection.db) {
    return { connected: false, replicaSetName: null, isPrimary: false, supportsTransactions: false };
  }

  try {
    const hello = await mongoose.connection.db.admin().command({ hello: 1 }) as MongoHello;
    const replicaSetName = hello.setName ?? null;
    const isPrimary = hello.isWritablePrimary === true;
    const supportsTransactions = Boolean(replicaSetName && isPrimary && hello.logicalSessionTimeoutMinutes);
    return { connected: true, replicaSetName, isPrimary, supportsTransactions };
  } catch {
    return { connected: false, replicaSetName: null, isPrimary: false, supportsTransactions: false };
  }
}

async function waitForReplicaSetPrimary(deadline: number) {
  while (Date.now() < deadline) {
    const readiness = await getDatabaseReadiness();
    if (readiness.supportsTransactions) return;
    await delay(500);
  }

  throw new Error('MongoDB is connected but is not a PRIMARY replica set with transaction support');
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}
