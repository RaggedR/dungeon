// play.ts — the player, which is a container too.
//
//   ./play            twenty processes: ./up.sh first
//   ./play --local    one process, the same engine, in-process leaves
//
// `round(d,r) = look x standing(d,r) x move` — all three offered, exactly one
// answered.  A container does not choose; the program implementing
// `(p : P) -> R p` does.  For a round that program is this one, so this file is
// a leaf of the labyrinth in exactly the sense a monster is: it listens on a
// port, it is prompted, and it owes a reply whose type was fixed before the
// prompt went out.
//
// What it does NOT do is keep a list of the secrets you have been told.  Not
// because it would be hard — because a free, sorted, searchable list of every
// sentence you have heard is the table, filled in on your behalf, and
// discovering the table is how you win.  Keep notes on paper.  Paper does not
// index.

import { delegate, depthHeaders } from "./lib/wire.ts";
import { type Move, type Sees, decodeLevelR, isRecord } from "./containers.ts";
import { MONSTERS, type Item, type MonsterId, type Room } from "./spec.ts";
import { MUSTERED, OFFICE_OF, handsFree, handsUsed } from "./party.ts";
import { LEVEL_PORT, PLAYER_PORT } from "./ports.ts";
import { mkGame, play as playLocal } from "./harness.ts";
import { emph, out, readLine, wrap } from "./term.ts";
import { menuDecide } from "./menu.ts";

const LOCAL = Deno.args.includes("--local");

/** Two front ends over the same container.  The menu offers everything the
 *  player could see for free and types everything they had to learn; the parser
 *  types all of it.  `menu.ts` explains where that line is and why it is there. */
const TYPED = Deno.args.includes("--type");
const decide = (sees: Sees): Promise<Move> => TYPED ? parseDecide(sees) : menuDecide(sees);

// ── who is that ───────────────────────────────────────────────────────
/** A name, a nickname or an id.  "Ask Shara what mu means" and "ask m8 what mu
 *  means" are the same move; nothing in the labyrinth is addressed by number
 *  except by somebody reading the specification over your shoulder. */
function whoIs(word: string, here: readonly { id: MonsterId; name: string }[]): MonsterId | null {
  const w = word.toLowerCase();
  const byId = here.find((h) => h.id.toLowerCase() === w);
  if (byId) return byId.id;
  const byName = here.find((h) =>
    h.name.toLowerCase() === w || h.name.toLowerCase().split(/[\s,-]+/).includes(w)
  );
  if (byName) return byName.id;
  const loose = here.find((h) => h.name.toLowerCase().startsWith(w));
  return loose ? loose.id : null;
}

// ── showing a room ────────────────────────────────────────────────────
let lastRoom: Room | null = null;

function show(sees: Sees) {
  for (const line of sees.heard) out(`\n${emph(wrap(line))}\n`);

  if (sees.room !== lastRoom) {
    out(`\n\x1b[1m${sees.room}\x1b[0m\n${emph(wrap(sees.description))}\n`);
    lastRoom = sees.room;
  }
  if (sees.here.length) {
    out(`\nHere: ${sees.here.map((h) => `${h.name} (${h.id})`).join(", ")}\n`);
  }
  const ways = sees.ways.map((w) =>
    w.shut ? `${w.to} \x1b[2m(shut)\x1b[0m` : w.to
  ).join(", ");
  out(`Ways: ${ways}\n`);
  if (sees.lying.length) out(`Lying here: ${sees.lying.join(", ")}\n`);

  const p = sees.party;
  out(
    `\x1b[2m${p.who.map((n) => `${n} the ${OFFICE_OF[n]}`).join(", ")} — ` +
    `hands ${handsUsed(p)}/${handsFree(p)}` +
    `${p.held.length ? `: ${p.held.join(", ")}` : ""}\x1b[0m\n`,
  );
  out("\n> ");
}

