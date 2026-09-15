// spec.ts — the labyrinth as data.
//
// Everything here is transcribed from THEME.md.  Nothing is invented and
// nothing is tuned.  Where THEME.md's maps and its prose disagree, the prose
// wins, because the maps are tikz pictures of rooms and two of the sixteen
// inhabitants are not in a room at all.
//
// This file is read by `solve.ts`, which searches it, and by the level servers,
// which serve it.  It holds no behaviour: a desire is a price and a payment,
// and who decides whether the price was met is not this file's business.

// ── Rooms ─────────────────────────────────────────────────────────────
export type Room =
  | "0.A"
  | "1.A" | "1.B" | "1.C" | "1.D" | "1.E" | "1.F"
  | "2.A" | "2.B" | "2.C" | "2.D" | "2.E"
  | "3.A" | "3.B" | "3.C";

export const depthOf = (r: Room): 0 | 1 | 2 | 3 =>
  Number(r[0]) as 0 | 1 | 2 | 3;

// ── Items ─────────────────────────────────────────────────────────────
// The five materials are the five things on M0's bench in 0.A, each with the
// sign chalked in front of it.  The relics are the eleven inscribed objects.
export type Material = "clay" | "reed" | "bitumen" | "water" | "stone";

export const SIGN_OF: Readonly<Record<Material, string>> = {
  clay: "im", reed: "gi", bitumen: "esir", water: "a", stone: "na₄",
};

export type Relic =
  | "sillum-cone" | "emegir-cone" | "emegir-bulla"
  | "emegir-seal" | "sillum-kudurru" | "kalam-brick"
  | "foundation-tablet";

/** Traded for, never used: light and fighting are both deferred in this build. */
export type Inert = "lamp-oil" | "healing-potion";

export type Item = Material | Relic | Inert;

/** "Each takes one hand to carry, except the kudurru and the brick, which take
 *  two."  The Tablet is a slab about the size of your palm, so one. */
export const HANDS_OF: Readonly<Record<Item, 1 | 2>> = {
  clay: 1, reed: 1, bitumen: 1, water: 1, stone: 1,
  "sillum-cone": 1, "emegir-cone": 1, "emegir-bulla": 1, "emegir-seal": 1,
  "sillum-kudurru": 2, "kalam-brick": 2, "foundation-tablet": 1,
  "lamp-oil": 1, "healing-potion": 1,
};

/** A party of three has six hands.  The lamp and the dagger are always carried
 *  and take two of them.  After M2 has taken one of the three there are four
 *  hands and the same two are still spoken for. */
export const HANDS_FREE = (partySize: number): number => partySize * 2 - 2;

// ── Secrets ───────────────────────────────────────────────────────────
// A secret never enters the party record.  It is here only so the search can
// reason about who knows what; the running game keeps it in the player's head.
export type Secret = "S1" | "S2" | "S3" | "S4" | "S5" | "S6";

// ── The ways between rooms ────────────────────────────────────────────
// A guarded way is opened once and stays open.  An open way was never shut.
export interface Way {
  readonly from: Room;
  readonly to: Room;
  /** the inhabitant standing at it, or null for an open way or a trapdoor */
  readonly guard: MonsterId | null;
}

export const WAYS: readonly Way[] = [
  // level 0 to 1 — M0 stands on the trapdoor and will not open it until the
  // party has asked him what all five things on the bench are.  So he is a
  // guard whose price is nothing but curiosity, which is the first lesson the
  // labyrinth teaches and the only place it is taught for free.
  { from: "0.A", to: "1.A", guard: "M0" },

  { from: "1.A", to: "1.B", guard: null },
  { from: "1.B", to: "1.F", guard: null },
  { from: "1.A", to: "1.D", guard: null },
  { from: "1.B", to: "1.C", guard: "M1" },
  { from: "1.D", to: "1.E", guard: "M2" },
  { from: "1.F", to: "2.A", guard: null },   // the gap where two repairs met

  { from: "2.A", to: "2.B", guard: null },
  { from: "2.B", to: "2.E", guard: null },
  { from: "2.B", to: "2.C", guard: null },
  { from: "2.B", to: "2.D", guard: "M5" },
  { from: "2.E", to: "3.A", guard: null },   // the trapdoor under the sump

  { from: "3.A", to: "3.B", guard: "M11" },
  { from: "3.B", to: "3.C", guard: "M14" },
];

