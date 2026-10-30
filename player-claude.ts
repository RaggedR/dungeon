// player-claude.ts — the oracle at the PLAYER leaf, and the wrapper that makes
// its type a promise kept.
//
// This is the dual of `leaf-claude.ts`.  There, a model answers *as an
// inhabitant*: `(MonsterPrompt) → MonsterReply`.  Here a model plays *the
// party*: `(Choose{sees}) → Move`.  `round(d,r) = look × standing × move` is a
// product — three things offered, exactly one answered — and the program that
// implements it is the player.  So the player is a leaf of this tower exactly as
// a monster is: prompted with a room, owing a move whose type was fixed before
// the prompt went out.
//
// And a raw LLM is untyped.  Presenting it as `(sees) → Move` is a PROMISE, made
// good by the decoder below.  Nothing here forgives anything: a reply that does
// not decode throws, and the turn is counted against its cause.  A default would
// turn an unchecked type into a checked-looking one, which is worse than a crash.
//
// THE NOTEBOOK IS THE TRANSCRIPT, AND THAT IS THE WHOLE POINT.  `play.ts` refuses
// to keep a list of the secrets the party has been told, because a sorted,
// searchable list is the table filled in on the player's behalf, and discovering
// the table is how the game is won.  This file obeys the same rule.  It keeps no
// `secrets` structure — it keeps the running conversation as prose and replays it
// whole into each call.  The secrets live in that prose exactly as they would in
// a human player's head: unindexed, and the player's own to recall.  Transcript =
// S, one turn = read `sees` (fwd) then append the move and what was heard
// (writeback).  That is the worker, on the nose.

import { type Move, type Sees, decodeMove, isRecord, isStr } from "./containers.ts";
import { OFFICE_OF, handsFree, handsUsed } from "./party.ts";
import { unfence } from "./leaf-claude.ts";
import { type Ask, modelAsk } from "./leaf-model.ts";
import type { Driver } from "./harness.ts";

/** What the model owes: a move, and the one line of why that `trace.ts` cannot
 *  see.  The reason is lifted out to the intent-log and never rides in `Move` —
 *  putting it in the move would fold WHY into the WHAT layer, which is the exact
 *  thing the two-log design exists to prevent. */
export interface Decision {
  readonly reason: string;
  readonly move: Move;
}

/** The honest price of a model at the player leaf, as numbers, same as the
 *  monster leaf's `tally`.  `reasked` counts turns a first reply failed to
 *  decode and a second was asked for. */
export const tally = {
  asked: 0,
  decoded: 0,
  reasked: 0,
  causes: new Map<string, number>(),
};
const note = (cause: string) =>
  tally.causes.set(cause, (tally.causes.get(cause) ?? 0) + 1);

// ── Rendering a room for the model ────────────────────────────────────────
// The same information `play.ts`'s `show()` puts on a human's screen, as text,
// with two deliberate omissions that keep the discovery honest:
//
//   • `sees.signs` is NOT rendered.  The signs are already in the description,
//     in **bold**, and that is all a human gets.  Handing over the clean array
//     would be the "menu that already noticed for you" that `menu.ts` rejects.
//     The model must notice the bold word itself.
//   • nothing names a desire, a price or a secret.  None of that is in `sees`.
export function renderSees(sees: Sees): string {
  const L: string[] = [];

  for (const line of sees.heard) L.push(`» ${line}`);
  if (sees.heard.length) L.push("");

  if (sees.awaiting === "name") {
    L.push(
      "He is holding the Foundation Tablet out with one open hand and waiting " +
      "for the NAME of the one of you who will stay. He will not be hurried and " +
      "will not take a stranger. Reply with a Substitute move naming one of your party.",
    );
    L.push("");
  }

  L.push(`[ ${sees.room} ]`);
  L.push(sees.description); // the **bold** signs are left exactly as they are

  if (sees.here.length) {
    L.push(`Here: ${sees.here.map((h) => `${h.name} (${h.id})`).join(", ")}`);
  } else {
    L.push("Here: nobody");
  }

  const ways = sees.ways.map((w) => w.shut ? `${w.to} (shut)` : w.to).join(", ");
  L.push(`Ways out: ${ways || "none"}`);

  L.push(`On the floor: ${sees.lying.length ? sees.lying.join(", ") : "nothing"}`);

  const p = sees.party;
  L.push(
    `Your party: ${p.who.map((n) => `${n} the ${OFFICE_OF[n]}`).join(", ")} — ` +
    `hands ${handsUsed(p)}/${handsFree(p)} full` +
    (p.held.length ? `, carrying ${p.held.join(", ")}` : ", carrying nothing"),
  );

  return L.join("\n");
}

// ── The decoder — the only thing that establishes the contract ────────────
/** The flat object a person would write, `{reason, move}`, lifted and checked.
 *  `reason` must be a non-empty string: the hard reason-gate.  `move` must pass
 *  the game's own `decodeMove`.  Either failing is a rejected reply, not a
 *  defaulted one. */
