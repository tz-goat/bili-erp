#!/usr/bin/env bash
# 生产机幂等部署：对齐 origin/master → 装依赖 → 构建前端 → pm2 reload → /health 探活。
# 由 GitHub Actions SSH 调用，也可在机上手动：bash scripts/deploy.sh
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

APP_NAME="${PM2_APP_NAME:-pl-dashboard}"
HEALTH_PORT="${SERVER_PORT:-3001}"
HEALTH_URL="${HEALTH_URL:-http://127.0.0.1:${HEALTH_PORT}/health}"
HEALTH_RETRIES="${HEALTH_RETRIES:-20}"
HEALTH_SLEEP_SECS="${HEALTH_SLEEP_SECS:-1}"

echo "==> repo: $ROOT"
echo "==> fetch + hard reset origin/master"
git fetch --prune origin
git checkout master
git reset --hard origin/master

if command -v corepack >/dev/null 2>&1; then
    corepack enable
fi

if ! command -v pnpm >/dev/null 2>&1; then
    echo "error: pnpm not found; install Node with corepack or add pnpm to PATH" >&2
    exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
    echo "error: pm2 not found; npm i -g pm2" >&2
    exit 1
fi

echo "==> pnpm install --frozen-lockfile"
pnpm install --frozen-lockfile

echo "==> pnpm build"
pnpm build

if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
    echo "==> pm2 reload $APP_NAME"
    pm2 reload ecosystem.config.cjs --env production --update-env
else
    echo "==> pm2 start (first deploy)"
    pm2 start ecosystem.config.cjs --env production
fi
pm2 save

echo "==> health check $HEALTH_URL"
ok=0
for ((i = 1; i <= HEALTH_RETRIES; i++)); do
    if curl -sf "$HEALTH_URL" >/dev/null; then
        ok=1
        break
    fi
    sleep "$HEALTH_SLEEP_SECS"
done

if [[ "$ok" -ne 1 ]]; then
    echo "error: health check failed after ${HEALTH_RETRIES} attempts" >&2
    pm2 status "$APP_NAME" || true
    exit 1
fi

echo "==> deploy ok @ $(git rev-parse --short HEAD)"
