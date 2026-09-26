import { Inject, Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { PG_POOL } from '../infra/infra.module';
import { ABSENT_USER_HASH, checkPassword, hashPassword, verifyPassword } from './password';
import { createSession, findUserBySession, revokeSession, type SessionUser } from './session';

// 邮箱统一规范化后再存、再查：去掉首尾空格，全部转小写。
// 这样 A@x.com 和 a@x.com 不会被当成两个账号。
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// 登录失败限制：同一个邮箱在 15 分钟里错满 5 次，就锁住 15 分钟。
const MAX_LOGIN_FAILURES = 5;
const LOGIN_FAILURE_WINDOW_MINUTES = 15;

// 邮箱不存在和密码不对，对外只说这一句。
// 告诉人到底是哪个错，等于帮人确认哪些邮箱注册过。
const LOGIN_FAILED_MESSAGE = '邮箱或者密码不对。';

export type RegisterFailure = { ok: false; status: number; code: string; message: string };

export type RegisterSuccess = {
  ok: true;
  user: SessionUser;
  token: string;
  maxAgeSeconds: number;
};

export type LoginSuccess = {
  ok: true;
  user: SessionUser;
  token: string;
  maxAgeSeconds: number;
};

function fail(status: number, code: string, message: string): RegisterFailure {
  return { ok: false, status, code, message };
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

@Injectable()
export class AuthService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async register(input: Record<string, unknown>): Promise<RegisterSuccess | RegisterFailure> {
    const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
    const password = typeof input.password === 'string' ? input.password : '';
    const confirmPassword =
      typeof input.confirmPassword === 'string' ? input.confirmPassword : '';

    if (!EMAIL_PATTERN.test(email)) {
      return fail(400, 'INVALID_EMAIL', '这个邮箱看着不像邮箱，检查一下再填。');
    }

    const problem = checkPassword(password);
    if (problem === 'too_short') {
      return fail(400, 'PASSWORD_TOO_SHORT', '密码太短了，至少要 8 位。');
    }
    if (problem === 'too_weak') {
      return fail(400, 'PASSWORD_TOO_WEAK', '密码太简单了，字母和数字都要有。');
    }

    if (password !== confirmPassword) {
      return fail(400, 'PASSWORD_MISMATCH', '两次输入的密码不一样。');
    }

    const existing = await this.pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (existing.rowCount) {
      return fail(409, 'EMAIL_ALREADY_REGISTERED', '这个邮箱已经注册过了，直接去登录就行。');
    }

    const userId = randomUUID();
    const passwordHash = await hashPassword(password);

    try {
      await this.pool.query(
        'INSERT INTO users (id, email, password_hash) VALUES ($1, $2, $3)',
        [userId, email, passwordHash],
      );
    } catch (err) {
      // 两个请求同时拿同一个邮箱注册时，唯一索引会挡住其中一个，
      // 这里兜住，回同样的提示，而不是抛个五百出去。
      if (isUniqueViolation(err)) {
        return fail(409, 'EMAIL_ALREADY_REGISTERED', '这个邮箱已经注册过了，直接去登录就行。');
      }
      throw err;
    }

    const { token, maxAgeSeconds } = await createSession(this.pool, userId);

    return {
      ok: true,
      user: { id: userId, email, created_at: new Date() },
      token,
      maxAgeSeconds,
    };
  }

  async currentUser(token: string | undefined): Promise<SessionUser | null> {
    return findUserBySession(this.pool, token);
  }

  async login(input: Record<string, unknown>): Promise<LoginSuccess | RegisterFailure> {
    const email = typeof input.email === 'string' ? normalizeEmail(input.email) : '';
    const password = typeof input.password === 'string' ? input.password : '';

    if (!EMAIL_PATTERN.test(email) || !password) {
      return fail(401, 'INVALID_CREDENTIALS', LOGIN_FAILED_MESSAGE);
    }

    const recentFailures = await this.countRecentFailures(email);
    if (recentFailures >= MAX_LOGIN_FAILURES) {
      return fail(429, 'TOO_MANY_ATTEMPTS', '错得太多次了，过一会儿再试。');
    }

    const found = await this.pool.query<{ id: string; email: string; password_hash: string }>(
      'SELECT id, email, password_hash FROM users WHERE email = $1',
      [email],
    );
    const row = found.rows[0];

    // 邮箱不存在的时候也照样跑一遍哈希比对，让两种情况耗时接近，
    // 免得从响应快慢上就能猜出这个邮箱注册没注册。
    const passwordOk = await verifyPassword(password, row?.password_hash ?? ABSENT_USER_HASH);

    if (!row || !passwordOk) {
      await this.recordFailure(email);
      return fail(401, 'INVALID_CREDENTIALS', LOGIN_FAILED_MESSAGE);
    }

    await this.clearFailures(email);

    const { token, maxAgeSeconds } = await createSession(this.pool, row.id);

    return {
      ok: true,
      user: { id: row.id, email: row.email, created_at: new Date() },
      token,
      maxAgeSeconds,
    };
  }

  async logout(token: string | undefined): Promise<void> {
    await revokeSession(this.pool, token);
  }

  private async countRecentFailures(email: string): Promise<number> {
    const result = await this.pool.query<{ count: string }>(
      `SELECT count(*) AS count FROM login_attempts
        WHERE email = $1 AND failed_at > now() - make_interval(mins => $2)`,
      [email, LOGIN_FAILURE_WINDOW_MINUTES],
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  private async recordFailure(email: string): Promise<void> {
    await this.pool.query('INSERT INTO login_attempts (id, email) VALUES ($1, $2)', [
      randomUUID(),
      email,
    ]);
  }

  // 登录成功就把这个邮箱的失败记录清掉，不然攒着攒着会误伤下一次
  private async clearFailures(email: string): Promise<void> {
    await this.pool.query('DELETE FROM login_attempts WHERE email = $1', [email]);
  }
}
