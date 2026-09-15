// type-tests.ts — the things the compiler is supposed to refuse.
//
//   deno check type-tests.ts
//
// A test that only ever passes is not a test, so every claim below is made
// twice: once positively, and once as a `@ts-expect-error` that FAILS THE BUILD
// IF THE ERROR STOPS HAPPENING.  `deno check` therefore fails in both
// directions, which is the only way a type test is worth having.
//
// This file is never run.  It exists entirely at compile time.

import type { Fib, PosAt, Shape, TensorC } from "./lib/algebra.ts";
import { tensorC } from "./lib/algebra.ts";
import type { AskR, MonsterC, OfferR, TellR, Tool } from "./containers.ts";
import type { Party } from "./party.ts";
import { monsterRunner } from "./flow.ts";

// ── 1. A secret does not travel in the prompt ─────────────────────────
// "A relic is in the type.  A secret is only in the player's head."  There is
// nowhere in the party record to put one, and this is what keeps it that way
// when somebody later adds a convenience.
const _travels: Party = { who: ["Nidintu"], held: ["foundation-tablet"] };

// @ts-expect-error a secret is prose and has no place in the party record
const _leaks: Party = { who: ["Nidintu"], held: [], secrets: ["S1"] };

// @ts-expect-error nor under any other name
const _leaksToo: Party = { who: ["Nidintu"], held: [], known: ["S1"] };

// ── 2. The dependent lookup ───────────────────────────────────────────
// Three prompts and three different response types.  Which one you get is
// fixed by what you asked, and `PosAt` is the lookup that fixes it.
type AskShape = { tag: "Ask"; to: "M8"; words: string };
type OfferShape = { tag: "Offer"; to: "M8"; held: readonly [] };

const _askOwes: PosAt<MonsterC, AskShape> = { prose: "mu is name.", answered: true };
const _offerOwes: PosAt<MonsterC, OfferShape> = { prose: "no", traded: false };

// @ts-expect-error asking gets you English and a boolean, not `traded`
const _wrongWay: PosAt<MonsterC, AskShape> = { prose: "mu is name.", traded: true };

// @ts-expect-error and the reverse is just as wrong
const _wrongWayBack: PosAt<MonsterC, OfferShape> = { prose: "no", answered: false };

// ── 3. The handler table is generated from the container ──────────────
// "The keys of that table are not a list somebody maintained.  They are the
// prompts of the container, so the table cannot fall out of step with it."
type Tag = Shape<MonsterC>["tag"];
type At<K extends Tag> = Extract<Shape<MonsterC>, { tag: K }>;
type Handlers = { [K in Tag]: (p: At<K>) => PosAt<MonsterC, At<K>> };

const _whole: Handlers = {
  Ask: (p) => ({ prose: `You said: ${p.words}`, answered: true }),
  Tell: () => ({ prose: "", accepted: false }),
  Offer: () => ({ prose: "I want nothing you are holding.", traded: false }),
};

// @ts-expect-error TS2741: 'Offer' is missing — the table is incomplete
const _partial: Handlers = {
  Ask: (p) => ({ prose: p.words, answered: true }),
  Tell: () => ({ prose: "", accepted: false }),
};

// The decoders are the same mapped type, one entry per prompt.  Delete one and
// the program does not build.
type Decoders = { [K in Tag]: (u: unknown) => PosAt<MonsterC, At<K>> | null };

// @ts-expect-error TS2741: 'Tell' is missing
const _halfDecoded: Decoders = {
  Ask: (u) => u as AskR,
  Offer: (u) => u as OfferR,
};

// ── 4. There is no third tool ─────────────────────────────────────────
const _open: Tool = { tag: "open_door" };
const _trade: Tool = { tag: "trade" };
const _nothing: Tool = null;

// @ts-expect-error a monster that summons has not surprised the game — it has
// failed to respond within its own container, and the failure is a build error
const _summon: Tool = { tag: "summon" };

// ── 5. A room is a tensor, and both replies are owed ──────────────────
// The nested shape is what `standingRunner` folds, and it is checked here at
// its full type because the fold in `flow.ts` erases it to `Runner<Cont>`.
const _pair = tensorC(monsterRunner("M12", 9112), monsterRunner("M13", 9113));
type Pair = TensorC<MonsterC, MonsterC>;
type PairShape = { left: AskShape; right: AskShape };

// Both prompts are supplied UP FRONT.  That is the tensor, and it is why the
// second prompt cannot depend on the first reply: you had to build it first.
const _bothAsked: Shape<Pair> = {
  left: { tag: "Ask", to: "M12", words: "what is gi?" },
  right: { tag: "Ask", to: "M13", words: "what is gi?" },
};

// And both replies are owed.  This is the line that distinguishes the tensor
// from the product, where exactly one side answers.
const _bothOwed: PosAt<Pair, PairShape> = {
  left: { prose: "gi is reed.", answered: true },
  right: { prose: "", answered: false },
};

// @ts-expect-error TS2741: 'right' is missing.  One reply is not a tensor.
const _oneOwed: PosAt<Pair, PairShape> = {
  left: { prose: "gi is reed.", answered: true },
};

// ── 6. The room is not a value, and that is why `engine.ts` is a loop ─
// `room(d,r) = round(d,r) <|* ( room(d,r) + exit(d,r) )` is recursive in its own
// definition.  Written as a value it is the same diagnostic `firm` records for
// the feedback edge and `federation` records for the ring:
//
//   const room = seqC(round, sumC(room, exit));
//   TS7022: 'room' implicitly has type 'any' because it does not have a type
//           annotation and is referenced directly or indirectly in its own
//           initializer.
//
// The four combinators build trees.  The star is what is not a tree, and a
// starred sequence is iteration.  `runLevel` is that iteration.

export type _Checked = [
  typeof _travels, typeof _askOwes, typeof _offerOwes, typeof _whole,
  typeof _open, typeof _trade, typeof _nothing, typeof _pair,
  typeof _bothAsked, typeof _bothOwed,
  typeof _leaks, typeof _leaksToo, typeof _wrongWay, typeof _wrongWayBack,
  typeof _partial, typeof _halfDecoded, typeof _summon, typeof _oneOwed,
  TellR,
];
