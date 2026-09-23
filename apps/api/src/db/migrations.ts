import type { Pool } from 'pg';

// 数据库迁移。按顺序执行，执行过的记在 schema_migrations 里，不会重复跑。
// 写在这里而不是放 .sql 文件，是为了编译后不用再操心文件拷没拷进镜像。

type Migration = { name: string; sql: string };

const migrations: Migration[] = [
  {
    name: '001_users_and_sessions',
    sql: `
      CREATE TABLE IF NOT EXISTS users (
        id uuid PRIMARY KEY,
        email text NOT NULL UNIQUE,
        password_hash text NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_hash text NOT NULL UNIQUE,
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions (user_id);
    `,
  },
];

export async function runMigrations(pool: Pool): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  const done = await pool.query<{ name: string }>('SELECT name FROM schema_migrations');
  const applied = new Set(done.rows.map((row) => row.name));

  for (const migration of migrations) {
    if (applied.has(migration.name)) {
      continue;
    }

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(migration.sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [migration.name]);
      await client.query('COMMIT');
      console.log(`[migrate] applied ${migration.name}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }
}
