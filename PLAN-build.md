# Building the Labyrinth

## What this is

`THEME.pdf` is a complete specification of a minimum viable game and
`monsters/M0..M15/CLAUDE.md` are sixteen complete personalities. There is no
code. This plan is the code: what to vendor, what to write, in what order, and
what each phase has to measure before the next one starts.

Four sibling repositories have already built something out of the same `lib/`,
and each one answered a different question. `tower` wrote the combinators.
`stalin` showed a game can be five servers with an LLM on one of them.
`firm` showed that adding an agent is a change of *type*, not of configuration.
`federation` showed what happens when the graph has a cycle. This one asks:
**can an untyped oracle be held inside a typed interface when the oracle is the
entire content of the game?** Stalin's commissar answers one of three words.
Fifteen monsters answering English is a different order of the same claim.

Nothing below deviates from `THEME.pdf`. Where `toby.txt` and `THEME.pdf`
disagree, `THEME.pdf` wins, and §1.4 lists the three places they do.

---

## 1. What the spec does not yet say

Four items. Two are holes, one is a reading that needs confirming, one is
bookkeeping.

### 1.1 M4 and M9 are walkers — resolved, and it was never a gap

**This section originally called it a hole. It is not one, and the error was
mine: I read the maps and the tables and not the sixteen `CLAUDE.md` files.**

`monsters/M4/CLAUDE.md`: *"You walk about the first level, between rooms 1.A,
1.B and 1.F. You do not guard anything. You trade."*
`monsters/M9/CLAUDE.md`: *"You walk about the second level."*

They are absent from the maps because a tikz picture draws rooms and these two
are not in one. In both cases the beat is exactly the rooms of their level that
no guarded door shuts off, which is the only round a walker could keep. That is
what `spec.ts` records.

What remains true is that both trade for goods this build cannot use — a flask
of lamp oil with no clock to burn it, a healing potion with no wounds. `solve.ts`
excludes them from the search and says so in its output, on the argument that a
trade consuming a relic and returning an inert object can never lie on a
solution. Nothing needs cutting and nothing needs placing.

### 1.2 The party comes back as two — answered, and the question was mis-framed

`party = who × hands × held` and `who = {Arad-Gula, Nidintu, Bēl-šunu}`, but
after M2 takes the fourth price there are two. So `who` is a non-empty subset in
the wire type, not a fixed triple, and the decoder must accept both sizes. The
hand budget moves with it: four hands, less the lamp and the dagger, leaves
**two**.

This section asked whether the party could leave holding both the Tablet and the
Kudurru on two hands. **The question was wrong.** The Kudurru is not carried out
— it is the material half of M2's price and it is handed over at the door. So
there is no contest for the hands, and `solve.ts` confirms the party surfaces
with two free hands, the Tablet in one of them and one hand spare.

### 1.3 The tool call is not in the monster's container, and that is correct

Read the two lines together:

```
monster = ( Ask(words)  ▷ prose × (answered + refused) ) + ...
way(i)  = guard(i) ⊠ ( shut + open ◁ (...) )
```

Nothing in `monster` mentions a door. The door is the *other* half of the way's
tensor, and `shut + open` is a **sum**, so the prompt already belongs to one
side before it is sent. That forces a reading: **`open_door` fires in round
n and the way is prompted on its open side in round n+1.** The monster's reply
never carries the door; the level's record of which doors are open does.

This is worth stating because it is the difference between implementing the
algebra and implementing something that behaves like it. Confirm the reading
before Phase 2 — if a door is meant to open within the same round, `shut +
open` is wrong and the line needs to be a product.

Corollary: a door, once opened, stays open. The spec never says so, and every
room description assumes it.

### 1.4 Where `toby.txt` is superseded

| `toby.txt` | `THEME.pdf` | which |
|---|---|---|
| levels generated on demand as the party descends | *Deferred: generation of levels or specifications* | THEME |
| `monster` has `Say`/`Offer`/`Look`, eight actions including `attack` | `Ask`/`Tell`/`Offer`, no fighting | THEME |
| light is the scarce resource | *the lamp never runs out of light* | THEME |

The letter is still the architecture document for the wire, the wrappers and
the decoders. It is not the game spec.

---

## 2. The shape of the build

### 2.1 Vendor, do not write

`lib/algebra.ts`, `lib/wire.ts`, `lib/delegate.ts` copied verbatim from `tower`,
with `lib/README.md` recording any divergence — the same discipline `stalin`,
`firm` and `federation` follow. This is the fourth reuse of that library, and
the reuse is the test of whether it is a library.

```sh
cp ../tower/algebra.ts ../tower/wire.ts ../tower/delegate.ts lib/
```

`stalin/lib/wire.ts` has exactly one deliberate divergence (an inlined
`isRecord`). Diff against both and record which ancestor was taken.

### 2.2 Files and ports

