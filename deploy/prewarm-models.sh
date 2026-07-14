#!/usr/bin/env bash
# SPDX-License-Identifier: LicenseRef-Vahini-Proprietary
# © 2026 Vahini Technologies. All rights reserved.
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"
ENV_NAME="${1:-stage}"
LANGS_RAW="${2:-}"

case "${ENV_NAME}" in
  stage)
    COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.stage.yml"
    ;;
  prod)
    COMPOSE_FILE="${DEPLOY_DIR}/docker-compose.prod.yml"
    ;;
  *)
    echo "Usage: $0 [stage|prod] [langs_csv]"
    echo "Example: $0 stage en,te,hi,ta,kn,ml"
    exit 1
    ;;
esac

if [[ -z "${LANGS_RAW}" ]]; then
  LANGS_RAW="en,te"
fi

# Keep cache on host so container rebuild/restart does not re-download models.
mkdir -p /home/vishnu/paddle-models/.paddlex

echo "[prewarm] environment=${ENV_NAME}"
echo "[prewarm] compose=${COMPOSE_FILE}"
echo "[prewarm] langs=${LANGS_RAW}"

git -C "${ROOT_DIR}" submodule update --init --recursive -- analyser
if [[ ! -f "${ROOT_DIR}/analyser/deployment/Dockerfile" ]]; then
  echo "[prewarm] ERROR: analyser/deployment/Dockerfile missing -- submodule not checked out." >&2
  exit 1
fi

docker compose -f "${COMPOSE_FILE}" up -d analyser

echo "[prewarm] running warmup_models.py in analyser container"
docker compose -f "${COMPOSE_FILE}" exec -T \
  -e VAHINI_OCR_PRELOAD_LANGS="${LANGS_RAW}" \
  analyser \
  python /app/backend/warmup_models.py

echo "[prewarm] done. Cache volume path: /home/vishnu/paddle-models/.paddlex"
