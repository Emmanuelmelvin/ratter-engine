#!/bin/bash
# clear-caddy-routes.sh

CADDY_ADMIN_URL="${CADDY_ADMIN_URL:-http://localhost:2019}"

echo "Fetching server names..."

servers=$(curl -s "$CADDY_ADMIN_URL/config/apps/http/servers" | jq -r 'keys[]')

echo
echo "Servers found:"
echo "$servers"
echo

for server in $servers; do
    echo "Clearing routes for server: $server"

    status=$(curl -s -o /dev/null -w "%{http_code}" \
        -X PUT \
        "$CADDY_ADMIN_URL/config/apps/http/servers/$server/routes" \
        -H "Content-Type: application/json" \
        -d '[]')

    echo "HTTP Status: $status"
    echo
done

echo "All routes removed."