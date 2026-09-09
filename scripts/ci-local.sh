#!/usr/bin/env bash
# Replicates GitHub Actions CI + E2E workflows locally (see .github/workflows/).
# Usage: pnpm ci:local
#
# E2E spins up a throwaway mongo:7 container (same image as CI) because a local
# MongoDB with auth will fail with "createIndexes requires authentication".
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

MONGO_CONTAINER="payload-audit-ci-mongo"
MONGO_PORT="27019"
MONGO_URI="mongodb://127.0.0.1:${MONGO_PORT}/payload-audit-e2e"

cleanup_mongo() {
  if docker ps -a --format '{{.Names}}' | grep -qx "$MONGO_CONTAINER"; then
    docker rm -f "$MONGO_CONTAINER" >/dev/null 2>&1 || true
  fi
}

start_mongo() {
  if ! command -v docker >/dev/null 2>&1; then
    echo "error: docker is required for ci:local E2E (mongo:7 service, same as CI)" >&2
    exit 1
  fi

  cleanup_mongo
  docker run -d --name "$MONGO_CONTAINER" -p "${MONGO_PORT}:27017" mongo:7 >/dev/null

  echo "==> E2E: waiting for mongo:7 on port ${MONGO_PORT}"
  for _ in $(seq 1 30); do
    if docker exec "$MONGO_CONTAINER" mongosh --quiet --eval 'db.runCommand({ ping: 1 }).ok' 2>/dev/null | grep -q 1; then
      return 0
    fi
    sleep 1
  done

  echo "error: mongo:7 did not become ready in time" >&2
  cleanup_mongo
  exit 1
}

echo "==> CI: format:check"
pnpm run format:check

echo "==> CI: lint"
pnpm run lint

echo "==> CI: typecheck"
pnpm run typecheck

echo "==> CI: test:int:cov"
pnpm run test:int:cov

echo "==> CI: build"
pnpm run build

echo "==> E2E: build:dev (production Next app)"
export CI=true
export NODE_ENV=test
export NEXT_TELEMETRY_DISABLED=1
export PAYLOAD_CONFIG_PATH=./dev/payload.config.ts
export PLAYWRIGHT_BASE_URL=http://127.0.0.1:3000
export NEXT_PUBLIC_SERVER_URL=http://127.0.0.1:3000
export PAYLOAD_SECRET=e2e-payload-secret-ci

start_mongo
trap cleanup_mongo EXIT

export DATABASE_URL="$MONGO_URI"
export MONGODB_URI="$MONGO_URI"

pnpm run build:dev

echo "==> E2E: playwright"
pnpm run test:e2e

echo "==> All CI checks passed locally."
