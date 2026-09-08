#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "Usage: $0 <preview-id> <api-port>"
  exit 1
fi

PREVIEW_ID="$1"
PREVIEW_API_PORT="$2"

if ! printf '%s' "$PREVIEW_ID" | grep -Eq '^[0-9]+$'; then
  echo "ERROR: preview-id must contain only digits"
  exit 1
fi

if ! printf '%s' "$PREVIEW_API_PORT" | grep -Eq '^[0-9]+$'; then
  echo "ERROR: api-port must contain only digits"
  exit 1
fi

PREVIEW_NAME="gridstate-pr-${PREVIEW_ID}"
PREVIEW_NETWORK="${PREVIEW_NAME}-network"
COMPOSE_PROJECT_NAME="$PREVIEW_NAME"

export PREVIEW_NAME
export PREVIEW_API_PORT
export PREVIEW_NETWORK
export COMPOSE_PROJECT_NAME

COMPOSE=(docker compose
  -p "$COMPOSE_PROJECT_NAME"
  -f preview/compose.yaml
)

echo "================================================="
echo " GRIDSTATE PROJECT 6 — CREATE PREVIEW"
echo "================================================="

echo
echo "Preview ID:        $PREVIEW_ID"
echo "Preview name:      $PREVIEW_NAME"
echo "API port:          $PREVIEW_API_PORT"
echo "Docker network:    $PREVIEW_NETWORK"
echo "Compose project:   $COMPOSE_PROJECT_NAME"

echo
echo "===== VALIDATING COMPOSE CONFIG ====="

"${COMPOSE[@]}" config >/dev/null

echo "Compose configuration: PASS"

echo
echo "===== STARTING PREVIEW ====="

"${COMPOSE[@]}" up -d

echo
echo "===== CONTAINER STATE ====="

"${COMPOSE[@]}" ps

echo
echo "===== WAITING FOR API ====="

for i in {1..30}; do
  if curl -fsS \
      "http://127.0.0.1:${PREVIEW_API_PORT}/healthz" \
      >/tmp/gridstate-preview-health.json 2>/dev/null; then

    echo "API health check: PASS"
    cat /tmp/gridstate-preview-health.json
    echo
    break
  fi

  if [ "$i" -eq 30 ]; then
    echo "API health check: FAIL"
    "${COMPOSE[@]}" logs --tail=50
    exit 1
  fi

  sleep 1
done

echo
echo "===== API STATUS ====="

curl -fsS \
  "http://127.0.0.1:${PREVIEW_API_PORT}/status"

echo

echo
echo "===== PREVIEW CREATED ====="

echo "PASS — $PREVIEW_NAME is running."
