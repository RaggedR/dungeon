// intent-log.ts — the WHY layer, which is the one thing the ship's log cannot be.
//
// `trace.ts` is the WHAT layer: it taps the single `IO` seam and records, as
// data, every move the engine ran and every tool a monster reached for.  What it
// cannot record is WHY the player made a move, because the reason is formed in
// the leaf — on the far side of the seam — and never crosses it.  A reason is
// not a position of any container in this game; it is the player's, and it stays
// with the player unless something writes it down.  This file writes it down.
//
// The discipline is the gold two-log discipline:
//
//   • WRITE-AHEAD.  The reason is appended the instant the move is decoded and
//     BEFORE the move is handed to the engine, so a crash mid-move still leaves
//     the intent on disk.  The reconciler's whole alarm — "a move committed with
//     no logged reason" — is only meaningful if the reason is written first.
//   • THE REASON IS HARD, NOT SOFT.  An empty reason is refused here, a second
//     time (the decoder refused it first).  A move with no WHY never reaches the
//     log, so it can never reach the engine through this driver.
//   • DETERMINISM IS A SEAM.  A scripted replay stamps no clock, so its log is
//     byte-identical twice.  A live run stamps a real ISO time, because a live
//     audit that carried a false, fixed timestamp would be the exact dishonesty
//     the reconciliation exists to catch (starship PR #1).

import type { Move, Sees } from "./containers.ts";

/** The clock is injected, never ambient.  `fixedClock` for scripted replay
 *  (no timestamp at all, so the bytes do not move); `realClock` for a live run. */
export interface Clock {
  now(): string | null;
}
export const fixedClock: Clock = { now: () => null };
export const realClock: Clock = { now: () => new Date().toISOString() };

/** One decision, as the WHY layer records it.
 *
 *  `heardBefore` is what the world said since the party's last decision — the
 *  OUTCOME of the previous move, in the world's own words ("the way to 3.B is
 *  shut", "I want nothing you are holding").  It rides here because it is the
 *  only place a refusal is legible: the WHAT log shows the move and the tool,
 *  never whether the table honoured it.  Attributing turn N's `heardBefore` to
 *  turn N-1's move is the reconciler's job, not this file's. */
export interface IntentEntry {
  readonly seq: number; // the agent's own turn counter, monotone from 1
  readonly room: string;
  readonly awaiting: "move" | "name";
  readonly heardBefore: readonly string[];
  readonly move: Move;
  readonly reason: string;
  /** live only; absent on a scripted replay so the bytes are stable */
  readonly at?: string;
}

export interface IntentLog {
  /** Append a decision, write-ahead.  Returns the full entry (with the clock's
   *  stamp, if any) so a caller can also show it live. */
  record(d: { room: string; awaiting: "move" | "name"; heardBefore: readonly string[]; move: Move; reason: string }): IntentEntry;
  entries(): readonly IntentEntry[];
}

export function mkIntentLog(opts: { path?: string | null; clock?: Clock } = {}): IntentLog {
  const clock = opts.clock ?? fixedClock;
  let path = opts.path ?? null;
  const evs: IntentEntry[] = [];
  let seq = 0;

  if (path) {
    // Start the file fresh: an append-only log of ONE run, not a growing midden.
    // A write that is simply not permitted must not take the game down with it —
    // the WHY still lives in memory and in the narration. Degrade to memory-only
    // and say so once, rather than throw mid-move (the audit must never be able
    // to crash the thing it audits).
    try {
      try { Deno.removeSync(path); } catch { /* first run, or nothing to remove */ }
      Deno.writeTextFileSync(path, "");
    } catch (e) {
      const why = e instanceof Deno.errors.NotCapable ? "no write permission" : String(e);
      Deno.stderr.writeSync(new TextEncoder().encode(
        `\x1b[2mintent-log: ${path} not writable (${why}); keeping the WHY in memory only\x1b[0m\n`,
      ));
      path = null;
    }
  }

  return {
    record(d) {
      if (d.reason.trim() === "") {
        // The hard reason-gate, a second time.  Never let a move be logged — and
        // so never let it reach the engine through this driver — without a WHY.
        throw new Error("intent-log: a move with an empty reason is refused");
      }
      const at = clock.now();
      const e: IntentEntry = {
        seq: ++seq,
        room: d.room,
        awaiting: d.awaiting,
        heardBefore: d.heardBefore,
        move: d.move,
        reason: d.reason.trim(),
        ...(at === null ? {} : { at }),
      };
      evs.push(e);
      if (path) {
        try {
          Deno.writeTextFileSync(path, JSON.stringify(e) + "\n", { append: true });
        } catch {
          path = null; // stop trying; the WHY is still in `evs` and the narration
        }
      }
      return e;
    },
    entries() {
      return evs;
    },
  };
}

/** Read a persisted intent-log back (for `reconcile.ts` run as a separate pass
 *  over a live run's artifacts). */
export function readIntentLog(path: string): IntentEntry[] {
  const text = Deno.readTextFileSync(path);
  return text.split("\n").filter((l) => l.trim() !== "").map((l) => JSON.parse(l) as IntentEntry);
}

/** The write-ahead hook `player-claude.ts` wants: given a log, return an
 *  `onDecision` that records the reason the instant it is decoded, pulling the
 *  outcome-of-the-previous-move out of the `sees` the engine just handed over. */
export function intentHook(log: IntentLog) {
  return (d: { reason: string; move: Move }, sees: Sees): void => {
    log.record({
      room: sees.room,
      awaiting: sees.awaiting,
      heardBefore: sees.heard,
      move: d.move,
      reason: d.reason,
    });
  };
}
