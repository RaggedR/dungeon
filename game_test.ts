// game_test.ts — two complete games, played by a script, with no human and no
// language model.  This is the Phase 2 measurement of PLAN-build.md.
//
//   deno test --allow-read
//
// One game takes the Tablet and leaves a member behind.  One refuses and walks
// out with three people and nothing.  Both must reach the surface.

import { assert, assertEquals } from "jsr:@std/assert@1";
import { type Move } from "./containers.ts";
import { mkGame, play, scripted } from "./harness.ts";
import { DESIRES } from "./spec.ts";

// ── the script ────────────────────────────────────────────────────────
const look = (): Move => ({ tag: "Look" });
const ask = (who: string, words: string): Move =>
  ({ tag: "Ask", who: who as never, words });
const tell = (who: string, words: string): Move =>
  ({ tag: "Tell", who: who as never, words });
const offer = (who: string): Move => ({ tag: "Offer", who: who as never });
const go = (to: string): Move => ({ tag: "Go", to: to as never });
const take = (item: string): Move => ({ tag: "Take", item: item as never });

/** Two real questions is what an inhabitant wants before it will part with a
 *  secret.  "You are lonely, not unreasonable." */
const curious = (who: string): Move[] =>
  [ask(who, "what does your name mean?"), ask(who, "what was your job?")];

export const TRIP_ONE: Move[] = [
  // 0.A — he will not open the trapdoor until all five have been asked about
  ...["im", "gi", "esir", "a", "na₄"].map((s) => ask("M0", `what does ${s} mean?`)),
  take("clay"), take("reed"), take("water"),
  go("1.A"),
  // down through the crack in 1.F and the sump in 2.E
  go("1.B"), go("1.F"), go("2.A"), go("2.B"), go("2.E"), go("3.A"),
  // level 3 wants the raw material, because there is nothing below it
  offer("M11"),                       // clay → the way to 3.B
  go("3.B"), offer("M12"),            // reed → an Emegir cone
  go("3.A"),
  ...curious("M10"), offer("M10"),    // water → S5
  // back up, collecting the Sillum cone out of the bitumen on the way
  go("2.E"), take("sillum-cone"), go("2.B"),
  offer("M5"),                        // the cone → the way to 2.D
  go("2.A"), go("1.F"), go("1.B"),
  offer("M1"),                        // the Sillum cone → the way to 1.C
  go("1.A"), go("0.A"),
];

export const TRIP_TWO: Move[] = [
  take("reed"), take("bitumen"), take("stone"),
  go("1.A"), go("1.B"), go("1.F"), go("2.A"), go("2.B"), go("2.E"), go("3.A"),
  go("3.B"),
  offer("M12"),                       // the second reed → the second cone
  offer("M13"),                       // bitumen → the Emegir Bulla
  offer("M14"),                       // a river stone → the way to 3.C
  go("3.C"),
  ...curious("M15"),
  tell("M15", "a dream that Nanshe read for him, and he built what she said"),
  take("emegir-seal"),
  go("3.B"), go("3.A"), go("2.E"), go("2.B"),
  ...curious("M5"), offer("M5"),      // the second cone → S6
  go("2.C"), ...curious("M7"), offer("M7"),   // the Bulla → S4
  go("2.B"), go("2.D"), offer("M6"),  // the Seal → the Sillum Kudurru
  go("2.B"), go("2.A"), go("1.F"), go("1.B"), go("1.C"),
  ...curious("M3"),
  tell("M3", "the seam is a join where two kings' stamped bricks meet"),
  // S3 has to be carried back DOWN to her, which is the whole shape of the game
  go("1.B"), go("1.F"), go("2.A"), go("2.B"),
  ...curious("M8"),
  tell("M8", "a name here is a god's name with man of in front of it"),
  tell("M8", "at Umma the god Shara threw himself into the dust"),
  go("2.A"), go("1.F"), go("1.B"), go("1.A"), go("1.D"),
  ...curious("M2"),
  tell("M2", "Nin-shubur waited above with instructions and made the lament"),
  tell("M2", "nobody leaves without leaving a substitute in their place"),
  offer("M2"),
];

