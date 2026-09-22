import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { Client as MinioClient } from 'minio';
import { MINIO_CLIENT, PG_POOL, REDIS_CLIENT } from '../infra/infra.module';

// 单个依赖的检查上限。任何一个卡住不回应，最多等这么久就判失败，
// 不会让请求一直挂在那。
const PROBE_TIMEOUT_MS = 3000;

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    @Inject(MINIO_CLIENT) private readonly minio: MinioClient,
  ) {}

  @Get()
  async check() {
    const [database, queue, storage] = await Promise.all([
      this.probe(() => this.pool.query('SELECT 1')),
      this.probe(() => this.redis.ping()),
      this.probe(() => this.minio.listBuckets()),
    ]);

    const checks = { database, queue, storage };
    const ok = database === 'ok' && queue === 'ok' && storage === 'ok';
    const body = { status: ok ? 'ok' : 'error', checks };

    // 只要有一个不通，接口本身就回 503，不只是把返回内容里的字样换掉。
    // 这样外面 curl -f 或者看状态码，一眼就知道失败了。
    if (!ok) {
      throw new ServiceUnavailableException(body);
    }

    return body;
  }

  private async probe(run: () => Promise<unknown>): Promise<string> {
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        run().then(() => undefined),
        new Promise((_resolve, reject) => {
          timer = setTimeout(() => reject(new Error('probe timeout')), PROBE_TIMEOUT_MS);
        }),
      ]);
      return 'ok';
    } catch {
      return 'error';
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
  }
}
