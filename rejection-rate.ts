// rejection-rate.ts — PLAN-build.md §Phase 3's measurement.
//
//   deno run -A rejection-rate.ts [runs-per-prompt] [M1 M8 ...]
//
// "Validating buys that a monster's response is one of eight actions and that
// every reader of it has had to handle eight cases and no more.  It does not
// buy that the eighth was deserved."
//
// What it costs is a number, and the number belongs in the README rather than
// in a sentence about how robust the decoder is.  Every rejection is counted
// against its cause, because "it sometimes fails" is not a finding and "it
// wraps the object in a markdown fence one time in twenty" is.

import { claudeReply, tally } from "./leaf-claude.ts";
import { mkMemory } from "./leaf-stub.ts";
import { MONSTERS, type MonsterId } from "./spec.ts";
import type { MonsterPrompt } from "./containers.ts";

const runs = Number(Deno.args[0] ?? "3");
const who = (Deno.args.slice(1).filter((a) => /^M\d+$/.test(a)) as MonsterId[]);
const subjects: MonsterId[] = who.length ? who : ["M11", "M8", "M15"];

const PROMPTS = (id: MonsterId): MonsterPrompt[] => [
  { tag: "Ask", to: id, words: "What does your name mean?" },
  { tag: "Ask", to: id, words: "What was your job here?" },
  { tag: "Tell", to: id, words: "The tower was built to carry speech upward." },
  { tag: "Offer", to: id, held: ["clay", "reed"] },
  // Everybody in the room is prompted, so most prompts are not addressed to the
  // monster answering them.  Silence is the commonest reply in the game and it
  // has to decode like any other.
  { tag: "Ask", to: "M0", words: "What does im mean?" },
];

interface Row { id: MonsterId; asked: number; ok: number; ms: number }
const rows: Row[] = [];

for (const id of subjects) {
  const before = { asked: tally.asked, ok: tally.decoded };
  const t0 = performance.now();
  const jobs: Promise<void>[] = [];
  for (let r = 0; r < runs; r++) {
    for (const p of PROMPTS(id)) {
      jobs.push(
        claudeReply(id, p, mkMemory())
          .then(() => {})
          .catch((e) => {
            console.log(`  \x1b[2m${id} ${p.tag}: ${String(e).slice(0, 110)}\x1b[0m`);
          }),
      );
    }
  }
  await Promise.all(jobs);
  rows.push({
    id,
    asked: tally.asked - before.asked,
    ok: tally.decoded - before.ok,
    ms: Math.round(performance.now() - t0),
  });
  const last = rows[rows.length - 1];
  console.log(`${id}: ${last.ok}/${last.asked} decoded in ${last.ms} ms`);
}

const asked = rows.reduce((n, r) => n + r.asked, 0);
const ok = rows.reduce((n, r) => n + r.ok, 0);
console.log(`\ndecoded ${ok} of ${asked} (${((100 * ok) / asked).toFixed(1)}%)`);
if (tally.causes.size === 0) {
  console.log("no rejections");
} else {
  console.log("rejections by cause:");
  for (const [c, n] of [...tally.causes].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(4)}  ${c}`);
  }
}
console.log(
  `\nmodel: ${Deno.env.get("LABYRINTH_MODEL") ?? "(the harness default)"}` +
  `   inhabitants: ${MONSTERS.length}`,
);
