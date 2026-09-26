import { Inject, Injectable } from '@nestjs/common';
import { Pool } from 'pg';
import { PG_POOL } from '../infra/infra.module';

export type LedgerRow = {
  id: string;
  type: string;
  reason: string;
  business_ref: string | null;
  delta_units: string;
  created_at: Date;
};

@Injectable()
export class WalletService {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  // 余额是把分录加出来的，不是另外存的一个数字。
  // 所以往分录表里插一条，余额自己就跟着变了。
  async balanceUnits(userId: string): Promise<number> {
    const result = await this.pool.query<{ balance: string }>(
      `SELECT COALESCE(SUM(e.delta_units), 0) AS balance
         FROM wallets w
         LEFT JOIN ledger_entries e ON e.wallet_id = w.id
        WHERE w.owner_type = 'user' AND w.owner_id = $1`,
      [userId],
    );
    return Number(result.rows[0]?.balance ?? 0);
  }

  // 明细只翻自己的钱包，别人名下的查不到
  async ledger(userId: string, limit = 100): Promise<LedgerRow[]> {
    const result = await this.pool.query<LedgerRow>(
      `SELECT e.id, t.type, t.reason, t.business_ref, e.delta_units, e.created_at
         FROM ledger_entries e
         JOIN ledger_transactions t ON t.id = e.tx_id
         JOIN wallets w ON w.id = e.wallet_id
        WHERE w.owner_type = 'user' AND w.owner_id = $1
        ORDER BY e.created_at DESC, e.id DESC
        LIMIT $2`,
      [userId, limit],
    );
    return result.rows;
  }
}
