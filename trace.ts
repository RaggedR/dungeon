// trace.ts — what actually happened, as data.
//
// `containers.ts` says a decoder is "the only thing that ever establishes that
// a value has the type claimed for it".  That discipline stops at the fibre.
// It checks that a reply has the shape of an `AskR`; it does not check that the
// room's inhabitants were all prompted, that exactly one side of the round
// answered, or that the loop in `engine.ts` is the `<|*` THEME.md says it is.
//
// Those are properties of a SEQUENCE of prompts and replies, not of any one
// value, so nothing local can see them.  This file records the sequence.
//
// WHERE IT TAPS.  `engine.ts` touches the outside world through exactly one
// interface, `IO`, and `harness.ts` (in process) and `level.server.ts` (over
// sockets) build the same `LevelState` and call the same `runLevel`, differing
// only in how those four methods are implemented.  So a decorator on `IO` sees
// every prompt in either wiring, and there is nothing else to tap.
//
// WHAT IT DOES NOT TAP.  `IO.say` is deliberately excluded.  In process it
// stores and prints; over sockets it is `() => {}`, because a socket cannot
// push and everything rides in `sees.heard` instead.  A checker resting on
// `say` would pass in one wiring and see nothing in the other, which is worse
// than not checking at all.  The `choose`/`monster`/`descend` triad is the part
// that is symmetric, and it is the whole of what is recorded here.

import { type IO, runLevel } from "./engine.ts";
import type { Move, Sees, LevelR, MonsterC, MonsterPrompt, MonsterReply } from "./containers.ts";
import { depthOf, type MonsterId, type Room } from "./spec.ts";
import { MUSTERED, type Party } from "./party.ts";
import type { Runner } from "./lib/algebra.ts";
import { type Driver, type Game, stubRunner } from "./harness.ts";

// ── Events ────────────────────────────────────────────────────────────
/** One thing that crossed the `IO` boundary.
 *
 *  `seq` is a global monotone counter, not a timestamp.  The algebra's rules
 *  are about ORDER — "the second prompt is computed from the first response",
 *  "the side is settled before the prompt is sent" — and order is exactly what
 *  a counter records and a clock muddles.  Two events with adjacent `seq` are
 *  adjacent; nothing here claims to know how long anything took.
 *
 *  `depth` is the level's own depth, threaded by `engine.ts`.  A descent is
 *  visible as a `descend` event followed by events at a greater depth. */
export type Ev =
  | { readonly k: "choose"; readonly seq: number; readonly depth: number; readonly room: Room }
  | { readonly k: "chose"; readonly seq: number; readonly depth: number; readonly move: Move }
  | {
    readonly k: "prompt";
    readonly seq: number;
    readonly depth: number;
    /** WHO IT WENT TO — the inhabitant whose runner was called. */
    readonly at: MonsterId;
    /** WHO IT WAS ADDRESSED TO — `promptFor` (engine.ts:335) sets this to
     *  `move.who` for every prompt in the round, and that is deliberate:
     *  "Everyone still hears the words; `answered` is still each monster's own
     *  to decide."  So `to` is the same across a round and `at` varies.
     *  Conflating the two is the first thing writing this checker taught. */
    readonly to: MonsterId;
    readonly tag: MonsterPrompt["tag"];
  }
  | {
    readonly k: "reply";
    readonly seq: number;
    readonly depth: number;
    readonly at: MonsterId;
    readonly to: MonsterId;
    readonly tool: string | null;
  }
  | { readonly k: "descend"; readonly seq: number; readonly depth: number; readonly to: Room }
  | { readonly k: "returned"; readonly seq: number; readonly depth: number; readonly exit: string };

export interface Sink {
  readonly evs: Ev[];
  /** The counter lives here, not in `recordIO`, because `playRecorded` rebuilds
   *  the `IO` on every entry to a level.  A counter in the decorator's closure
   *  restarts at each descent, and the resulting collisions make every ordering
   *  question unanswerable.  Found by the checker failing on a real game. */
  seq: number;
}

export const mkSink = (): Sink => ({ evs: [], seq: 0 });

// ── The decorator ─────────────────────────────────────────────────────
/** Wrap an `IO` so that every prompt and reply lands in `sink`.
 *
 *  Nothing here changes what `engine.ts` sees.  Each method forwards its
 *  arguments unchanged and returns the inner result unchanged; the only effect
 *  is the push into `sink.evs`.  That transparency is not a claim, it is tested
 *  — `conformance_test.ts` runs the same script through the recorded and
 *  unrecorded wirings and asserts the outcomes are identical.
 *
 *  The monster leg needs care.  `io.monster(id)` does not itself prompt
 *  anything; it hands back a `Runner<MonsterC>` which `standingRunner` folds
 *  into a tensor and runs later, inside `runRound`.  So the wrapper has to
 *  decorate the RUNNER, not the call that produces it, or it would record the
 *  building of the round and never the round. */
