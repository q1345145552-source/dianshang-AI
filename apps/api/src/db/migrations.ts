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
  {
    name: '002_login_attempts',
    sql: `
      CREATE TABLE IF NOT EXISTS login_attempts (
        id uuid PRIMARY KEY,
        email text NOT NULL,
        failed_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS login_attempts_email_time_idx
        ON login_attempts (email, failed_at DESC);
    `,
  },
  {
    name: '003_wallets_and_ledger',
    sql: `
      -- 钱包：每个账号一个。注意里面不存余额数字，
      -- 余额永远由下面的分录加出来，不另存一份，就不会有两边对不上的事。
      CREATE TABLE IF NOT EXISTS wallets (
        id uuid PRIMARY KEY,
        owner_type text NOT NULL,
        owner_id uuid NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (owner_type, owner_id)
      );

      -- 一笔业务操作对应一条事务，记清楚什么时候、为什么变的
      CREATE TABLE IF NOT EXISTS ledger_transactions (
        id uuid PRIMARY KEY,
        type text NOT NULL,
        business_ref text,
        idempotency_key text NOT NULL UNIQUE,
        reason text NOT NULL,
        actor_id uuid,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      -- 分录：每一笔钱的进出。余额就是这些正负数字加起来
      CREATE TABLE IF NOT EXISTS ledger_entries (
        id uuid PRIMARY KEY,
        tx_id uuid NOT NULL REFERENCES ledger_transactions(id) ON DELETE RESTRICT,
        wallet_id uuid NOT NULL REFERENCES wallets(id) ON DELETE RESTRICT,
        delta_units bigint NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS ledger_entries_wallet_idx
        ON ledger_entries (wallet_id, created_at DESC, id);

      -- 新用户一注册就自动有钱包。
      -- 放在数据库这层做，注册那边的代码一个字都不用动。
      CREATE OR REPLACE FUNCTION create_wallet_for_user() RETURNS trigger AS $$
      BEGIN
        INSERT INTO wallets (id, owner_type, owner_id)
        VALUES (gen_random_uuid(), 'user', NEW.id)
        ON CONFLICT (owner_type, owner_id) DO NOTHING;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS users_create_wallet ON users;
      CREATE TRIGGER users_create_wallet
        AFTER INSERT ON users
        FOR EACH ROW EXECUTE FUNCTION create_wallet_for_user();

      -- 建这张表之前就已经存在的用户，补上钱包
      INSERT INTO wallets (id, owner_type, owner_id)
      SELECT gen_random_uuid(), 'user', u.id
        FROM users u
       WHERE NOT EXISTS (
         SELECT 1 FROM wallets w WHERE w.owner_type = 'user' AND w.owner_id = u.id
       );

      -- 不许把余额扣成负数。
      -- 挡在数据库这一层，是因为不管谁写进来都得过这一关，
      -- 只在应用里拦的话，直接写库就绕过去了。
      CREATE OR REPLACE FUNCTION check_ledger_entry_not_negative() RETURNS trigger AS $$
      DECLARE
        current_balance bigint;
      BEGIN
        -- 先把这个钱包锁住，免得两个请求同时通过检查
        PERFORM 1 FROM wallets WHERE id = NEW.wallet_id FOR UPDATE;

        IF NEW.delta_units < 0 THEN
          SELECT COALESCE(SUM(delta_units), 0) INTO current_balance
            FROM ledger_entries WHERE wallet_id = NEW.wallet_id;

          IF current_balance + NEW.delta_units < 0 THEN
            RAISE EXCEPTION 'balance would go negative: wallet=% current=% delta=%',
              NEW.wallet_id, current_balance, NEW.delta_units
              USING ERRCODE = 'check_violation';
          END IF;
        END IF;

        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      DROP TRIGGER IF EXISTS ledger_entries_not_negative ON ledger_entries;
      CREATE TRIGGER ledger_entries_not_negative
        BEFORE INSERT ON ledger_entries
        FOR EACH ROW EXECUTE FUNCTION check_ledger_entry_not_negative();
    `,
  },
  {
    name: '004_wallet_owner_fk',
    sql: `
      -- 钱包必须指向一个真账号。
      -- 不加这条的话，账号被删掉以后钱包会变成没人管的孤儿，
      -- 余额就挂在那儿算不清是谁的了。
      DELETE FROM wallets w
       WHERE w.owner_type = 'user'
         AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = w.owner_id);

      ALTER TABLE wallets DROP CONSTRAINT IF EXISTS wallets_owner_user_fk;

      ALTER TABLE wallets
        ADD CONSTRAINT wallets_owner_user_fk
        FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE RESTRICT;
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