Deno.test("a party goes down three, comes up two, and brings the Tablet", async () => {
  const g = mkGame();
  const log: string[] = [];
  const script: Move[] = [
    ...TRIP_ONE, ...TRIP_TWO,
    { tag: "Substitute", who: "Bēl-šunu" },
    go("1.A"), go("0.A"),
    { tag: "Quit" },
  ];
  const out = await play(g, scripted(script, log));

  assertEquals(out.exit, "quit");
  assert(out.party.held.includes("foundation-tablet"), "the Tablet came up");
  assertEquals(out.party.who.length, 2, "two of the three came up");
  assert(!out.party.who.includes("Bēl-šunu"), "Bēl-šunu stayed");

  // `solve.ts` proves no live desire is optional, so a playthrough that skipped
  // one would have found a way round the spec.  But only some of them are
  // VISIBLE to the program, and the split is the point of the next test.
  const used = new Set([...g.levels.values()].flatMap((s) => [...s.used.keys()]));
  const missed = DESIRES
    .filter((d) => d.times !== Infinity)
    .filter((d) => d.items.length > 0 || d.gives.kind === "opens")
    .filter((d) => !used.has(d.id))
    .map((d) => d.id);
  assertEquals(missed, [], `material bargains never struck: ${missed.join(", ")}`);
});

Deno.test("a secret changing hands leaves no trace in the program", async () => {
  const g = mkGame();
  await play(g, scripted([...TRIP_ONE, ...TRIP_TWO, { tag: "Substitute", who: "Nidintu" }]));

  // Three of the fifteen bargains are priced in nothing but a secret and pay
  // out in nothing but a secret: M3 gives S3 for S6, M8 gives S1 for S3 and S4,
  // M15 gives S2 for S5.  No object moves and no door opens, so no tool fires
  // and the level has nothing to record.  It cannot know they happened.
  //
  // That is not a gap.  "A relic is in the type.  A secret is only in the
  // player's head."  A program that could tick these off would be keeping the
  // player's notes for them, and discovering the table is the win condition.
  const invisible = ["M3-S3", "M8-S1", "M15-S2"];
  const used = new Set([...g.levels.values()].flatMap((s) => [...s.used.keys()]));
  for (const id of invisible) {
    assert(!used.has(id), `${id} left a trace, and it must not`);
  }

  // And they plainly DID happen, because the game could not have finished
  // otherwise: M2 opens for S1 and S2, which are bought with S3, S4 and S5.
  assert(
    g.said.some((s) => s.includes("Foundation Tablet is in your hands")),
    "the vault opened, so the three invisible bargains were struck",
  );

  // The party record is where they would have been stored, if anywhere.
  assertEquals(Object.keys({ who: 0, held: 0 }).sort(), ["held", "who"]);
});

Deno.test("the party may refuse, and walking out empty is not a loss", async () => {
  const g = mkGame();
  const script: Move[] = [
    ...TRIP_ONE, ...TRIP_TWO,
    { tag: "Quit" },                 // he is waiting for a name, and gets none
    go("1.A"), go("0.A"),
    { tag: "Quit" },
  ];
  const out = await play(g, scripted(script));

  assertEquals(out.exit, "quit");
  assertEquals(out.party.who.length, 3, "all three walked out");
  assert(!out.party.held.includes("foundation-tablet"), "and with nothing");
  assert(
    g.said.some((s) => s.includes("puts the Tablet back")),
    "the door closed again",
  );
});

Deno.test("a monster cannot conjure a bargain the table does not license", async () => {
  const g = mkGame();
  // M11 wants clay.  Offer it an empty pair of hands and no door opens, however
  // enthusiastically the leaf answers.
  const script: Move[] = [
    ...["im", "gi", "esir", "a", "na₄"].map((s) => ask("M0", `what is ${s}?`)),
    go("1.A"), go("1.B"), go("1.F"), go("2.A"), go("2.B"), go("2.E"), go("3.A"),
    offer("M11"), go("3.B"),
    { tag: "Quit" },
  ];
  const out = await play(g, scripted(script));
  assertEquals(out.exit, "quit");
  assert(
    g.said.some((s) => s.includes("is shut")),
    "the way to 3.B stayed shut",
  );
});
