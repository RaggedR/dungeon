# dungeon

**Can an untyped oracle be held inside a typed interface when the oracle is the
entire content of the game?**

Three levels under Babylon, sixteen inhabitants, and a table nobody will read
out to you. Every object you carry is inscribed in a language the level above it
cannot read, everyone wants something from the level below, and the only way out
is to work out who wants what by asking. The specification is
[`THEME.pdf`](THEME.pdf); this is the program.

Built on the four combinators of §5 of Neil Ghani's *Containers for Typed
Agentic AI* — `+`, `⊠`, `◁`, `×` as first-class values, vendored unmodified into
[`lib/`](lib/). That is the fourth reuse of that library after `tower`, `stalin`
and `firm`, and the reuse is the test of whether it is a library.

Requires [Deno](https://deno.com) 2.x. No install step, no lockfile, no
dependencies beyond the standard library. Playing with real inhabitants also
needs the `claude` binary.

```
  you ─$ ./play ──────────────▶ [ 9000 level 0 ]   0.A, the room with the daylight
       ◀── Choose ─────────────      │ delegates down the trapdoor
         [ 9200 the player ]   [ 9001 level 1 ]   Kalam
                                     │
                               [ 9002 level 2 ]   Sillum
                                     │
                               [ 9003 level 3 ]   Emegir

  every level ──Ask/Tell/Offer──▶ [ 9100+n   M0 .. M15 ]   answered by claude
                                                           ./up.sh --agent
```

```sh
deno check *.ts lib/*.ts    # includes type-tests.ts; fails in BOTH directions
deno test --allow-read      # two complete games, no human and no model, 10 ms
deno run solve.ts           # is the labyrinth completable, and in how many trips

./up.sh                     # twenty processes, scripted leaves
./play                      # play it
deno run -A smoke.ts        # the same game over the sockets
./down.sh

./up.sh --agent             # sixteen inhabitants, answered by claude
deno run -A rejection-rate.ts   # what the decoder costs, as a number
deno run -A adversarial.ts      # three things a monster may not do
```

## Playing it

```sh
./play              # the menu front end (default)
./play --type       # the parser, if you would rather type `ask shara what mu means`
./play --local      # either of the above with in-process leaves and no servers
```

The menu offers **moves**. It never offers **words**.

So the ways out, the people standing here, what is on the floor and how many
hands are full are all menu items: that is the map and the inventory, and
looking at them costs nothing. But `ask` is one line on the menu and the
question is yours to type, and so is `tell`. Whatever you type goes to the
inhabitant as you typed it — there is no vocabulary, no parser and nothing you
are supposed to have guessed.

That matters more than it looks. In this game **formulating the question is the
move**: you have to notice there is a word on the wall you cannot read, decide
to ask about it, and decide who to ask. A menu that has already noticed for you
has taken the turn on your behalf, and taking it correctly is exactly what makes
it the wrong menu.

A conversation is the unit of play here — you ask, you are answered, you ask
about the answer — so the front end stays with a person until you back out of
them.

```
  0.A
  A side room off the temple court, and the last place you will be warm...

  cut into the walls: im  gi  esir  a  na₄
  here: Nabonidus the Sealer
  lying here: clay, reed, bitumen, water, stone
  hands: 0/4   Arad-Gula the Builder, Nidintu the Scribe, Bēl-šunu the Sealer

    1  speak to Nabonidus the Sealer
    2  go to 1.A — shut, and Nabonidus is standing at it
    3  pick something up
    l  read the room again
    q  walk out
```

## What the game is

Everyone in the labyrinth wants a relic inscribed in the language of the level
*below* them, so the whole thing unlocks from the bottom. Level 3 is the
foundation and has nothing below it, so it wants raw material instead — clay,
reed, bitumen, a river stone, water — which you carry in from the surface. A
party of three has six hands, the lamp and the dagger take two, and the six
materials do not fit in the four that are left.

Nobody tells you what they want. Every room description has words in it you
cannot read, and the signs are what the room is short of. You ask what the sign
over the empty niche says, somebody tells you it says *reed*, and now you know.

## The four ways this is a container program

**A level is a container.** It is prompted by a party arriving at the top of it
and it answers with the party leaving. That is the same interface at every
depth, which is why `level.server.ts` is one program run four times rather than
four programs, and why descending can be a *delegation to a copy of itself*
rather than a call into itself.

**A room is a tensor.** `standing(d,r) = monster(1) ⊠ ⋯ ⊠ monster(n)` — every
inhabitant of the room is prompted and every one owes a reply. You speak in 3.B
and Lugal-bur, Nanshe and Utu-hegal all hear it. The independence is *enforced*
rather than promised: the shape of a tensor is a record holding both prompts at
once, so both must be built before either is sent, and the second cannot depend
on the first reply because you had to build it first.

**The ways out are a product.** `exit(d,r) = way(1) × ⋯ × way(k)` — all offered,
exactly one answered. Three ways are three prices and you have one purse.

**A monster is a leaf.** An LLM takes a prompt and produces an answer, which is
a direct answerer, an event handler into the do-nothing interface. It does not
delegate further. It just answers.

## Which is why no monster may summon another

It is the one action refused rather than priced. A monster that summons is a
monster whose action depends on another monster's action, and that is a sequence
and not a tensor. Every other action leaves the algebra alone; that one would
force the operator to change.

## A secret is prose, and the program never sees one

Six secrets, each bought from somebody who wants an object or another secret,
and four times in the game something one inhabitant tells you has to be carried
to another and said out loud. Those four handovers are the spine of it.

None of them is in the program. `Party` is `who × held` and there is nowhere to
put a secret; `type-tests.ts` makes adding one a build error. The level cannot
observe a secret changing hands at all — three of the fifteen bargains are
priced in nothing but a secret and pay out in nothing but a secret, so no object
moves, no door opens, no tool fires, and nothing is recorded. `game_test.ts`
tests that absence positively.

That costs one of the type-level tables some of its force and it is worth saying
so. A goal whose positions are relics stays checkable, because the party either
holds three pieces or it does not. A goal whose positions are secrets is
checkable by nothing, because the party's knowledge is not in the program to be
indexed. So the material half is enforced by the compiler and the informational
half is enforced by a gate-keeper's judgement.

Players will keep notes on paper, so the game has not removed the inventory of
secrets. It has moved it outside the program, which is the right place for it.
Paper does not sort, does not search, and does not tell you which of eleven
remembered sentences this gate-keeper wants. What the program refuses to supply
is not the memory. It is the indexing.

## A tool call selects a desire. It does not describe one.

The one rule `engine.ts` exists to enforce. A monster's reply carries at most one
tool — `open_door` or `trade` — and nothing else about the transaction. What was
handed over, what came back and which door opened all come from `spec.ts`.

So a model that announces it has handed over the Kudurru while holding nothing
has not moved an object. It has set a boolean, and `selectDesire` finds no
desire it can pay for and refuses. **The goods are never on the wire and cannot
be lied about.** That is also the only one of the three tiers in
`adversarial.ts` that is a guarantee rather than a hope, and it needs no model
to demonstrate:

```
TABLE   open_door from M11 with empty hands   -> refused
        trade from M14                        -> refused
        open_door from M11 holding clay       -> M11-door
```

## What was measured

| | |
|---|---|
| a winning schedule exists | **yes** — 62 moves, **2 descents**, matching THEME.md |
| desire graph | **acyclic**, deepest chain `M2-tablet` at depth **5** |
| is any desire optional | **no** — all 15 live desires lie on the shortest solution |
| two scripted playthroughs | **4 tests, 10 ms**, no model and no network |
| the same game over 20 sockets | **95 prompts, 2.8 s**, ~180 real CLI hops at 28 ms each |
| decoder rejection rate | **0 of 30** replies rejected, across M8, M11 and M15 |
| one `claude -p` turn | **≈ 6 s** |

The rejection rate is a small sample and should be read as one. It is measured
by `rejection-rate.ts`, it is counted against its cause, and it belongs in this
table rather than in a sentence about how robust the decoder is.

## What the sandbox does and does not buy

Two claims that look identical and are not.

**A monster's response lies in its container.** Bought by the decoder. There is
no third tool, so a monster that reaches for one has not surprised the game — it
has failed to respond within its own interface, and the failure is a rejected
reply rather than a bug.

**A monster cannot *act* outside its container.** Bought by no decoder, because a
decoder inspects stdout and has no opinion about what the process did while it
ran. Here it is bought by the design instead: the monster is never given the
tools. It returns a *request* to use one and `engine.ts` decides. There is no
wrapper to subvert because there is no wrapper. `--allowedTools ""` and
`--permission-mode plan` buy the smaller, separate claim that the process cannot
go looking for one.

`adversarial.ts` reports, for every refusal, which tier it came from — and says
plainly that it **cannot currently separate a model refusal from a harness
refusal**, because the model refuses before the harness is ever asked to. A
refusal the model chose is not a refusal the system enforced, and reporting them
as the same thing would be the exact failure `toby.txt` §13 warns about.

## The cycle

The player is prompted by the levels and prompts level 0, so the graph has a
cycle in it — the one structure the four combinators cannot build, and the whole
subject of `federation/` next door. It is survivable here for the reason that
repository gives: the cycle carries no data round it. The player's reply to
`Choose` never becomes part of the reply to `Enter`; it only decides which
prompt goes out next.

The room is the other place the algebra stops:

```
room(d,r) = round(d,r) ◁* ( room(d,r) + exit(d,r) )
```

Written as a value that is `TS7022: referenced directly or indirectly in its own
initializer`, the same diagnostic `firm-type-tests.ts` records for the feedback
edge. The four combinators build trees. The star is what is not a tree, and a
starred sequence is iteration — so `engine.ts` is a loop, and says so.

## The files

| | |
|---|---|
| `spec.ts` | the labyrinth as data: rooms, ways, inhabitants, desires, prices |
| `rooms.ts` | generated from `THEME.md` by `mkrooms.py`; the prose is unaltered |
| `secrets.ts` | the six sentences, so an inhabitant can say one |
| `containers.ts` | the interfaces, as unions of fibres, and every decoder |
| `flow.ts` | `round` and `standing`, wired out of `lib/algebra.ts` values |
| `engine.ts` | the loop `◁*` stands for, and the only place a tool becomes a change |
| `leaf-stub.ts` | a scripted inhabitant, for tests |
| `leaf-claude.ts` | the oracle, and the wrapper that makes its type a promise kept |
| `solve.ts` | the search that says the labyrinth is completable |
| `menu.ts` | the front end, and the argument for where its line is drawn |
| `type-tests.ts` | never run; fails the build in both directions |

## One deviation from the specification

`THEME.md` writes the prompts as `Ask(words)`, `Tell(words)` and `Offer(held)`.
This adds a `to` field, and the tensor is what forces it: every inhabitant of
the room is prompted with the same words, so without `to` none of the three in
3.B can tell whether it was spoken to, and the tensor becomes indistinguishable
from shouting. Everyone still hears; `answered` is still each monster's own to
decide.

`PLAN-build.md` records the rest — what was built in what order, what each phase
measured, and the three questions still open.
