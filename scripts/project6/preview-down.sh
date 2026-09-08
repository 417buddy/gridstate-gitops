#!/usr/bin/env bash

set -euo pipefail

if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <preview-id>"
  exit 1
fi

PREVIEW_ID="$1"

if ! printf '%s' "$PREVIEW_ID" | grep -Eq '^[0-9]+$'; then
  echo "ERROR: preview-id must contain only digits"
  exit 1
fi

PREVIEW_NAME="gridstate-pr-${PREVIEW_ID}"
PREVIEW_NETWORK="${PREVIEW_NAME}-network"
COMPOSE_PROJECT_NAME="$PREVIEW_NAME"

export PREVIEW_NAME
export PREVIEW_NETWORK
export COMPOSE_PROJECT_NAME

COMPOSE=(docker compose
  -p "$COMPOSE_PROJECT_NAME"
  -f preview/compose.yaml
)

echo "================================================="
echo " GRIDSTATE PROJECT 6 — DESTROY PREVIEW"
echo "================================================="

echo
echo "Preview ID:        $PREVIEW_ID"
echo "Preview name:      $PREVIEW_NAME"
echo "Docker network:    $PREVIEW_NETWORK"
echo "Compose project:   $COMPOSE_PROJECT_NAME"

echo
echo "===== CURRENT STATE ====="

"${COMPOSE[@]}" ps -a || true

echo
echo "===== STOPPING AND REMOVING PREVIEW ====="

"${COMPOSE[@]}" down --remove-orphans

echo
echo "===== VERIFY CONTAINERS ====="

if docker ps -a \
    --filter "name=${PREVIEW_NAME}" \
    --format '{{.Names}}' |
    grep -q .; then

  echo "FAIL — Preview containers still exist."
  docker ps -a --filter "name=${PREVIEW_NAME}"
  exit 1
fi

echo "Containers removed: PASS"

echo
echo "===== VERIFY NETWORK ====="

if docker network inspect "$PREVIEW_NETWORK" >/dev/null 2>&1; then
  echo "FAIL — Preview network still exists."
  exit 1
fi

echo "Network removed: PASS"

echo
echo "===== VERIFY COMPOSE PROJECT ====="

if docker compose ls -a |
    awk 'NR > 1 {print $1}' |
    grep -qx "$COMPOSE_PROJECT_NAME"; then

  echo "FAIL — Compose project still registered."
  exit 1
fi

echo "Compose project removed: PASS"

echo
echo "===== PREVIEW DESTROYED ====="

echo "PASS — $PREVIEW_NAME has been completely removed."