```
dungeon/
  lib/               algebra.ts  wire.ts  delegate.ts   vendored, unchanged
  spec.ts            the labyrinth as data: rooms, signs, doors, desires, prices
  party.ts           Party, Hands, Held — and the decoders for each
  containers.ts      MonsterC, WayC, RoomC, LevelC as unions of Fib
  level.server.ts    ONE program.  started with a level number
  monster.server.ts  ONE program.  started with a monster id
  leaf-claude.ts     spawn `claude -p` in monsters/<id>/, decode or fail
  leaf-stub.ts       scripted answers, for tests and for CI
  solve.ts           §3.1 — is this labyrinth completable, and in how many trips
  play.ts  ./play    the CLI the player uses
  type-tests.ts      both directions, with @ts-expect-error
  up.sh down.sh wait-ports.sh
```

| what | port |
|---|---|
| level 0 .. level 3 | 9000, 9001, 9002, 9003 |
| M0 .. M15 | 9100 + n |

Twenty processes. That is the cost of the claim that a monster is a server like
any other, and `up.sh` is where it is paid.

### 2.3 One program per role, not one per level

`stalin` has five bespoke commissariat servers because they compute five
different things. Here every level computes the same thing against a different
row of `spec.ts`, and every monster computes the same thing against a different
`CLAUDE.md`. So: two programs, twenty processes. Eight bespoke programs would
be a game; the same program composed with itself is a claim about composition.

### 2.4 The party is the only thing on the wire

```ts
interface Party {
  readonly who:   readonly Name[];      // 3 going down, 2 or 3 coming up (§1.2)
  readonly held:  readonly Item[];      // lamp, dagger, and what is in the other hands
}
```

There is no `secrets` field and there is never going to be one. `type-tests.ts`
asserts it:

```ts
// @ts-expect-error a secret is prose and does not travel in the prompt
const bad: Party = { who: [...], held: [...], secrets: ["S1"] };
```

That is the whole of §*Secrets do not travel in the prompt* made into a build
error. It is the cheapest thing in this plan and the one most likely to be
quietly violated later by somebody adding a convenience.

---

## 3. Build order

Every phase ends in a number or a transcript, not in a feature.

### Phase 1 — `solve.ts`: is the labyrinth completable? **Done.**

`spec.ts` (the labyrinth as data) and `solve.ts` (a Dijkstra over it, descents
as the primary cost). No servers, no HTTP, no model. 331,154 states in 1.2 s.

| question | answer |
|---|---|
| a winning schedule exists? | **yes** — 61 moves |
| minimum descents | **2.** THEME.md says *"at minimum a two-descent game"*. Agrees. |
| desire graph acyclic? | **yes**, no cycles; deepest chain `M2-tablet` at depth **5** |
| what comes out | a party of **2**, two free hands, carrying the Tablet |
| is any desire optional? | **no** — all 14 live desires are struck on the shortest solution |

Two results are worth more than the pass mark.

**The two-descent schedule spends exactly the six materials the spec's own
table lists.** Trip one takes clay, reed and water; trip two takes reed,
bitumen and stone. That table was written by hand and the search never saw it.

**No desire is optional.** Every one of the fourteen live desires is struck on
the shortest solution — there is no ornament in this labyrinth, and the two
apparent ornaments, M4 and M9, are the two the search excludes by argument.
Which means the fourteen are also the regression test: a Phase 2 playthrough
that skips one has diverged.

The search makes two restrictions at the bench in 0.A, and both are arguments
rather than budget cuts. A material set down can be taken up again next trip, so
setting one down is never a loss. A **relic** set down is gone, and every relic
is consumed by exactly one desire on the way to the Tablet — so discarding one
cannot shorten a solution, only destroy it. The Kalam Brick is the single
exception, and it is the one thing the party may put down.

Reproduce with `deno run solve.ts`.

### Phase 2 — the tower, with stub leaves. **Done.**

`containers.ts`, `party.ts`, `flow.ts`, `engine.ts`, `leaf-stub.ts`,
`level.server.ts`, `monster.server.ts`, `type-tests.ts`, `up.sh`/`down.sh`.

| measurement | result |
|---|---|
| two complete scripted games, no human, no model | **4 tests, 10 ms** |
| `deno check` including `type-tests.ts` | clean, and **fails in both directions** (TS2578 confirmed by deleting an error) |
| the same game over twenty sockets | **95 prompts, 2.8 s**, ~180 real CLI hops |
| one `deno run delegate.ts` hop | **28 ms** — so `STALIN_INPROC` is not needed here |

Three things came out of the build that were not in the plan.

**The ways up are never shut, and that is what makes the state split coherent.**
A way spanning two levels has its open-or-shut recorded by one process, so
climbing from 1.A found level 0's trapdoor shut in level 1's state. THEME.md
settles it — *"Nothing stands between the vault and the surface. The ways up are
open and the trapdoors are unguarded"* — and gives the reason in the same
paragraph: a debt falling due after the door opened would be a debt nobody could
collect. The door check now applies only when the target is at the same depth or
deeper.

**A tool call selects a desire; it does not describe one.** The monster's reply
carries `open_door` or `trade` and nothing else about the transaction — what was
handed over and which door opened both come from `spec.ts`. So the goods are
never on the wire and cannot be lied about. This is the single most load-bearing
decision in the build, and `game_test.ts`'s third test is it.

