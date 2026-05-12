#!/usr/bin/env bash
set -euo pipefail

TECHNITIUM_BASE_URL="${TECHNITIUM_BASE_URL:-http://localhost:5380}"
TECHNITIUM_TOKEN="${TECHNITIUM_TOKEN:-${TECHNITIUM_API_KEY:-}}"
TECHNITIUM_NODE="${TECHNITIUM_NODE:-}"

usage() {
    echo "Usage:"
    echo "  TECHNITIUM_TOKEN=... ./get-technitium-logs.sh list"
    echo "  TECHNITIUM_TOKEN=... ./get-technitium-logs.sh download <file-name>"
    echo
    echo "Optional environment variables:"
    echo "  TECHNITIUM_BASE_URL  Base Technitium URL (default: http://localhost:5380)"
    echo "  TECHNITIUM_NODE      Cluster node name to target"
}

if [ -z "$TECHNITIUM_TOKEN" ]; then
    echo "Error: TECHNITIUM_TOKEN or TECHNITIUM_API_KEY is required."
    usage
    exit 1
fi

urlencode() {
    jq -nr --arg value "$1" '$value | @uri'
}

build_query() {
    local query=""

    if [ -n "$TECHNITIUM_NODE" ]; then
        query="?node=$(urlencode "$TECHNITIUM_NODE")"
    fi

    printf '%s' "$query"
}

request_json() {
    local path="$1"

    curl -sS \
        -H "Authorization: Bearer $TECHNITIUM_TOKEN" \
        "${TECHNITIUM_BASE_URL}${path}"
}

command_name="${1:-list}"

case "$command_name" in
    list)
        request_json "/api/logs/list$(build_query)" | jq
        ;;
    download)
        file_name="${2:-}"

        if [ -z "$file_name" ]; then
            echo "Error: missing log file name."
            usage
            exit 1
        fi

        request_json "/api/logs/download?fileName=$(urlencode "$file_name")$(build_query)"
        ;;
    *)
        usage
        exit 1
        ;;
esac