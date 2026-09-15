// flow.ts — the round, wired out of the four combinators.
//
//   round(d,r)     = look x standing(d,r) x move
//   standing(d,r)  = monster(1) (x) ... (x) monster(n)
//
// Both lines are built here out of `lib/algebra.ts` values rather than out of
// bespoke control flow, because being able to build them that way is the claim
// this repository is testing.  What is NOT built that way is the room:
//
//   room(d,r) = round(d,r) <|* ( room(d,r) + exit(d,r) )
//
// That is recursive in its own definition, and `firm-type-tests.ts` already
// records what the compiler does about such a thing (TS7022: referenced in its
// own initializer).  The star is the difference: `<|*` means the first response
// decides which side is prompted at all, which is iteration, and iteration is a
// loop.  `engine.ts` is that loop.

import {
  type Cont, type Fib, type Runner, productC, tensorC,
} from "./lib/algebra.ts";
import { delegate, trace } from "./lib/wire.ts";
import {
  type MonsterPrompt, type MonsterReply, type Move, type Sees,
  decodeMonster, decodeTool, isRecord,
} from "./containers.ts";
import type { MonsterId } from "./spec.ts";
import { DESCRIPTION, SIGNS } from "./rooms.ts";

// ── The three sides of a round ────────────────────────────────────────
export type LookC = Fib<{ tag: "Look"; sees: Sees }, { description: string; signs: readonly string[] }>;
export type ActC = Fib<{ tag: "Act"; move: Move }, { prose: string }>;
export type SpeakC = Fib<{ tag: "Speak"; prompts: readonly MonsterPrompt[] }, readonly MonsterReply[]>;

/** Looking is a direct answerer: an event handler into the do-nothing
 *  interface.  It delegates to nobody, so it must do it all, and all it has to
 *  do is read the wall. */
export const lookRunner: Runner<LookC> = {
  label: "look",
  // deno-lint-ignore require-await
  async run(shape, _depth) {
    const room = shape.sees.room;
    return { description: DESCRIPTION[room], signs: SIGNS[room] } as never;
  },
};

/** Acting is also a direct answerer.  Moving, taking and setting down are
 *  arithmetic a person wrote; nothing is asked of anybody. */
export const actRunner: Runner<ActC> = {
  label: "act",
  // deno-lint-ignore require-await
  async run(_shape, _depth) {
    return { prose: "" } as never;
  },
};

// ── A monster is a leaf ───────────────────────────────────────────────
/** `lib/algebra.ts` ships a `leaf()` that fires a prompt down a CLI hop and
 *  validates the position that comes back.  This is that function with one
 *  difference, and the difference is §1.3 of PLAN-build.md: a monster's reply
 *  carries a position AND, separately, at most one tool call, and the tool is
 *  not part of the container.  `wire.ts` puts the depth in an HTTP header for
 *  exactly this reason — "nothing that isn't a prompt belongs in the prompt" —
 *  and the tool is that argument run in the response direction.  It is in the
 *  body rather than a header only because vendored `delegate()` hands back the
 *  parsed body and nothing else, and `lib/` is not ours to edit. */
export function monsterRunner(id: MonsterId, port: number): Runner<MonsterC> {
  return {
    label: id,
    async run(shape, depth) {
      const raw = await delegate(port, shape, depth);
      const reply = decodeMonsterReply(raw);
      if (reply === null) {
        throw new Error(`${id}/${shape.tag}: reply did not validate`);
      }
      return reply as never;
    },
  };
}

/** Two decoders, run together, and neither forgives anything.  A model that
 *  answers with an apology has not asked, told or offered; a model that names a
 *  third tool has produced a word that is in no interface.  Both are ordinary,
 *  neither is malice, and both are stopped here. */
export function decodeMonsterReply(u: unknown): MonsterReply | null {
  if (!isRecord(u)) return null;
  const tool = decodeTool(u.tool);
  if (tool === undefined) return null;
  const p = u.pos;
  const pos = decodeMonster.Ask(p) ?? decodeMonster.Tell(p) ?? decodeMonster.Offer(p);
  if (pos === null) return null;
  return { pos, tool };
}

/** The container a monster serves.  Declared here rather than imported as a
 *  value because it exists only in the types. */
type MonsterC = import("./containers.ts").MonsterC;

