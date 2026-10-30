// leaf-claude.ts — the oracle at the leaf.
//
// An LLM does one thing: it takes a prompt and produces an answer.  In this
// vocabulary that is a direct answerer, an event handler into the do-nothing
// interface, `(s : S) -> P s`.  It is a LEAF: it does not delegate further, it
// just answers.
//
// And a raw LLM is untyped.  It maps text to text, and nothing about it
// guarantees its output lies in `P s`.  Presenting it as `(s : S) -> P s` is a
// PROMISE, made good by the wrapper around it — and this file is that wrapper.
// The interface is the contract; the model is the fallible oracle behind it;
// the decoder is the only thing that ever establishes the contract was kept.
//
// Nothing here forgives anything.  A reply that does not decode throws, and the
// level logs the refusal.  A default would turn an unchecked type into a
// checked-looking one, which is worse than a crash.

import { MONSTERS, type MonsterId } from "./spec.ts";
import type { MonsterPrompt, MonsterReply } from "./containers.ts";
import { decodeMonsterReply } from "./flow.ts";
import type { Memory } from "./leaf-stub.ts";

const M = new Map(MONSTERS.map((m) => [m.id, m]));

/** Counted per process, and reported by `rejection-rate.ts`.  The honest price
 *  of putting a model at a leaf is a number, and this is where it is kept. */
export const tally = {
  asked: 0,
  decoded: 0,
  /** Turns where a monster's reply would not decode after every retry and it
   *  was taken to be SILENT rather than crashing the tower.  Counted, not
   *  hidden: a monster that is silent because it broke is a different event from
   *  one that chose silence, even though the game cannot tell them apart from the
   *  outside, and the honest audit keeps the number. */
  forcedSilent: 0,
  causes: new Map<string, number>(),
};

/** The silent position — a legal, ordinary reply.  "An inhabitant that has been
 *  treated as a vending machine says nothing, whatever is put in front of it."
 *  A reply that will not decode after every attempt collapses to THIS rather
 *  than throwing: a monster that cannot speak legibly and a monster that chooses
 *  silence are the same position of its container, exactly as a denied command
 *  and a jammed tool are the same position from inside.  The per-attempt decoder
 *  still forgives nothing; what changes is only the consequence of exhausting
 *  the retries — the tower survives one bad call among the hundreds a full game
 *  makes. */
function silence(p: MonsterPrompt): MonsterReply {
  const pos = p.tag === "Ask"
    ? { prose: "", answered: false }
    : p.tag === "Tell"
    ? { prose: "", accepted: false }
    : { prose: "", traded: false };
  return { pos, tool: null };
}

const note = (cause: string) =>
  tally.causes.set(cause, (tally.causes.get(cause) ?? 0) + 1);

/** The brief.  It describes the shape of the reply and NOT what is wanted.
 *  The monster's own `CLAUDE.md` — which it reads on startup and cannot write
 *  to — is what tells it who it is, what it knows and what it will not say.
 *  This file must not repeat any of that, or the personality stops being the
 *  file and starts being the harness. */
