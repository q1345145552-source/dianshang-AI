import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { Pool } from 'pg';
import { AppModule } from './app.module';
import { PG_POOL } from './infra/infra.module';
import { runMigrations } from './db/migrations';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // 建表在启动时做，跑过的迁移不会重复执行
  await runMigrations(app.get<Pool>(PG_POOL));

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`[api] listening on 0.0.0.0:${port}`);
}

bootstrap().catch((err) => {
  console.error('[api] startup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
