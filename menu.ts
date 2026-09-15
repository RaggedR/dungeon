// menu.ts — the front end that offers you your options.
//
// WHERE THE LINE IS, because a menu is the one thing that could quietly destroy
// this game.
//
// The menu offers MOVES.  It never offers WORDS.
//
// So the ways out, the people standing here, what is on the floor and how many
// hands are full are all menu items: those are the map and the inventory, and
// looking at them costs nothing.  But `ask` is one line on the menu and the
// question is yours to type, and so is `tell`.
//
// An earlier draft of this file listed the signs as questions — "ask what im
// means", "ask what their name means" — on the argument that the signs are
// printed in the room description anyway, so nothing was being leaked.  That
// argument was answering the wrong objection.  Nothing WAS being leaked, and it
// was still wrong, because in this game formulating the question IS the move.
// You have to notice there is a word you cannot read, and decide to ask about
// it, and decide who to ask.  A list that has already noticed for you has taken
// the turn on your behalf, and the fact that it took it correctly is exactly
// what makes it a bad menu.
//
// Whatever you type goes to the inhabitant as you typed it.  There is no
// vocabulary, there is no parser, and there is nothing you are supposed to have
// guessed.  Ask them anything.

import type { Move, Sees } from "./containers.ts";
import type { Item, MonsterId } from "./spec.ts";
import { MONSTERS } from "./spec.ts";
import { OFFICE_OF, handsFree, handsUsed } from "./party.ts";
import { bold, dim, emph, out, readLine, sign, wrap } from "./term.ts";

const OFFICE = new Map(MONSTERS.map((m) => [m.id, m.office]));

interface Option {
  readonly key: string;
  readonly label: string;
  /** a Move, or a submenu to open */
  readonly go: () => Promise<Move | null>;
}

let lastRoom: string | null = null;

/** Who the party is in the middle of talking to.  A conversation is the unit of
 *  play in this game — you ask, you are answered, you ask about the answer —
 *  so the front end stays with a person until you back out of them, rather than
 *  making you choose them again for every sentence. */
let talkingTo: MonsterId | null = null;

// ── drawing ───────────────────────────────────────────────────────────
const showHeard = (sees: Sees) => {
  for (const line of sees.heard) out(`\n${emph(wrap(line, 76, "  "))}\n`);
};

function showRoom(sees: Sees, force: boolean) {
  if (sees.room !== lastRoom || force) {
    out(`\n${bold(sees.room)}\n${emph(wrap(sees.description, 76, "  "))}\n`);
    lastRoom = sees.room;
  }

  if (sees.signs.length) {
    out(`\n  ${dim("cut into the walls:")} ${sees.signs.map(sign).join("  ")}\n`);
  }
  if (sees.here.length) {
    out(`  ${dim("here:")} ${
      sees.here.map((h) => `${h.name} ${dim(`the ${OFFICE.get(h.id)}`)}`).join(",  ")
    }\n`);
  }
  if (sees.lying.length) out(`  ${dim("lying here:")} ${sees.lying.join(", ")}\n`);

  const p = sees.party;
  out(
    `  ${dim("hands:")} ${handsUsed(p)}/${handsFree(p)}` +
    `${p.held.length ? ` — ${p.held.join(", ")}` : ""}` +
    `   ${dim(p.who.map((n) => `${n} the ${OFFICE_OF[n]}`).join(", "))}\n`,
  );
}

function draw(title: string | null, opts: readonly Option[]) {
  if (title) out(`\n  ${bold(title)}\n`);
  out("\n");
  for (const o of opts) out(`   ${bold(o.key.padStart(2))}  ${o.label}\n`);
  out("\n  > ");
}

/** Offer a list and return the chosen entry.  `b` goes back, `q` walks out. */
async function pick(title: string | null, opts: readonly Option[]): Promise<Move | null> {
  for (;;) {
    draw(title, opts);
    const line = (await readLine()).trim().toLowerCase();
    if (line === "") continue;
    const hit = opts.find((o) => o.key.toLowerCase() === line);
    if (hit) return await hit.go();
    // A number that is not on the list, or a word: say so and redraw.
    out(`  ${dim(`there is no ${line} on that list`)}\n`);
  }
}

const typed = async (prompt: string): Promise<string> => {
  out(`\n  ${prompt}\n  > `);
  return await readLine();
};

