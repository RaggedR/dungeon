// solve.ts — is this labyrinth completable, and in how many descents?
//
// No servers, no HTTP, no language model.  A search over `spec.ts` alone,
// which is why it is the first thing built: it needs nothing else to exist,
// and if it answers "no" then every later phase is building the wrong
// labyrinth.
//
// Four questions, from PLAN-build.md §3:
//   1. is there any winning schedule at all, inside the hand budget?
//   2. what is the minimum number of descents?  THEME.md says at least two.
//   3. is the desire graph acyclic — is the goal structure a goal structure?
//   4. what can the party carry out, once M2 has taken one of the three?

import {
  BENCH, DESIRES, HANDS_FREE, HANDS_OF, INERT, LYING, MONSTERS, WAYS,
  type Desire, type Item, type Material, type Room, type Secret,
} from "./spec.ts";

// ── Encoding ──────────────────────────────────────────────────────────
const KINDS = Object.keys(HANDS_OF) as Item[];
const KIX = new Map(KINDS.map((k, i) => [k, i]));
const IS_MATERIAL = new Set<string>(BENCH);

const SECRETS: Secret[] = ["S1", "S2", "S3", "S4", "S5", "S6"];
const SIX = new Map(SECRETS.map((s, i) => [s, i]));

const wayKey = (a: Room, b: Room) => (a < b ? `${a}|${b}` : `${b}|${a}`);
const GUARDED = WAYS.filter((w) => w.guard !== null);
const DIX = new Map(GUARDED.map((w, i) => [wayKey(w.from, w.to), i]));

/** Which rooms an inhabitant can be met in.  A guard stands on the near side
 *  of its way, so it is met in the room the party is already in. */
const ROOMS_OF = new Map(
  MONSTERS.map((m) => [m.id, new Set(m.post.kind === "stands" ? [m.post.room] : m.post.rooms)]),
);

/** The desires the search may use.  A trade that consumes a relic and hands
 *  back an object this build cannot use is a sink: it can only ever make a
 *  state worse, so it never lies on a solution.  Excluded by argument, not
 *  searched and discarded. */
const LIVE: Desire[] = DESIRES.filter((d) => !INERT.has(d.id));

interface State {
  readonly room: Room;
  readonly held: readonly number[];   // counts, indexed by KIX
  readonly secrets: number;           // bitmask over SECRETS
  readonly doors: number;             // bitmask over GUARDED
  readonly used: readonly number[];   // times each LIVE desire has been struck
  readonly taken: number;             // bitmask over LYING
  readonly party: number;             // 3, or 2 once M2 has been paid
}

const key = (s: State) =>
  `${s.room}|${s.held.join(",")}|${s.secrets}|${s.doors}|${s.used.join(",")}|${s.taken}|${s.party}`;

const hands = (held: readonly number[]) =>
  held.reduce((n, c, i) => n + c * HANDS_OF[KINDS[i]], 0);

const has = (held: readonly number[], items: readonly Item[]) => {
  const need = new Map<number, number>();
  for (const it of items) need.set(KIX.get(it)!, (need.get(KIX.get(it)!) ?? 0) + 1);
  for (const [i, n] of need) if (held[i] < n) return false;
  return true;
};

const without = (held: readonly number[], items: readonly Item[]) => {
  const out = held.slice();
  for (const it of items) out[KIX.get(it)!] -= 1;
  return out;
};

const withItem = (held: readonly number[], item: Item) => {
  const out = held.slice();
  out[KIX.get(item)!] += 1;
  return out;
};

// ── Moves ─────────────────────────────────────────────────────────────
interface Step { readonly label: string; readonly next: State; readonly descends: boolean }

