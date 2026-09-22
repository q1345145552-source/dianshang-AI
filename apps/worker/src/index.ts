import { Pool } from 'pg';
import Redis from 'ioredis';
import { Client as MinioClient } from 'minio';
import { Worker } from 'bullmq';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`missing required env: ${name}`);
  }
  return value;
}

const QUEUE_NAME = process.env.WORKER_QUEUE ?? 'default';

async function main() {
  const pool = new Pool({
    host: requireEnv('PGHOST'),
    port: Number(process.env.PGPORT ?? 5432),
    user: requireEnv('PGUSER'),
    password: requireEnv('PGPASSWORD'),
    database: requireEnv('PGDATABASE'),
    connectionTimeoutMillis: 5000,
  });
  // 数据库或者队列断开时要接住 error 事件，
  // 不然未处理的 error 会把整个进程带崩。
  pool.on('error', (err) => {
    console.warn(`[worker] database connection error: ${err.message}`);
  });
  await pool.query('SELECT 1');
  console.log('[worker] database connected');

  const connection = new Redis({
    host: requireEnv('REDIS_HOST'),
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
    maxRetriesPerRequest: null,
  });
  connection.on('error', (err) => {
    console.warn(`[worker] queue connection error: ${err.message}`);
  });
  await connection.ping();
  console.log('[worker] queue connected');

  const minio = new MinioClient({
    endPoint: requireEnv('MINIO_ENDPOINT'),
    port: Number(process.env.MINIO_PORT ?? 9000),
    useSSL: process.env.MINIO_USE_SSL === 'true',
    accessKey: requireEnv('MINIO_ACCESS_KEY'),
    secretKey: requireEnv('MINIO_SECRET_KEY'),
  });
  await minio.listBuckets();
  console.log('[worker] storage connected');

  const worker = new Worker(
    QUEUE_NAME,
    async (job) => {
      console.log(`[worker] job ${job.id} received, no handler in this milestone`);
      return { handled: false };
    },
    { connection },
  );

  worker.on('ready', () => {
    console.log(`[worker] ready, waiting on queue "${QUEUE_NAME}"`);
  });

  worker.on('error', (err) => {
    console.warn(`[worker] job error: ${err.message}`);
  });

  const shutdown = async (signal: string) => {
    console.log(`[worker] ${signal} received, shutting down`);
    await worker.close();
    await connection.quit();
    await pool.end();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  console.log('[worker] standby');
}

main().catch((err) => {
  console.error('[worker] startup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