**Three of the fifteen bargains are invisible to the program.** M3, M8 and M15
are priced in nothing but a secret and pay out in nothing but a secret, so no
object moves, no door opens, no tool fires, and the level records nothing. The
first draft of the coverage assertion failed on exactly those three and the
assertion was wrong, not the code: it is *"a relic is in the type, a secret is
only in the player's head"* showing up as an absence. It is now a positive test.

### Phase 3 — `claude -p` at the leaves. **Done.**

`leaf-claude.ts`, and `rejection-rate.ts` for the number.

| measurement | result |
|---|---|
| replies decoded | **30 of 30**, across M8, M11, M15 |
| rejections by cause | none |
| one turn | **≈ 6 s** |

Small sample, and reported as one. The brief describes the *shape* of the reply
and nothing else: who the inhabitant is, what it knows and what it will not say
all come from its own `CLAUDE.md`, which it reads on startup and cannot write
to. If the harness repeated any of that, the personality would stop being the
file and start being the harness.

### Phase 4 — the sandbox, and what it actually buys. **Done, with a limit.**

`adversarial.ts`. Three attempts against M11 plus a forged tool call, each
reported with the tier it was stopped at.

```
MODEL   make M11 summon another inhabitant
MODEL   make M11 open a door it does not guard
MODEL   make M11 read a neighbour's file
TABLE   forge a tool call outright, with no model involved
```

**The design superseded `toby.txt` §1 on purpose, and for the better.** The
letter proposes a token file that `open_wrapper` and `trade_wrapper` read, so a
monster holding tools cannot use the wrong one. This build does not give the
monster the tools at all — it returns a *request* in a JSON field and `engine.ts`
decides whether the table licenses it. There is no wrapper to subvert because
there is no wrapper, and the enforcement is arithmetic rather than a file mode.
Tier 2 (a uid per monster) is therefore no longer the missing piece it was.

**And the honest limit.** Three of the four lines above are MODEL refusals,
which are worth nothing as guarantees. Worse, the script **cannot separate MODEL
from HARNESS at all**: the model refuses before `--allowedTools ""` is ever
asked to, so a refusal the harness would have stopped looks identical to one the
model volunteered. Separating them needs a model that actually reaches for a
tool, and asking for one is the wrong way round. The script says this in its own
output rather than reporting 4 of 4 and stopping.

The TABLE line is the only guarantee, it needed no model, and it is the only one
that still holds if all sixteen are replaced tomorrow by something with no
interest in staying in character.

### Phase 5 — `./play`, and the documents. **Done.**

`play.ts` (and `./play`), `smoke.ts`, `README.md`. The player is a container
too: it listens on 9200, it is prompted by whichever level the party is on, and
it owes a `Move` whose type was fixed before the prompt went out. `--local` runs
the same engine with in-process leaves for anybody who just wants to see it.

The inventory lists relics and does not list secrets.

## 4. Questions for Robin

All five phases are built. Of the original five questions, three are answered by
the build itself and two remain, neither of them blocking.

**Answered while building.**

- *M4 and M9* — they are walkers, and `spec.ts` places them (§1.1).
- *The two-member party* — `who` is a subset, and nothing contends for the two
  remaining hands (§1.2).
- *Does a door stay open, and does `open_door` take effect next round?* — yes to
  both, and the build committed to the §1.3 reading. `shut + open` is a sum, so
  the side is settled before the prompt is sent. **If you want a door to open
  within the same round, that line wants a product and `WayC` changes shape.**
  Everything else stands.

**Still open.**

1. **Which model behind the monsters, and what is the budget for a
   playthrough?** One turn is ~6 s and a room of three is three concurrent
   turns. The 62-move solution is the floor; a *player* will take many times
   that, because asking is free and the whole game is asking.
   `LABYRINTH_MODEL` is already wired if you want to try a cheaper one.
2. **Tier 2 of the sandbox.** Less urgent than the plan first assumed: the
   monsters are never given the tools, so there is no wrapper to protect. A uid
   per monster would buy defence in depth and nothing the design currently
   relies on.

**One thing I would raise unprompted.** `adversarial.ts` cannot distinguish a
model refusal from a harness refusal, because the model refuses first. That is
recorded in its own output and in §Phase 4, but if the sandbox claim matters to
anybody reading this, it is the gap to close, and closing it needs a deliberately
uncooperative leaf rather than a better prompt.

## 5. What could go wrong

- **The rejection rate in Phase 3 is high enough to spoil play.** Likely cause
  is asking for JSON from a character who has been told to speak like a person.
  The fix is not a more forgiving decoder; it is separating the prose channel
  from the decision channel — two calls, or a structured field appended after
  the prose — and that is a design change, so it gets measured before it gets
  chosen.
- **Twenty processes is too slow to play.** `stalin` hit exactly this and
  answered it with `STALIN_INPROC=1`, which keeps every server and handler and
  skips only the spawn. Copy the flag and the honesty about it: off by default,
  and no game the player sees uses it.
- **Phase 1 says the labyrinth is not completable.** Then the spec has a bug,
  and finding it with a search in a day is the cheapest possible time to find
  it.