// ── The inhabitants ───────────────────────────────────────────────────
export type MonsterId =
  | "M0" | "M1" | "M2" | "M3" | "M4" | "M5" | "M6" | "M7"
  | "M8" | "M9" | "M10" | "M11" | "M12" | "M13" | "M14" | "M15";

export type Office = "Builder" | "Scribe" | "Sealer";

/** Where an inhabitant is.  Fourteen stand at a post.  Two walk, which is why
 *  they appear in THEME.md's tables and on none of its maps — a tikz picture
 *  draws rooms, and M4 and M9 are not in one.  M4's own CLAUDE.md says "You
 *  walk about the first level, between rooms 1.A, 1.B and 1.F"; M9's says "You
 *  walk about the second level".  Both are the rooms of their level that no
 *  guarded door shuts off, which is the only beat a walker could keep. */
export type Post =
  | { readonly kind: "stands"; readonly room: Room }
  | { readonly kind: "walks"; readonly rooms: readonly Room[] };

export interface Monster {
  readonly id: MonsterId;
  readonly name: string;
  readonly office: Office;
  readonly post: Post;
}

const stands = (room: Room): Post => ({ kind: "stands", room });
const walks = (...rooms: Room[]): Post => ({ kind: "walks", rooms });

export const MONSTERS: readonly Monster[] = [
  { id: "M0",  name: "Nabonidus",             office: "Sealer",  post: stands("0.A") },
  { id: "M1",  name: "Ur-Nintu",              office: "Builder", post: stands("1.B") },
  { id: "M2",  name: "Ishme, the Crown-Level", office: "Sealer", post: stands("1.D") },
  { id: "M3",  name: "Lu-Utu",                office: "Scribe",  post: stands("1.C") },
  { id: "M4",  name: "Bau-the-Tally",         office: "Builder", post: walks("1.A", "1.B", "1.F") },
  { id: "M5",  name: "Igi-dur",               office: "Builder", post: stands("2.B") },
  { id: "M6",  name: "Nin-shubur",            office: "Sealer",  post: stands("2.D") },
  { id: "M7",  name: "Ku-Ningal",             office: "Scribe",  post: stands("2.C") },
  { id: "M8",  name: "Shara-the-Echo",        office: "Sealer",  post: stands("2.B") },
  { id: "M9",  name: "Enannatum",             office: "Scribe",  post: walks("2.A", "2.B", "2.C", "2.E") },
  { id: "M10", name: "Gudea-of-the-Floor",    office: "Sealer",  post: stands("3.A") },
  { id: "M11", name: "Ashgi",                 office: "Builder", post: stands("3.A") },
  { id: "M12", name: "Lugal-bur",             office: "Scribe",  post: stands("3.B") },
  { id: "M13", name: "Nanshe-of-the-Ring",    office: "Sealer",  post: stands("3.B") },
  { id: "M14", name: "Utu-hegal",             office: "Builder", post: stands("3.B") },
  { id: "M15", name: "Namtar",                office: "Sealer",  post: stands("3.C") },
];

/** A guard stands on the near side of the way it holds, so it is met in the
 *  room the party is already in. */
export const roomsOf = (m: Monster): readonly Room[] =>
  m.post.kind === "stands" ? [m.post.room] : m.post.rooms;

// ── What is lying about ───────────────────────────────────────────────
export const LYING: readonly { readonly room: Room; readonly item: Relic }[] = [
  { room: "2.E", item: "sillum-cone" },   // half buried in the muck at the edge
  { room: "3.C", item: "emegir-seal" },   // on the platform, on its side
  { room: "1.B", item: "kalam-brick" },   // loose in the middle aisle, and nobody wants it
];

