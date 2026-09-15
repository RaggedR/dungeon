// engine.ts — the loop that `<|*` stands for, and the only place a tool call
// is ever turned into a change in the world.
//
//   room(d,r) = round(d,r) <|* ( room(d,r) + exit(d,r) )
//
// The star means the first response decides which side is prompted at all, and
// that is iteration.  `flow.ts` builds the round out of the combinators; this
// file iterates it and holds the state the iteration threads.
//
// The rule the whole file exists to enforce is one line long:
//
//   A TOOL CALL SELECTS A DESIRE FROM `spec.ts`.  IT DOES NOT DESCRIBE ONE.
//
// A monster decides *whether*.  The table decides *what*.  So a model that
// announces it has handed over the Kudurru while holding nothing has not moved
// an object — it has set a boolean, and `applyTool` finds no desire it can pay
// for and refuses.  The goods are never on the wire and cannot be lied about.

import {
  DESIRES, depthOf, HANDS_FREE, HANDS_OF, LYING, MONSTERS, WAYS,
  BENCH, type Desire, type Item, type Material, type MonsterId, type Room,
} from "./spec.ts";
import { DESCRIPTION, SIGNS } from "./rooms.ts";
import {
  type Exit, type LevelR, type MonsterPrompt, type MonsterReply,
  type Move, type Sees, type Tool,
} from "./containers.ts";
import {
  type Party, type Name, fits, give, handsFree, handsUsed, takeFrom,
} from "./party.ts";
import { type SpeakC, monsterRunner, standingRunner, runRound } from "./flow.ts";
import type { Runner } from "./lib/algebra.ts";
import { trace } from "./lib/wire.ts";

type MonsterC = import("./containers.ts").MonsterC;

export const wayKey = (a: Room, b: Room) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const NAME_OF = new Map(MONSTERS.map((m) => [m.id, m.name]));

// ── The state one level holds ─────────────────────────────────────────
// Level d's server holds level d's doors, level d's loose objects and level d's
// bargains.  Nothing is shared between levels, and the only thing that crosses
// between them is the party.
export interface LevelState {
  readonly depth: number;
  readonly doors: Set<string>;
  readonly lying: Map<Room, Item[]>;
  readonly used: Map<string, number>;
}

export function mkLevel(depth: number): LevelState {
  const lying = new Map<Room, Item[]>();
  for (const l of LYING) {
    if (depthOf(l.room) !== depth) continue;
    lying.set(l.room, [...(lying.get(l.room) ?? []), l.item]);
  }
  return { depth, doors: new Set(), lying, used: new Map() };
}

const struck = (st: LevelState, id: string) => st.used.get(id) ?? 0;

/** The bench in 0.A is the surface, and the surface is not scarce.  Hands are. */
const benchHere = (room: Room): readonly Material[] =>
  room === "0.A" ? BENCH : [];

export const monstersIn = (room: Room): MonsterId[] =>
  MONSTERS.filter((m) =>
    m.post.kind === "stands" ? m.post.room === room : m.post.rooms.includes(room)
  ).map((m) => m.id);

// ── What the party can see ────────────────────────────────────────────
export function see(st: LevelState, room: Room, party: Party, heard: readonly string[]): Sees {
  const ways = WAYS.flatMap((w) => {
    for (const [from, to] of [[w.from, w.to], [w.to, w.from]] as const) {
      if (from !== room) continue;
      return [{
        to,
        shut: w.guard !== null && !st.doors.has(wayKey(w.from, w.to)),
        guard: w.guard,
      }];
    }
    return [];
  });
  return {
    room,
    awaiting: "move",
    description: DESCRIPTION[room],
    signs: SIGNS[room],
    here: monstersIn(room).map((id) => ({ id, name: NAME_OF.get(id)! })),
    ways,
    lying: [...(st.lying.get(room) ?? []), ...benchHere(room)],
    party,
    heard,
  };
}

// ── A tool call selects a desire ──────────────────────────────────────
/** The first unexhausted desire of this inhabitant whose *material* price the
 *  party is holding and whose outcome matches the tool that fired.  There is no
 *  secret condition here and there cannot be: the party's knowledge is not in
 *  the program to be indexed, so whether S3 and S4 were really said is M8's
 *  judgement and nobody else's.  The material half is enforced by the table;
 *  the informational half is enforced by a gate-keeper. */
export function selectDesire(
  st: LevelState, party: Party, who: MonsterId, tool: Tool,
): Desire | null {
  if (tool === null) return null;
  for (const d of DESIRES) {
    if (d.who !== who) continue;
    if (struck(st, d.id) >= d.times) continue;
    if (takeFrom(party, d.items) === null) continue;
    const wants: "open_door" | "trade" =
      d.gives.kind === "opens" ? "open_door" : "trade";
    if (wants !== tool.tag) continue;
    return d;
  }
  return null;
}

