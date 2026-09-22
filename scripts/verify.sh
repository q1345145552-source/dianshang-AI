#!/usr/bin/env bash
#
# 一键验证：把能自动查的都查一遍。
#
# 用法：
#   make verify
#   make verify ENV=test
#
# 每项打「通过」或「失败」，最后汇总。有失败就以非 0 退出，
# 所以也能直接放进脚本或者流水线里用。

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

WEB_PORT="$(read_env WEB_PORT)"
API_PORT="$(read_env API_PORT)"
PGUSER_VALUE="$(read_env PGUSER)"
PGDATABASE_VALUE="$(read_env PGDATABASE)"
REDIS_PASSWORD_VALUE="$(read_env REDIS_PASSWORD)"
MINIO_ACCESS_VALUE="$(read_env MINIO_ACCESS_KEY)"
MINIO_SECRET_VALUE="$(read_env MINIO_SECRET_KEY)"
MINIO_BUCKET_VALUE="$(read_env MINIO_BUCKET)"

pass_count=0
fail_count=0

pass() { printf '  [通过] %s\n' "$1"; pass_count=$((pass_count + 1)); }
fail() {
  printf '  [失败] %s\n' "$1"
  shift
  if [ "$#" -gt 0 ] && [ -n "$1" ]; then
    printf '%s\n' "$1" | head -5 | sed 's/^/         /'
  fi
  fail_count=$((fail_count + 1))
}

# run "说明" 命令...
run() {
  local desc="$1"
  shift
  local out
  if out=$("$@" 2>&1); then
    pass "$desc"
  else
    fail "$desc" "$out"
  fi
}

container_running() {
  [ -n "$(docker ps -q -f "name=^${PROJECT}-$1-1$" -f "status=running")" ]
}

container_healthy() {
  [ "$(docker inspect -f '{{.State.Health.Status}}' "${PROJECT}-$1-1" 2>/dev/null)" = "healthy" ]
}

# 看每个容器里 PID 1 的实际 UID，0 就是 root
not_root() {
  local svc uid bad=""
  for svc in web api worker postgres redis minio; do
    uid=$(docker exec "${PROJECT}-${svc}-1" cat /proc/1/status 2>/dev/null \
      | sed -n 's/^Uid:[[:space:]]*\([0-9]*\).*/\1/p')
    if [ -z "$uid" ] || [ "$uid" = "0" ]; then
      bad="${bad} ${svc}(uid=${uid:-未知})"
    fi
  done
  if [ -n "$bad" ]; then
    echo "还在用 root 跑的容器:${bad}"
    return 1
  fi
  return 0
}

echo "验证环境：$ENV      项目名：$PROJECT"
echo

echo "一、容器状态"
for svc in web api worker postgres redis minio; do
  run "$svc 在跑" container_running "$svc"
done
for svc in postgres redis minio; do
  run "$svc 健康检查通过" container_healthy "$svc"
done

echo
echo "二、网站"
run "首页返回 200，不白屏不报错" curl -fsS -o /dev/null "http://localhost:${WEB_PORT}/"
run "首页能打出页面内容" bash -c "curl -fsS 'http://localhost:${WEB_PORT}/' | grep -q '电商作图'"

echo
echo "三、服务器健康检查"
run "接口返回 200，三个依赖都通" curl -fsS -o /dev/null "http://localhost:${API_PORT}/health"
run "返回里 status 是 ok" bash -c "curl -fsS 'http://localhost:${API_PORT}/health' | grep -q '\"status\":\"ok\"'"

echo
echo "四、三个基础设施，绕过应用直接连"
run "数据库能连" docker exec "${PROJECT}-postgres-1" \
  psql -U "$PGUSER_VALUE" -d "$PGDATABASE_VALUE" -t -c 'select 1'
if [ -n "$REDIS_PASSWORD_VALUE" ]; then
  run "队列能连（带密码）" docker exec "${PROJECT}-redis-1" \
    redis-cli --no-auth-warning -a "$REDIS_PASSWORD_VALUE" ping
else
  run "队列能连（没密码）" docker exec "${PROJECT}-redis-1" redis-cli ping
fi
run "文件存储能连，桶在" bash -c \
  "docker exec '${PROJECT}-minio-1' mc alias set verify http://localhost:9000 '${MINIO_ACCESS_VALUE}' '${MINIO_SECRET_VALUE}' >/dev/null 2>&1; docker exec '${PROJECT}-minio-1' mc ls verify 2>/dev/null | grep -q '${MINIO_BUCKET_VALUE}'"

echo
echo "五、干活进程"
run "worker 连着队列在待命" bash -c \
  "docker logs '${PROJECT}-worker-1' 2>&1 | grep -q 'ready, waiting on queue'"

echo
echo "六、安全"
run "六个容器的 PID 1 都不是 root" not_root

echo
echo "----------------------------------------"
printf '通过 %d 项   失败 %d 项\n' "$pass_count" "$fail_count"
if [ "$fail_count" -eq 0 ]; then
  echo "结果：全部通过"
  exit 0
fi
echo "结果：有失败"
exit 1
