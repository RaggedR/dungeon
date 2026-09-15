// secrets.ts — the six sentences, and the words that identify each.
//
// GENERATED from THEME.md by `mksecrets.py`.  Do not hand-edit.
//
// Read what this file is FOR, because it is the one file in the repository that
// could quietly destroy the game.  A secret is prose.  The program does not
// keep it anywhere, it never enters the party record, and there is no inventory
// of secrets — the player holds them in their own head and works out where they
// are worth using.  Discovering the table is the win condition, so a program
// that stored secrets would be a program playing its own win condition for the
// player.
//
// These strings are here so that an INHABITANT can say one, and so that the
// stub leaf of Phase 2 can recognise one being said back.  Nothing reads them
// on the player's behalf.  `type-tests.ts` asserts that `Party` has nowhere to
// put one.

export type Secret = "S1" | "S2" | "S3" | "S4" | "S5" | "S6";

export const TEXT: Readonly<Record<Secret, string>> = {
  S1:
    "When Inanna went down to the underworld she left Nin-shubur standing above her with instructions. Wait three days. If I do not come back, make the lament and go to the gods and plead for me. Nin-shubur did exactly that. It is the only reason Inanna came up again.",
  S2:
    "Nobody leaves the underworld without leaving somebody in their place. Inanna came up. Dumuzi went down.",
  S3:
    "A name here is a god's name with *man of* in front of it. Mine is man of Utu. Utu crosses the sky, sees everything and judges what he sees. They gave that name to a clerk and put him underground.",
  S4:
    "Shara was a god of Umma before he was anything here. When Inanna came back up, demons came with her looking for a substitute. They went to Umma, and Shara threw himself into the dust in front of her, and she would not let them take him.",
  S5:
    "I did not decide to build anything. I had a dream and I did not understand it. Nanshe read it for me and told me what to build. Everything buried under that floor is there because of a dream that somebody else explained.",
  S6:
    "Every king who repaired this tower stamped his own name into his own bricks and laid them over the last man's. Where two repairs meet, the rows do not line up. The fourth row in room 1.F is one of those seams. It is not damage. It is a join.",
};

/** Words distinctive enough to identify a secret being told back.  Used ONLY by
 *  `leaf-stub.ts`, which is a scripted stand-in for a language model and is not
 *  pretending to be one.  When a real monster is behind the socket it makes
 *  this judgement itself, from what the player actually said, and no keyword
 *  list is consulted — M8 decides for itself whether what was typed amounts to
 *  knowing what happened at Umma. */
export const TELLS: Readonly<Record<Secret, readonly string[]>> = {
  S1: ["nin-shubur", "ninshubur", "three days", "instructions", "lament"],
  S2: ["substitute", "dumuzi", "in their place", "somebody behind", "leave somebody"],
  S3: ["man of", "god's name", "gods name", "how a name"],
  S4: ["umma", "shara", "threw himself", "dust"],
  S5: ["dream", "nanshe", "read it for"],
  S6: ["seam", "join", "stamped", "two repairs", "rows do not line up", "crack"],
};

export const recognise = (words: string): Secret[] => {
  const w = words.toLowerCase();
  return (Object.keys(TELLS) as Secret[]).filter((s) =>
    TELLS[s].some((k) => w.includes(k))
  );
};
