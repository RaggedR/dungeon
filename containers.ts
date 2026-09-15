// containers.ts — the interfaces, as unions of fibres.
//
// TypeScript has no dependent types and does not need any here: every prompt
// set in this game is finite, and over a finite index a function from values to
// types is a lookup table.  A tagged union is that table.  So a container is
// written as the union of its fibres, one fibre per prompt, each pairing a
// prompt with the response owed to it.
//
// Three containers and one side channel:
//
//   MonsterC   what you may say to an inhabitant, and what it owes you back
//   PlayerC    what the labyrinth may ask the player, and what the player owes
//   LevelC     a party arriving at the top of a level; the party leaving
//   Tool       "separately from all of that, a monster may call one of two
//              tools, and only one, and only once per turn" — THEME.md
//
// Every decoder here is the only thing that ever establishes that a value has
// the type claimed for it.  `as` is not a check; it is a promise to the
// compiler, and a promise from the far side of a socket was never enforceable.

import type { Fib } from "./lib/algebra.ts";
import type { Item, MonsterId, Room } from "./spec.ts";
import { HANDS_OF } from "./spec.ts";
import { type Party, decodeParty } from "./party.ts";

// ── unknown-shaped helpers.  Everything below is built out of these. ──
export const isRecord = (u: unknown): u is Record<string, unknown> =>
  typeof u === "object" && u !== null && !Array.isArray(u);
export const isStr = (u: unknown): u is string => typeof u === "string";
export const isBool = (u: unknown): u is boolean => typeof u === "boolean";
export const isStrArray = (u: unknown): u is string[] =>
  Array.isArray(u) && u.every(isStr);

// ── The monster ───────────────────────────────────────────────────────
// "There are three things you can do to a monster, and each gets a different
// kind of response."  Ask gets English back, and whether it answered.  Tell
// gets no English at all, only whether it took the point.  Offer gets whether
// it traded.
export interface AskR { readonly prose: string; readonly answered: boolean }
export interface TellR { readonly prose: string; readonly accepted: boolean }
export interface OfferR { readonly prose: string; readonly traded: boolean }

/** ONE DEVIATION FROM THEME.md, and it is forced by the line above it.
 *
 *  THEME.md writes the three prompts as `Ask(words)`, `Tell(words)` and
 *  `Offer(held)`.  But `standing(d,r) = monster(1) (x) ... (x) monster(n)`
 *  prompts EVERY inhabitant of the room and owes a reply from each, so 3.B
 *  sends the same words to Lugal-bur, Nanshe and Utu-hegal at once.  Without a
 *  `to` field none of the three can tell whether it was spoken to, and the
 *  tensor becomes indistinguishable from shouting into a room.
 *
 *  So `to` is the minimum the tensor forces, and it is the only field this
 *  implementation adds to the spec's prompts.  Everyone still hears the words;
 *  `answered` is still each monster's own to decide. */
export type MonsterC =
  | Fib<{ tag: "Ask"; to: MonsterId; words: string }, AskR>
  | Fib<{ tag: "Tell"; to: MonsterId; words: string }, TellR>
  | Fib<{ tag: "Offer"; to: MonsterId; held: readonly Item[] }, OfferR>;

export type MonsterPrompt = MonsterC extends Fib<infer S, unknown> ? S : never;

/** Notice what an Offer reply does NOT carry: what was taken and what was given
 *  back.  The monster decides *whether*, and `spec.ts` decides *what*.  So a
 *  model that claims to have handed over the Kudurru when it is holding nothing
 *  has not moved an object — it has set a boolean, and the level applies the
 *  desire table to it.  The goods are not on the wire and cannot be lied about. */
export const decodeMonster = {
  Ask: (u: unknown): AskR | null =>
    isRecord(u) && isStr(u.prose) && isBool(u.answered)
      ? { prose: u.prose, answered: u.answered }
      : null,
  Tell: (u: unknown): TellR | null =>
    isRecord(u) && isStr(u.prose) && isBool(u.accepted)
      ? { prose: u.prose, accepted: u.accepted }
      : null,
  Offer: (u: unknown): OfferR | null =>
    isRecord(u) && isStr(u.prose) && isBool(u.traded)
      ? { prose: u.prose, traded: u.traded }
      : null,
};

// ── The tool, which is not in the monster's container ──────────────────
// Read THEME.md's two lines together and nothing in `monster` mentions a door:
//
//   monster = ( Ask(words) |> prose x (answered + refused) ) + ...
//   way(i)  = guard(i) (x) ( shut + open <| (...) )
//
// The door is the OTHER half of the way's tensor, and `shut + open` is a sum,
// so the side is settled before the prompt is sent.  Which forces a reading:
// `open_door` fires in round n and the way is prompted on its open side in
// round n+1.  The monster's reply never carries the door; the level's record of
// which doors are open does.
export type Tool =
  | { readonly tag: "open_door" }
  | { readonly tag: "trade" }
  | null;

