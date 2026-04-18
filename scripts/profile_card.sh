#!/usr/bin/env bash
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "Usage: scripts/profile_card.sh <linkedin_url> [host]"
  exit 1
fi

URL="$1"
HOST="${2:-http://localhost:3001}"

curl -s -X POST "${HOST}/profile" \
  -H "Content-Type: application/json" \
  -d "$(printf '{"url":"%s"}' "$URL")"
