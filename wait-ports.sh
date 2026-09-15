#!/bin/bash
# Poll until every port given is answering, or give up.  No bare `sleep`.
set -uo pipefail
deadline=$(( $(date +%s) + 20 ))
for port in "$@"; do
  until nc -z localhost "$port" 2>/dev/null; do
    if [ "$(date +%s)" -ge "$deadline" ]; then
      echo "wait-ports: :$port never answered" >&2
      exit 1
    fi
  done
done
