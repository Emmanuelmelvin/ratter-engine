#!/bin/bash
# show-caddy-route.sh

CADDY_ADMIN_URL="${CADDY_ADMIN_URL:-http://localhost:2019}"

SERVER_NAME="$1"
ROUTE_INDEX="$2"

if [ -z "$SERVER_NAME" ] || [ -z "$ROUTE_INDEX" ]; then
    echo "Usage:"
    echo "  ./show-caddy-route.sh <server-name> <route-index>"
    exit 1
fi

curl -s \
    "$CADDY_ADMIN_URL/config/apps/http/servers/$SERVER_NAME/routes/$ROUTE_INDEX" \
    | jq