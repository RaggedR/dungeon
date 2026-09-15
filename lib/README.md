# lib — vendored

`algebra.ts`, `wire.ts` and `delegate.ts` are copied from the `tower` project, an
implementation of §4–§5 of Neil Ghani's *Containers for Typed Agentic AI*: the
four combinators (`+`, `⊠`, `◁`, `×`) as first-class values, and a
delegate/serve pair that makes each hop between servers an actual CLI process.

They are vendored rather than depended on so this repository stands alone.
Nothing in them is specific to this game — that is the point of copying them
unchanged.

`algebra.ts` and `delegate.ts` are byte-identical to `tower/` and to
`stalin/lib/`. `wire.ts` carries the **one** divergence `stalin/lib/README.md`
already records: upstream imports `isRecord` from the tower's double-entry
bookkeeping module, which has nothing to do with a labyrinth, so the four-line
helper is inlined instead. This file is byte-identical to `stalin/lib/wire.ts`.
Any other difference is a bug here, not a feature.

Note that `delegate()` honours `STALIN_INPROC=1`, which keeps the HTTP hop and
skips only the process spawn. It is upstream's, not ours, and the name is
upstream's too. It is off by default and no game the player ever sees uses it.