export interface Applied {
  readonly party: Party;
  readonly prose: string;
  /** M2 only.  The Tablet out and one of the three in, in the same moment. */
  readonly substitution: boolean;
}

export function applyDesire(st: LevelState, party: Party, d: Desire): Applied | null {
  const paid = takeFrom(party, d.items);
  if (paid === null) return null;

  if (d.gives.kind === "opens") {
    st.doors.add(wayKey(d.gives.from, d.gives.to));
    st.used.set(d.id, struck(st, d.id) + 1);
    return { party: paid, prose: `The way to ${d.gives.to} is open.`, substitution: false };
  }
  if (d.gives.kind === "secret") {
    st.used.set(d.id, struck(st, d.id) + 1);
    return { party: paid, prose: "", substitution: false };
  }
  if (d.gives.kind === "item") {
    const next = give(paid, d.gives.item);
    if (!fits(next)) return null;     // no free hand.  The trade does not happen.
    st.used.set(d.id, struck(st, d.id) + 1);
    return { party: next, prose: `You are handed the ${d.gives.item}.`, substitution: false };
  }
  // The Tablet.  Nothing is applied here: the exchange is simultaneous and the
  // party member has not been chosen yet, so `runLevel` finishes it.
  return { party, prose: "", substitution: true };
}

/** M2's price, paid in one moment.  `receive = offer <|* ((tablet (x) substitute)
 *  + refused)` — the tensor is the simultaneity, and both halves are owed. */
export function payFourthPrice(
  st: LevelState, party: Party, d: Desire, leaving: Name,
): Applied | null {
  if (!party.who.includes(leaving)) return null;
  const paid = takeFrom(party, d.items);
  if (paid === null) return null;
  const after: Party = {
    who: paid.who.filter((n) => n !== leaving),
    held: [...paid.held, "foundation-tablet"],
  };
  if (!fits(after)) return null;
  st.doors.add(wayKey("1.D", "1.E"));
  st.used.set(d.id, struck(st, d.id) + 1);
  return {
    party: after,
    prose: `${leaving} steps past him into the dark and the Foundation Tablet is in your hands.`,
    substitution: false,
  };
}

// ── What the level needs from outside itself ──────────────────────────
export interface IO {
  /** the player's leaf: the program that implements the round's product */
  choose(sees: Sees, depth: number): Promise<Move>;
  /** one runner per inhabitant */
  monster(id: MonsterId): Runner<MonsterC>;
  /** descending is a delegation: control genuinely flows down */
  descend(party: Party, to: Room, depth: number): Promise<LevelR>;
  /** everything the player is shown */
  say(text: string): void;
}

