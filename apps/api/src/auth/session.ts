import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

// 会话：登录状态靠这个 cookie 维持。数据库里只存令牌的哈希，
// 就算库被看到也拿不到能直接用的令牌。
export const SESSION_COOKIE = 'session';
const SESSION_DAYS = 30;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function createSession(
  pool: Pool,
  userId: string,
): Promise<{ token: string; maxAgeSeconds: number }> {
  const token = randomBytes(32).toString('hex');
  const maxAgeSeconds = SESSION_DAYS * 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + maxAgeSeconds * 1000);

  await pool.query(
    'INSERT INTO sessions (id, user_id, token_hash, expires_at) VALUES ($1, $2, $3, $4)',
    [randomUUID(), userId, hashToken(token), expiresAt],
  );

  return { token, maxAgeSeconds };
}

export type SessionUser = { id: string; email: string; created_at: Date };

// 退出登录：把这条会话从库里删掉。
// 只清浏览器的 cookie 不够，那样手里存着旧令牌的人还能接着用。
export async function revokeSession(pool: Pool, token: string | undefined): Promise<void> {
  if (!token) {
    return;
  }
  await pool.query('DELETE FROM sessions WHERE token_hash = $1', [hashToken(token)]);
}

export async function findUserBySession(
  pool: Pool,
  token: string | undefined,
): Promise<SessionUser | null> {
  if (!token) {
    return null;
  }

  const result = await pool.query<SessionUser>(
    `SELECT u.id, u.email, u.created_at
       FROM sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = $1
        AND s.expires_at > now()`,
    [hashToken(token)],
  );

  return result.rows[0] ?? null;
}
