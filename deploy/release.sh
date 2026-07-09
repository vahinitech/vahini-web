#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
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

echo "[release] syncing analyser submodule (vahinitech/20factor-analyser)"
git -C "${ROOT_DIR}" submodule sync --recursive -- analyser
git -C "${ROOT_DIR}" submodule update --init --recursive -- analyser

if [[ ! -f "${ROOT_DIR}/analyser/deployment/Dockerfile" ]]; then
  echo "[release] ERROR: analyser/deployment/Dockerfile missing after submodule update." >&2
  echo "[release] The analyser/ submodule looks empty or out of date -- check network/auth" >&2
  echo "[release] to github.com and 'git -C ${ROOT_DIR} submodule status'." >&2
  exit 1
fi
echo "[release] analyser submodule pinned at $(git -C "${ROOT_DIR}/analyser" rev-parse --short HEAD)"

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
