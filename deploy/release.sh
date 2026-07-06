#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
ENV_NAME="${1:-stag}"

case "${ENV_NAME}" in
  stag)
    COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.stag.yml"
    WEB_HEALTH_URL="http://127.0.0.1:3016/site/index.html"
    OCR_HEALTH_URL="http://127.0.0.1:3016/ocr/health"
    ;;
  prod)
    COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"
    WEB_HEALTH_URL="http://127.0.0.1:3015/site/index.html"
    OCR_HEALTH_URL="http://127.0.0.1:3015/ocr/health"
    ;;
  *)
    echo "Usage: $0 [stag|prod]"
    exit 1
    ;;
esac

echo "[release] environment=${ENV_NAME}"
echo "[release] compose=${COMPOSE_FILE}"

docker compose -f "${COMPOSE_FILE}" build --pull analyser web
docker compose -f "${COMPOSE_FILE}" up -d --remove-orphans analyser web

echo "[release] waiting for ${WEB_HEALTH_URL}"
for _ in $(seq 1 40); do
  if curl -fsI "${WEB_HEALTH_URL}" >/dev/null; then
    break
  fi
  sleep 1
done

echo "[release] waiting for ${OCR_HEALTH_URL}"
for _ in $(seq 1 40); do
  if curl -fs "${OCR_HEALTH_URL}" >/dev/null; then
    echo "[release] health checks passed"
    docker compose -f "${COMPOSE_FILE}" ps
    exit 0
  fi
  sleep 1
done

echo "[release] health check failed"
docker compose -f "${COMPOSE_FILE}" logs --tail=80 web || true
exit 1