// ── Desires ───────────────────────────────────────────────────────────
// "One satisfied desire buys one thing, a secret or an object.  An inhabitant
// holding two things will do business twice if you can pay twice."  So a
// desire is one line of trade, and an inhabitant may have more than one.
export interface Desire {
  readonly id: string;
  readonly who: MonsterId;
  /** objects handed over and not given back */
  readonly items: readonly Item[];
  /** secrets that have to be said out loud.  Nothing in the program can check
   *  this; M8 decides for itself whether what the player typed amounts to
   *  knowing what happened at Umma. */
  readonly told: readonly Secret[];
  /** what it does when it is satisfied */
  readonly gives:
    | { readonly kind: "item"; readonly item: Item }
    | { readonly kind: "secret"; readonly secret: Secret }
    | { readonly kind: "opens"; readonly from: Room; readonly to: Room }
    | { readonly kind: "tablet" };   // M2 only: the Tablet, for a member, at once
  /** how many times this line of trade may be struck */
  readonly times: number;
}

export const DESIRES: readonly Desire[] = [
  // ── Level 0.  The price is asking, and nothing else.
  { id: "M0-trapdoor", who: "M0", items: [], told: [], times: 1,
    gives: { kind: "opens", from: "0.A", to: "1.A" } },

  // ── Level 3.  Nothing below the foundation, so nothing here wants an
  //    inscription.  It wants the raw material the party carried in.
  { id: "M11-door", who: "M11", items: ["clay"],    told: [], times: 1,
    gives: { kind: "opens", from: "3.A", to: "3.B" } },
  { id: "M10-S5",   who: "M10", items: ["water"],   told: [], times: 1,
    gives: { kind: "secret", secret: "S5" } },
  { id: "M13-bulla", who: "M13", items: ["bitumen"], told: [], times: 1,
    gives: { kind: "item", item: "emegir-bulla" } },
  { id: "M12-cone", who: "M12", items: ["reed"],    told: [], times: 2,
    gives: { kind: "item", item: "emegir-cone" } },
  { id: "M14-door", who: "M14", items: ["stone"],   told: [], times: 1,
    gives: { kind: "opens", from: "3.B", to: "3.C" } },
  { id: "M15-S2",   who: "M15", items: [],          told: ["S5"], times: 1,
    gives: { kind: "secret", secret: "S2" } },

  // ── Level 2 speaks Sillum and wants Emegir.
  { id: "M5-door",  who: "M5",  items: ["emegir-cone"], told: [], times: 1,
    gives: { kind: "opens", from: "2.B", to: "2.D" } },
  { id: "M5-S6",    who: "M5",  items: ["emegir-cone"], told: [], times: 1,
    gives: { kind: "secret", secret: "S6" } },
  { id: "M6-kudurru", who: "M6", items: ["emegir-seal"], told: [], times: 1,
    gives: { kind: "item", item: "sillum-kudurru" } },
  { id: "M7-S4",    who: "M7",  items: ["emegir-bulla"], told: [], times: 1,
    gives: { kind: "secret", secret: "S4" } },
  { id: "M8-S1",    who: "M8",  items: [], told: ["S3", "S4"], times: 1,
    gives: { kind: "secret", secret: "S1" } },

  // ── Level 1 speaks Kalam and wants Sillum.
  { id: "M1-door",  who: "M1",  items: ["sillum-cone"], told: [], times: 1,
    gives: { kind: "opens", from: "1.B", to: "1.C" } },
  { id: "M3-S3",    who: "M3",  items: [], told: ["S6"], times: 1,
    gives: { kind: "secret", secret: "S3" } },
  { id: "M2-tablet", who: "M2", items: ["sillum-kudurru"], told: ["S1", "S2"], times: 1,
    gives: { kind: "tablet" } },

  // ── The two walkers.  Both take a relic of the language their level wants
  //    and hand back something this build cannot use.  A trade that consumes
  //    a relic and returns an inert object can never lie on a solution, and
  //    `solve.ts` says so rather than searching it.
  { id: "M4-oil",    who: "M4", items: ["sillum-cone"],   told: [], times: Infinity,
    gives: { kind: "item", item: "lamp-oil" } },
  { id: "M9-potion", who: "M9", items: ["emegir-bulla"],  told: [], times: Infinity,
    gives: { kind: "item", item: "healing-potion" } },
];

export const INERT: ReadonlySet<string> = new Set(["M4-oil", "M9-potion"]);

/** M0 opens the trapdoor once he has been asked what all five signs mean, and
 *  hands over the five things on the bench.  The bench is the surface, so the
 *  materials are not scarce — hands are. */
export const BENCH: readonly Material[] = ["clay", "reed", "bitumen", "water", "stone"];
