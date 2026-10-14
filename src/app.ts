import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'node:path';
import { env } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import unitRoutes from './routes/unit.routes.js';
import residentRoutes from './routes/resident.routes.js';
import chargeRoutes from './routes/charge.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import auditRoutes from './routes/audit.routes.js';
import lookupRoutes from './routes/lookup.routes.js';
import accountPayableRoutes from './routes/accountPayable.routes.js';
import bankImportRoutes from './routes/bankImport.routes.js';
import expenseRoutes from './routes/expense.routes.js';
import monthlyClosingRoutes from './routes/monthlyClosing.routes.js';
import quickEntryRunRoutes from './routes/quickEntryRun.routes.js';
import { bankTransactionRouter, paymentAllocationRouter } from './routes/creditReconciliation.routes.js';
import { errorHandler } from './middleware/errorHandler.js';
import { getDatabaseReadiness } from './config/db.js';

export function createApp() {
  const app = express();

  app.use(cors());
  app.use(helmet());
  app.use(morgan('dev'));
  app.use(express.json({ limit: '2mb' }));
  app.use(express.urlencoded({ extended: true }));
  app.use('/uploads', express.static(path.resolve(env.uploadDir)));

  app.get('/health', async (_req, res) => {
    const database = await getDatabaseReadiness();
    res.status(database.supportsTransactions ? 200 : 503).json({ ok: database.supportsTransactions, database });
  });

  app.use('/auth', authRoutes);
  app.use('/units', unitRoutes);
  app.use('/residents', residentRoutes);
  app.use('/charges', chargeRoutes);
  app.use('/dashboard', dashboardRoutes);
  app.use('/imports', uploadRoutes);
  app.use('/audit', auditRoutes);
  app.use('/lookups', lookupRoutes);
  app.use('/accounts-payable', accountPayableRoutes);
  app.use('/expenses', expenseRoutes);
  app.use('/monthly-closings', monthlyClosingRoutes);
  app.use('/quick-entry-runs', quickEntryRunRoutes);
  app.use('/bank-imports', bankImportRoutes);
  app.use('/bank-transactions', bankTransactionRouter);
  app.use('/payment-allocations', paymentAllocationRouter);

  app.use(errorHandler);

  return app;
}
