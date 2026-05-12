#!/bin/bash
# show-caddy-server-listeners.sh

CADDY_ADMIN_URL="${CADDY_ADMIN_URL:-http://localhost:2019}"

SERVER_NAME="$1"

if [ -z "$SERVER_NAME" ]; then
    echo "Usage:"
    echo "  ./show-caddy-server-listeners.sh <server-name>"
    exit 1
fi

echo "Listeners for server: $SERVER_NAME"
echo

curl -s \
"$CADDY_ADMIN_URL/config/apps/http/servers/$SERVER_NAME" \
| jq -r '.listen[]'