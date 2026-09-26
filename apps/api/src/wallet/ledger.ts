import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';

// 这是改余额的唯一入口。
//
// 余额本来就没有单独存一个数字，它是 ledger_entries 里那些正负数字加出来的。
// 所以想让余额变，只有一条路：写一条事务，再写它的分录。
//
// 以后不管哪里要动余额，都从 postLedgerEntry 走，不要绕过去直接改数字。
// 数据库那边也把话说死了：没有余额列可以让人改，扣成负数会被触发器拦下来。

export type LedgerPosting = {
  // 这笔是什么性质，比如 grant、spend、refund
  type: string;
  // 给人看的说明，写清这笔为什么变
  reason: string;
  // 幂等键。同一个键只算一次，网络重试重复提交不会动两次钱
  idempotencyKey: string;
  // 关联的业务对象，比如某个订单号或者任务号
  businessRef?: string;
  // 这笔是谁触发的
  actorId?: string;
  walletId: string;
  // 正数是加，负数是扣
  deltaUnits: number;
};

export type PostLedgerResult =
  | { ok: true; transactionId: string | null; alreadyPosted: boolean }
  | { ok: false; code: 'INSUFFICIENT_BALANCE'; message: string };

function isCheckViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23514';
}

function isUniqueViolation(err: unknown): boolean {
  return typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505';
}

export async function postLedgerEntry(
  pool: Pool,
  posting: LedgerPosting,
): Promise<PostLedgerResult> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // 幂等：这个键要是已经记过，直接返回，不再动一次钱
    const existing = await client.query<{ id: string }>(
      'SELECT id FROM ledger_transactions WHERE idempotency_key = $1',
      [posting.idempotencyKey],
    );
    if (existing.rowCount) {
      await client.query('COMMIT');
      return { ok: true, transactionId: existing.rows[0].id, alreadyPosted: true };
    }

    const transactionId = randomUUID();

    await client.query(
      `INSERT INTO ledger_transactions (id, type, business_ref, idempotency_key, reason, actor_id)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        transactionId,
        posting.type,
        posting.businessRef ?? null,
        posting.idempotencyKey,
        posting.reason,
        posting.actorId ?? null,
      ],
    );

    await client.query(
      'INSERT INTO ledger_entries (id, tx_id, wallet_id, delta_units) VALUES ($1, $2, $3, $4)',
      [randomUUID(), transactionId, posting.walletId, posting.deltaUnits],
    );

    await client.query('COMMIT');
    return { ok: true, transactionId, alreadyPosted: false };
  } catch (err) {
    await client.query('ROLLBACK');

    // 触发器挡下来的，钱不够
    if (isCheckViolation(err)) {
      return { ok: false, code: 'INSUFFICIENT_BALANCE', message: '余额不够，这笔扣不了。' };
    }

    // 两个请求同时拿同一个幂等键，后到的撞上唯一索引，也算已经记过
    if (isUniqueViolation(err)) {
      return { ok: true, transactionId: null, alreadyPosted: true };
    }

    throw err;
  } finally {
    client.release();
  }
}