// ── The loop ──────────────────────────────────────────────────────────
export async function runLevel(
  st: LevelState, party: Party, entry: Room, io: IO, depth: number,
): Promise<LevelR> {
  let room = entry;
  let p = party;
  let heard: string[] = [];
  // Everything the party is told between two of its own decisions.  It rides
  // in the next prompt rather than being pushed at the player, because the
  // player is a leaf of this tower and a leaf is prompted, never pushed.
  const say = (t: string) => { heard.push(t); io.say(t); };

  for (;;) {
    const sees = see(st, room, p, heard);
    heard = [];
    const move = await io.choose(sees, depth);

    if (move.tag === "Quit") return { party: p, exit: "quit" };

    // going somewhere
    if (move.tag === "Go") {
      const w = WAYS.find((x) =>
        (x.from === room && x.to === move.to) || (x.to === room && x.from === move.to)
      );
      if (!w) { say("There is no way through there."); continue; }
      const there = depthOf(move.to);
      // A guard shuts the way DOWN and never the way back.  "Nothing stands
      // between the vault and the surface.  The ways up are open and the
      // trapdoors are unguarded" — and the reason is given in the same
      // paragraph: a debt that fell due after the door opened would be a debt
      // nobody was in a position to collect.  It is also what makes the state
      // split between processes coherent, because a way that spans two levels
      // has its open-or-shut recorded by the shallower of them, and the deeper
      // one has no business being asked.
      if (there >= st.depth && w.guard !== null && !st.doors.has(wayKey(w.from, w.to))) {
        say(`The way to ${move.to} is shut, and ${NAME_OF.get(w.guard)} is standing at it.`);
        continue;
      }
      if (there > st.depth) {
        trace(depth, "down", `level${st.depth}`, `the party goes down to ${move.to}`);
        const back = await io.descend(p, move.to, depth + 1);
        p = back.party;
        if (back.exit === "quit") return { party: p, exit: "quit" };
        continue;                          // they came back up into this room
      }
      if (there < st.depth) return { party: p, exit: "up" };
      room = move.to;
      continue;
    }

    // picking things up and setting them down
    if (move.tag === "Take") {
      const loose = st.lying.get(room) ?? [];
      const onBench = (benchHere(room) as readonly Item[]).includes(move.item);
      const i = loose.indexOf(move.item);
      if (i < 0 && !onBench) { say("There is no such thing here."); continue; }
      const next = give(p, move.item);
      if (!fits(next)) {
        say(`No hand is free. ${handsUsed(p)} of ${handsFree(p)} are full.`);
        continue;
      }
      if (i >= 0) loose.splice(i, 1);      // the bench alone replenishes
      p = next;
      say(`You take the ${move.item}.`);
      continue;
    }
    if (move.tag === "Drop") {
      const next = takeFrom(p, [move.item]);
      if (next === null) { say("You are not carrying that."); continue; }
      p = next;
      st.lying.set(room, [...(st.lying.get(room) ?? []), move.item]);
      say(`You set down the ${move.item}.`);
      continue;
    }
    if (move.tag === "Substitute") { say("Nobody has asked you for that."); continue; }

    // looking, and speaking.  Both go through the round's product.
    const here = monstersIn(room);
    const standing = standingRunner(here.map(io.monster));
    const prompts = here.map((id) => promptFor(id, move, p));
    const result = await runRound(standing, sees, prompts, move, depth);

    if (result.kind === "look") {
      say(result.description);
      if (result.signs.length) say(`Signs here: ${result.signs.join(", ")}`);
      continue;
    }
    if (result.kind === "act") continue;

    // Every inhabitant of the room was prompted and every one owed a reply.
    // Most of them will have said nothing, which is still a reply.
    for (let i = 0; i < here.length; i++) {
      const id = here[i];
      const { pos, tool } = result.replies[i];
      if (pos.prose.trim()) say(`${NAME_OF.get(id)}: ${pos.prose.trim()}`);
      if (tool === null) continue;

      const d = selectDesire(st, p, id, tool);
      if (d === null) {
        // The monster reached for a tool the table does not license it to use
        // here.  Nothing happens, and it is logged rather than forgiven.
        trace(depth, "up", id, `REFUSED ${tool.tag}: no desire it can pay for`);
        continue;
      }
      const applied = applyDesire(st, p, d);
      if (applied === null) {
        trace(depth, "up", id, `REFUSED ${tool.tag}: the exchange would not fit in the hands`);
        continue;
      }
      p = applied.party;
      if (applied.prose) say(applied.prose);

      if (applied.substitution) {
        const done = await takeFourthPrice(st, p, d, io, say, sees, depth);
        if (done === null) {
          say("He puts the Tablet back where it was. The door closes.");
        } else {
          p = done;
        }
      }
    }
  }
}

/** The one place in the labyrinth where the party is asked for a person.
 *  M2 will not choose, will not be hurried, and will not accept a stranger. */
async function takeFourthPrice(
  st: LevelState, p: Party, d: Desire, io: IO, say: (t: string) => void,
  sees: Sees, depth: number,
): Promise<Party | null> {
  say(
    "He holds the Tablet out with one hand and does not let go of it, and the " +
    "other hand is open and waiting. One of the three. He will not choose, and " +
    "he will not take a stranger.",
  );
  for (;;) {
    const m = await io.choose({ ...sees, party: p, heard: [], awaiting: "name" }, depth);
    if (m.tag === "Quit") return null;
    if (m.tag !== "Substitute") { say("He is waiting for a name."); continue; }
    const who = p.who.find((n) => n.toLowerCase() === m.who.toLowerCase());
    if (who === undefined) { say("Nobody of that name is standing here."); continue; }
    const done = payFourthPrice(st, p, d, who);
    if (done === null) { say("It will not fit in the hands you have left."); continue; }
    say(done.prose);
    for (const n of done.party.who) say(`${n} says nothing at all.`);
    return done.party;
  }
}

function promptFor(id: MonsterId, move: Move, p: Party): MonsterPrompt {
  switch (move.tag) {
    case "Ask": return { tag: "Ask", to: move.who, words: move.words };
    case "Tell": return { tag: "Tell", to: move.who, words: move.words };
    case "Offer": return { tag: "Offer", to: move.who, held: p.held };
    default: throw new Error(`promptFor: ${move.tag} is not something you say`);
  }
}

export { HANDS_FREE, HANDS_OF, type Exit };