export function recordIO(io: IO, sink: Sink): IO {
  const next = () => sink.seq++;

  const wrapMonster = (id: MonsterId, r: Runner<MonsterC>): Runner<MonsterC> => ({
    label: r.label,
    async run(shape, depth) {
      const s = shape as unknown as MonsterPrompt;
      sink.evs.push({ k: "prompt", seq: next(), depth, at: id, to: s.to, tag: s.tag });
      const pos = await r.run(shape, depth);
      // The reply arrives as a `MonsterReply` envelope — the position proper
      // plus the at-most-one tool call.  Only the tool is recorded: the prose
      // is the monster's own business and no rule in the algebra is about it.
      const rep = pos as unknown as MonsterReply;
      sink.evs.push({
        k: "reply",
        seq: next(),
        depth,
        at: id,
        to: s.to,
        tool: rep?.tool?.tag ?? null,
      });
      return pos;
    },
  });

  return {
    async choose(sees: Sees, depth: number): Promise<Move> {
      sink.evs.push({ k: "choose", seq: next(), depth, room: sees.room });
      const m = await io.choose(sees, depth);
      sink.evs.push({ k: "chose", seq: next(), depth, move: m });
      return m;
    },
    monster(id: MonsterId): Runner<MonsterC> {
      return wrapMonster(id, io.monster(id));
    },
    async descend(party: Party, to: Room, depth: number): Promise<LevelR> {
      sink.evs.push({ k: "descend", seq: next(), depth, to });
      const r = await io.descend(party, to, depth);
      sink.evs.push({ k: "returned", seq: next(), depth, exit: r.exit });
      return r;
    },
    say(text: string): void {
      // Forwarded, never recorded.  See the header.
      io.say(text);
    },
  };
}

// ── Rounds ────────────────────────────────────────────────────────────
/** A round, as the trace shows it.
 *
 *  THEME.md: `round(d,r) = look x standing(d,r) x move`.  One prompt to the
 *  player, one prompt to every inhabitant, and exactly one side answered.  So a
 *  round in the trace begins at a `choose` and ends where the next one begins.
 *
 *  This segmentation is deliberately naive, and the naivety is the point: if
 *  the engine ever issues a second `choose` without closing the round, this
 *  produces a round with a move and no prompts and the checker will say so.  A
 *  segmenter clever enough to paper over that would be checking its own
 *  cleverness instead of the engine. */
export interface Round {
  readonly depth: number;
  readonly room: Room;
  readonly move: Move | null;
  readonly prompts: readonly { at: MonsterId; to: MonsterId; tag: string }[];
  readonly replies: readonly { at: MonsterId; tool: string | null }[];
  readonly first: number;
}

export function rounds(evs: readonly Ev[]): Round[] {
  const out: Round[] = [];
  let cur: {
    depth: number;
    room: Room;
    move: Move | null;
    prompts: { at: MonsterId; to: MonsterId; tag: string }[];
    replies: { at: MonsterId; tool: string | null }[];
    first: number;
  } | null = null;

  const close = () => { if (cur) out.push({ ...cur }); cur = null; };

  for (const e of evs) {
    if (e.k === "choose") {
      close();
      cur = { depth: e.depth, room: e.room, move: null, prompts: [], replies: [], first: e.seq };
      continue;
    }
    if (!cur) continue;          // events before the first choose: nothing owns them
    if (e.k === "chose") cur.move = e.move;
    else if (e.k === "prompt") cur.prompts.push({ at: e.at, to: e.to, tag: e.tag });
    else if (e.k === "reply") cur.replies.push({ at: e.at, tool: e.tool });
  }
  close();
  return out;
}

// ── The recorded wiring ───────────────────────────────────────────────
// `harness.ts:play` builds its `IO` inside a closure, so a decorator cannot be
// inserted from outside without editing it — and this work does not edit the
// thing it checks.  So the wiring is mirrored here with the decorator in place.
//
// A mirror is a liability: if it drifts from `play`, the checker checks
// something that is not the game.  That is why `conformance_test.ts` runs the
// same script through both and asserts the outcomes are identical.  The mirror
// is held honest by a test, not by care.

export function playRecorded(
  g: Game, drv: Driver, sink: Sink, party: Party = MUSTERED,
): Promise<LevelR> {
  const io = (depth: number): IO =>
    recordIO({
      choose: (sees) => drv.choose(sees),
      monster: (id) => stubRunner(g, id),
      descend: (p, to, d) => enter(depthOf(to), p, to, d),
      say: (t) => { g.said.push(t); drv.say(t); },
    }, sink);
  const enter = (d: number, p: Party, room: Room, depth: number): Promise<LevelR> =>
    runLevel(g.levels.get(d)!, p, room, io(depth), depth);

  return enter(0, party, "0.A", 0);
}
