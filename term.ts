// term.ts — reading a line and writing a room.  Shared by both front ends.

const enc = new TextEncoder();
export const out = (s: string) => Deno.stdout.writeSync(enc.encode(s));

// A line is what lies BEFORE a newline, and a chunk off stdin ends with one.
// Splitting the chunk on "\n" therefore yields a trailing "" that is not a line
// — it is the empty remainder after the last terminator — and enqueuing it hands
// the front end a phantom blank entry for every line the player types.  `pick`
// reads that blank, sees no key, and redraws: the menu appears twice and the
// player's next keystroke is answering the second copy.  So hold the remainder
// back in a buffer instead, and emit a line only once its newline has arrived.
let pending = "";
const reader = Deno.stdin.readable
  .pipeThrough(new TextDecoderStream())
  .pipeThrough(new TransformStream<string, string>({
    transform(chunk, c) {
      pending += chunk;
      let i: number;
      while ((i = pending.indexOf("\n")) !== -1) {
        c.enqueue(pending.slice(0, i));
        pending = pending.slice(i + 1);
      }
    },
    // A last line with no newline behind it — a pipe that ends mid-line — is
    // still a line, and this is the one place it is safe to say so.
    flush(c) { if (pending !== "") { c.enqueue(pending); pending = ""; } },
  }))
  .getReader();

export async function readLine(): Promise<string> {
  const { value, done } = await reader.read();
  return done ? "quit" : (value ?? "").trim();
}

export const wrap = (s: string, w = 76, indent = ""): string => {
  const lines: string[] = [];
  let line = "";
  for (const word of s.split(/\s+/)) {
    if ((line + " " + word).trim().length > w) { lines.push(indent + line.trim()); line = ""; }
    line += " " + word;
  }
  if (line.trim()) lines.push(indent + line.trim());
  return lines.join("\n");
};

/** THEME.md sets the signs in bold and `rooms.ts` keeps its prose unaltered, so
 *  the markdown is still in it and this is where it is rendered.  The signs are
 *  the only emphasis in any room description, which is not an accident: they are
 *  the only words on the wall you cannot read. */
export const emph = (s: string) => s.replace(/\*\*(.+?)\*\*/g, "\x1b[1;33m$1\x1b[0m");

export const dim = (s: string) => `\x1b[2m${s}\x1b[0m`;
export const bold = (s: string) => `\x1b[1m${s}\x1b[0m`;
export const sign = (s: string) => `\x1b[1;33m${s}\x1b[0m`;
