#!/usr/bin/env bash
# servone: backend stack for the webpack dev-server, DB on CockroachDB Cloud (see servone-cloud-db.override.yaml).
#
#   ./servone-stack.sh up        # minimal set (no cockroach container)
#   ./servone-stack.sh up ws     # + workspace_cockroach (only needed to create/upgrade a workspace)
#   ./servone-stack.sh down
#   ./servone-stack.sh logs [svc]
#   ./servone-stack.sh ps
set -euo pipefail
cd "$(dirname "$0")"
compose=(docker compose -p huly-servone
  --env-file .env --env-file .env.servone-cloud
  -f docker-compose.yaml -f docker-compose.min.yaml
  -f servone-backend.override.yaml -f servone-cloud-db.override.yaml)
base=(redpanda minio datalake account transactor_cockroach collaborator)
case "${1:-}" in
  up)
    svcs=("${base[@]}")
    [[ "${2:-}" == "ws" ]] && svcs+=(workspace_cockroach)
    "${compose[@]}" up -d "${svcs[@]}" ;;
  down) "${compose[@]}" down ;;
  logs) shift; "${compose[@]}" logs -f --tail=100 "$@" ;;
  ps)   "${compose[@]}" ps ;;
  *)    echo "usage: $0 up [ws] | down | logs [svc] | ps" >&2; exit 1 ;;
esac