function moves(s: State): Step[] {
  const out: Step[] = [];
  const budget = HANDS_FREE(s.party);

  // walk
  for (const w of WAYS) {
    for (const [from, to] of [[w.from, w.to], [w.to, w.from]] as const) {
      if (from !== s.room) continue;
      if (w.guard !== null && !(s.doors & (1 << DIX.get(wayKey(w.from, w.to))!))) continue;
      out.push({
        label: `go to ${to}`,
        next: { ...s, room: to },
        descends: from === "0.A" && to === "1.A",
      });
    }
  }

  // pick up what is lying about
  LYING.forEach((l, i) => {
    if (l.room !== s.room || (s.taken & (1 << i))) return;
    const held = withItem(s.held, l.item);
    if (hands(held) > budget) return;
    out.push({
      label: `take the ${l.item} lying in ${l.room}`,
      next: { ...s, held, taken: s.taken | (1 << i) },
      descends: false,
    });
  });

  // the bench in 0.A: set down what is free to set down, then take at most one
  // of each material.  Two restrictions, and both are arguments rather than
  // budget cuts.  A material dropped can be picked up again next trip, so
  // dropping one is never a loss.  A *relic* dropped is gone, and every relic
  // in the labyrinth is consumed by exactly one desire on the way to the
  // Tablet — so discarding one cannot shorten a solution, it can only destroy
  // it.  The Kalam Brick is the single exception: nobody wants it, so it is
  // the one thing the party may put down.
  if (s.room === "0.A") {
    const brick = KIX.get("kalam-brick")!;
    for (const dropBrick of s.held[brick] > 0 ? [false, true] : [false]) {
      const base = s.held.slice();
      for (const m of BENCH) base[KIX.get(m)!] = 0;
      if (dropBrick) base[brick] = 0;
      for (const pick of subsets(BENCH.length)) {
        const held = base.slice();
        const took: Material[] = [];
        BENCH.forEach((m, j) => {
          if (pick & (1 << j)) { held[KIX.get(m)!] += 1; took.push(m); }
        });
        if (hands(held) > budget) continue;
        if (held.every((c, i) => c === s.held[i])) continue;
        out.push({
          label: took.length
            ? `take from the bench: ${took.join(", ")}`
            : "set down what you carry",
          next: { ...s, held },
          descends: false,
        });
      }
    }
  }

  // strike a bargain
  LIVE.forEach((d, i) => {
    if (s.used[i] >= d.times) return;
    if (!ROOMS_OF.get(d.who)!.has(s.room)) return;
    if (!has(s.held, d.items)) return;
    if (!d.told.every((t) => s.secrets & (1 << SIX.get(t)!))) return;

    const paid = without(s.held, d.items);
    const used = s.used.slice(); used[i] += 1;
    const g = d.gives;

    if (g.kind === "item") {
      const held = withItem(paid, g.item);
      if (hands(held) > budget) return;
      out.push({ label: `${d.who}: ${price(d)} → the ${g.item}`, next: { ...s, held, used }, descends: false });
    } else if (g.kind === "secret") {
      out.push({
        label: `${d.who}: ${price(d)} → ${g.secret}`,
        next: { ...s, held: paid, used, secrets: s.secrets | (1 << SIX.get(g.secret)!) },
        descends: false,
      });
    } else if (g.kind === "opens") {
      out.push({
        label: `${d.who}: ${price(d)} → the way ${g.from} to ${g.to} opens`,
        next: { ...s, held: paid, used, doors: s.doors | (1 << DIX.get(wayKey(g.from, g.to))!) },
        descends: false,
      });
    } else {
      // M2.  The Tablet out and one of the three in, in the same moment.
      const held = withItem(paid, "foundation-tablet");
      if (hands(held) > HANDS_FREE(2)) return;
      out.push({
        label: `M2: ${price(d)}, and one of the three → the Foundation Tablet`,
        next: { ...s, held, used, party: 2, doors: s.doors | (1 << DIX.get(wayKey("1.D", "1.E"))!) },
        descends: false,
      });
    }
  });

  return out;
}

const price = (d: Desire) =>
  [...d.items.map((i) => `the ${i}`), ...d.told].join(" + ") || "nothing";

function* subsets(n: number) { for (let m = 0; m < (1 << n); m++) yield m; }

// ── Dijkstra, with descents as the primary cost ───────────────────────
function search() {
  const start: State = {
    room: "0.A", held: KINDS.map(() => 0), secrets: 0, doors: 0,
    used: LIVE.map(() => 0), taken: 0, party: 3,
  };
  const cost = new Map<string, number>();
  const back = new Map<string, { from: string; label: string; descends: boolean }>();
  const seen = new Map<string, State>();
  const COST = (d: number, n: number) => d * 1_000_000 + n;

  const heap: { c: number; s: State }[] = [];
  const push = (e: { c: number; s: State }) => {
    heap.push(e);
    let i = heap.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (heap[p].c <= heap[i].c) break;
      [heap[p], heap[i]] = [heap[i], heap[p]]; i = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < heap.length && heap[l].c < heap[m].c) m = l;
        if (r < heap.length && heap[r].c < heap[m].c) m = r;
        if (m === i) break;
        [heap[m], heap[i]] = [heap[i], heap[m]]; i = m;
      }
    }
    return top;
  };
  push({ c: 0, s: start });
  cost.set(key(start), 0);
  seen.set(key(start), start);

  let goal: string | null = null;
  let expanded = 0;

  while (heap.length) {
    const { c, s } = pop();
    const k = key(s);
    if (c > (cost.get(k) ?? Infinity)) continue;
    expanded++;

    if (s.room === "0.A" && s.held[KIX.get("foundation-tablet")!] > 0) { goal = k; break; }

    for (const m of moves(s)) {
      const nk = key(m.next);
      const nc = c + COST(m.descends ? 1 : 0, 1);
      if (nc < (cost.get(nk) ?? Infinity)) {
        cost.set(nk, nc);
        back.set(nk, { from: k, label: m.label, descends: m.descends });
        seen.set(nk, m.next);
        push({ c: nc, s: m.next });
      }
    }
  }

  return { goal, cost, back, seen, expanded };
}