export const decodeTool = (u: unknown): Tool | undefined => {
  if (u === null || u === undefined) return null;
  if (!isRecord(u) || !isStr(u.tag)) return undefined;
  if (u.tag === "open_door" || u.tag === "trade") return { tag: u.tag };
  return undefined;   // a ninth action.  Rejected at the boundary.
};

/** What a monster server actually puts on the wire: the position owed to the
 *  prompt, and at most one tool call.  One optional field, not a list, so "only
 *  one, and only once per turn" is a fact about the type. */
export interface MonsterReply {
  readonly pos: AskR | TellR | OfferR;
  readonly tool: Tool;
}

// ── The player ────────────────────────────────────────────────────────
// `round(d,r) = look x standing(d,r) x move` — all three offered, exactly one
// answered.  A container does not choose; the program implementing
// `(p : P) -> R p` does, and for a round that program is the player.  So the
// player is a leaf of this tower exactly as a monster is.
export interface Sees {
  readonly room: Room;
  readonly description: string;
  readonly signs: readonly string[];
  readonly here: readonly { readonly id: MonsterId; readonly name: string }[];
  readonly ways: readonly { readonly to: Room; readonly shut: boolean; readonly guard: MonsterId | null }[];
  readonly lying: readonly Item[];
  readonly party: Party;
  readonly heard: readonly string[];
  /** What kind of answer is owed.  Normally a move; at the vault door, once M2
   *  has held the Tablet out, a name — and he will not be hurried and will not
   *  take a stranger.  The player knows this already, because he has just said
   *  so; the field is here so a front end can stop offering doors. */
  readonly awaiting: "move" | "name";
}

export type Move =
  | { readonly tag: "Look" }
  | { readonly tag: "Ask"; readonly who: MonsterId; readonly words: string }
  | { readonly tag: "Tell"; readonly who: MonsterId; readonly words: string }
  | { readonly tag: "Offer"; readonly who: MonsterId }
  | { readonly tag: "Take"; readonly item: Item }
  | { readonly tag: "Drop"; readonly item: Item }
  | { readonly tag: "Go"; readonly to: Room }
  | { readonly tag: "Substitute"; readonly who: string }
  | { readonly tag: "Quit" };

export type PlayerC = Fib<{ tag: "Choose"; sees: Sees }, Move>;

const MONSTER_IDS = new Set(
  Array.from({ length: 16 }, (_, i) => `M${i}`),
);
const ITEMS = new Set(Object.keys(HANDS_OF));

export const decodeMove = (u: unknown): Move | null => {
  if (!isRecord(u) || !isStr(u.tag)) return null;
  switch (u.tag) {
    case "Look":
      return { tag: "Look" };
    case "Quit":
      return { tag: "Quit" };
    case "Ask":
      return isStr(u.who) && MONSTER_IDS.has(u.who) && isStr(u.words)
        ? { tag: "Ask", who: u.who as MonsterId, words: u.words }
        : null;
    case "Tell":
      return isStr(u.who) && MONSTER_IDS.has(u.who) && isStr(u.words)
        ? { tag: "Tell", who: u.who as MonsterId, words: u.words }
        : null;
    case "Offer":
      return isStr(u.who) && MONSTER_IDS.has(u.who)
        ? { tag: "Offer", who: u.who as MonsterId }
        : null;
    case "Take":
      return isStr(u.item) && ITEMS.has(u.item)
        ? { tag: "Take", item: u.item as Item }
        : null;
    case "Drop":
      return isStr(u.item) && ITEMS.has(u.item)
        ? { tag: "Drop", item: u.item as Item }
        : null;
    case "Go":
      return isStr(u.to) ? { tag: "Go", to: u.to as Room } : null;
    case "Substitute":
      return isStr(u.who) ? { tag: "Substitute", who: u.who } : null;
    default:
      // A word that names no interface is not a move the game refuses politely.
      // It is a prompt that fails to decode.
      return null;
  }
};

// ── The level ─────────────────────────────────────────────────────────
// "That record is the prompt a level is given, and the response is the same
// record coming back."  A level is a container because it is prompted and
// something comes back, and it is the same interface at every depth.
export type Exit = "up" | "down" | "quit";

export interface LevelR {
  readonly party: Party;
  readonly exit: Exit;
}

export type LevelC = Fib<{ tag: "Enter"; party: Party; from: Room | null }, LevelR>;

export const decodeLevelR = (u: unknown): LevelR | null => {
  if (!isRecord(u)) return null;
  const party = decodeParty(u.party);
  if (party === null) return null;
  if (!isStr(u.exit) || !["up", "down", "quit"].includes(u.exit)) return null;
  return { party, exit: u.exit as Exit };
};
