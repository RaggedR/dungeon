// derivative.ts — ∂, a candidate fifth combinator.
//
// The four of §5 build composites: `+` routes, `⊠` parallelises, `×` offers,
// `◁` sequences. All four are *total*: a composite prompt is answered when
// every sub-prompt it fired has come back. There is no vocabulary for the
// state in between — a composite with every answer in except one. That state
// is a stack frame inside `run`, and it dies with the process holding it.
//
// ∂ is the name for it. For a container ψ = (S, P),
//
//     ∂ψ  =  ( Σ (s : S). P s ,   λ (s, p). P s \ {p} )
//
// a shape is a prompt together with a distinguished position — the hole — and
// the positions are the ones that remain. The classical reading is McBride's:
// the derivative of a regular type is its type of one-hole contexts. The
// reading that earns it a place *here* is operational:
//
//     ∂C is a composite prompt with exactly one outstanding delegation.
//
// Three things follow that the four cannot express.
//
//   1. Suspension. A half-finished turn becomes a value. It can be written to
//      disk, logged, or handed to another process, because it is data rather
//      than a continuation.
//   2. Localisation. When one leaf fails — a socket times out, a decoder
//      rejects — you hold ∂C with the hole exactly at the failing position.
//      You know *which* hop is missing, in the type.
//   3. Repair. `plug` fills the hole and returns the completed labelling, so
//      one leaf can be re-fired without re-running the others.
//
// This file is NOT part of lib/. lib/ is vendored unmodified into tower,
// stalin, firm and dungeon, and the fourth reuse is the test of whether it is
// a library; editing it to add a fifth combinator would forfeit that test. ∂
// lives outside until it has earned its way in — which means until the
// calculus laws below hold for it.

import type {
  Cont,
  Fib,
  PosAt,
  ProductC,
  SeqC,
  Shape,
  SumC,
  TensorC,
} from "./lib/algebra.ts";

// ── The operation ─────────────────────────────────────────────────────

/** ∂ — the derivative. Shapes are (prompt, hole); positions are the rest.
 *
 *  Both conditionals distribute: the outer one over the fibres of C, the inner
 *  one over the *positions* of each fibre. That inner distribution is the
 *  whole construction, and it is also its precondition — see LEAKS below. A
 *  position type that is a union of n literals yields n fibres, one per hole.
 *  A position type that is not a union yields exactly one fibre, whose hole is
 *  the entire response and whose remainder is `never`. */
export type DerivC<C extends Cont> = C extends Fib<infer S, infer P>
  ? DerivFib<S, P, P>
  : never;

/** The fibres of ∂ over ONE fibre of C. `All` is the whole position union and
 *  `P` is the one being distributed over — and they must be separate
 *  parameters, which is the trap in this construction.
 *
 *  Writing the obvious `P extends infer H ? Fib<{at:S; hole:H}, Exclude<P,H>>`
 *  yields `never` positions everywhere. Distribution does not merely bind `H`
 *  to each member; it substitutes that member for the type parameter
 *  THROUGHOUT the true branch. So in the branch where `H = "p"`, the `P` in
 *  `Exclude<P, H>` has also become `"p"`, and `Exclude<"p","p">` is `never`.
 *  The remainder has to be computed against a union the distribution cannot
 *  reach, which is what `All` is for. */
type DerivFib<S, P, All> = P extends infer H
  ? Fib<{ at: S; hole: H }, Exclude<All, H>>
  : never;

/** Ṗ — the pointed container. Same shapes as ∂, but *every* position survives:
 *  a prompt with a distinguished position and nothing removed. This is the
 *  right-hand side of the plug law. */
export type PointedC<C extends Cont> = C extends Fib<infer S, infer P>
  ? PointedFib<S, P, P>
  : never;

type PointedFib<S, P, All> = P extends infer H ? Fib<{ at: S; hole: H }, All>
  : never;

// ── Labellings, and the plug isomorphism ──────────────────────────────

/** A labelling of the positions over one shape: the data slotted into the
 *  container. `run` produces a single position; a labelling is the function
 *  that says what is stored at each one. */
export type Label<P, X> = (p: P) => X;

/** Positions must be comparable for ∂ to have a value-level meaning: `plug`
 *  has to decide, given a position, whether it is *the* hole. In Lean or Agda
 *  this is the `DecidableEq` side condition; here it is a witness passed in.
 *  It is not a technicality — without it ∂ exists as a type and computes
 *  nothing. */
export type DecEq<P> = (a: P, b: P) => boolean;

/** plug : ∂ψ(X) × X → ψ̇(X)
 *
 *  Alastair Poole, *Polynomial Agentic Networks*, Prop. 3.13: "a task with a
 *  distinguished missing port and a replacement value reconstructs uniquely a
 *  populated task". Here: a labelling of everything but the hole, plus a value
 *  for the hole, is a labelling of everything. */