// ── standing(d,r) — the tensor over everybody in the room ─────────────
/** "Every monster in the room is prompted and every monster owes a reply,
 *  which is what distinguishes the tensor from the product."
 *
 *  The fold below is the combinator doing the work: `tensorC(a, b)` builds a
 *  runner whose shape is `{left, right}`, so BOTH prompts must be constructed
 *  before either is sent.  You cannot make the second prompt depend on the
 *  first reply because you had to build it first, and that is a fact about the
 *  type rather than about how the monsters happen to behave.
 *
 *  The flatten afterwards is presentation and nothing else: the nested
 *  `{left:{left:a,right:b},right:c}` is turned back into `[a,b,c]` so callers
 *  can index by the same order they passed in.  `type-tests.ts` keeps a
 *  two-monster instance at its full nested type, which is where the shape is
 *  actually checked. */
export function standingRunner(monsters: readonly Runner<MonsterC>[]): Runner<SpeakC> {
  if (monsters.length === 0) {
    return {
      label: "standing()",
      // deno-lint-ignore require-await
      async run(_s, _d) { return [] as never; },
    };
  }
  const folded = monsters
    .slice(1)
    .reduce<Runner<Cont>>(
      (acc, m) => tensorC(acc, m) as unknown as Runner<Cont>,
      monsters[0] as unknown as Runner<Cont>,
    );

  return {
    label: `standing${folded.label}`,
    async run(shape, depth) {
      const ps = shape.prompts;
      if (ps.length !== monsters.length) {
        throw new Error(`standing: ${ps.length} prompts for ${monsters.length} monsters`);
      }
      // Build the whole nested shape FIRST.  This is the tensor's defining
      // move, and the reason the loop below runs to completion before any
      // prompt is sent.
      let shp: unknown = ps[0];
      for (let i = 1; i < ps.length; i++) shp = { left: shp, right: ps[i] };
      const pos = await folded.run(shp as never, depth);
      return flatten(pos, monsters.length) as never;
    },
  };
}

function flatten(pos: unknown, n: number): MonsterReply[] {
  const out: MonsterReply[] = [];
  let cur = pos;
  for (let i = n - 1; i >= 1; i--) {
    const r = cur as { left: unknown; right: MonsterReply };
    out.unshift(r.right);
    cur = r.left;
  }
  out.unshift(cur as MonsterReply);
  return out;
}

// ── round(d,r) = look x standing x move ───────────────────────────────
/** The product is "both offered, answer one", and a container does not choose
 *  — the program implementing `(p : P) -> R p` does.  For a round that program
 *  is the player, so the player's move is what `choose` reads.  Every side is
 *  offered a prompt and exactly one of them is answered.
 *
 *  Note the order of events.  The player is prompted first, on its own leaf, and
 *  the move it returns is then what selects the summand.  That is not a
 *  sequence smuggled into a product: the product's shape still carries a prompt
 *  for all three sides, all three are still built before anything is run, and
 *  exactly one position comes back. */
export type RoundResult =
  | { readonly kind: "look"; readonly description: string; readonly signs: readonly string[] }
  | { readonly kind: "speak"; readonly replies: readonly MonsterReply[] }
  | { readonly kind: "act" };

const sideOf = (m: Move): "look" | "speak" | "act" =>
  m.tag === "Look" ? "look"
    : (m.tag === "Ask" || m.tag === "Tell" || m.tag === "Offer") ? "speak"
    : "act";

export async function runRound(
  standing: Runner<SpeakC>,
  sees: Sees,
  prompts: readonly MonsterPrompt[],
  move: Move,
  depth: number,
): Promise<RoundResult> {
  const side = sideOf(move);
  const inner = productC(standing, actRunner, () => side === "speak" ? "a" : "b");
  const outer = productC(lookRunner, inner, () => side === "look" ? "a" : "b");

  // All three sides are given a prompt before anything runs.  Exactly one
  // position comes back, and which one is the player's answer.
  const shape = outer.offer(
    { tag: "Look" as const, sees },
    inner.offer({ tag: "Speak" as const, prompts }, { tag: "Act" as const, move }),
  );
  const pos = await outer.run(shape, depth);

  if (pos.side === "a") {
    const v = pos.value as { description: string; signs: readonly string[] };
    return { kind: "look", description: v.description, signs: v.signs };
  }
  const innerPos = pos.value as { side: "a" | "b"; value: unknown };
  return innerPos.side === "a"
    ? { kind: "speak", replies: innerPos.value as readonly MonsterReply[] }
    : { kind: "act" };
}

export function announceRound(label: string, depth: number) {
  trace(depth, "down", "round", label);
}
