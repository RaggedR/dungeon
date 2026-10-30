# PLAN-agent.md — a model that plays the party

This is the handoff for the agent player: the dual of `leaf-claude.ts`. Where
that file puts a model behind an *inhabitant* (`MonsterPrompt → MonsterReply`),
this one puts a model behind the *party* (`Choose{sees} → Move`) — a leaf of the
labyrinth tower exactly as a monster is, prompted with a room and owing a move
whose type was fixed before the prompt went out.

It was built on top of a finished game, additively: no edit to `engine.ts`,
`flow.ts`, `containers.ts`, `harness.ts` or `level.server.ts`. The agent is a
*third implementation of the existing `decide(sees) → Move` seam*, selected by a
flag, beside the menu and the typed parser.

## The one idea it had to respect

`play.ts`, `secrets.ts` and the README all say the same thing: **the program must
not keep a sorted, searchable list of the secrets.** A free index of every
sentence you have heard is the table filled in for you, and discovering the table
is the win condition. So the agent is handed **no `secrets` structure**. Its
notebook is prose — its own running transcript, replayed whole into each call.
The secrets live in that prose exactly as they would in a human's head:
unindexed, and the player's own to recall. Transcript = `S`; one turn = read the
room (`fwd`) then append the move and what was heard (`writeback`). The worker,
on the nose.

Two deliberate omissions keep the discovery honest (`player-claude.ts:renderSees`):

- **`sees.signs` is never rendered.** The signs are already in the description,
  in `**bold**`, which is all a human gets. Handing over the clean array is the
  "menu that already noticed for you" that `menu.ts` rejects. The model must
  notice the bold word itself and decide to ask about it.
- **Nothing names a desire, a price or a secret.** None of it is in `sees`, and
  the persona (`player/CLAUDE.md`) describes only how to play and the goal — the
  dual of a monster's brief, which "describes the shape of the reply and NOT what
  is wanted."

## The files

| file | what it is |
|---|---|
| `player/CLAUDE.md` | the player persona: the output contract, the rules of play, the goal. Never the table. The single source of the standing rules — `claude` reads it as its system prompt, `groq` sends it as the system message. |
| `leaf-model.ts` | the oracle seam `Ask = (prompt) → text`, with two backends: `claude` (default) and `groq` (any OpenAI-compatible endpoint). `LABYRINTH_PLAYER` switches. |
| `player-claude.ts` | the player leaf: `renderSees`, the transcript store, the `{reason, move}` decoder, the `tally`, and `agentDriver` (a `Driver`). |
| `intent-log.ts` | the WHY layer — one reason per move, write-ahead, non-empty reason hard-gated, clock injected (real on live, none on a scripted replay). |
| `reconcile.ts` | crosses the two logs: ALARM (a move with no reason) and BLOCKED (a move the world refused). Scripted by default; `--agent` runs a live game. |
| `play.ts` | gains `--agent`, a third `decide`. |

Everything else is reused unchanged. In particular `trace.ts` already *was* the
WHAT layer; the agent's narration is the WHY it structurally cannot see.

## Why `claude -p` needs a narrow collar

`claude -p` is not a bare `String → String` oracle. It is the whole Claude-Code
assistant, with an identity and a reflex to consult its principal — faced with a
hard choice and no tools, the first build watched it answer *"AskUserQuestion
isn't available, so I'll ask in plain text"*, which is not a move, and the decoder
threw it out (correctly — a reply that does not decode throws). The fix is to
narrow what sits behind the seam so the oracle *is* the persona:

- `--system-prompt-file player/CLAUDE.md` — the persona replaces the Claude-Code
  system prompt. This also makes the two backends symmetric.
- `--setting-sources project,local` — do **not** load the operator's own
  `~/.claude` memory and settings; the player is not the operator's assistant.
- `--exclude-dynamic-system-prompt-sections`, `--allowedTools ""`,
  `--permission-mode plan`, `--add-dir player/` — no tools, no machine context,
  and a sandbox that (because `player/` holds only the persona) means the process
  cannot read `spec.ts` or `secrets.ts`. The sandbox is load-bearing twice: it
  isolates the process *and* it is what stops the player reading the answer key.

## Run it

```sh
deno run -A reconcile.ts            # scripted party, deterministic, free, no model
deno run -A reconcile.ts --agent    # a model plays it, recorded, then reconciled
./play --agent --local              # watch a model play against stub inhabitants
./up.sh --agent && ./play --agent   # the showpiece: model player, model inhabitants
```

`LABYRINTH_MAX_TURNS` caps the game (default 200). `LABYRINTH_PLAYER=groq` with
`source ~/.config/groq/env` first swaps the backend. A live run writes
`player-intent.jsonl` (WHY) and `ships-log.jsonl` (WHAT) to the working directory.

## What was measured

- scripted reconcile: 95 moves, 95 reasons, **0 alarms**, Tablet up, byte-identical.
- a live `claude` turn: ≈ 25–35 s (one stateless call over the whole transcript).
- **a cold live game against stubs (`claude`, no prompt tuning):** 88 decisions,
  **11 of the 15 rooms, 0.A down to 3.C** — the full depth of the labyrinth,
  though not the level-1 interior (1.C/1.D/1.E) or 2.D, where the endgame waits.
  It discovered M0's curiosity gate unaided (asked who he was, saw he answers one
  sign at a time, worked through all five, the trapdoor opened), descended three
  levels by the real route, and struck the material trades the solver uses:
  reed → emegir-cone (M12), bitumen → emegir-bulla (M13), stone → the way into
  3.C (M14), and picked up the sillum-cone and emegir-seal. It reached Namtar in
  3.C, the last room, carrying four relics and reasoning — correctly — that the
  cylinder on the platform was the Tablet's seal-stone. It did **not** complete
  the win (it still had to take the Kudurru from M6 and carry S1+S2 to M2), and
  the run ended on the engine bug below rather than on a wall of its own making.
- **a latent engine bug the agent surfaced.** `engine.ts` built a monster prompt
  for *every* move reaching the round, and `promptFor` threw on anything that was
  not Ask/Tell/Offer — so a `Look` in any **occupied** room crashed the tower. No
  scripted game had ever looked in a room with somebody in it; the agent did, in
  3.C. Fixed by handing the unused speak side a placeholder (the look side wins
  the product, so it is never sent); regression test in `game_test.ts`
  ("looking in an occupied room reads the wall and does not throw"). This is the
  textbook argument for putting an agent on an interface: it travels the legal
  paths the fixtures never did.

## Open questions

1. **The stub-TELLS seam.** Against stub inhabitants, a told secret must hit the
   keyword list in `secrets.ts`; a model that paraphrases loosely may miss. The
   agent tends to restate what it heard, so it mostly matches, but the honest
   showpiece is `--agent` inhabitants, where M8 judges meaning itself. Measure the
   miss rate and decide whether the stub should judge more generously (and whether
   that would itself be a leak).
2. **Does it win, unaided?** The desire graph is depth-5 and the secrets cross
   levels (S6 from M5 on L2 → M3 on L1; S3 → S1; S5 → S2). Record how far a cold
   run gets and which handover, if any, it misses. The milestones are valuable
   short of a full win.
3. **Cost and latency.** A full game is ~95+ moves at one `claude` call each.
   Worth a transcript-compaction pass (summarise old rooms, keep all secrets) if
   the full run is to be routine rather than a showpiece.
4. **A player rejection-rate, as a number.** `tally` in `player-claude.ts` already
   counts asked/decoded/reasked; mirror `rejection-rate.ts` for the player leaf so
   the honest price of a model at the player seam is reported, not asserted.