function brief(id: MonsterId, p: MonsterPrompt, mem: Memory): string {
  const me = M.get(id)!;
  const addressed = p.to === id;

  const said = p.tag === "Offer"
    ? `The party holds out what it is carrying: ${
      p.held.length ? p.held.join(", ") : "nothing at all"
    }.`
    : p.tag === "Ask"
    ? `The party asks: "${p.words}"`
    : `The party says to you: "${p.words}"`;

  // The monster's own memory of this conversation, threaded back in so a
  // stateless call can meet a condition that spans turns (M0's "all five
  // asked", the curiosity two inhabitants want before a secret).  It is the
  // dual of the player's transcript: what THIS inhabitant has actually heard
  // and said, in order, and nothing from any other room or inhabitant.
  const history = mem.history.length
    ? [
      "So far, between you and this party (oldest first — this is your memory, " +
      "and the only record of it):",
      ...mem.history,
      "",
    ]
    : [];

  // The monster's perception of the world, over and above the words — the dual
  // of the player's `sees`.  It is the ground truth about the way this
  // inhabitant guards, so it OVERRIDES memory: if you believe you opened the way
  // but this says it is still shut, then it did not open, your tool did not fire,
  // and you must fire it now (in a reply whose condition is otherwise met).
  const world = p.perceives?.guardedWayShut === undefined
    ? []
    : [
      p.perceives.guardedWayShut
        ? "The way you guard is RIGHT NOW still shut. If you believe you already " +
          "opened it, you are mistaken — saying so did not open it; only the " +
          'open_door tool does. If the party has met your condition, set ' +
          '"tool":{"tag":"open_door"} in THIS reply.'
        : "The way you guard is now open; there is nothing left to open.",
      "",
    ];

  return [
    `You are ${me.name}. Everyone in the room hears what is said.`,
    addressed
      ? "This was addressed to YOU."
      : "This was addressed to somebody else in the room, not to you. You may " +
        "stay silent, and silence is the ordinary answer.",
    "",
    ...history,
    ...world,
    said,
    "",
    "Reply with a single JSON object and no other text, of exactly this form:",
    p.tag === "Ask"
      ? '  {"prose": "<what you say, in plain English>", "answered": true|false, "tool": null}'
      : p.tag === "Tell"
      ? '  {"prose": "<what you say, or empty>", "accepted": true|false, "tool": null}'
      : '  {"prose": "<what you say>", "traded": true|false, "tool": null}',
    "",
    'To open the way you are standing at, set "tool" to {"tag": "open_door"}.',
    'To hand over what you are holding, set "tool" to {"tag": "trade"}.',
    "At most one tool, and only when the condition in your own file is met.",
    "You cannot call, summon, fetch or send for anybody else. There is no third tool.",
    "",
    "SAYING an action in prose does NOTHING on its own. Telling the party the way " +
    "is open, or that you hand something over, is only words — the ONLY thing that " +
    "opens a way or moves an object is the tool field. So if your reply means the " +
    'way should open, you MUST set "tool":{"tag":"open_door"} in THIS SAME reply; if ' +
    'it means you give them what they came for, set "tool":{"tag":"trade"}. Never ' +
    "narrate an opening or a handover you have not put in the tool field.",
  ].join("\n");
}

/** Spawn the harness.  Same `Deno.Command`, same argument vector, same standard
 *  output as every other hop in this game.  `--add-dir` is scoped to the
 *  monster's own directory and nothing above it, so the sixteen cannot read one
 *  another's files.  `--allowedTools ""` grants it no tools at all, and
 *  `--permission-mode plan` is the second belt.
 *
 *  Note what has happened to `toby.txt` §1 here, because it is the one part of
 *  that letter this build supersedes on purpose.  The letter proposes a token
 *  file that `open_wrapper` and `trade_wrapper` read, so a monster holding tools
 *  cannot use the wrong one.  This design does not give the monster the tools.
 *  It returns a REQUEST to use one, in a JSON field, and `engine.ts` decides
 *  whether `spec.ts` licenses it.  There is no wrapper to subvert because there
 *  is no wrapper, and the enforcement is arithmetic rather than a file mode.
 *  What the flags above buy is the smaller, separate claim that the process
 *  cannot go looking for one. */
async function askClaude(id: MonsterId, prompt: string): Promise<string> {
  const dir = new URL(`./monsters/${id}/`, import.meta.url).pathname;
  const model = Deno.env.get("LABYRINTH_MODEL");
  const cmd = new Deno.Command("claude", {
    args: [
      "-p", prompt,
      // The inhabitant's OWN file is its system prompt, so the oracle IS the
      // inhabitant and nothing else.  Without this, `claude -p` wears its
      // Claude-Code identity and, in a crowded room where it was not the one
      // addressed, breaks character into meta-commentary ("I need to treat this
      // as the game it is...") instead of the one silent JSON reply it owes —
      // which the decoder rightly throws out.  The player leaf learned this
      // first; the three-monster tensor is where the monster leaf needs it too.
      "--system-prompt-file", `${dir}CLAUDE.md`,
      "--exclude-dynamic-system-prompt-sections",
      "--setting-sources", "project,local",
      "--add-dir", dir,
      "--allowedTools", "",
      "--permission-mode", "plan",
      ...(model ? ["--model", model] : []),
    ],
    cwd: dir,
    stdout: "piped",
    stderr: "piped",
  });
  const { code, stdout, stderr } = await cmd.output();
  if (code !== 0) {
    throw new Error(`claude exited ${code}: ${new TextDecoder().decode(stderr).slice(0, 200)}`);
  }
  return new TextDecoder().decode(stdout).trim();
}

/** Four things the binary might really put on standard output, and what each
 *  one is:
 *
 *    a legal reply         -> a MonsterReply
 *    a ninth tool          -> null, rejected at the boundary
 *    an apology            -> null, rejected at the boundary
 *    fenced JSON           -> unfenced first, then as above
 *
 *  A model that wraps its answer in a markdown fence has produced eleven
 *  characters of punctuation around a legal reply, so the fence is stripped.
 *  Nothing else is forgiven.  Neither of the other two is malice and both are
 *  ordinary, and both are stopped here by the same three lines. */
