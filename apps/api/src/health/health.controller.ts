import { Controller, Get, Inject } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { Client as MinioClient } from 'minio';
import { MINIO_CLIENT, PG_POOL, REDIS_CLIENT } from '../infra/infra.module';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(MINIO_CLIENT) private readonly minio: MinioClient,
  ) {}

  @Get()
  async check() {
    const checks: Record<string, string> = {
      database: 'error',
      queue: 'error',
      storage: 'error',
    };

    try {
      await this.pool.query('SELECT 1');
      checks.database = 'ok';
    } catch {
      checks.database = 'error';
    }

    try {
      await this.redis.ping();
      checks.queue = 'ok';
    } catch {
      checks.queue = 'error';
    }

    try {
      await this.minio.listBuckets();
      checks.storage = 'ok';
    } catch {
      checks.storage = 'error';
    }

    const ok = Object.values(checks).every((value) => value === 'ok');
    return { status: ok ? 'ok' : 'error', checks };
  }
}
