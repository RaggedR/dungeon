// leaf-model.ts — the player's oracle, and the one env var that swaps it.
//
// The player is a leaf exactly as a monster is: it is prompted (with a room, a
// `sees`) and it owes a reply (a `Move`) whose type was fixed before the prompt
// went out.  `leaf-claude.ts` is that wrapper on the monster side; this file is
// the raw oracle on the player side, and `player-claude.ts` is the wrapper that
// turns its String → String into the typed `(Choose{sees}) → Move`.
//
// There are two oracles behind one interface, chosen by `LABYRINTH_PLAYER`:
//
//   claude   the local `claude` binary, same hop as every monster (default)
//   groq     an OpenAI-compatible endpoint, for a keyless-for-the-reader run
//
// Everything above this file is identical either way.  The scripted player in
// `harness.ts` does not touch this file at all — it needs no oracle.
//
// THE SANDBOX IS LOAD-BEARING TWICE.  `--add-dir player/` and a `cwd` of
// `player/` do for the player what `--add-dir monsters/<id>/` does for a
// monster: they isolate it.  But here that isolation is also what keeps the
// game honest, because `player/` holds nothing but the persona.  The process
// cannot read `spec.ts` or `secrets.ts`, so it cannot read the table of who
// wants what — the very thing it is down there to discover.

const PLAYER_DIR = new URL("./player/", import.meta.url).pathname;

/** The oracle: one per-turn user prompt in, one block of text out.  The
 *  standing rules of play live in `player/CLAUDE.md` and reach both backends
 *  from that one file — read natively by `claude`, read by us for `groq`. */
export type Ask = (userPrompt: string) => Promise<string>;

// ── claude ──────────────────────────────────────────────────────────────
/** The same `Deno.Command`, flags and sandbox as `leaf-claude.ts`'s monster
 *  hop.  `--allowedTools ""` grants it nothing; `--permission-mode plan` is the
 *  second belt; `--add-dir PLAYER_DIR` is the first and the important one.  The
 *  transcript rides in `-p` because a `claude -p` call is stateless — the store
 *  is threaded explicitly, which is exactly the worker picture. */
function claudeAsk(): Ask {
  const model = Deno.env.get("LABYRINTH_MODEL");
  return async (userPrompt) => {
    const cmd = new Deno.Command("claude", {
      args: [
        "-p", userPrompt,
        // The persona IS the system prompt.  Without this, `claude -p` wears its
        // Claude-Code assistant identity and, faced with a hard decision and no
        // tools, reaches for the user — "AskUserQuestion isn't available, so I'll
        // ask in plain text" — which is not a move and the decoder rightly throws
        // it out.  Replacing the system prompt makes the oracle the player and
        // nothing else, and makes this backend symmetric with groq, which sends
        // the same file as its system message.
        "--system-prompt-file", `${PLAYER_DIR}CLAUDE.md`,
        "--exclude-dynamic-system-prompt-sections",
        // Do NOT load the operator's own ~/.claude memory and settings; the
        // player is not the operator's assistant and must not inherit its reflexes.
        "--setting-sources", "project,local",
        "--add-dir", PLAYER_DIR,
        "--allowedTools", "",
        "--permission-mode", "plan",
        ...(model ? ["--model", model] : []),
      ],
      cwd: PLAYER_DIR,
      stdout: "piped",
      stderr: "piped",
    });
    const { code, stdout, stderr } = await cmd.output();
    if (code !== 0) {
      throw new Error(
        `claude exited ${code}: ${new TextDecoder().decode(stderr).slice(0, 200)}`,
      );
    }
    return new TextDecoder().decode(stdout).trim();
  };
}

// ── groq / any OpenAI-compatible endpoint ─────────────────────────────────
// One base URL switches Groq, Cerebras, OpenRouter or a local Ollama.  The key
// is read from the environment (`source ~/.config/groq/env` first); the model
// is discovered from `/models` rather than hardcoded, because the free tier's
// catalogue drifts and a pinned id goes stale.

