#!/bin/bash
# Twenty processes: four levels and sixteen inhabitants.
#
#   ./up.sh                scripted leaves — free, fast, deterministic (default)
#   ./up.sh --agent        `claude -p` behind every monster
#
# That is the cost of the claim that a monster is a server like any other, and
# this file is where it is paid.  `stalin/up.sh` pays five.
#
# Each server's trace goes to .run/<name>.log rather than to this terminal: the
# tower writes its trace to stderr so that stdout stays pure JSON and the CLI
# stays pipeable, and twenty of those interleaved on one terminal is not a trace.
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p .run
: > .run/pids

LEAF=stub
[ "${1:-}" = "--agent" ] && LEAF=claude

start() {  # start <logname> <args...>
  local name=$1; shift
  LABYRINTH_LEAF=$LEAF nohup deno run --quiet \
    --allow-net --allow-env --allow-read --allow-run \
    "$@" > ".run/$name.log" 2>&1 &
  echo $! >> .run/pids
  disown
}

for d in 0 1 2 3; do start "level$d" level.server.ts "$d"; done
for n in $(seq 0 15); do start "M$n" monster.server.ts "M$n"; done

./wait-ports.sh 9000 9001 9002 9003 $(seq 9100 9115)
echo "up: levels 9000-9003, inhabitants 9100-9115, leaves=$LEAF"
