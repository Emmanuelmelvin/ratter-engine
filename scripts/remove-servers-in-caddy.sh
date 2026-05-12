#!/bin/bash
# remove-all-caddy-servers.sh

CADDY_ADMIN_URL="${CADDY_ADMIN_URL:-http://localhost:2019}"

echo "Fetching servers..."

servers=$(curl -s "$CADDY_ADMIN_URL/config/apps/http/servers" | jq -r 'keys[]')

echo
echo "Servers found:"
echo "$servers"
echo

for server in $servers; do
    echo "Removing server: $server"

    status=$(curl -s -o /dev/null -w "%{http_code}" \
        -X DELETE \
        "$CADDY_ADMIN_URL/config/apps/http/servers/$server")

    echo "HTTP Status: $status"
    echo
done

echo "All servers removed."