export function unfence(text: string): string {
  const m = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : text).trim();
}

const CORRECTION =
  "\n\nYour last reply was not a single JSON object of the required form. Send " +
  "EXACTLY ONE JSON object and nothing else — no words around it, no markdown " +
  "fence. If this was not addressed to you, the reply is still that object, with " +
  'an empty "prose" and the boolean false.';

export async function claudeReply(
  id: MonsterId, p: MonsterPrompt, mem: Memory,
): Promise<MonsterReply> {
  tally.asked += 1;
  const base = brief(id, p, mem);

  // What the party did this turn, recorded whether or not it was addressed to
  // this inhabitant — a monster in a crowded room still HEARD it, and "have
  // they asked me about all five?" is only answerable if every asking is kept.
  const youHeard = p.tag === "Offer"
    ? `They offered what they held: ${p.held.length ? p.held.join(", ") : "nothing"}.`
    : p.tag === "Ask"
    ? `They asked: "${p.words}"`
    : `They said: "${p.words}"`;

  // Up to three attempts, like the player leaf's re-ask.  The decoder still
  // forgives nothing — a reply that does not validate is asked for again, and
  // only a reply that fails EVERY time throws.  A single drifted answer from one
  // inhabitant in a crowded room should not take the whole tower down with it,
  // but a persistently broken one still must, visibly.
  let lastBody = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const text = await askClaude(id, attempt === 0 ? base : base + CORRECTION);
    const body = lastBody = unfence(text);

    let u: unknown;
    try {
      u = JSON.parse(body);
    } catch {
      if (attempt < 2) continue;
      note("not JSON");
      return forcedSilence(id, p, mem, youHeard, "not JSON", body);
    }

    // The wire shape is {pos, tool}; a model is asked for the flatter thing a
    // person would write, so it is lifted here.  The lift is presentation; the
    // decode below is the check, and it is the only one.
    const r = u as Record<string, unknown>;
    const lifted = { pos: { ...r }, tool: r.tool ?? null };
    delete (lifted.pos as Record<string, unknown>).tool;

    const reply = decodeMonsterReply(lifted);
    if (reply === null) {
      if (attempt < 2) continue;
      const cause = causeOf(r, p);
      note(cause);
      return forcedSilence(id, p, mem, youHeard, cause, body);
    }
    tally.decoded += 1;
    // Writeback: this exchange joins the monster's memory, so next turn it sees
    // what it has already been asked and already answered. A tool fired is part
    // of what happened and is recorded too.
    const youSaid = reply.pos.prose.trim()
      ? `You answered: "${reply.pos.prose.trim()}"`
      : "You said nothing.";
    const toolNote = reply.tool ? ` (you used ${reply.tool.tag})` : "";
    mem.history.push(`${youHeard} ${youSaid}${toolNote}`);
    return reply;
  }
  // The loop only falls through here if every attempt `continue`d without a
  // terminal branch, which the structure above prevents; kept as a belt.
  return forcedSilence(id, p, mem, youHeard, "exhausted", lastBody);
}

/** Collapse an undecodable exchange to silence — a legal position — rather than
 *  throw.  Honest about it: bump a distinct counter, record it in the monster's
 *  own memory as a non-answer, and append the raw reply to a file that survives
 *  server restarts, so a systematic failure at one inhabitant is VISIBLE as a
 *  cluster rather than laundered into a clean game.  The file is the evidence
 *  that tells a random hiccup (category 1, spread thin) from a broken monster
 *  (category 2, all at one id) — which decides whether the cure is this net or a
 *  fix at the source. */
function forcedSilence(
  id: MonsterId, p: MonsterPrompt, mem: Memory, youHeard: string,
  cause: string, body: string,
): MonsterReply {
  tally.forcedSilent += 1;
  mem.history.push(`${youHeard} You could not find your words, and said nothing.`);
  try {
    const line = JSON.stringify({ id, tag: p.tag, cause, reply: body.slice(0, 400) }) + "\n";
    Deno.writeTextFileSync(
      new URL("./.run/forced-silence.jsonl", import.meta.url).pathname,
      line,
      { append: true },
    );
  } catch { /* .run may not exist outside ./up.sh; the counter still stands */ }
  return silence(p);
}

function causeOf(r: Record<string, unknown>, p: MonsterPrompt): string {
  if (typeof r.prose !== "string") return "no prose field";
  const flag = p.tag === "Ask" ? "answered" : p.tag === "Tell" ? "accepted" : "traded";
  if (typeof r[flag] !== "boolean") return `${flag} was not a boolean`;
  if (r.tool !== null && r.tool !== undefined) return "a tool that is in no interface";
  return "unknown";
}
