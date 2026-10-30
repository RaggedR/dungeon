// reconcile.ts — the two logs, read against each other.
//
//   deno run -A reconcile.ts            the scripted party, deterministic, free
//   deno run -A reconcile.ts --agent    a model plays it, live
//
// A gold demo keeps two logs and the point is in crossing them.  Layer 1 is the
// SHIP'S LOG — `trace.ts`, tapping the one `IO` seam, recording every move the
// engine ran and every tool a monster reached for.  It is the WHAT.  Layer 2 is
// the INTENT LOG — `intent-log.ts`, written by the player leaf, one reason per
// move, write-ahead.  It is the WHY.
//
// Two things fall out of crossing them, and the second is the whole reason there
// are two:
//
//   ALARM    a move the ship's log shows executed, with no reason in the intent
//            log beside it.  This must never happen.  The reason-gate refuses an
//            empty reason before the move is logged and so before it reaches the
//            engine, so a move with no WHY cannot be made through this driver —
//            and here is the cross-check that says so, as a number.
//
//   BLOCKED  a move the party MADE and the world REFUSED.  The ship's log cannot
//            show this: it records the move and the monster's tool, but whether
//            the table honoured the tool depends on `spec.ts`, which the trace
//            never consults — so a refused trade and an accepted one look
//            identical in Layer 1.  The intent log can show it, because the
//            refusal comes back in the world's own words on the next turn, and
//            the player wrote down why it tried.  That asymmetry is why the
//            reason cannot simply be a column on the ship's log.

import { type Ev, mkSink, playRecorded, rounds } from "./trace.ts";
import { mkGame } from "./harness.ts";
import type { Driver } from "./harness.ts";
import type { Move, Sees } from "./containers.ts";
import {
  type IntentEntry, type IntentLog, intentHook, mkIntentLog, realClock,
} from "./intent-log.ts";
import { agentDriver, tally } from "./player-claude.ts";
import { TRIP_ONE, TRIP_TWO } from "./game_test.ts";

const SHIPS_LOG = "ships-log.jsonl";
const INTENT_LOG = "player-intent.jsonl";

// ── The scripted stand-in — a deterministic party with honest reasons ─────
// This is the dual of `leaf-stub.ts`: not a model and not pretending to be one.
// It exists so the two-log machinery can be exercised with no network, no key
// and the same bytes twice — which is the only way `verify.sh` can gate on it.
// The reasons are mechanical and true; a scripted move's honest WHY is a plain
// statement of the move.
const WINNING: Move[] = [
  ...TRIP_ONE,
  ...TRIP_TWO,
  { tag: "Substitute", who: "Bēl-šunu" },
  { tag: "Go", to: "1.A" },
  { tag: "Go", to: "0.A" },
  { tag: "Quit" },
];

function reasonFor(m: Move): string {
  switch (m.tag) {
    case "Ask": return `ask ${m.who} what the writing says: "${m.words}"`;
    case "Tell": return `say to ${m.who} what was learned elsewhere: "${m.words}"`;
    case "Offer": return `hold out what is carried to ${m.who} and let them take what they want`;
    case "Take": return `pick up the ${m.item}`;
    case "Drop": return `set down the ${m.item}`;
    case "Go": return `walk to ${m.to}`;
    case "Substitute": return `leave ${m.who} with him, which is the Tablet's fourth price`;
    case "Look": return "read the room again";
    case "Quit": return "the Tablet is up; walk out";
  }
}

function reasonedScripted(steps: readonly Move[], log: IntentLog): Driver {
  let i = 0;
  return {
    // deno-lint-ignore require-await
    async choose(sees: Sees): Promise<Move> {
      const move = steps[i++] ?? { tag: "Quit" as const };
      log.record({
        room: sees.room,
        awaiting: sees.awaiting,
        heardBefore: sees.heard,
        move,
        reason: reasonFor(move),
      });
      return move;
    },
    say() {},
  };
}

// ── The cross-check, as a pure function over the two logs ─────────────────
export interface Blocked {
  readonly turn: number;
  readonly move: Move;
  readonly words: string;
}
export interface Report {
  readonly executed: number;
  readonly reasoned: number;
  readonly alarms: { readonly turn: number; readonly note: string; readonly move: Move | null }[];
  readonly blocked: Blocked[];
}

/** The engine's own refusals, in its own words (`engine.ts`).  These are leaf-
 *  independent: a shut way is shut whoever stands at it, a full hand is full
 *  whatever a monster says.  A trade a monster declines in free prose is not in
 *  this list and may not be classified — see the note the report prints. */
const REFUSALS = [
  "is shut, and",
  "There is no way through there",
  "No hand is free",
  "There is no such thing here",
  "You are not carrying that",
  "Nobody has asked you for that",
  "He is waiting for a name",
  "Nobody of that name is standing here",
  "It will not fit in the hands",
  "puts the Tablet back",
  "I want nothing you are holding", // the stub's decline; a real monster varies
];
const isRefusal = (line: string) => REFUSALS.some((r) => line.includes(r));

