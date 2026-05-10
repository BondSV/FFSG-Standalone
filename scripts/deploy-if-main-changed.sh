#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-/home/ubuntu/services/ffbsg}"
cd "$APP_DIR"

if [ ! -d .git ]; then
  echo "ffbsg deploy: $APP_DIR is not a git checkout" >&2
  exit 1
fi

git fetch origin main
LOCAL_SHA="$(git rev-parse HEAD)"
REMOTE_SHA="$(git rev-parse origin/main)"

if [ "$LOCAL_SHA" = "$REMOTE_SHA" ]; then
  echo "ffbsg deploy: already current at $LOCAL_SHA"
  exit 0
fi

echo "ffbsg deploy: updating $LOCAL_SHA -> $REMOTE_SHA"
git merge --ff-only origin/main

if [ ! -f .env ] || ! grep -q '^DATABASE_URL=' .env; then
  echo "ffbsg deploy: .env with DATABASE_URL is missing; building image but not starting container" >&2
  docker compose build
  exit 0
fi

docker compose up -d --build --remove-orphans
docker image prune -f --filter 'until=168h' >/dev/null || true
echo "ffbsg deploy: running $(git rev-parse --short HEAD)"
