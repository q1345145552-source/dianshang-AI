import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port, '0.0.0.0');
  console.log(`[api] listening on 0.0.0.0:${port}`);
}

bootstrap().catch((err) => {
  console.error('[api] startup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
