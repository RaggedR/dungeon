// level.server.ts (:9000+d) — one program, four processes.
//
//   deno run --allow-net --allow-env --allow-read level.server.ts 2
//
// "Eight bespoke programs would be a game, but the same program composed with
// itself eight times is a claim about composition."  There are four here rather
// than eight and the claim is the same one: this file is fixed, and the
// labyrinth is not.  Each process is started with a depth and serves whatever
// `spec.ts` says lies at that depth.
//
// A level is a container because it is prompted and something comes back.  The
// prompt is a party arriving at the top of it.  The response is the party
// leaving, with whatever it is carrying.  That is the whole interface and it is
// the same interface at every depth — which is why descending can be a
// delegation to a copy of this program rather than a call into it.

import { delegate, serveContainer } from "./lib/wire.ts";
import { type IO, mkLevel, runLevel } from "./engine.ts";
import { monsterRunner } from "./flow.ts";
import {
  type LevelR, type Move, type Sees, decodeLevelR, decodeMove, isRecord, isStr,
} from "./containers.ts";
import { decodeParty, type Party } from "./party.ts";
import { type Room, depthOf } from "./spec.ts";
import { LEVEL_PORT, MONSTER_PORT, PLAYER_PORT } from "./ports.ts";

const depth = Number(Deno.args[0]);
if (!Number.isInteger(depth) || depth < 0 || depth > 3) {
  console.error(`usage: level.server.ts <0..3>  (got ${Deno.args[0] ?? "nothing"})`);
  Deno.exit(2);
}

/** One `LevelState`, made once and kept for the life of the process.  This is
 *  what makes going back down for the piece you missed a real option rather
 *  than a reset: level 2 remembers which of its doors are open even though the
 *  party has been to the surface and back since. */
const state = mkLevel(depth);

type Enter = { tag: "Enter"; party: Party; from: Room | null };

const parse = (u: unknown): Enter | null => {
  if (!isRecord(u) || u.tag !== "Enter") return null;
  const party = decodeParty(u.party);
  if (party === null) return null;
  const from = u.from === null || u.from === undefined ? null : u.from;
  if (from !== null && !isStr(from)) return null;
  return { tag: "Enter", party, from: from as Room | null };
};

const io = (d: number): IO => ({
  // The player is a leaf of this tower exactly as a monster is: it is prompted
  // over a socket and it owes a reply of a type fixed before the prompt went out.
  async choose(sees: Sees): Promise<Move> {
    const raw = await delegate(PLAYER_PORT, { tag: "Choose", sees }, d);
    const move = decodeMove(raw);
    if (move === null) {
      // "A word that names no interface is not a move the game refuses
      // politely.  It is a prompt that fails to decode."
      throw new Error(`the player answered with something that is not a move`);
    }
    return move;
  },
  monster: (id) => monsterRunner(id, MONSTER_PORT(id)),
  async descend(p: Party, to: Room, d2: number): Promise<LevelR> {
    const raw = await delegate(LEVEL_PORT(depthOf(to)), { tag: "Enter", party: p, from: to }, d2);
    const back = decodeLevelR(raw);
    if (back === null) throw new Error(`level ${depthOf(to)} answered with something that is not a party`);
    return back;
  },
  // Nothing is pushed at the player.  Everything said since its last decision
  // rides in `sees.heard` of the next prompt.
  say: () => {},
});

serveContainer<Enter>({
  name: `level${depth}`,
  port: LEVEL_PORT(depth),
  parse,
  answer: (p, d) =>
    runLevel(state, p.party, p.from ?? entryOf(depth), io(d), d) as Promise<unknown>,
});

const entryOf = (d: number): Room => (["0.A", "1.A", "2.A", "3.A"] as const)[d];
