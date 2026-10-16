#!/bin/zsh
# servone: start the webpack dev-server for the Huly front.
#
#   dev/servone-front.sh            # backend = Railway (dev/.servone-railway.json)
#   dev/servone-front.sh local      # backend = local docker stack (dev/servone-stack.sh)
#   dev/servone-front.sh <mode> fg  # foreground instead of nohup + log
#
# Measured after 6 rebuilds: upstream defaults 6.1 GB / 55 s cold start; these settings 4.4 GB / 12 s warm start.
# First start after `rm -rf dev/prod/.build_dev` spikes to ~9 GB once while the cache is written.
set -euo pipefail
cd "$(dirname "$0")/prod"
mode=${1:-railway}
fg=${2:-}

source ~/.nvm/nvm.sh >/dev/null
nvm use 22 >/dev/null

# V8 grows to its cap before collecting, so the cap is the footprint; raise SERVONE_HEAP_MB on 'heap out of memory'.
export NODE_OPTIONS=--max-old-space-size=${SERVONE_HEAP_MB:-4096}
export USE_CACHE=true
export DO_VALIDATE=false        # type gate = `npx svelte-check` in packages/servone-ui
export SERVONE_LOCALHOST_CONFIG=1
export CLIENT_TYPE=dev-server

case "$mode" in
  railway)
    cfg=../.servone-railway.json
    [ -f "$cfg" ] || { echo "missing $cfg" >&2; exit 1; }
    export DEV_ACCOUNT_URL=$(node -p "require('$cfg').ACCOUNTS_PROXY")
    export SERVONE_CONFIG_OVERRIDES=$(cd .. && pwd)/.servone-railway.json
    ;;
  local)
    export DEV_ACCOUNT_URL=http://localhost:3001
    ;;
  *) echo "usage: $0 [railway|local] [fg]" >&2; exit 1 ;;
esac

mkdir -p .servone-logs
if [ "$fg" = "fg" ]; then
  exec npx webpack serve
else
  nohup npx webpack serve > .servone-logs/devserver.log 2>&1 &
  echo "webpack serve started (pid $!, backend=$mode) — log: dev/prod/.servone-logs/devserver.log"
fi
