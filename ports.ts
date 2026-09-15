// ports.ts — where everything listens.
//
// Twenty processes.  That is the cost of the claim that a monster is a server
// like any other, and `up.sh` is where it is paid.
//
//   you ─$ ./play ────────────▶ [ 9000 level 0 ]   0.A, the room with the daylight
//        ◀── Choose ───────────      │ delegates down the trapdoor
//          [ 9200 the player ]  [ 9001 level 1 ]   Kalam
//                                    │
//                               [ 9002 level 2 ]   Sillum
//                                    │
//                               [ 9003 level 3 ]   Emegir
//
//   every level ──Ask/Tell/Offer──▶ [ 9100+n  M0 .. M15 ]
//
// The player is prompted by the levels and prompts level 0, so the graph has a
// cycle in it — the one structure the four combinators cannot build, and the
// whole subject of the `federation` repository next door.  It is survivable
// here for the reason that repository gives: the cycle carries no data round
// it.  The player's reply to `Choose` never becomes part of the reply to
// `Enter`; it only decides which prompt goes out next.

import type { MonsterId } from "./spec.ts";

export const LEVEL_PORT = (d: number) => 9000 + d;
export const MONSTER_PORT = (id: MonsterId) => 9100 + Number(id.slice(1));
export const PLAYER_PORT = 9200;
