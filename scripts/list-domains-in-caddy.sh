#!/bin/bash
# list-caddy-routes.sh

CADDY_ADMIN_URL="${CADDY_ADMIN_URL:-http://localhost:2019}"

SERVER_NAME="$1"

echo "=== CADDY ROUTES ==="
echo

if [ -z "$SERVER_NAME" ]; then
    # List all servers
    curl -s "$CADDY_ADMIN_URL/config/apps/http/servers" \
    | jq -r '
        to_entries[]
        | "\(.key):\n"
        + (
            (.value.routes[]?.match[]?.host[]? // "No host match")
            | "  - \(.)"
        )
    ' || echo "No routes found."
else
    # List specific server
    curl -s "$CADDY_ADMIN_URL/config/apps/http/servers/$SERVER_NAME" \
    | jq -r '
        .routes[]?.match[]?.host[]? // "No routes found."
    ' | sed 's/^/  - /'
fi