export function plug<P, H extends P, X>(
  eq: DecEq<P>,
  hole: H,
  rest: Label<Exclude<P, H>, X>,
  value: X,
): Label<P, X> {
  return (p: P) => eq(p, hole) ? value : rest(p as Exclude<P, H>);
}

/** unplug : ψ̇(X) → ∂ψ(X) × X — the inverse. Read off the value at the hole,
 *  and restrict the labelling to the remaining positions. */
export function unplug<P, H extends P, X>(
  hole: H,
  full: Label<P, X>,
): { rest: Label<Exclude<P, H>, X>; value: X } {
  return {
    rest: (p: Exclude<P, H>) => full(p as P),
    value: full(hole),
  };
}

// ── A pending composite, operationally ────────────────────────────────

/** The state the four combinators cannot name: a composite prompt, the answers
 *  already gathered, and the one position still owed.
 *
 *  `at` and `hole` are exactly the shape of ∂C, which is the point — this
 *  interface is not a new idea, it is `Shape<DerivC<C>>` with the gathered
 *  labelling attached and a reason recorded. */
export interface Pending<C extends Cont, S extends Shape<C>, X> {
  readonly at: S;
  readonly hole: PosAt<C, S>;
  readonly gathered: Label<Exclude<PosAt<C, S>, PosAt<C, S>>, X>;
  /** Why this position is still outstanding: a timeout, a decoder rejection,
   *  a deliberate suspension. Not part of ∂; part of being able to act on it. */
  readonly reason: string;
}

/** Complete a pending composite. The `eq` witness is the DecidableEq side
 *  condition made explicit at the call site. */
export function resume<C extends Cont, S extends Shape<C>, X>(
  eq: DecEq<PosAt<C, S>>,
  pending: Pending<C, S, X>,
  value: X,
): Label<PosAt<C, S>, X> {
  return plug(eq, pending.hole, pending.gathered, value);
}

// ── The calculus, and where it leaks ──────────────────────────────────
//
// ∂ deserves a place beside the four only if it composes with them. The three
// laws to want are the usual ones:
//
//     ∂(A + B)  ≅  ∂A + ∂B                     (sum)
//     ∂(A × B)  ≅  (∂A × B) + (A × ∂B)          (Leibniz)
//     ∂(A ◁ B)  ≅  (∂A ◁ B) × ∂B                (chain)
//
// They hold up to a shape isomorphism, never definitionally: ∂ of a composite
// tags its shapes `{ at: { side, value }, hole }` where the composite of the
// ∂s tags them `{ side, value: { at, hole } }`. Same information, different
// spelling. The witnesses below are that re-spelling and nothing more.
//
// LEAKS — and this is the honest finding, not a caveat.
//
// `Exclude<P, H>` removes a member from a UNION. So ∂ computes exactly when a
// container's position type is a finite union of literals, which is the same
// hypothesis the library already relies on for its shapes ("every prompt set
// in this game is finite, and over a finite index a function from values to
// types is a lookup table").
//
//   `+` positions are inherited unmodified.       ∂ works, and it is the ONLY
//        one of the four that works without help — precisely because it is the
//        only combinator that does not reshape the position type.
//   `×` positions are a SUM by SIDE, {side:"a";value:PA} | {side:"b";value:PB}
//        — two members, each holding a union in its `value` field. `Exclude`
//        sees two members, so ∂ removes a whole side rather than a position.
//        `Spread` below repairs it, and then Leibniz holds.
//   `⊠` positions are a PRODUCT, {left: PA; right: PB}.  ∂ degenerates: the
//        type is not a union, so there is one fibre whose hole is the entire
//        pair and whose remainder is `never`. That is not the tensor's
//        derivative; it is the statement that a pair has one position.
//   `◁` positions are a PRODUCT, {first: PA; second: PB}. Same degeneracy, so
//        the chain rule is not expressible here as written.
//
// The repair is the same move the library made for shapes: present the
// position set as its graph too — the union of its inhabitants — so that
// {left, right} becomes the union over (l, r) of the singleton {left:l;right:r}.
// That requires PA and PB to be finite unions of literals, which is true of
// every leaf container in this game and false in general. Until that is done,
// ∂ is a combinator for `+` and `×` and a degenerate one for `⊠` and `◁`,
// and it has not earned a place in lib/.

/** Type-level equality, for stating the laws as compile-time assertions. */
export type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends
  (<T>() => T extends B ? 1 : 2) ? true : false;

export type Assert<T extends true> = T;

// Sum rule, as an isomorphism of shapes. Both sides carry a side-tag, a
// summand shape and a hole; they differ only in nesting.
export type SumRuleLHS<A extends Cont, B extends Cont> = Shape<
  DerivC<SumC<A, B>>
>;
export type SumRuleRHS<A extends Cont, B extends Cont> = Shape<
  SumC<DerivC<A>, DerivC<B>>
