// harness.ts — the tower, assembled in one process.
//
// This is the SAME `engine.ts` the servers run, wired to in-process leaves
// instead of sockets.  It exists for two reasons.  Tests need a game that
// finishes in milliseconds and gives the same answer twice, and `play.ts` needs
// a way to run without twenty processes for anybody who just wants to see it.
//
// What it is NOT is a second implementation.  `level.server.ts` builds the same
// `LevelState`, calls the same `runLevel`, and differs only in where the leaves
// are — which is exactly the claim being made about the boundary: the thing on
// the other side of it may be a function, a process or a language model, and
// the level cannot tell.

import { type IO, type LevelState, mkLevel, runLevel } from "./engine.ts";
import { type Move, type Sees, type LevelR } from "./containers.ts";
import { MUSTERED, type Party } from "./party.ts";
import { type MonsterId, MONSTERS, depthOf, type Room } from "./spec.ts";
import { type Memory, mkMemory, stubReply } from "./leaf-stub.ts";
import type { Runner } from "./lib/algebra.ts";

type MonsterC = import("./containers.ts").MonsterC;

export interface Game {
  readonly levels: Map<number, LevelState>;
  readonly memory: Map<MonsterId, Memory>;
  readonly said: string[];
}

export const mkGame = (): Game => ({
  levels: new Map([0, 1, 2, 3].map((d) => [d, mkLevel(d)])),
  memory: new Map(MONSTERS.map((m) => [m.id, mkMemory()])),
  said: [],
});

/** How many times a bargain has been struck, across every level.  A desire
 *  lives on the level its holder stands on, so this only ever finds one. */
const struckIn = (g: Game) => (id: string): number => {
  for (const st of g.levels.values()) {
    const n = st.used.get(id);
    if (n !== undefined) return n;
  }
  return 0;
};

/** A stub inhabitant as a `Runner`.  The lib's `leaf()` would put a CLI hop
 *  here; this one answers in process.  Everything above it is identical. */
export function stubRunner(g: Game, id: MonsterId): Runner<MonsterC> {
  return {
    label: id,
    // deno-lint-ignore require-await
    async run(shape, _depth) {
      return stubReply(id, shape, g.memory.get(id)!, struckIn(g)) as never;
    },
  };
}

export interface Driver {
  choose(sees: Sees): Promise<Move>;
  say(text: string): void;
}

/** Play the whole labyrinth.  Level 0 is entered once; every deeper level is
 *  entered by delegation from the one above it, and its `LevelState` persists
 *  between visits — which is what makes going back down for the piece you
 *  missed a real option rather than a reset. */
export function play(g: Game, drv: Driver, party: Party = MUSTERED): Promise<LevelR> {
  const io = (depth: number): IO => ({
    choose: (sees) => drv.choose(sees),
    monster: (id) => stubRunner(g, id),
    descend: (p, to, d) => enter(depthOf(to), p, to, d),
    say: (t) => { g.said.push(t); drv.say(t); },
  });
  const enter = (d: number, p: Party, room: Room, depth: number): Promise<LevelR> =>
    runLevel(g.levels.get(d)!, p, room, io(depth), depth);

  return enter(0, party, "0.A", 0);
}

/** A player that reads from a list.  When it runs out it walks out. */
export function scripted(moves: readonly Move[], log?: string[]): Driver {
  let i = 0;
  return {
    // deno-lint-ignore require-await
    async choose(_sees) { return moves[i++] ?? { tag: "Quit" }; },
    say(t) { log?.push(t); },
  };
}

