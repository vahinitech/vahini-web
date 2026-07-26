#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
ENV_NAME="${1:-stage}"

case "${ENV_NAME}" in
  stage)
    COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.stage.yml"
    WEB_HEALTH_URL="http://127.0.0.1:3016/site/index.html"
    OCR_HEALTH_URL="http://127.0.0.1:3016/ocr/health"
    ;;
  prod)
    COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"
    WEB_HEALTH_URL="http://127.0.0.1:3015/site/index.html"
    OCR_HEALTH_URL="http://127.0.0.1:3015/ocr/health"
    ;;
  *)
    echo "Usage: $0 [stage|prod]"
    exit 1
    ;;
esac

# Host paths for the persist volumes and the mail env file. The compose files
# reference ${VAHINI_HOST_DATA} instead of a baked-in /home/<user>, using the
# ":?" form so an unset value aborts rather than silently mounting /uploads at
# the filesystem root. Export it before calling this script to deploy from a
# different location.
export VAHINI_HOST_DATA="${VAHINI_HOST_DATA:-${HOME:-}}"
if [[ -z "${VAHINI_HOST_DATA}" || ! -d "${VAHINI_HOST_DATA}" ]]; then
  echo "[release] ERROR: VAHINI_HOST_DATA='${VAHINI_HOST_DATA}' is not a directory." >&2
  echo "[release] \$HOME is unset or wrong for this user (sudo/cron often drops it);" >&2
  echo "[release] export VAHINI_HOST_DATA explicitly." >&2
  exit 1
fi

# persist-api's build context is the repo root, and the root .dockerignore
# excludes services/ and config/ so they cannot reach the public web root.
# services/persist-api/Dockerfile.dockerignore re-includes them for that build,
# and per-Dockerfile ignore files are a BuildKit feature: the legacy builder
# ignores that file, so config/email never reaches the context and the COPY
# fails. Pin the builder rather than trusting the daemon's default.
export DOCKER_BUILDKIT=1
export COMPOSE_DOCKER_CLI_BUILD=1

echo "[release] environment=${ENV_NAME}"
echo "[release] compose=${COMPOSE_FILE}"
echo "[release] host data dir=${VAHINI_HOST_DATA}"

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