// ── the person submenu ────────────────────────────────────────────────
async function speakTo(who: MonsterId, name: string, sees: Sees): Promise<Move | null> {
  const opts: Option[] = [
    {
      key: "1",
      label: "ask them something",
      go: async () => {
        const words = await typed("what do you ask?");
        return words ? { tag: "Ask", who, words } : null;
      },
    },
    {
      key: "2",
      label: "tell them something",
      go: async () => {
        const words = await typed("what do you say?");
        return words ? { tag: "Tell", who, words } : null;
      },
    },
    {
      key: "3",
      label: sees.party.held.length
        ? `offer what you are carrying ${dim(`(${sees.party.held.join(", ")})`)}`
        : dim("offer what you are carrying (your hands are empty)"),
      go: () => Promise.resolve<Move>({ tag: "Offer", who }),
    },
    {
      key: "b",
      label: dim("stop talking to them"),
      go: () => { talkingTo = null; return Promise.resolve(null); },
    },
  ];

  return await pick(`${name}, ${OFFICE.get(who)}`, opts);
}

// ── the top menu ──────────────────────────────────────────────────────
export async function menuDecide(sees: Sees): Promise<Move> {
  // The vault door, and the only place in the labyrinth the party is asked for
  // a person rather than a thing.
  if (sees.awaiting === "name") {
    const opts: Option[] = sees.party.who.map((who, i) => ({
      key: String(i + 1),
      label: `${who} ${dim(`the ${OFFICE_OF[who]}`)} stays`,
      go: () => Promise.resolve<Move>({ tag: "Substitute", who }),
    }));
    opts.push({
      key: "b",
      label: "refuse, and walk all three of them up the stair with nothing",
      go: () => Promise.resolve<Move>({ tag: "Quit" }),
    });
    const m = await pick("he is waiting for a name", opts);
    return m ?? { tag: "Quit" };
  }

  showHeard(sees);

  // Still mid-conversation?  Go straight back to them.
  if (talkingTo !== null) {
    const them = sees.here.find((h) => h.id === talkingTo);
    if (them === undefined) {
      talkingTo = null;            // they are not in this room; the talk is over
    } else {
      const m = await speakTo(them.id, them.name, sees);
      if (m) return m;
      talkingTo = null;            // they backed out
    }
  }

  showRoom(sees, false);

  for (;;) {
    const opts: Option[] = [];
    let n = 0;
    const k = () => String(++n);

    for (const h of sees.here) {
      opts.push({
        key: k(),
        label: `speak to ${h.name} ${dim(`the ${OFFICE.get(h.id)}`)}`,
        go: () => { talkingTo = h.id; return speakTo(h.id, h.name, sees); },
      });
    }
    for (const w of sees.ways) {
      opts.push({
        key: k(),
        label: w.shut
          ? dim(`go to ${w.to} — shut, and ${
            sees.here.find((h) => h.id === w.guard)?.name ?? w.guard
          } is standing at it`)
          : `go to ${bold(w.to)}`,
        go: () => Promise.resolve<Move>({ tag: "Go", to: w.to }),
      });
    }
    if (sees.lying.length) {
      opts.push({
        key: k(),
        label: "pick something up",
        go: () =>
          pick(
            "what do you take?",
            [
              ...sees.lying.map((it, i) => ({
                key: String(i + 1),
                label: it,
                go: () => Promise.resolve<Move>({ tag: "Take", item: it as Item }),
              })),
              { key: "b", label: dim("back"), go: () => Promise.resolve(null) },
            ],
          ),
      });
    }
    if (sees.party.held.length) {
      opts.push({
        key: k(),
        label: "set something down",
        go: () =>
          pick(
            "what do you set down?",
            [
              ...sees.party.held.map((it, i) => ({
                key: String(i + 1),
                label: it,
                go: () => Promise.resolve<Move>({ tag: "Drop", item: it as Item }),
              })),
              { key: "b", label: dim("back"), go: () => Promise.resolve(null) },
            ],
          ),
      });
    }
    opts.push(
      { key: "l", label: dim("read the room again"), go: () => Promise.resolve<Move>({ tag: "Look" }) },
      { key: "q", label: dim("walk out"), go: () => Promise.resolve<Move>({ tag: "Quit" }) },
    );

    const m = await pick(null, opts);
    if (m) return m;
    showRoom(sees, true);   // came back from a submenu; remind them where they are
  }
}
