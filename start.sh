#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT_DIR"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "未检测到 pnpm，请先安装: corepack enable && corepack prepare pnpm@latest --activate"
  exit 1
fi

if [ ! -d node_modules ]; then
  echo "未检测到依赖，开始安装..."
  pnpm i
fi

HOST="${HOST:-0.0.0.0}"
PORT="${PORT:-3001}"

pnpm web dev --host "$HOST" --port "$PORT" --strictPort
