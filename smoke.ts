// smoke.ts — the same game, over twenty sockets.
//
//   ./up.sh && deno run -A smoke.ts ; ./down.sh
//
// `game_test.ts` plays the labyrinth with the leaves in this process.  This
// plays it with the leaves on ports, through `delegate.ts`, with every reply
// arriving as bytes and every type re-established by a decoder on this side.
// If the two disagree, the disagreement is in the boundary and nowhere else,
// which is the only reason for having both.

import { delegate } from "./lib/wire.ts";
import { decodeLevelR, isRecord, type Move, type Sees } from "./containers.ts";
import { MUSTERED } from "./party.ts";
import { LEVEL_PORT, PLAYER_PORT } from "./ports.ts";
import { TRIP_ONE, TRIP_TWO } from "./game_test.ts";

const script: Move[] = [
  ...TRIP_ONE, ...TRIP_TWO,
  { tag: "Substitute", who: "Bēl-šunu" },
  { tag: "Go", to: "1.A" }, { tag: "Go", to: "0.A" },
  { tag: "Quit" },
];

let i = 0;
let prompted = 0;
const ac = new AbortController();

Deno.serve({ port: PLAYER_PORT, signal: ac.signal, onListen: () => {} }, async (req) => {
  const body = await req.json().catch(() => null);
  if (!isRecord(body) || body.tag !== "Choose") {
    return new Response(JSON.stringify({ error: "not a prompt for the player" }), { status: 400 });
  }
  prompted++;
  const _sees = body.sees as Sees;
  const move: Move = script[i++] ?? { tag: "Quit" };
  return new Response(JSON.stringify(move), { headers: { "content-type": "application/json" } });
});

const t0 = performance.now();
const raw = await delegate(LEVEL_PORT(0), { tag: "Enter", party: MUSTERED, from: "0.A" }, 0);
const res = decodeLevelR(raw);
const ms = Math.round(performance.now() - t0);
ac.abort();

if (res === null) {
  console.error("level 0 answered with something that is not a party");
  Deno.exit(1);
}

const tablet = res.party.held.includes("foundation-tablet");
const left = res.party.who.length;
console.log(
  `\n${prompted} prompts, ${ms} ms, ${script.length} scripted moves\n` +
  `party out: ${res.party.who.join(", ")} (${left})\n` +
  `carrying:  ${res.party.held.join(", ") || "nothing"}\n`,
);

const ok = tablet && left === 2 && !res.party.who.includes("Bēl-šunu");
console.log(ok ? "SMOKE OK — the same ending as game_test.ts" : "SMOKE FAILED");
Deno.exit(ok ? 0 : 1);