>;

/** Witness for the sum rule, left to right. A hole in a routed prompt is a
 *  hole in whichever summand was routed to. */
export function sumRule<SA, SB, H>(
  lhs: {
    at: { side: "left"; value: SA } | { side: "right"; value: SB };
    hole: H;
  },
): { side: "left"; value: { at: SA; hole: H } } | {
  side: "right";
  value: { at: SB; hole: H };
} {
  return lhs.at.side === "left"
    ? { side: "left", value: { at: lhs.at.value, hole: lhs.hole } }
    : { side: "right", value: { at: lhs.at.value, hole: lhs.hole } };
}

/** Witness for Leibniz, left to right. `×` offers both and answers one, so its
 *  positions are already a sum — and a hole lands in exactly one side. The
 *  content of the product rule here is that the OTHER side is untouched, which
 *  is why the result keeps both shapes and marks only one of them. */
export function leibniz<SA, SB, PA, PB>(
  lhs: {
    at: { a: SA; b: SB };
    hole: { side: "a"; value: PA } | { side: "b"; value: PB };
  },
):
  | { side: "left"; value: { a: { at: SA; hole: PA }; b: SB } }
  | { side: "right"; value: { a: SA; b: { at: SB; hole: PB } } } {
  return lhs.hole.side === "a"
    ? {
      side: "left",
      value: { a: { at: lhs.at.a, hole: lhs.hole.value }, b: lhs.at.b },
    }
    : {
      side: "right",
      value: { a: lhs.at.a, b: { at: lhs.at.b, hole: lhs.hole.value } },
    };
}

// The degeneracies, recorded as assertions so that a future change to the
// encoding breaks a test rather than silently starting to work. Both say: a
// product-shaped position type has exactly one hole and no remainder.
type TensorFib = TensorC<Fib<"a", "p" | "q">, Fib<"b", "r" | "s">>;
type SeqFib = SeqC<Fib<"a", "p" | "q">, Fib<"b", "r" | "s">>;

export type TensorDegenerates = Assert<
  Equal<PosAt<DerivC<TensorFib>, Shape<DerivC<TensorFib>>>, never>
>;
export type SeqDegenerates = Assert<
  Equal<PosAt<DerivC<SeqFib>, Shape<DerivC<SeqFib>>>, never>
>;

// And the positive cases, which do not degenerate.
type SumFib = SumC<Fib<"a", "p" | "q">, Fib<"b", "r" | "s">>;
type ProdFib = ProductC<Fib<"a", "p" | "q">, Fib<"b", "r" | "s">>;

export type SumSurvives = Assert<
  Equal<
    PosAt<DerivC<SumFib>, { at: { side: "left"; value: "a" }; hole: "p" }>,
    "q"
  >
>;
export type ProductRemovesASide = Assert<
  Equal<
    PosAt<
      DerivC<ProdFib>,
      { at: { a: "a"; b: "b" }; hole: { side: "a"; value: "p" | "q" } }
    >,
    { side: "b"; value: "r" | "s" }
  >
>;

// ── The repair: normalise the position union ──────────────────────────
//
// ProductC's positions are a union of TWO members, one per side, each holding
// a union in its `value` field. `Exclude` sees two members, so ∂ removes a
// whole side. That is not the derivative; it is the derivative of a two-
// position container whose positions happen to be named "side a" and "side b".
//
// The fix is the move the library already made for shapes: present the set as
// its graph — one member per inhabitant — by distributing the inner union out.
// With positions so normalised, ∂ computes the true derivative and Leibniz
// holds: a hole on one side leaves that side's remainder plus all of the other.

/** Push a union out of the `value` field, so `{side:"a"; value:"p"|"q"}`
 *  becomes `{side:"a"; value:"p"} | {side:"a"; value:"q"}`. The inner
 *  `V extends V` is the idiom that forces distribution over an inferred union. */
export type Spread<P> = P extends { side: infer Sd; value: infer V }
  ? (V extends V ? { side: Sd; value: V } : never)
  : P;

/** ∂ over a container whose positions have been normalised first. */
export type DerivNormC<C extends Cont> = C extends Fib<infer S, infer P>
  ? DerivFib<S, Spread<P>, Spread<P>>
  : never;

/** With normalisation, a hole at one position of side `a` leaves the OTHER
 *  position of `a` together with both positions of `b`. That is Leibniz:
 *  ∂(A × B) = ∂A × B + A × ∂B, read off one summand at a time. */
export type LeibnizHolds = Assert<
  Equal<
    PosAt<
      DerivNormC<ProdFib>,
      { at: { a: "a"; b: "b" }; hole: { side: "a"; value: "p" } }
    >,
    { side: "a"; value: "q" } | { side: "b"; value: "r" } | {
      side: "b";
      value: "s";
    }
  >
>;