export function reconcile(evs: readonly Ev[], why: readonly IntentEntry[]): Report {
  // One round per `choose`, one WHY per decision; both are per-choose and in the
  // same order, so they align by index.  `rounds()` is deliberately naive and
  // will produce a mis-shaped round if the engine ever double-chooses, which is
  // exactly what we want it to surface rather than smooth over.
  const executed = rounds(evs).map((r) => r.move).filter((m): m is Move => m !== null);

  const alarms: Report["alarms"] = [];
  for (let i = 0; i < executed.length; i++) {
    const w = why[i];
    if (w === undefined) {
      alarms.push({ turn: i + 1, note: "move executed with no reason logged", move: executed[i] });
    } else if (JSON.stringify(w.move) !== JSON.stringify(executed[i])) {
      alarms.push({ turn: i + 1, note: `intent log and ship's log disagree on the move`, move: executed[i] });
    }
  }

  // Blocked: turn N's `heardBefore` is the world's answer to move N-1.  A refusal
  // phrase there means the previous move was refused — information no row of the
  // ship's log carries.
  const blocked: Blocked[] = [];
  for (let j = 1; j < why.length; j++) {
    for (const line of why[j].heardBefore) {
      if (isRefusal(line)) {
        blocked.push({ turn: j, move: why[j - 1].move, words: line });
      }
    }
  }
  return { executed: executed.length, reasoned: why.length, alarms, blocked };
}

// ── Running a recorded game and printing the crossing ─────────────────────
const describe = (m: Move): string =>
  m.tag === "Ask" || m.tag === "Tell"
    ? `${m.tag} ${m.who} "${m.words.slice(0, 40)}${m.words.length > 40 ? "…" : ""}"`
    : m.tag === "Offer"
    ? `Offer ${m.who}`
    : m.tag === "Go"
    ? `Go ${m.to}`
    : m.tag === "Take" || m.tag === "Drop"
    ? `${m.tag} ${m.item}`
    : m.tag === "Substitute"
    ? `Substitute ${m.who}`
    : m.tag;

if (import.meta.main) {
  const live = Deno.args.includes("--agent");
  const g = mkGame();
  const sink = mkSink();
  // Live run → a real clock (never a false, fixed stamp on a real audit).
  // Scripted run → no clock at all, so the bytes are identical twice.
  const log = mkIntentLog({ path: INTENT_LOG, clock: live ? realClock : undefined });

  const drv: Driver = live
    ? agentDriver({
      onDecision: intentHook(log),
      maxTurns: Number(Deno.env.get("LABYRINTH_MAX_TURNS") ?? "200"),
    })
    : reasonedScripted(WINNING, log);

  const res = await playRecorded(g, drv, sink);

  // Persist the ship's log beside the intent log, so a stranger can `cat` both.
  Deno.writeTextFileSync(SHIPS_LOG, sink.evs.map((e) => JSON.stringify(e)).join("\n") + "\n");

  const rep = reconcile(sink.evs, log.entries());

  const rule = (s: string) => console.log(`\n${s}\n${"─".repeat(s.length)}`);
  rule("Reconciliation — WHY × WHAT");
  console.log(`ship's log (WHAT):   ${SHIPS_LOG}   — ${sink.evs.length} events, ${rep.executed} moves`);
  console.log(`intent log (WHY):    ${INTENT_LOG}   — ${rep.reasoned} reasons`);
  console.log();
  console.log(
    rep.alarms.length === 0
      ? `ALARMS:  0   ✓  every move the ship's log shows executed has a reason beside it`
      : `ALARMS:  ${rep.alarms.length}   ✗`,
  );
  for (const a of rep.alarms) console.log(`  turn ${a.turn}: ${a.note}${a.move ? ` — ${describe(a.move)}` : ""}`);

  rule(`BLOCKED — ${rep.blocked.length} move${rep.blocked.length === 1 ? "" : "s"} the world refused, legible only in the WHY log`);
  if (rep.blocked.length === 0) {
    console.log("  (none this run)");
  } else {
    for (const b of rep.blocked) console.log(`  turn ${b.turn}  ${describe(b.move).padEnd(22)} » ${b.words}`);
  }
  console.log(
    "\n  Basis: the engine's own refusals — a shut way, a full hand — are leaf-\n" +
    "  independent and always classified.  A trade a monster declines in its own\n" +
    "  prose may not be, and is not counted here rather than guessed at.",
  );

  const won = res.party.held.includes("foundation-tablet");
  rule("Outcome");
  console.log(
    won
      ? `The Foundation Tablet came up. ${res.party.who.length} of the three returned.`
      : `No Tablet. ${res.party.who.length} walked out, exit=${res.exit}.`,
  );

  if (live) {
    rule("What the player decoder cost, as a number");
    const rejected = tally.asked - tally.decoded;
    console.log(
      `asked ${tally.asked}, decoded ${tally.decoded}, re-asked ${tally.reasked}, ` +
      `rejected outright ${rejected}`,
    );
    for (const [cause, n] of tally.causes) console.log(`  ${n}× ${cause}`);
  }

  Deno.exit(rep.alarms.length === 0 ? 0 : 1);
}
