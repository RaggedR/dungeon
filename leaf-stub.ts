// leaf-stub.ts — a scripted inhabitant.
//
// It is not a language model and it is not pretending to be one.  It exists so
// that the game can be played from end to end by a script, in CI, with no
// network, no subscription and no non-determinism — which is the only way the
// wiring can be tested separately from the oracle.  Phase 3 swaps it for
// `leaf-claude.ts` one monster at a time.
//
// It answers from `spec.ts`, `rooms.ts` and `secrets.ts`, and it holds the one
// piece of state a real monster holds too: what it has been told, and how many
// real questions it has been asked.  Nothing else about it is faithful — the
// prose is a placeholder, and the keyword matching in `secrets.ts` is a
// caricature of a judgement the real thing makes for itself.

import {
  DESIRES, MONSTERS, type Desire, type MonsterId,
} from "./spec.ts";
import { GLOSS, SIGNS } from "./rooms.ts";
import type { MonsterPrompt, MonsterReply, Tool } from "./containers.ts";
import { TEXT, type Secret, recognise } from "./secrets.ts";
import { roomsOf } from "./spec.ts";

const M = new Map(MONSTERS.map((m) => [m.id, m]));

/** What an inhabitant has been told, and whether it has been treated as a
 *  person.  "An inhabitant that has been treated as a vending machine says
 *  nothing, whatever is put in front of it." */
export interface Memory {
  told: Set<Secret>;
  asked: Set<string>;
  curious: number;
}

export const mkMemory = (): Memory => ({ told: new Set(), asked: new Set(), curious: 0 });

const desiresOf = (id: MonsterId) => DESIRES.filter((d) => d.who === id);

const signsHere = (id: MonsterId): string[] =>
  roomsOf(M.get(id)!).flatMap((r) => [...SIGNS[r]]);

/** A sign is a whole word, not a substring.  `a` is the sign for water and it
 *  is also inside "what", "clay" and "Nabonidus", so matching on `includes`
 *  answers every question in room 0.A with "a is water".  Longest first, and
 *  bounded on both sides by something that is not part of a word — the signs
 *  themselves contain hyphens and a subscript, so the boundary cannot be \b. */
const EDGE = "[^\\p{L}\\p{N}-]";
/** Nobody types `na\u2084`.  The subscript is how the sign is written on the wall and
 *  `na4` is how it reaches a keyboard, so both sides are flattened before they
 *  are compared.  A real inhabitant reads what the party meant; a stub has to be
 *  told. */
const flat = (s: string) => s.replace(/\u2084/g, "4").replace(/\u00e9/g, "e");
const mentions = (words: string, sign: string): boolean => {
  const s = flat(sign).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|${EDGE})${s}($|${EDGE})`, "iu").test(flat(words));
};

/** A desire is ready when every secret it wants has been said out loud to this
 *  inhabitant, and — if what it is about to give up is a SECRET — the party has
 *  also shown some curiosity.  "A secret has two prices and both must be paid.
 *  The first is the one listed against its holder.  The second is curiosity."
 *  An object has only the one price: M11 wants clay and does not care who you
 *  are. */
const needsCuriosity = (d: Desire): boolean =>
  d.gives.kind === "secret" || d.told.length > 0;

const ready = (d: Desire, mem: Memory, struck: number): boolean =>
  struck < d.times &&
  d.told.every((s) => mem.told.has(s as Secret)) &&
  (!needsCuriosity(d) || mem.curious >= 2);

/** The one desire in the labyrinth priced in nothing but questions. */
function opensOnCuriosity(id: MonsterId, mem: Memory, struck: (id: string) => number): boolean {
  const signs = new Set(signsHere(id));
  if (signs.size === 0) return false;
  if ([...signs].some((s) => !mem.asked.has(s))) return false;
  return desiresOf(id).some((d) =>
    d.items.length === 0 && d.told.length === 0 &&
    d.gives.kind === "opens" && struck(d.id) < d.times
  );
}

export function stubReply(
  id: MonsterId,
  p: MonsterPrompt,
  mem: Memory,
  struck: (id: string) => number,
): MonsterReply {
  const me = M.get(id)!;

  // Everyone in the room is prompted and everyone owes a reply.  Most of what
  // comes back is silence, and silence is still a reply.
  if (p.to !== id) return { pos: { prose: "", answered: false }, tool: null };

  if (p.tag === "Ask") {
    const w = p.words.toLowerCase();

    for (const sign of [...signsHere(id)].sort((a, b) => b.length - a.length)) {
      if (mentions(p.words, sign)) {
        mem.curious++;
        mem.asked.add(sign);
        return {
          pos: { prose: `${sign} is ${GLOSS[sign]}`, answered: true },
          // "He will not open the trapdoor until you have asked him what all
          // five of them are."  A door whose whole price is curiosity opens the
          // moment the last sign in the room has been asked about.
          tool: opensOnCuriosity(id, mem, struck) ? { tag: "open_door" } : null,
        };
      }
    }
    if (w.includes("name")) {
      mem.curious++;
      return { pos: { prose: `They call me ${me.name}.`, answered: true }, tool: null };
    }
    if (w.includes("job") || w.includes("office") || w.includes("do here")) {
      mem.curious++;
      return { pos: { prose: `I was a ${me.office}.`, answered: true }, tool: null };
    }
    if (w.includes("holding") || w.includes("carrying") || w.includes("tower")) {
      mem.curious++;
      return { pos: { prose: "Nothing I am willing to talk about yet.", answered: true }, tool: null };
    }
    return { pos: { prose: "I cannot read that one.", answered: false }, tool: null };
  }

  if (p.tag === "Tell") {
    let took = false;
    for (const s of recognise(p.words)) { mem.told.add(s); took = true; }

    // A desire priced purely in secrets pays out the moment it is satisfied,
    // and it needs no tool: a secret is prose, and prose is the reply itself.
    for (const d of desiresOf(id)) {
      if (d.items.length > 0) continue;
      if (!ready(d, mem, struck(d.id))) continue;
      if (d.gives.kind === "secret") {
        return { pos: { prose: TEXT[d.gives.secret], accepted: true }, tool: null };
      }
      if (d.gives.kind === "opens") {
        return { pos: { prose: "Go on, then.", accepted: true }, tool: { tag: "open_door" } };
      }
    }
    return {
      pos: { prose: "", accepted: took },
      tool: null,
    };
  }

  // Offer.  The monster decides whether; the table decides what.
  for (const d of desiresOf(id)) {
    if (!ready(d, mem, struck(d.id))) continue;
    if (d.items.length === 0) continue;
    if (!holdsAll(p.held, d.items)) continue;
    const tool: Tool = d.gives.kind === "opens" ? { tag: "open_door" } : { tag: "trade" };
    const prose = d.gives.kind === "secret" ? TEXT[d.gives.secret] : "Yes. That is the one.";
    return { pos: { prose, traded: true }, tool };
  }
  return { pos: { prose: "I want nothing you are holding.", traded: false }, tool: null };
}

const holdsAll = (held: readonly string[], want: readonly string[]) => {
  const pool = [...held];
  for (const w of want) {
    const i = pool.indexOf(w);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
};
