#!/bin/bash
set -uo pipefail
cd "$(dirname "$0")"
[ -f .run/pids ] && xargs kill 2>/dev/null < .run/pids
rm -f .run/pids
echo "down"
