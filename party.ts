// party.ts — what travels in the prompt, and nothing else travels in it.
//
// "Over the network goes the party and nothing else.  Three names, six hands,
// and whatever is in them."
//
// There is no `secrets` field and there is not going to be one.  A secret
// leaves the game as a sentence a monster said and it can only re-enter as a
// sentence the player typed at another monster; nothing in the program stores
// one and nothing in the program ever observed one being told.  `type-tests.ts`
// makes that a build error rather than a convention.

import { HANDS_FREE, HANDS_OF, type Item } from "./spec.ts";

export type Name = "Arad-Gula" | "Nidintu" | "Bēl-šunu";

export const MUSTER: readonly Name[] = ["Arad-Gula", "Nidintu", "Bēl-šunu"];

/** "Arad-Gula, a bricklayer.  He sets.  Nidintu, a scribe.  She keeps the
 *  record.  Bēl-šunu, an old man who has sealered things for other people all
 *  his life."  One of each office, because that is what a repair crew is. */
export const OFFICE_OF: Readonly<Record<Name, string>> = {
  "Arad-Gula": "Builder",
  "Nidintu": "Scribe",
  "Bēl-šunu": "Sealer",
};

export interface Party {
  /** Three going down.  Two, once M2 has taken the fourth price. */
  readonly who: readonly Name[];
  /** The lamp and the dagger are always carried and are not listed; they are
   *  the two hands `HANDS_FREE` has already deducted. */
  readonly held: readonly Item[];
}

export const handsUsed = (p: Party): number =>
  p.held.reduce((n, i) => n + HANDS_OF[i], 0);

export const handsFree = (p: Party): number => HANDS_FREE(p.who.length);

export const fits = (p: Party): boolean => handsUsed(p) <= handsFree(p);

export const carrying = (p: Party, item: Item): boolean => p.held.includes(item);

export const give = (p: Party, item: Item): Party =>
  ({ ...p, held: [...p.held, item] });

export const takeFrom = (p: Party, items: readonly Item[]): Party | null => {
  const held = [...p.held];
  for (const it of items) {
    const i = held.indexOf(it);
    if (i < 0) return null;
    held.splice(i, 1);
  }
  return { ...p, held };
};

export const MUSTERED: Party = { who: MUSTER, held: [] };

// ── The decoder ───────────────────────────────────────────────────────
const isName = (u: unknown): u is Name =>
  typeof u === "string" && (MUSTER as readonly string[]).includes(u);

const isItem = (u: unknown): u is Item =>
  typeof u === "string" && u in HANDS_OF;

/** `who` is a non-empty subset of the muster, not a fixed triple: after M2 has
 *  taken one of the three there are two, and the hand budget moves with it. */
export const decodeParty = (u: unknown): Party | null => {
  if (typeof u !== "object" || u === null || Array.isArray(u)) return null;
  const r = u as Record<string, unknown>;
  if (!Array.isArray(r.who) || r.who.length === 0 || !r.who.every(isName)) return null;
  if (new Set(r.who).size !== r.who.length) return null;
  if (!Array.isArray(r.held) || !r.held.every(isItem)) return null;
  const p: Party = { who: r.who as Name[], held: r.held as Item[] };
  return fits(p) ? p : null;
};