// ── Question 3: is the desire graph acyclic? ──────────────────────────
function acyclic() {
  // An edge runs from a desire to each desire that produces something it needs.
  const producers = (need: Item | Secret) =>
    LIVE.filter((d) =>
      (d.gives.kind === "item" && d.gives.item === need) ||
      (d.gives.kind === "secret" && d.gives.secret === need),
    ).map((d) => d.id);

  const edges = new Map<string, string[]>();
  for (const d of LIVE) {
    const deps = new Set<string>();
    for (const i of d.items) for (const p of producers(i)) deps.add(p);
    for (const t of d.told) for (const p of producers(t)) deps.add(p);
    edges.set(d.id, [...deps]);
  }

  const colour = new Map<string, 0 | 1 | 2>();
  const cycles: string[][] = [];
  const walk = (n: string, path: string[]): void => {
    colour.set(n, 1);
    for (const m of edges.get(n) ?? []) {
      if (colour.get(m) === 1) cycles.push([...path.slice(path.indexOf(m)), m]);
      else if (!colour.has(m)) walk(m, [...path, m]);
    }
    colour.set(n, 2);
  };
  for (const d of LIVE) if (!colour.has(d.id)) walk(d.id, [d.id]);

  // depth of each desire, = longest chain beneath it
  const depth = new Map<string, number>();
  const dep = (n: string): number => {
    if (depth.has(n)) return depth.get(n)!;
    depth.set(n, 0);
    const v = 1 + Math.max(0, ...(edges.get(n) ?? []).map(dep));
    depth.set(n, v);
    return v;
  };
  for (const d of LIVE) dep(d.id);

  return { cycles, edges, depth };
}

// ── Report ────────────────────────────────────────────────────────────
const t0 = performance.now();
const { goal, cost, back, seen, expanded } = search();
const ms = Math.round(performance.now() - t0);
const { cycles, depth } = acyclic();

const rule = (s: string) => console.log(`\n${s}\n${"─".repeat(s.length)}`);

rule("1. Is there a winning schedule?");
if (!goal) {
  console.log("NO.  No sequence of moves ends at 0.A holding the Foundation Tablet.");
  console.log(`Searched ${expanded} states in ${ms} ms.`);
  Deno.exit(1);
}

const path: { label: string; descends: boolean }[] = [];
for (let k: string | undefined = goal; k && back.has(k); k = back.get(k)!.from) {
  const b = back.get(k)!;
  path.unshift({ label: b.label, descends: b.descends });
}
const descents = Math.floor(cost.get(goal)! / 1_000_000);
console.log(`YES.  ${path.length} moves, ${descents} descent${descents === 1 ? "" : "s"}.`);
console.log(`Searched ${expanded} states in ${ms} ms.`);

rule("2. Minimum descents");
console.log(`THEME.md: "at minimum a two-descent game".  Search: ${descents}.`);
console.log(descents === 2 ? "Agrees." : `DISAGREES — the spec is wrong by ${descents - 2}.`);

rule("3. Is the desire graph acyclic?");
if (cycles.length === 0) {
  const deepest = [...depth.entries()].sort((a, b) => b[1] - a[1])[0];
  console.log(`YES.  No cycles.  Deepest chain: ${deepest[0]} at depth ${deepest[1]}.`);
} else {
  console.log(`NO.  ${cycles.length} cycle(s):`);
  for (const c of cycles) console.log(`  ${c.join(" → ")}`);
}

rule("4. What comes out");
const end = seen.get(goal)!;
const carried = KINDS.filter((k) => end.held[KIX.get(k)!] > 0)
  .map((k) => `${end.held[KIX.get(k)!]}× ${k}`);
console.log(`Party of ${end.party}.  ${HANDS_FREE(end.party)} free hands, ${hands(end.held)} used.`);
console.log(`Carrying: ${carried.join(", ")}`);

rule("5. Is any desire optional?");
const struck = new Set(
  path.map((p) => p.label.match(/^(M\d+):/)?.[1]).filter(Boolean) as string[],
);
const idle = LIVE.filter((d) => !struck.has(d.who)).map((d) => d.id);
console.log(
  idle.length === 0
    ? `NO.  All ${LIVE.length} live desires are struck on the shortest solution.`
    : `${idle.length} unused on this solution: ${idle.join(", ")}`,
);
console.log(
  `Excluded by argument, not searched: ${[...INERT].join(", ")} — each consumes a`,
);
console.log("relic and returns an object this build has no use for.");

rule("The schedule");
let trip = 0;
for (const step of path) {
  if (step.descends) console.log(`\n  ── descent ${++trip}, through the trapdoor in 0.A ──`);
  console.log(`  ${step.label}`);
}
console.log();
