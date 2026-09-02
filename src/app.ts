import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import authRoutes from './routes/auth.routes.js';
import unitRoutes from './routes/unit.routes.js';
import residentRoutes from './routes/resident.routes.js';
import chargeRoutes from './routes/charge.routes.js';
import dashboardRoutes from './routes/dashboard.routes.js';
import uploadRoutes from './routes/upload.routes.js';
import lookupRoutes from './routes/lookup.routes.js';
import accountPayableRoutes from './routes/accountPayable.routes.js';
import bankImportRoutes from './routes/bankImport.routes.js';
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
  app.use('/lookups', lookupRoutes);
  app.use('/accounts-payable', accountPayableRoutes);
  app.use('/bank-imports', bankImportRoutes);
  app.use('/bank-transactions', bankTransactionRouter);
  app.use('/payment-allocations', paymentAllocationRouter);

  app.use(errorHandler);

  return app;
}
