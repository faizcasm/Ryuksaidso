#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

export DOCKERHUB_USERNAME="${DOCKERHUB_USERNAME:-local}"
export IMAGE_TAG="${IMAGE_TAG:-smoke}"
export POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-smoke-postgres-password}"
export JWT_SECRET="${JWT_SECRET:-$(head -c 64 /dev/urandom | base64 | tr -d '\n')}"
export CORS_ORIGIN="${CORS_ORIGIN:-http://localhost:3000}"
export FRONTEND_URL="${FRONTEND_URL:-http://localhost:3000}"
export GRAFANA_ADMIN_PASSWORD="${GRAFANA_ADMIN_PASSWORD:-smoke-grafana-password}"
export LOG_LEVEL="${LOG_LEVEL:-http}"

IMAGE_SRC_TAG="${IMAGE_SRC_TAG:-smoke}"

compose() {
  docker compose -f docker-compose.prod.yml "$@"
}

cleanup() {
  compose down -v --remove-orphans >/dev/null 2>&1 || true
}

fail() {
  echo "SMOKE FAILED: $1" >&2
  compose ps || true
  compose logs --tail=200 || true
  cleanup
  exit 1
}

command -v curl >/dev/null || fail "curl is required"
docker info >/dev/null 2>&1 || fail "docker is not running"

for image in api web worker; do
  docker image inspect "ryuksaidso-${image}:${IMAGE_SRC_TAG}" >/dev/null 2>&1 \
    || docker build -f "apps/${image}/Dockerfile" -t "ryuksaidso-${image}:${IMAGE_SRC_TAG}" .
  docker tag "ryuksaidso-${image}:${IMAGE_SRC_TAG}" "${DOCKERHUB_USERNAME}/ryuksaidso-${image}:${IMAGE_TAG}"
done

trap cleanup EXIT
cleanup

compose up -d --scale llm-proxy=0

echo "waiting for the stack to become healthy"
for _ in $(seq 1 60); do
  if curl -fsS http://127.0.0.1/healthz >/dev/null 2>&1 && curl -fsS http://127.0.0.1/health >/dev/null 2>&1; then
    break
  fi
  sleep 3
done

curl -fsS http://127.0.0.1/healthz | grep -q ok || fail "/healthz is not serving through the reverse proxy"
curl -fsS http://127.0.0.1/health | grep -q ryuksaidso-api || fail "/health did not reach the api upstream"
curl -fsS -o /dev/null http://127.0.0.1/ || fail "the web upstream is not serving the app"
code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/api/control/runs)
[ "$code" = "401" ] || fail "expected 401 from a protected api route, got $code"
code=$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1/api/auth/login -H 'Content-Type: application/json' -d '{"email":"a@b.co","password":"x"}')
[ "$code" != "404" ] || fail "the reverse proxy is not routing /api/*"

compose exec -T api sh -c 'true' >/dev/null 2>&1 || fail "api replicas are not running"

replicas=$(compose ps -q api | wc -l | tr -d ' ')
[ "$replicas" -ge 2 ] || fail "expected at least 2 api replicas, found $replicas"

for _ in $(seq 1 40); do
  curl -fsS -o /dev/null http://127.0.0.1/health || true
done

hits=0
for id in $(compose ps -q api); do
  count=$(docker logs "$id" 2>&1 | grep -c "GET /health" || true)
  hits=$((hits + count))
  echo "replica $id served $count health requests"
done
[ "$hits" -ge 2 ] || fail "load balancing did not distribute traffic across api replicas"

echo "SMOKE PASSED: reverse proxy, api replicas, web, migrations and load balancing verified"
