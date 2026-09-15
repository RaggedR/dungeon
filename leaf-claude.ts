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
export const tally = { asked: 0, decoded: 0, causes: new Map<string, number>() };

const note = (cause: string) =>
  tally.causes.set(cause, (tally.causes.get(cause) ?? 0) + 1);

/** The brief.  It describes the shape of the reply and NOT what is wanted.
 *  The monster's own `CLAUDE.md` — which it reads on startup and cannot write
 *  to — is what tells it who it is, what it knows and what it will not say.
 *  This file must not repeat any of that, or the personality stops being the
 *  file and starts being the harness. */
function brief(id: MonsterId, p: MonsterPrompt): string {
  const me = M.get(id)!;
  const addressed = p.to === id;

  const said = p.tag === "Offer"
    ? `The party holds out what it is carrying: ${
      p.held.length ? p.held.join(", ") : "nothing at all"
    }.`
    : p.tag === "Ask"
    ? `The party asks: "${p.words}"`
    : `The party says to you: "${p.words}"`;

  return [
    `You are ${me.name}. Everyone in the room hears what is said.`,
    addressed
      ? "This was addressed to YOU."
      : "This was addressed to somebody else in the room, not to you. You may " +
        "stay silent, and silence is the ordinary answer.",
    "",
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

export async function claudeReply(
  id: MonsterId, p: MonsterPrompt, _mem: Memory,
): Promise<MonsterReply> {
  tally.asked += 1;
  const text = await askClaude(id, brief(id, p));
  const body = unfence(text);

  let u: unknown;
  try {
    u = JSON.parse(body);
  } catch {
    note("not JSON");
    throw new Error(`${id}: reply was not JSON: ${body.slice(0, 160)}`);
  }

  // The wire shape is {pos, tool}; a model is asked for the flatter thing a
  // person would write, so it is lifted here.  The lift is presentation; the
  // decode below is the check, and it is the only one.
  const r = u as Record<string, unknown>;
  const lifted = { pos: { ...r }, tool: r.tool ?? null };
  delete (lifted.pos as Record<string, unknown>).tool;

  const reply = decodeMonsterReply(lifted);
  if (reply === null) {
    note(causeOf(r, p));
    throw new Error(`${id}/${p.tag}: reply did not validate: ${body.slice(0, 160)}`);
  }
  tally.decoded += 1;
  return reply;
}

function causeOf(r: Record<string, unknown>, p: MonsterPrompt): string {
  if (typeof r.prose !== "string") return "no prose field";
  const flag = p.tag === "Ask" ? "answered" : p.tag === "Tell" ? "accepted" : "traded";
  if (typeof r[flag] !== "boolean") return `${flag} was not a boolean`;
  if (r.tool !== null && r.tool !== undefined) return "a tool that is in no interface";
  return "unknown";
}