// ── parsing a line into a move ────────────────────────────────────────
async function parseDecide(sees: Sees): Promise<Move> {
  show(sees);
  for (;;) {
    const line = await readLine();
    const [head, ...rest] = line.split(/\s+/);
    const v = (head ?? "").toLowerCase();
    const tail = rest.join(" ");

    if (v === "" ) { out("> "); continue; }
    if (v === "quit" || v === "q") return { tag: "Quit" };
    if (v === "look" || v === "l") return { tag: "Look" };
    if (v === "help" || v === "?") { out(HELP); out("> "); continue; }

    if (v === "ask" || v === "tell") {
      const who = whoIs(rest[0] ?? "", sees.here);
      if (!who) { out("Nobody of that name is here.\n> "); continue; }
      const words = rest.slice(1).join(" ");
      if (!words) { out(`${v} whom what?\n> `); continue; }
      return v === "ask"
        ? { tag: "Ask", who, words }
        : { tag: "Tell", who, words };
    }
    if (v === "offer" || v === "give") {
      const who = whoIs(rest[0] ?? "", sees.here);
      if (who) return { tag: "Offer", who };
      // `give <name>` at the vault door is the fourth price, not a trade.
      return { tag: "Substitute", who: tail };
    }
    if (v === "take" || v === "get") {
      const it = sees.lying.find((i) => i.toLowerCase().includes((rest[0] ?? "").toLowerCase()));
      if (!it) { out("There is no such thing here.\n> "); continue; }
      return { tag: "Take", item: it };
    }
    if (v === "drop" || v === "put") {
      const it = sees.party.held.find((i) => i.toLowerCase().includes((rest[0] ?? "").toLowerCase()));
      if (!it) { out("You are not carrying that.\n> "); continue; }
      return { tag: "Drop", item: it as Item };
    }
    if (v === "go" || v === "down" || v === "up" || /^\d\.[a-f]$/i.test(v)) {
      const target = (v === "go" ? rest[0] : v === "down" || v === "up" ? rest[0] : v) ?? "";
      const w = sees.ways.find((x) => x.to.toLowerCase() === target.toLowerCase());
      if (!w) { out("There is no way through there.\n> "); continue; }
      return { tag: "Go", to: w.to };
    }
    out("I do not know that word.  `help` lists the ones I do.\n> ");
  }
}

const HELP = `
  look                       read the room again
  ask <who> <words>          free, and every answer is true
  tell <who> <words>         say something you were told somewhere else
  offer <who>                hold out what you are carrying
  take <thing> / drop <thing>
  go <room>   or just  2.B
  give <name>               at the vault door, and nowhere else
  quit
`;

// ── the opening ───────────────────────────────────────────────────────
const OPENING = `
A king who wants to rebuild a temple does not start by building.  He starts by
digging.  Somewhere under the old foundation is whatever the last builder put
there, and he is supposed to find it, read it, and lay it back down with his own
name added to it.

You are the crew he has sent down.  Three of you: a bricklayer, a scribe, and an
old man who has sealed things for other people all his life.  You are carrying a
lamp and a dagger, which leaves you four hands between you.

Nothing down there will tell you what it wants.  You will have to ask.
`;

// ── run ───────────────────────────────────────────────────────────────
if (LOCAL) {
  out(OPENING);
  const g = mkGame();
  const res = await playLocal(g, { choose: decide, say: () => {} });
  report(res.party.who.length, res.party.held.includes("foundation-tablet"));
} else {
  // The player listens, and is prompted by whichever level the party is on.
  Deno.serve({ port: PLAYER_PORT, onListen: () => {} }, async (req) => {
    const body = await req.json().catch(() => null);
    if (!isRecord(body) || body.tag !== "Choose") {
      return new Response(JSON.stringify({ error: "not a prompt for the player" }), { status: 400 });
    }
    const move = await decide(body.sees as Sees);
    return new Response(JSON.stringify(move), {
      headers: { "content-type": "application/json" },
    });
  });

  out(OPENING);
  const raw = await delegate(LEVEL_PORT(0), { tag: "Enter", party: MUSTERED, from: "0.A" }, 0);
  const res = decodeLevelR(raw);
  if (res === null) {
    out("\nLevel 0 answered with something that is not a party.\n");
    Deno.exit(1);
  }
  report(res.party.who.length, res.party.held.includes("foundation-tablet"));
  Deno.exit(0);
}

function report(left: number, tablet: boolean) {
  out("\n");
  if (tablet && left === 2) {
    out(wrap(
      "Two of you come up the stair into the light off the court, and one of you " +
      "does not.  The Tablet is in your hands and it carries one sentence: What " +
      "is set below is what is said above.",
    ) + "\n\n");
  } else if (!tablet && left === 3) {
    out(wrap(
      "Three of you come up the stair into the light off the court, carrying " +
      "nothing at all.  That is not a loss.  The haul was never the object, and " +
      "the table came up in your heads.  You will have to go and tell a king so.",
    ) + "\n\n");
  } else {
    out("You walk out.\n\n");
  }
}
