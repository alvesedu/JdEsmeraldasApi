import { createApp } from './app.js';
import { connectDatabase } from './config/db.js';
import { env } from './config/env.js';
import { ensureDefaultAdmin } from './controllers/auth.controller.js';

async function bootstrap() {
  await connectDatabase();
  await ensureDefaultAdmin();

  const app = createApp();
  app.listen(env.port, () => {
    console.log(`Backend listening on http://localhost:${env.port}`);
  });
}

void bootstrap().catch((error) => {
  console.error(error);
  process.exit(1);
});
