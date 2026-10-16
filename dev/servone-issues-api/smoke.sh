#!/usr/bin/env bash
# servone: smoke test for the issues REST API (SRV-125). Needs curl and jq.
#
#   SERVONE_API_URL=https://<servone-mcp host> SERVONE_API_TOKEN=... PROJECT=SRV \
#     dev/servone-issues-api/smoke.sh
#
# Leaves one test issue behind; cancel it in the app afterwards.
set -euo pipefail
: "${SERVONE_API_URL:?set SERVONE_API_URL}"
: "${SERVONE_API_TOKEN:?set SERVONE_API_TOKEN}"
project=${PROJECT:-SRV}
issues="${SERVONE_API_URL%/}/v1/tracker/issues"
key="smoke-$(date +%s)-$RANDOM"

api() {
  local method=$1 url=$2
  shift 2
  curl -sS --fail-with-body -X "$method" "$url" \
    -H "Authorization: Bearer $SERVONE_API_TOKEN" -H 'Content-Type: application/json' "$@"
}

body=$(jq -n --arg project "$project" '{project: $project, title: "API smoke test (cancel me)", description: "Created by `smoke.sh`.", priority: "low"}')
first=$(api POST "$issues" -H "Idempotency-Key: $key" -d "$body")
id=$(jq -r .identifier <<<"$first")
echo "created $id"

again=$(api POST "$issues" -H "Idempotency-Key: $key" -d "$body")
[[ $(jq -r .identifier <<<"$again") == "$id" ]] || { echo "replay returned another issue: $again" >&2; exit 1; }
echo "replay returned $id"

api PATCH "$issues/$id" -d '{"status":"In Progress"}' | jq -e '.status == "In Progress"' >/dev/null
echo "moved $id to In Progress"

api POST "$issues/$id/comments" -H "Idempotency-Key: $key-comment" -d '{"text":"Comment from **smoke.sh**"}' | jq -c .
api GET "$issues/$id" | jq .

status=$(curl -sS -o /dev/null -w '%{http_code}' "$issues/$id" -H 'Authorization: Bearer not-a-token')
[[ $status == 401 ]] || { echo "bad token got $status, expected 401" >&2; exit 1; }
echo "bad token gets 401"