export function decodeDecision(u: unknown): Decision | null {
  if (!isRecord(u)) return null;
  if (!isStr(u.reason) || u.reason.trim() === "") return null;
  const move = decodeMove(u.move);
  if (move === null) return null;
  return { reason: u.reason.trim(), move };
}

function causeOf(u: unknown): string {
  if (!isRecord(u)) return "not a JSON object";
  if (!isStr(u.reason)) return "no reason field";
  if (u.reason.trim() === "") return "empty reason";
  if (decodeMove(u.move) === null) return "move did not validate";
  return "unknown";
}

// ── The player leaf as a Driver ───────────────────────────────────────────
export interface AgentOpts {
  /** the oracle; defaults to `modelAsk()` (claude, or groq via LABYRINTH_PLAYER) */
  ask?: Ask;
  /** a hard turn budget; the agent quits rather than run forever.  Not state. */
  maxTurns?: number;
  /** re-ask once on a reply that fails to decode before giving up.  Default true. */
  reask?: boolean;
  /** called the moment a decision is decoded, BEFORE the move is returned to the
   *  engine — the write-ahead hook the intent-log hangs on.  The reason is
   *  required non-empty by the decoder, so this never fires without one. */
  onDecision?: (d: Decision, sees: Sees, turn: number) => void;
  /** live narration for a human watching; defaults to printing to stderr. */
  say?: (text: string) => void;
}

const INSTRUCTION =
  "\nIt is your move. Study everything above — it is your only notebook. There " +
  "is nobody to ask and no tool to call; decide with what you see. Reply with " +
  'EXACTLY ONE JSON object {"reason": "...", "move": {...}} and NOTHING else — no ' +
  "prose, no markdown fence.";

const CORRECTION =
  "\nThat reply did not parse as a single JSON object {\"reason\": <non-empty " +
  "string>, \"move\": <a valid move>}. Send exactly that, and nothing else — no " +
  "prose around it, no markdown fence.";

export function agentDriver(opts: AgentOpts = {}): Driver {
  const ask = opts.ask ?? modelAsk();
  const maxTurns = opts.maxTurns ?? 200;
  const reask = opts.reask ?? true;
  const sayLive = opts.say ?? ((t: string) =>
    Deno.stderr.writeSync(new TextEncoder().encode(`\x1b[2m${t}\x1b[0m\n`)));

  // The store.  A plain list of prose turns, replayed whole each call.  This is
  // the only memory the player has, and it is deliberately not indexed.
  const transcript: string[] = [];
  let turn = 0;

  async function askOnce(prompt: string): Promise<Decision> {
    tally.asked += 1;
    let text = await ask(prompt);
    let u = parse(unfence(text));
    let d = decodeDecision(u);

    if (d === null && reask) {
      tally.reasked += 1;
      note(causeOf(u));
      text = await ask(prompt + "\n" + CORRECTION);
      u = parse(unfence(text));
      d = decodeDecision(u);
    }
    if (d === null) {
      note(causeOf(u));
      throw new Error(
        `player reply did not validate (${causeOf(u)}): ${JSON.stringify(u).slice(0, 180)}`,
      );
    }
    tally.decoded += 1;
    return d;
  }

  return {
    async choose(sees: Sees): Promise<Move> {
      if (turn >= maxTurns) {
        sayLive(`(turn budget of ${maxTurns} reached — walking out)`);
        return { tag: "Quit" };
      }
      turn += 1;
      const view = renderSees(sees);
      transcript.push(view);
      sayLive(view);

      const d = await askOnce(transcript.join("\n\n──────────\n\n") + "\n" + INSTRUCTION);

      // Writeback: the move and its reason join the store, so next turn the
      // model sees its own prior reasoning, not just the world's replies.
      transcript.push(
        `You decided: ${JSON.stringify(d.move)}\nBecause: ${d.reason}`,
      );
      sayLive(`→ ${describe(d.move)}  — ${d.reason}`);

      opts.onDecision?.(d, sees, turn);
      return d.move;
    },
    say(_t: string) {
      // Everything the engine would push arrives in `sees.heard` and is rendered
      // by `choose`, in both wirings.  Nothing to do here; kept for the Driver
      // shape.
    },
  };
}

function parse(body: string): unknown {
  try {
    return JSON.parse(body);
  } catch {
    return body; // a non-JSON reply; `decodeDecision` will reject it and `causeOf` names it
  }
}

function describe(m: Move): string {
  switch (m.tag) {
    case "Ask": return `ask ${m.who}: "${m.words}"`;
    case "Tell": return `tell ${m.who}: "${m.words}"`;
    case "Offer": return `offer to ${m.who}`;
    case "Take": return `take the ${m.item}`;
    case "Drop": return `drop the ${m.item}`;
    case "Go": return `go to ${m.to}`;
    case "Substitute": return `leave ${m.who} behind`;
    case "Look": return "look";
    case "Quit": return "walk out";
  }
}
