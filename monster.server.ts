// monster.server.ts (:9100+n) — one program, sixteen processes.
//
//   deno run --allow-net --allow-env --allow-read monster.server.ts M8
//
// A monster is a server, and the level it stands in is its client.  From above
// there is no way to tell one from any other server here, and that is the whole
// claim.  What is behind the socket is decided by one environment variable:
//
//   LABYRINTH_LEAF=stub     `leaf-stub.ts`, scripted, deterministic  (default)
//   LABYRINTH_LEAF=claude   `leaf-claude.ts`, which spawns the harness
//
// Nothing above this line changes when that variable changes.  That is the
// point of the variable.

import { serveContainer } from "./lib/wire.ts";
import { MONSTERS, type MonsterId } from "./spec.ts";
import { type MonsterPrompt, type MonsterReply, isRecord, isStr } from "./containers.ts";
import { type Memory, mkMemory, stubReply } from "./leaf-stub.ts";
import { MONSTER_PORT } from "./ports.ts";

const id = Deno.args[0] as MonsterId;
if (!MONSTERS.some((m) => m.id === id)) {
  console.error(`usage: monster.server.ts <M0..M15>  (got ${Deno.args[0] ?? "nothing"})`);
  Deno.exit(2);
}

/** An inhabitant's whole memory: what it has been told, and whether it has been
 *  treated as a person.  It lives in the process, which is the only place it
 *  could live — the party record has nowhere to put it, and that is deliberate. */
const mem: Memory = mkMemory();
const struck = new Map<string, number>();

const LEAF = Deno.env.get("LABYRINTH_LEAF") ?? "stub";

const parse = (u: unknown): MonsterPrompt | null => {
  if (!isRecord(u) || !isStr(u.tag) || !isStr(u.to)) return null;
  if (u.tag === "Ask" || u.tag === "Tell") {
    return isStr(u.words)
      ? { tag: u.tag, to: u.to as MonsterId, words: u.words } as MonsterPrompt
      : null;
  }
  if (u.tag === "Offer") {
    return Array.isArray(u.held) && u.held.every(isStr)
      ? { tag: "Offer", to: u.to as MonsterId, held: u.held } as MonsterPrompt
      : null;
  }
  return null;
};

async function answer(p: MonsterPrompt): Promise<MonsterReply> {
  if (LEAF === "claude") {
    const { claudeReply } = await import("./leaf-claude.ts");
    return await claudeReply(id, p, mem);
  }
  return stubReply(id, p, mem, (d) => struck.get(d) ?? 0);
}

serveContainer<MonsterPrompt>({
  name: id,
  port: MONSTER_PORT(id),
  parse,
  answer: (p) => answer(p),
});