const GROQ_BASE = Deno.env.get("GROQ_BASE_URL") ?? "https://api.groq.com/openai/v1";

/** Preferences in order; the first that the endpoint actually lists wins.  A
 *  miss falls through to the first chat-capable id the endpoint returns, so a
 *  renamed catalogue degrades rather than crashes. */
const PREFER = [
  "llama-3.3-70b-versatile",
  "llama-3.1-70b-versatile",
  "moonshotai/kimi-k2-instruct",
  "qwen-2.5-72b-instruct",
];

async function discoverModel(key: string): Promise<string> {
  const pinned = Deno.env.get("LABYRINTH_MODEL");
  if (pinned) return pinned;
  const res = await fetch(`${GROQ_BASE}/models`, {
    headers: { authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`GET /models answered ${res.status}`);
  const body = await res.json() as { data?: { id: string }[] };
  const ids = (body.data ?? []).map((m) => m.id);
  if (ids.length === 0) throw new Error("the endpoint lists no models");
  for (const want of PREFER) if (ids.includes(want)) return want;
  // Whisper/TTS/guard models are not chat models; skip the obvious ones.
  const chat = ids.find((id) => !/whisper|tts|guard|embed/i.test(id));
  return chat ?? ids[0];
}

/** Parse `Retry-After`, which the spec allows to be either a number of seconds
 *  or an HTTP-date.  A free tier sends both over a day, and honouring it is the
 *  difference between a run that finishes and one that aborts on the first
 *  throttle. */
function retryAfterMs(h: string | null, nowMs: number): number {
  if (!h) return 1000;
  const secs = Number(h);
  if (Number.isFinite(secs)) return Math.max(0, secs * 1000);
  const when = Date.parse(h);
  return Number.isFinite(when) ? Math.max(0, when - nowMs) : 1000;
}

function groqAsk(): Ask {
  const key = Deno.env.get("GROQ_API_KEY");
  if (!key) {
    throw new Error(
      "LABYRINTH_PLAYER=groq but GROQ_API_KEY is unset — `source ~/.config/groq/env` first",
    );
  }
  // The standing rules of play are the player's persona, and there is one
  // source of them: the same file `claude` reads.  We read it once and send it
  // as the system message, so neither backend carries a second copy.
  const system = Deno.readTextFileSync(`${PLAYER_DIR}CLAUDE.md`);
  let modelP: Promise<string> | null = null;

  return async (userPrompt) => {
    const model = await (modelP ??= discoverModel(key));
    for (let attempt = 0; attempt < 6; attempt++) {
      const res = await fetch(`${GROQ_BASE}/chat/completions`, {
        method: "POST",
        headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
        body: JSON.stringify({
          model,
          temperature: 0.3,
          messages: [
            { role: "system", content: system },
            { role: "user", content: userPrompt },
          ],
        }),
      });
      if (res.status === 429 || res.status === 503) {
        const wait = retryAfterMs(res.headers.get("retry-after"), Date.now());
        await res.body?.cancel();
        await new Promise((r) => setTimeout(r, Math.min(wait, 60_000)));
        continue;
      }
      if (!res.ok) {
        throw new Error(`chat/completions answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
      }
      const body = await res.json() as { choices?: { message?: { content?: string } }[] };
      const text = body.choices?.[0]?.message?.content;
      if (typeof text !== "string") throw new Error("no message content in the reply");
      return text.trim();
    }
    throw new Error("gave up after six throttled attempts");
  };
}

// ── the switch ────────────────────────────────────────────────────────────
export function modelAsk(): Ask {
  const which = (Deno.env.get("LABYRINTH_PLAYER") ?? "claude").toLowerCase();
  if (which === "claude") return claudeAsk();
  if (which === "groq" || which === "openai") return groqAsk();
  throw new Error(`LABYRINTH_PLAYER=${which} is neither "claude" nor "groq"`);
}
