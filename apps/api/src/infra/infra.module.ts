import { Global, Logger, Module } from '@nestjs/common';
import { Pool } from 'pg';
import Redis from 'ioredis';
import { Client as MinioClient } from 'minio';

export const PG_POOL = 'PG_POOL';
export const REDIS_CLIENT = 'REDIS_CLIENT';
export const MINIO_CLIENT = 'MINIO_CLIENT';

const logger = new Logger('Infra');

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing required env: ${name}`);
  }
  return value;
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: async (): Promise<Pool> => {
        const pool = new Pool({
          host: requireEnv('PGHOST'),
          port: Number(process.env.PGPORT ?? 5432),
          user: requireEnv('PGUSER'),
          password: requireEnv('PGPASSWORD'),
          database: requireEnv('PGDATABASE'),
          connectionTimeoutMillis: 5000,
        });
        await pool.query('SELECT 1');
        logger.log('database connected');
        return pool;
      },
    },
    {
      provide: REDIS_CLIENT,
      useFactory: async (): Promise<Redis> => {
        const client = new Redis({
          host: requireEnv('REDIS_HOST'),
          port: Number(process.env.REDIS_PORT ?? 6379),
          password: process.env.REDIS_PASSWORD || undefined,
          lazyConnect: true,
          maxRetriesPerRequest: 2,
          retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000)),
        });
        await client.connect();
        await client.ping();
        logger.log('queue connected');
        return client;
      },
    },
    {
      provide: MINIO_CLIENT,
      useFactory: async (): Promise<MinioClient> => {
        const client = new MinioClient({
          endPoint: requireEnv('MINIO_ENDPOINT'),
          port: Number(process.env.MINIO_PORT ?? 9000),
          useSSL: process.env.MINIO_USE_SSL === 'true',
          accessKey: requireEnv('MINIO_ACCESS_KEY'),
          secretKey: requireEnv('MINIO_SECRET_KEY'),
        });
        await client.listBuckets();
        const bucket = requireEnv('MINIO_BUCKET');
        if (!(await client.bucketExists(bucket))) {
          await client.makeBucket(bucket);
          logger.log(`storage bucket created: ${bucket}`);
        }
        logger.log('storage connected');
        return client;
      },
    },
  ],
  exports: [PG_POOL, REDIS_CLIENT, MINIO_CLIENT],
})
export class InfraModule {}
