#!/usr/bin/env bash
#
# 余额自查。
#
# 查的是这几件事：有没有余额变成负数的钱包、有没有账号漏了钱包、
# 有没有光有事务没有分录的记录、余额和记录对不对得上。
#
# 用法：
#   make check-balance
#   make check-balance ENV=test
#
# 全部正常返回 0，发现问题返回非 0。

set -uo pipefail

ENV="${ENV:-dev}"
ENV_FILE=".env.${ENV}"
PROJECT="dianshangzuotu-${ENV}"

cd "$(dirname "$0")/.." || exit 1

if [ ! -f "$ENV_FILE" ]; then
  echo "找不到配置文件 $ENV_FILE，先跑 make up ENV=$ENV"
  exit 1
fi

read_env() {
  grep -E "^$1=" "$ENV_FILE" | head -1 | cut -d= -f2-
}

psql_q() {
  docker exec "${PROJECT}-postgres-1" \
    psql -U "$(read_env PGUSER)" -d "$(read_env PGDATABASE)" -t -A -c "$1"
}

problems=0

expect_zero() {
  local desc="$1"
  local value="$2"
  if [ "$value" = "0" ]; then
    printf '  [通过] %s\n' "$desc"
  else
    printf '  [失败] %s   查出 %s 条\n' "$desc" "$value"
    problems=$((problems + 1))
  fi
}

echo "余额自查（环境 $ENV）"
echo

echo "一、钱包的形状"
expect_zero "没有余额为负的钱包" "$(psql_q "SELECT count(*) FROM (SELECT w.id FROM wallets w LEFT JOIN ledger_entries e ON e.wallet_id = w.id GROUP BY w.id HAVING COALESCE(SUM(e.delta_units), 0) < 0) t;")"
expect_zero "每个账号都有钱包" "$(psql_q "SELECT count(*) FROM users u WHERE NOT EXISTS (SELECT 1 FROM wallets w WHERE w.owner_type = 'user' AND w.owner_id = u.id);")"
expect_zero "钱包都指向存在的账号" "$(psql_q "SELECT count(*) FROM wallets w WHERE w.owner_type = 'user' AND NOT EXISTS (SELECT 1 FROM users u WHERE u.id = w.owner_id);")"

echo
echo "二、记录本身"
expect_zero "没有光有事务却没有分录的" "$(psql_q "SELECT count(*) FROM ledger_transactions t WHERE NOT EXISTS (SELECT 1 FROM ledger_entries e WHERE e.tx_id = t.id);")"
expect_zero "每条分录都指向存在的事务和钱包" "$(psql_q "SELECT count(*) FROM ledger_entries e WHERE NOT EXISTS (SELECT 1 FROM ledger_transactions t WHERE t.id = e.tx_id) OR NOT EXISTS (SELECT 1 FROM wallets w WHERE w.id = e.wallet_id);")"
expect_zero "没有重复的幂等键" "$(psql_q "SELECT count(*) FROM (SELECT idempotency_key FROM ledger_transactions GROUP BY idempotency_key HAVING count(*) > 1) t;")"

echo
echo "三、余额和记录对不对得上"
expect_zero "每个钱包的余额，换条路重算一遍结果一样" "$(psql_q "SELECT count(*) FROM (SELECT w.id, COALESCE((SELECT SUM(delta_units) FROM ledger_entries WHERE wallet_id = w.id), 0) AS way_a, COALESCE((SELECT SUM(e.delta_units) FROM ledger_entries e JOIN ledger_transactions t ON t.id = e.tx_id WHERE e.wallet_id = w.id), 0) AS way_b FROM wallets w) x WHERE way_a <> way_b;")"

echo
echo "四、现在的账面"
rows="$(psql_q "SELECT w.owner_id || '  余额 ' || COALESCE(SUM(e.delta_units), 0) || '   记录 ' || count(e.id) || ' 条' FROM wallets w LEFT JOIN ledger_entries e ON e.wallet_id = w.id GROUP BY w.owner_id ORDER BY w.owner_id;")"
if [ -z "$rows" ]; then
  echo "  （还没有账号）"
else
  printf '%s\n' "$rows" | sed 's/^/  /'
fi

echo
if [ "$problems" -eq 0 ]; then
  echo "结果：余额和记录一致，没发现问题"
  exit 0
fi
echo "结果：有 $problems 类问题"
exit 1
