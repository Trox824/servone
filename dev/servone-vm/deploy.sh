#!/bin/sh
# cron: */5 * * * * ~/servone/deploy.sh >> ~/servone/deploy.log 2>&1
# Rollback: set SERVONE_TAG=<older commit sha> in .env and run this script.
set -u
cd "$(dirname "$0")"

docker compose pull --quiet account transactor servone front 2>&1 | sed "s/^/$(date -Is) pull: /"

# up -d only recreates containers whose image or config changed.
out=$(docker compose up -d --remove-orphans 2>&1)
case "$out" in
  *Recreate*|*Creat*)
    echo "$(date -Is) deployed $(grep -s '^SERVONE_TAG=' .env || echo SERVONE_TAG=develop)"
    echo "$out" | grep -E 'Recreate|Creat'
    docker image prune -f >/dev/null
    ;;
esac
