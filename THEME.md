```{=latex}
\begin{yellowbox}
This is the specification of a minimum viable game. Hand-authored by Claude. None of the code is
generated at run-time. Three levels, no gate-keepers, no puzzles, no clues, no liars. There is no
fighting and no clock. The lamp
never runs out of light.

\medskip
The purpose of the game is to illustrate container programming with agents as
first-class morphisms. There are a great many confusing Babylonian words
and that is the whole point of the game. You have to ask the monsters what the
words mean in
order to solve the labyrinth.
\end{yellowbox}
```

## The algebra

```{=latex}
\begin{center}
\begin{tcolorbox}[colback=white, colframe=black!30, boxrule=0.6pt, arc=2pt,
                  width=0.95\textwidth, breakable=false]
\begin{align*}
\text{game}     \;&=\; \text{level}(0) \lhd^{*} \big(\,\text{receive} + \text{nothing}\,\big)\\[2pt]
\text{level}(d) \;&=\; \text{room}(d,1) + \text{room}(d,2) + \cdots + \text{room}(d,m) \qquad d = 0,1,2,3\\
\text{level}(4) \;&=\; \text{nothing}\\[2pt]
\text{room}(d,r)\;&=\; \text{round}(d,r) \lhd^{*} \big(\,\text{room}(d,r) + \text{exit}(d,r)\,\big)\\
\text{exit}(d,r)\;&=\; \text{way}(1) \times \text{way}(2) \times \cdots \times \text{way}(k)\\
\text{way}(i)   \;&=\; \text{guard}(i) \boxtimes \Big(\,\text{shut} \;+\; \text{open} \lhd \big(\,\text{room}(d, r_i) + \text{level}(d{+}1) + \text{level}(d{-}1)\,\big)\Big)\\
\text{guard}(i) \;&=\; \text{nobody} \;+\; \text{monster}\\[2pt]
\text{round}(d,r)\;&=\; \text{look} \times \text{standing}(d,r) \times \text{move}\\
\text{standing}(d,r)\;&=\; \text{monster}(1) \boxtimes \cdots \boxtimes \text{monster}(n)\\[4pt]
\text{monster}  \;&=\; \big(\,\text{Ask}(\text{words}) \,\triangleright\, \text{prose} \times (\text{answered} + \text{refused})\,\big)\\
                &\;+\; \big(\,\text{Tell}(\text{words}) \,\triangleright\, \text{accepted} + \text{refused}\,\big)\\
                &\;+\; \big(\,\text{Offer}(\text{held}) \,\triangleright\, \text{traded} + \text{refused}\,\big)\\[4pt]
\text{receive}  \;&=\; \text{offer} \lhd^{*} \big( (\text{tablet} \boxtimes \text{substitute}) + \text{refused} \big)
\end{align*}
\end{tcolorbox}
\end{center}
```

Four operators and one rule each.

The tensor $\boxtimes$ means both parts are prompted and both replies are owed.
The product $\times$ means both are offered and exactly one answers. The sum
$+$ means the prompt already belongs to one side before it is sent. The sequence
$\lhd$ means the second prompt is computed from the first response, and the
starred $\lhd^{*}$ means the first response decides which side is prompted at
all.

```{=latex}
\newpage
```

### The Monsters

There are three things you can do to a monster, and each gets a different kind
of response.

- You can ask it something, and the response is English, together with whether
  it answered or refused.
- You can tell it something, and the response is no English at all, only whether
  it took the point.
- You can offer it what you are carrying, and the response is whether it traded
  or refused.

Separately from all of that, a monster may call one of two tools, and only one,
and only once per turn.

| tool | what it does |
|----------------|-------------------------------------------------|
| `open_door` | opens the way it is standing at |
| `trade` | hands over what it is holding |

### What travels in the prompt

Over the network goes the party and nothing else. Three names, six hands, and
whatever is in them.

```{=latex}
\begin{center}
\begin{tcolorbox}[colback=white, colframe=black!30, boxrule=0.6pt, arc=2pt,
                  width=0.95\textwidth, breakable=false]
\begin{align*}
\text{party} \;&=\; \text{who} \;\times\; \text{hands} \;\times\; \text{held}\\
\text{who}   \;&=\; \{\,\text{Arad-Gula},\ \text{Nidintu},\ \text{B\=el-\v{s}unu}\,\}\\
\text{held}  \;&=\; \text{lamp} \;\times\; \text{dagger} \;\times\; \text{four free hands}
\end{align*}
\end{tcolorbox}
\end{center}
```

That record is the prompt a level is given, and the response is the same record
coming back.

**Secrets do not travel in the prompt.** No secret is in that record,
because nothing in the program stores one and nothing in the program ever
observed one being told. A secret leaves the game as a sentence a monster said
and it can only re-enter as a sentence the player typed at another monster.

```{=latex}
\begin{yellowbox}
A relic is in the type. A secret is only in the player's head.
\end{yellowbox}
```

```{=latex}
\newpage
```

### TypeScript

Each level is one Deno process listening on a port, and a prompt is JSON sent to
it. Nothing is shared between them. The only thing that crosses is text.

A container is a tagged union with one case per prompt, and each case names the
reply that prompt is owed.

```typescript
type MonsterC =
  | Fib<{ tag: "Ask";   words: string },  { prose: string; answered: boolean }>
  | Fib<{ tag: "Tell";  words: string },  { accepted: boolean }>
  | Fib<{ tag: "Offer"; held: string[] }, { traded: boolean }>;
```

`Fib<S, P>` is a pair of types and nothing else, a prompt and the reply owed to
it.

TypeScript has no dependent types and does not need any here, because there are
only three prompts. Over a list that short, a reply type that changes with the
prompt is a lookup table, and a tagged union is the list.

Every prompt goes over the network, so nothing returns a reply. It returns a promise
of one.

```typescript
run(shape, depth): Promise<PosAt<C, S>>
```

`PosAt<C, S>` is the lookup, the reply owed to the prompt `S`. The promise sits
outside it. The reply type was settled before anything was sent, so waiting for
the process to answer cannot lose track of which prompt is being answered.

Both halves of a tensor are built before either one goes out, which is what makes
it safe to send them together and wait for both at once. That is a consequence of
the tensor and not its definition — sending them one after the other would still
be a tensor. A sequence is the opposite: the second prompt is computed from the
first reply, so there is nothing to send until the first is back.

The four combinators are written as values in `lib/algebra.ts`, vendored
unchanged from the tower, and the game is wired out of them rather than out of
bespoke code.

```{=latex}
\newpage
```

## Historical background

### The City

Babylon stood on the river Euphrates. That is southern Mesopotamia, on the
plain of what is now central Iraq. Baghdad lies about eighty-five kilometres to
the north. Babylon was a city for roughly two thousand years.

Its god was Marduk. Marduk's temple was called Esagila.

### The Tower

A ziggurat is a stepped tower of mud brick. There is a shrine on top. God descends from the tower and human language goes up.

Babylon's ziggurat was called É-temen-an-ki. The name means "the house of the
foundation of heaven and earth".

It probably existed by the second millennium BC. Nabopolassar rebuilt much of
it. His son Nebuchadnezzar II finished the work.

Nebuchadnezzar reigned from 605 to 562 BC.

One cuneiform document describes the tower. It is called the Esagil tablet. The
surviving copy was made in 229 BC. It gives the tower a square base about ninety
metres across. It gives the same figure for the height. It counts seven levels.

Herodotus wrote in the fifth century BC. He says eight levels. He describes a
ramp spiralling up the outside. At the top he puts a great couch and a golden
table. He says there was no image of any god. Whether he ever saw the place is
disputed.

Alexander the Great ordered the tower pulled down. He meant to rebuild it. He
died first. It was never rebuilt. What is at the site now is a water-filled pit.

### Genesis 11

> *Go to, let us build us a city and a tower, whose top may reach unto
> heaven ... Go to, let us go down, and there confound their language, that they
> may not understand one another's speech.*

```{=latex}
\begin{bluebox}
In Hebrew the name \textbf{Babel} sounds like \emph{balal}, which means ``to
confuse''. In Akkadian the name \textbf{B\=ab-ili} means ``gate of the god''.
\end{bluebox}
```

## Beneath the tower

The game is fiction. No labyrinth was ever dug under Etemenanki. Nothing that
follows was found by anybody.

The game does not happen in the tower. It happens beneath it. Three levels go
down from the foundation. A party descends. A party climbs back out.

Each level speaks its own language.

```{=latex}
\begin{bluebox}
\textbf{In the game:}
\begin{itemize}[nosep, leftmargin=1.6em, topsep=3pt]
\item level 1 speaks \textbf{Kalam}
\item level 2 speaks \textbf{Sillum}
\item level 3 speaks \textbf{Emegir}
\end{itemize}
\smallskip
Each level reads only the level below it.
\end{bluebox}
```

## Writing

Cuneiform is wedges pressed into wet clay with a cut reed. Both **Sumerian** and
**Akkadian** were written in it, and they are unrelated languages. Sumerian
stopped being anybody's mother tongue around 2000 BC, but it continued being
written, taught and recited for another two thousand years as a learned and
liturgical language.

Scribes learned it from **bilingual lexical lists**: long tablets with a
Sumerian word in one column and its Akkadian equivalent in the next, thousands of
entries, copied out by students for centuries.

```{=latex}
\begin{bluebox}
\textbf{In the game: you must discover these translation tables.}
\end{bluebox}
```

## Foundation deposits

```{=latex}
\begin{yellowbox}
\textbf{Mesopotamian builders buried inscribed objects in the foundations of temples.}
\end{yellowbox}
```

- **A clay cone.** A baked clay peg, roughly the size and shape of a tent peg,
  with writing running round the outside of it. Hammered point-first into the
  mud-brick wall so that only the flat head shows.
- **A stamped brick.** An ordinary mud brick with the king's name pressed into
  the wet clay before it was fired, like a maker's mark. A wall holds thousands
  of them, every one stamped the same.
- **A tablet.** A slab of clay about the size of your palm, written on both
  faces with a cut reed, then sealed inside a stone box built into a corner of
  the foundation.
- **A figurine.** A small copper or clay figure. It is often a king carrying a
  basket of earth on his head. It is buried in the same box as the tablet.

Every one of them is inscribed, buried on purpose, and not meant to be seen by
anybody alive.

They carry a message. It is addressed to **whoever digs this up**. That means a
future king who will restore the building, and the gods who read over his
shoulder.


```{=latex}
\begin{yellowbox}
\textbf{Every object that the player carries between levels is an inscribed
relic written in one of the three languages.}
\end{yellowbox}
```
```{=latex}
\newpage
```

## The vocabulary

The tower was a translation engine. It ran upward. Each level took speech from
the level below it and rendered that speech into its own language. The result
went up.

Genesis does not say the tower was pulled down. God confounded the language of
the builders. They could no longer understand one another. They left off
building and were scattered.

So no level can read the level below it any more.

```{=latex}
\begin{bluebox}
\textbf{Each level wants a word from the level below it.}
\end{bluebox}
```

### The three languages

The languages are invented. Only their names are real words.

- **Kalam** is the language of Level 1. The name is the Sumerian word for "the
  Land". Kalam is close enough to the surface to be understood.
- **Sillum** is the language of Level 2. The name is the Akkadian word for
  "shadow". Sillum uses the same words as Kalam, but many of them mean something
  different.
- **Emegir** is the language of Level 3. The name is what Sumerians called their
  own language. Emegir is derived from nothing. It is missing words the upper
  languages assume.

Every etymology inside the game is fiction. A secret that tells you what a word
means in Sillum is a fact about an invented language.

### The Officers

Every inhabitant of the labyrinth holds an office. There are three.

- **A Builder.** His job was to build the tower. He laid the bricks in rows and
  hammered the inscribed clay cones into the wall.
- **A Scribe.** His job was to keep the record. He copied the texts and filed
  them.
- **A Sealer.** His job was to make the work binding. He rolled his seal across
  wet clay to sign it and he set the stones that marked the boundary.

### The Names

The inhabitants are named from real Sumerian and Akkadian material.

- **Nin-shubur** was the messenger of the goddess Inanna. She is a Sealer.
- **Gudea** was a ruler of Lagash around 2100 BC. He is famous for temple
  building and for the foundation deposits he left. The Gudea of this game
  stands on the bitumen floor and remembers when it was poured.
- **Namtar** was the demon of fate, vizier of Ereshkigal, queen of the
  underworld. He is at the bottom.
- **Utu-hegal**, **Enannatum** and **Ku-Ningal** were real people. **Bau**,
  **Ashgi**, **Shara** and **Nanshe** were gods. **Ur-Nintu**, **Lu-Utu** and
  **Lugal-bur** follow ordinary Sumerian name patterns.

```{=latex}
\begin{bluebox}
\textbf{Relics are carried by the player. Secrets are not. The player must
remember the secrets.}
\end{bluebox}
```

```{=latex}
\newpage
```

## Scope

This build demonstrates one thing. The hidden table is discoverable, and
discovering it is the way out. Everything else is deferred.

**In this build:**

- the maze, hand-built, three levels
- the inhabitants, what each one wants and what each one knows
- talk, negotiate, trade
- doors priced in relics and secrets
- the two goal trees
- carrying and the hand budget

**Deferred:**

- generation of levels or specifications
- gate-keepers, riddles, puzzle pieces, clues
- fighting. Attack, hit points, the dagger as a weapon
- light. The lamp running down, oil as a clock
- lying monsters
- multi-party play

---

## The law of desire

Everyone in the labyrinth wants a relic. Which one depends on two things. The
level they stand on, and the office they hold.

**Level 1 speaks Kalam.** Everyone on Level 1 wants a relic inscribed in Sillum,
which is the language of Level 2. A Builder there wants a Sillum cone. A
Scribe wants a Sillum tablet, prism or bulla. A Sealer wants a Sillum
cylinder seal or kudurru.

**Level 2 speaks Sillum.** Everyone on Level 2 wants a relic inscribed in
Emegir, which is the language of Level 3. A Builder wants an Emegir cone. A
Scribe wants an Emegir tablet, prism or bulla. A Sealer wants an Emegir
cylinder seal or kudurru.

**Level 3 speaks Emegir.** There is no level below the foundation, so nothing on
Level 3 wants an inscription at all. It wants the raw material instead. A Builder
wants clay or a river stone. A Scribe wants a reed bundle. A Sealer wants
bitumen or water. The party carries all of these in from the surface.

Nothing anywhere wants Kalam, so a relic inscribed in Kalam is worthless. The
only place above Level 1 is the surface, and the surface is not buying.

---

## Relics

Eleven relics exist in the labyrinth. Each takes one hand to carry, except the
kudurru and the brick, which take two.

**Cones.** A cone is a baked clay peg about the size and shape of a tent peg,
with writing running round the outside of it. It was hammered point-first into
the wall so that only the flat head showed. There are three. One is inscribed in
Sillum and lies in room 2.E. Two are inscribed in Emegir and come from M12
on Level 3. A Builder wants a cone.

**The Emegir Bulla.** A bulla is a hollow clay ball with counting tokens sealed
inside it. The tokens are the account, and you cannot read it without breaking
it. There is one. M13 holds it on Level 3. A Scribe wants a
bulla.

**The Emegir Cylinder Seal.** A cylinder seal is a small engraved stone
cylinder. Rolled across wet clay it leaves a signature that cannot be copied by
hand. There is one. It lies on the floor of room 3.C. A Sealer wants a cylinder
seal.

**The Sillum Kudurru.** A kudurru is a carved stone slab recording a grant of
land. It states the terms and curses anyone who moves it. There is one.
M6 holds it on Level 2. It takes two hands. A Sealer wants a kudurru.

**The Kalam Brick.** A stamped brick is an ordinary mud brick with the king's
name pressed into the wet clay before firing. There is one. It lies in room 1.B.
It takes two hands and nobody in the labyrinth wants it.

**The materials.** Clay, a reed bundle, bitumen, a river stone and water. None of
them is inscribed and none is found below. The party carries them in from the
surface, and Level 3 accepts nothing else.

A party of three has six hands. The lamp and the dagger take two of them,
leaving four. The materials are six items, so they do not fit in one descent. This is
at minimum a two-descent game.

---

## The rooms

A room is described when the party walks into it. Every description contains
words the party cannot read. The words are real Sumerian and each one means
something that matters. Nobody translates them unasked.

An inhabitant will explain any sign in its own room. A Scribe will explain
any sign on its level, because keeping the record was its job. Four rooms have
signs and nobody in them to ask, so the word has to be carried to somebody who
knows.

In the maps below, a thick line is a door with a guard standing at it and a thin
line is an open way. An arrow leaves the level. A number inside a room is
somebody standing in it.

```{=latex}
\begin{yellowbox}
No inhabitant will tell you what it wants. You have to work it out by asking it
about the room it is standing in. Every room description has words you cannot
read. Ask what they mean and the answers tell you what is missing.
\end{yellowbox}
```

### Level 0

```{=latex}
\begin{tikzpicture}
  \node[room] (Z) at (0,0) {0.A\\[-1pt]\occfont M0};
  \draw[-{Latex}] (Z.south) -- ++(0,-0.8) node[below,vlab]{Level 1};
\end{tikzpicture}
```

**0.A.** A side room off the temple court, and the last place you will be warm.
The door to the court stands open and the light comes in low and yellow across
the floor with the dust turning in it. Somewhere outside a man is calling the
price of something. Along the near wall runs a bench of scrubbed wood, and five
things are set out on it in a row with a hand's width between each of them. A
lump of grey river clay, still damp, wrapped in cloth. A bundle of reed cut
short and tied. A pot with something black in it that has skinned over. A skin
of clean water, full. A stone off a riverbed, smooth as an egg, the size of your
fist. A sign is chalked on the bench in front of each one. **im**, **gi**,
**esir**, **a**, **na₄**. At the far end of the room the floor is cut through
and there is a trapdoor in it, shut, with a ring in the middle. Standing on the
trapdoor is an old man in a very good coat who has been waiting for you long
enough to have stopped pretending otherwise.

### Level 1

```{=latex}
\begin{center}
\begin{tikzpicture}
  \node[room] (C) at (0,2.2)     {1.C\\[-1pt]\occfont M3};
  \node[room] (A) at (-2.8,0)    {1.A};
  \node[room] (B) at (0,0)       {1.B};
  \node[room] (F) at (2.8,0)     {1.F};
  \node[room] (D) at (-2.8,-2.2) {1.D};
  \node[room] (E) at (-2.8,-4.4) {1.E};
  \draw[openway] (A) -- (B);
  \draw[openway] (B) -- (F);
  \draw[openway] (A) -- (D);
  \draw[guarded] (B) -- (C) node[glab]{M1};
  \draw[guarded] (D) -- (E) node[glab]{M2};
  \node[room] (Z) at (-2.8,1.6) {0.A\\[-1pt]\occfont M0};
  \draw[openway] (A) -- (Z);
  \draw[-{Latex}] (F.south) -- ++(0,-0.8) node[below,vlab]{Level 2};
\end{tikzpicture}
\end{center}
```

**1.A.** The stair lets you out into a chamber so low that the tallest of you
walks with a bent neck. It is cool and it smells of dry earth. Cut into the wall
at shoulder height is a slot about the length of your arm and no deeper than
your hand, and it is packed solid. Broken tablets stacked edgeways like roof
tiles. Sealed balls of clay. A bundle of reed tied with a plait of human hair.
The corner of something folded that comes apart when you touch it. Nobody has
taken anything out of that slot in living memory and nobody was ever meant to.
Over the stair behind you, cut into the lintel where you would have to turn
round to see it, are four signs: **é-temen-an-ki**. And on every brick in the
room, on every one you can find, the same single sign stamped into the clay
before it was ever fired: **kalam**.

**1.B.** A field of brick. They are stacked in rows that come up past your head
and run back further than the lamp reaches, set out to dry in a season that
ended a very long time ago, and never used for anything. The aisles between them
are wide enough for one person. The dust on the floor is brick dust and it is
fine as flour. Every brick in the field carries the same stamp pressed into its
face while the clay was soft, two signs, the first of them **lugal** and the
second a name. One brick lies loose and alone on the floor of the middle aisle,
face up, as though somebody set it down meaning to come back. It is a handsome
object. It is also extremely heavy. Somebody walks about in here with a flask
under one arm and does not seem surprised to see you.

**1.C.** An alcove off the field with a shelf at head height and a flask of lamp
oil standing on it. There is a table, and the table has nothing on it at all,
not a stylus, not a scrap, and the wood has been rubbed pale in one patch where
a forearm has rested for years. A man is sitting at it. The wall behind him is
covered from the floor to as high as a seated man can reach with one sign
written over and over in a hundred different hands, some of them careful and
some of them not, thousands upon thousands of times: **mu**. Higher up, above
all of it, out of the reach of anybody sitting down, the same hand has cut one
sign once and cut it well: **utu**.

**1.D.** A short antechamber that goes nowhere. Six paces, and then a door that
has been sealed so long the seam has filled with dust and gone hard. There is
nothing in the room. No shelf, no niche, no bench to sit on. Above the door, cut
deep into the brick and standing alone with a hand's clearance all round it so
that you cannot mistake it for part of anything else, is one sign: **ĝeštug**. A
man stands underneath it facing out. He has stood there long enough that the
floor is worn in two shallow places and nowhere else.

**1.E.** The vault. You cannot see into it. The door has not been open in the
lifetime of anybody who has ever come down this stair.

**1.F.** The wall in this room is wrong and you will see it before you can say
why. The courses of brick run true and level for three rows and then they stop,
and start again a finger's width out of true, and run on true for ever after
that. Hold the lamp close. Above the seam the stamp on each brick reads **lugal**
and a name. Below the seam it reads **lugal** and a different name. Where the
two runs of brickwork failed to meet they have left a gap along the line of the
join, and the gap goes down through the floor, and it is wide enough. Nobody is
standing anywhere near it.

### Level 2

```{=latex}
\begin{center}
\begin{tikzpicture}
  \node[room] (A) at (-2.8,0)    {2.A};
  \node[room] (B) at (0,0)       {2.B\\[-1pt]\occfont M8};
  \node[room] (E) at (2.8,0)     {2.E};
  \node[room] (C) at (-1.5,-2.2) {2.C\\[-1pt]\occfont M7};
  \node[room] (D) at (1.5,-2.2)  {2.D\\[-1pt]\occfont M6};
  \draw[openway] (A) -- (B);
  \draw[openway] (B) -- (E);
  \draw[openway] (B) -- (C);
  \draw[guarded] (B) -- (D) node[glab]{M5};
  \draw[-{Latex}] (A.north) -- ++(0,0.8) node[above,vlab]{Level 1};
  \draw[-{Latex}] (E.south) -- ++(0,-0.8) node[below,vlab]{Level 3};
\end{tikzpicture}
\end{center}
```

**2.A.** You come down into a corridor that runs further than the lamp will
carry. It is straight and it is empty and the air in it does not move. At eye
height along the left-hand wall there is one line of text, incised, running the
whole length of the corridor without a break and without a space, the same sign
repeated over and over for as far as you can follow it: **gar**. You have seen
that sign before, upstairs. It is not cut the same way here. The strokes are
shallower and they lean.

**2.B.** A wide hall where four ways meet, and the traffic of the entire level
comes through it. The floor in the middle is dished out and polished by feet.
Every wall has been written on by many hands over many years and none of it
agrees with any of the rest. The sign **mu** is here too and it is not made the
way it was made upstairs. Beside it, again and again, cut by somebody with time,
**igi**. There is a woman sitting on the floor with her back against the wall
between two of the doorways. People come through this room constantly. Not one
of them looks at her.

**2.C.** A channel that used to carry water and now carries nothing. The silt in
the bottom of it has dried into plates that lift when you tread on them. Cut
into the bank on one side is a row of niches, and in each niche sits a ball of
clay the size of a closed fist, and round the middle of each ball a seal has
been rolled so that the same line of figures runs round it like a belt. There
are a great many of them. Not one has been opened. Above the row, cut once and
plainly for anybody walking past, one sign: **ku**. A man is standing in the dry
channel doing nothing at all.

**2.D.** A small room with a stone standing upright in the middle of the floor.
It comes up past your waist and it is carved all over, top to bottom, front and
back. Signs of the gods along the top. Field measurements. A long list of
witnesses. Then, near the bottom where the carving gets smaller and closer
together and much older, a line that is not like anything above it, and the sign
that begins the line is **temen**. A woman stands beside the stone with one hand
resting on the top of it, and it is clear from the way she stands that she has
no intention of leaving the room.

**2.E.** The floor slopes and everything that has ever come down it has gone to
one corner. Something black has pushed up through the brick there and spread and
set hard and shining, and the smell of it fills the room. Before it set, while
it was still soft enough to take a mark, somebody drew one sign in it with a
finger: **esir**. Half buried in the muck at the edge, where it has been lying
long enough to have been walked past, is a clay cone with writing round the
outside. The trapdoor is under the sump and you will have to stand in the stuff
to open it.

### Level 3

```{=latex}
\begin{center}
\begin{tikzpicture}
  \node[room] (A) at (0,0)   {3.A\\[-1pt]\occfont M10};
  \node[room] (B) at (3.2,0) {3.B\\[-1pt]\occfont M12 M13};
  \node[room] (C) at (6.4,0) {3.C\\[-1pt]\occfont M15};
  \draw[guarded] (A) -- (B) node[glab]{M11};
  \draw[guarded] (B) -- (C) node[glab]{M14};
  \draw[-{Latex}] (A.north) -- ++(0,0.8) node[above,vlab]{Level 2};
\end{tikzpicture}
\end{center}
```

**3.A.** You come off the last ladder onto a floor of black bitumen, poured flat
from wall to wall and hard as stone. It is not cold. The marks of a ladder are
still standing in it near the middle, two long depressions and the print of the
foot of it, made while the floor was soft and kept ever since. The room is
quiet in the particular way of a place with a great weight of earth over it.
Near the wall, where the pour reached last and stayed soft longest, three signs
were pressed into the surface with something blunt: **temen**, **a**, **im**. A
woman is sitting on the floor with her back to the wall and her legs out in
front of her. She has been sitting there so long that when she looks up it takes
her a moment to work out what she is looking at. At the far side, in the only
doorway out, a man is standing.

**3.B.** A round room, and the walls of it are a ring of clay cones driven into
the brick at waist height, heads out, all the way round, close enough together
that you could not put your hand between them. Hundreds of them. Every one has
writing running round it and every one is a message that was never going to be
read by anybody alive. Between the cones, cut into the wall at three points, are
three niches, and above each niche is one sign: **gi**, **esir**, **na₄**. All
three niches are empty. They have been swept. Three people are in this room. One
of them is holding something. None of them is doing anything at all.

**3.C.** The last room in the labyrinth, and the smallest. A platform of brick a
hand's height off the floor takes up most of it, and on the platform there is one
object, a stone cylinder lying on its side, engraved, about as long as your
thumb. Two signs are cut into the brick of the platform, one at each end of it,
and they were cut by the same hand at the same time: **nam-tar**, and **kur**.
There is nothing else in the room. No niche, no shelf, no second door. A man
stands over the cylinder with his hands at his sides. He does not look up when
you come in and he does not look up when you speak, and you will have the
distinct sense that he has not been spoken to in a very long time and is not
certain that he is being spoken to now.

## The names of the monsters

| | | | |
|------|------------------------|-------|--------------------|
| **M0** | Nabonidus | **M8** | Shara-the-Echo |
| **M1** | Ur-Nintu | **M9** | Enannatum |
| **M2** | Ishme, the Crown-Level | **M10** | Gudea-of-the-Floor |
| **M3** | Lu-Utu | **M11** | Ashgi |
| **M4** | Bau-the-Tally | **M12** | Lugal-bur |
| **M5** | Igi-dur | **M13** | Nanshe-of-the-Ring |
| **M6** | Nin-shubur | **M14** | Utu-hegal |
| **M7** | Ku-Ningal | **M15** | Namtar |

---

---

## The inhabitants

Fifteen below ground. Five Builders, four Scribes and six Sealers. One more
above it.

**M0** stands on the trapdoor in room 0.A and he is the reason you are going
down. He hands over the five things on the bench, and he will not open the
trapdoor until you have asked him what all five of them are.

He also musters the party, and he sends one of each office, because that is what
a repair crew is.

- **Arad-Gula**, a bricklayer. He sets.
- **Nidintu**, a scribe. She keeps the record.
- **Bēl-šunu**, an old man who has sealered things for other people all his
  life.

### The Builders

```{=latex}
\begin{bluebox}
A Builder wants something that was built into the wall.
\end{bluebox}
```

**M1** wants a Sillum cone. Give it one and the door opens.

**M4** trades. It takes any relic inscribed in Sillum and hands over a flask of
lamp oil.

**M5** wants an Emegir cone. The first cone opens the door. A second buys secret
S6, which M5 also knows.

**M11** wants clay.

**M14** wants a river stone.

### The Scribes

```{=latex}
\begin{bluebox}
A Scribe wants something that was written.
\end{bluebox}
```

**M3** wants to be told secret S6. In return it gives secret S3.

**M7** wants the Emegir Bulla. In return it gives secret S4.

**M9** trades. It takes any relic inscribed in Emegir and hands over a healing
potion.

**M12** wants a reed bundle. In return it gives an Emegir cone. Bring two
bundles and it will do this twice.

### The Sealers

```{=latex}
\begin{bluebox}
A Sealer wants something that was sealed.
\end{bluebox}
```

**M2** guards the Foundation Tablet. It wants four things. The Sillum Kudurru.
To be told S1. To be told S2. And **one of the three party members, handed over
at the door in the same moment the Tablet is handed out.** Anything less and the
door stays shut. Section 17 is about that fourth price.

**M6** wants the Emegir Cylinder Seal. In return it gives the Sillum Kudurru.

**M8** wants to be told S3 and S4. In return it gives secret S1.

**M10** wants water. In return it gives secret S5.

**M13** wants bitumen. In return it gives the Emegir Bulla.

**M15** wants to be told secret S5. In return it gives secret S2.

```{=latex}
\begin{yellowbox}
One satisfied desire buys one thing, a secret or an object. An inhabitant
holding two things will do business twice if you can pay twice.
\end{yellowbox}
```

---

## Asking

Every room is described when you walk into it, and every description has words
in it you cannot read. That is where the questions come from. You ask what the
sign over the empty niche says. Somebody tells you it says *reed*. Now you know
what the room is short of, and nobody had to tell you what anybody wanted.

No inhabitant knows who holds what. But each one will say what *kind* of person
would know the thing it is missing, and each one will tell a party holding half
of it which half is missing. A near-miss gets an answer, not silence.

Asking costs nothing and every answer is true. Beyond the signs, any inhabitant
will answer three questions.

- *What does your name mean?*
- *What was your job?*
- *What is that thing you are holding?*

None of the answers is invented. The names are real Sumerian and Akkadian, the
jobs are real, and the objects are real Mesopotamian artefacts. A player who
asks their way to the bottom comes back knowing what a ziggurat was for, why
builders buried inscribed cones, and how a language nobody spoke was taught for
two thousand years.

### What the names mean

| | | |
|-------|------------------|---------------------------------------------------------|
| **M0** | Nabonidus | the last king of Babylon. He dug up the foundation deposit of Naram-Sin at Sippar and worked out that it had lain there three thousand two hundred years |
| **M1** | Ur-Nintu | man of Nintu. Nintu is the birth goddess, who pinched the first people out of clay |
| **M2** | Ishme | he heard |
| **M3** | Lu-Utu | man of Utu. Utu is the sun, who crosses the sky, sees everything, and judges what he sees |
| **M4** | Bau | a goddess of healing at Lagash |
| **M5** | Igi-dur | igi is the eye |
| **M6** | Nin-shubur | minister to the goddess Inanna |
| **M7** | Ku-Ningal | a priest of Ur. Ku means pure |
| **M8** | Shara | a god of Umma, and Inanna's son |
| **M9** | Enannatum | a king of Lagash |
| **M10** | Gudea | a ruler of Lagash who rebuilt the temple at Girsu and buried inscribed clay cylinders under it |
| **M11** | Ashgi | a god of Adab |
| **M12** | Lugal-bur | lugal is king, bur is a stone bowl |
| **M13** | Nanshe | a goddess of Lagash who read dreams |
| **M14** | Utu-hegal | a king of Uruk who drove out the Gutians |
| **M15** | Namtar | minister to Ereshkigal, queen of the underworld. His name means fate |

```{=latex}
\begin{yellowbox}
Two of these names are the two ends of one poem, and the poem is this game.
Nin-shubur waited above. Namtar served below. A player who asks both of them
what their names mean finds out what the labyrinth is.
\end{yellowbox}
```

---

## The secrets

All true. There are no liars in this build.

A secret has two prices and both must be paid. The first is the one listed
against its holder in section 10, an object or another secret. The second is
curiosity. No inhabitant will tell a secret to a party that has not asked what
its name means, what its job was, what it is holding, or what the tower was
built to do. Paying without asking buys nothing.

- **S1.** "When Inanna went down to the underworld she left Nin-shubur standing
  above her with instructions. Wait three days. If I do not come back, make the
  lament and go to the gods and plead for me. Nin-shubur did exactly that. It is
  the only reason Inanna came up again."
- **S2.** "Nobody leaves the underworld without leaving somebody in their place.
  Inanna came up. Dumuzi went down."
- **S3.** "A name here is a god's name with *man of* in front of it. Mine is man
  of Utu. Utu crosses the sky, sees everything and judges what he sees. They
  gave that name to a clerk and put him underground."
- **S4.** "Shara was a god of Umma before he was anything here. When Inanna came
  back up, demons came with her looking for a substitute. They went to Umma, and
  Shara threw himself into the dust in front of her, and she would not let them
  take him."
- **S5.** "I did not decide to build anything. I had a dream and I did not
  understand it. Nanshe read it for me and told me what to build. Everything
  buried under that floor is there because of a dream that somebody else
  explained."
- **S6.** "Every king who repaired this tower stamped his own name into his own
  bricks and laid them over the last man's. Where two repairs meet, the rows do
  not line up. The fourth row in room 1.F is one of those seams. It is not
  damage. It is a join."

```{=latex}
\begin{bluebox}
M2 is the top of the tower and its name means \emph{he heard}. It opens the vault
for S1 and S2 together, because between them they say how the way out works. The
climb is arranged from above, and it is paid for from below.
\end{bluebox}
```

The Foundation Tablet carries one sentence.

> *What is set below is what is said above.*

It is not a riddle. A foundation deposit is an inscription buried at the bottom
of a building so that somebody standing on top of it will one day dig it up and
read it out. What the builder sets below is what the king says above. Nabonidus
did exactly that at Sippar. Somebody who was doing the thing wrote the sentence
that describes it.

It is also the specification of the tower. The engine ran upward. The input is
what was laid in the foundation and the output is what is spoken at the top, so
nothing can be said up there that was not set down here.

The three languages differ only in how much they believe it. Kalam reads it as a
promise, and the bottom reaches heaven. Sillum, where *gar* means to bury, reads
it as a suspicion, and the top merely repeats what it is given and adds nothing.
Emegir has no word for above at all, so it reads *what is set is what is said*.
The burying is the utterance and there is no destination. The sentence survives
all three readings because the last level never had anywhere to forward anything
to.

---

## Chart 1. The relics

Every position lies deeper than its goal. Read downward.

```{=latex}
\begin{center}
\begin{tikzpicture}[x=1cm,y=1cm]
  % rows y = 0, -2.3, -4.6, -6.9, -9.2   columns x = -5.55, -1.85, 1.85, 5.55
  \node[goalN]  (G0)  at (0,0)        {\nid{G0}{L1}THE VAULT DOOR OPENS\nsub{M2, 1.D $\to$ 1.E}};
  \node[relicN] (R1)  at (0,-2.3)     {\nid{R1}{L2}the SILLUM KUDURRU\nsub{from M6, 2.D}};

  \node[relicN] (R2)  at (-5.55,-4.6) {\nid{R2}{L3}EMEGIR CYLINDER SEAL\nsub{lies in 3.C}};
  \node[relicN] (R3)  at (0,-4.6)     {\nid{R3}{L3}EMEGIR CONE\nsub{from M12, 3.B}};
  \node[doorN]  (D1)  at (5.55,-4.6)  {\nid{D1}{}door 2.B $\to$ 2.D\nsub{held by M5}};

  \node[doorN]  (D3)  at (-5.55,-6.9) {\nid{D3}{}door 3.B $\to$ 3.C\nsub{held by M14}};
  \node[doorN]  (D2)  at (-1.85,-6.9) {\nid{D2}{}door 3.A $\to$ 3.B\nsub{held by M11}};
  \node[mudN]   (Lr)  at (1.85,-6.9)  {reed bundle\nsub{carried in}};
  \node[relicN] (R3p) at (5.55,-6.9)  {\nid{R3$'$}{L3}a second EMEGIR CONE};

  \node[mudN]   (Ls)  at (-5.55,-9.2) {river stone\nsub{carried in}};
  \node[mudN]   (Lc)  at (-1.85,-9.2) {clay\nsub{carried in}};
  \node[mudN]   (Lr2) at (5.55,-9.2)  {a second reed bundle\nsub{carried in}};

  \draw[dep] (G0) -- node[elab]{material half of the price} (R1);

  \draw[dep]    (R1.south) -- ++(0,-0.6) -| (R2.north);
  \draw[dep]    (R1.south) -- ++(0,-0.6) -| (R3.north);
  \draw[depalt] (R1.south) -- ++(0,-0.6) -| (D1.north);
  \node[elab] at (5.55,-3.62) {to reach M6 at all};

  \draw[dep] (R2) -- (D3);
  \draw[dep] (R3.south) -- ++(0,-0.6) -| (D2.north);
  \draw[dep] (R3.south) -- ++(0,-0.6) -| (Lr.north);
  \draw[dep] (D1) -- (R3p);

  \draw[dep] (D3)  -- (Ls);
  \draw[dep] (D2)  -- (Lc);
  \draw[dep] (R3p) -- (Lr2);
\end{tikzpicture}
\end{center}
```

```{=latex}
\medskip
\begin{center}
\begin{tikzpicture}[x=1cm,y=1cm]
  \node[goalN,  text width=17mm, minimum height=6mm] (a) at (0,0)    {goal / desire};
  \node[relicN, text width=17mm, minimum height=6mm] (b) at (2.55,0) {relic};
  \node[secN,   text width=17mm, minimum height=6mm] (c) at (5.1,0)  {secret};
  \node[doorN,  text width=17mm, minimum height=6mm] (d) at (7.65,0) {door};
  \node[matN,   text width=17mm, minimum height=6mm] (e) at (10.2,0) {material};
  \node[mudN,   text width=17mm, minimum height=6mm] (f) at (12.75,0){mud, carried in};
\end{tikzpicture}
\end{center}
```

The Kudurru has two relic positions beneath it. The Seal and the Cone. Each of
those has positions of its own that end in mud. Root to leaf is four deep.

---

## Chart 2. The secrets

A desire satisfied by two secrets, which are bought by satisfying desires, which
are satisfied by secrets. Read downward.

```{=latex}
\begin{center}
\begin{tikzpicture}[x=1cm,y=1cm]
  % rows y = 0, -2.3, -4.6, -6.9, -9.2, -11.5
  \node[goalN] (D0) at (1.1,0)       {\nid{D0}{L1}M2 OPENS THE VAULT DOOR\nsub{wants the Kudurru (chart 1), and to be told S1 and S2}};

  \node[secN]  (S1) at (-2.3,-2.3)   {\nid{S1}{L2}what Nin-shubur did\nsub{told by M8}};
  \node[secN]  (S2) at (4.6,-2.3)    {\nid{S2}{L3}what Namtar takes\nsub{told by M15}};

  \node[secN]  (S3) at (-4.3,-4.6)   {\nid{S3}{L1}how a name is made\nsub{told by M3}};
  \node[secN]  (S4) at (0.6,-4.6)    {\nid{S4}{L2}what happened to Shara\nsub{told by M7}};
  \node[secN]  (S5) at (4.6,-4.6)    {\nid{S5}{L3}whose dream it was\nsub{told by M10}};

  \node[secN]  (S6) at (-6.2,-6.9)   {\nid{S6}{L2}what the crack is\nsub{told by M5}};
  \node[doorN] (DX) at (-2.4,-6.9)   {door 1.B $\to$ 1.C\nsub{held by M1}};
  \node[matN]  (MB) at (0.6,-6.9)    {\nid{M}{L3}the EMEGIR BULLA\nsub{from M13, 3.B}};
  \node[mudN]  (Lw) at (4.6,-6.9)    {water\nsub{carried in}};

  \node[matN]  (MC) at (-6.2,-9.2)   {\nid{M}{L3}a second EMEGIR CONE};
  \node[relicN](RC) at (-2.4,-9.2)   {the SILLUM CONE\nsub{lying in 2.E}};
  \node[mudN]  (Lb) at (0.6,-9.2)    {bitumen\nsub{carried in}};

  \node[mudN]  (Lr) at (-6.2,-11.5)  {a second reed bundle\nsub{carried in}};

  \draw[dep] (D0.south) -- ++(0,-0.6) -| (S1.north);
  \draw[dep] (D0.south) -- ++(0,-0.6) -| (S2.north);

  \draw[dep] (S1.south) -- ++(0,-0.6) -| (S3.north);
  \draw[dep] (S1.south) -- ++(0,-0.6) -| (S4.north);
  \node[elab] at (-2.3,-3.62) {M8 wants two secrets};
  \draw[dep] (S2) -- node[elab]{M15 wants one} (S5);

  \draw[dep]    (S3.south) -- ++(0,-0.6) -| (S6.north);
  \draw[depalt] (S3.south) -- ++(0,-0.6) -| (DX.north);
  \node[elab] at (-2.4,-5.92) {to reach M3 at all};
  \draw[dep] (S4) -- (MB);
  \draw[dep] (S5) -- (Lw);

  \draw[dep] (S6) -- (MC);
  \draw[dep] (DX) -- (RC);
  \draw[dep] (MB) -- (Lb);

  \draw[dep] (MC) -- (Lr);
\end{tikzpicture}
\end{center}
```
Secret-depth on the left branch is three. **S1** needs **S3** needs **S6**.

**M** nodes are checked by the program. You hold the Bulla or you do not. **S**
nodes are checked by nobody. M8 decides for itself whether what the player typed
amounts to knowing what happened at Umma.

---

## The doors

| door | level | guard | price | what is behind it |
|--------------|------|------------|--------------------------|------------------------------|
| 1.B to 1.C | L1 | M1 | Sillum Cone | M3 with S3, a flask of oil |
| **1.D to 1.E** | L1 | **M2** | **Sillum Kudurru, S1, S2, and one of the three party members** | **the Foundation Tablet** |
| 2.B to 2.D | L2 | M5 | Emegir Cone | M6 with the Kudurru |
| 3.A to 3.B | L3 | M11 | unmarked clay | M12, M13, M14 |
| 3.B to 3.C | L3 | M14 | unmarked river stone | M15 with S2, the Cylinder Seal |

The trapdoors 0.A to 1.A, 1.F to 2.A and 2.E to 3.A are unguarded. The one in
1.F is the gap left where two repairs failed to meet. Secret S6 says what it
is. It does not open it, because it was never shut.

---

## Coming up

It is an exchange and it happens in one moment. M2 holds out the Tablet with one
hand and takes one of the three with the other, and neither half happens without
the other half. That is at the vault door in room 1.D, on the first level down,
and it is the only place in the labyrinth where it can happen.

It has to be simultaneous. Nothing stands between the vault and the surface. The
ways up are open and the trapdoors are unguarded, so a debt that fell due after
the door opened would be a debt nobody was in a position to collect. M2 does not
extend credit. It has been at that door since the language broke and it is not
owed anything by anybody.

M2 applies the rule. It did not make it. The rule is S2, which the party heard
at the bottom of the labyrinth from the one whose office it was, and which they
then repeated to M2 themselves. That is the only reason the door is open.

Three go down. Two come up. The third stays, takes a post, and becomes the
sixteenth inhabitant of the labyrinth.

**The player chooses which one.** M2 will not choose, and will not be hurried,
and will not accept a stranger. Arad-Gula, Nidintu or Bēl-šunu. The two who are
not chosen will say so.

It is the same choice Inanna was given and it is not a fair one. She was not
asked for a stranger either. Demons came up with her looking for a substitute,
she refused them Shara and others who begged her, and in the end she gave them
Dumuzi, who was her husband. **The party has already been told this.** It is
secret S4, bought from M7 two levels down and several hours earlier, and at the
time it looked like a piece of old history that somebody wanted repeated back to
them.

There is one other option and M2 will state it if asked. The party may refuse.
Nobody has to stay. The Tablet then stays where it is, the door closes, and all
three walk out with nothing in their hands.

That is not a loss. The haul was never the object. Discovering the table is the
win condition and the table comes up in their heads whatever they are carrying,
so a party that walks out empty and intact has still won and knows it. What they
have given up is the one object in the labyrinth they were sent for, and they
will have to go and tell a king so.

That is where the fifteen came from. Every one of them was left behind by
somebody who wanted to get out, and every one of them has been standing at a
post ever since with nothing handed up to them and nobody to talk to. The party
has spent the whole descent being told, over and over, by people who would know,
exactly what it costs to leave. Nobody said it plainly until the last door.

---

## The materials

Six items of unmarked matter. Four free hands per descent, so they arrive
across at least two trips.

| item | pays |
|--------------------------|------------------------------------|
| lump of river clay | M11, for door 3.A to 3.B |
| reed bundle | M12, for the first Emegir Cone |
| reed bundle | M12, for the second Emegir Cone |
| handful of bitumen | M13, for the Emegir Bulla |
| river stone | M14, for door 3.B to 3.C |
| skin of clean water | M10, for S5 |

The lamp and the dagger are always carried. The Kalam Brick in 1.B takes two hands and
nobody wants it.

---

```{=latex}
\newpage
```

## What the player learns

Asking is free and every answer is true, so a curious player collects most of
this without paying for any of it. The six secrets are the parts that have to be
earned. Each has a price, and each also requires that the party has been asking
questions. An inhabitant that has been treated as a vending machine says
nothing, whatever is put in front of it.

### The sequence

Going down is free. Everything below is the way back up.

1. **Level 0.** M0 hands over the clay, the reed, the bitumen, the stone and the
   water, and will not open the trapdoor until the party has asked what all five
   signs on the bench mean. He also musters the three who are going down.
   Arad-Gula, Nidintu and Bēl-šunu.
2. **Level 3.** Pay clay to M11 and the door to 3.B opens.
3. **M10** takes water and tells you **S5**. A ruler had a dream he could not
   read. Nanshe read it for him and told him what to build. Everything buried
   under the floor is there because of a dream somebody else explained.
4. **M13** takes bitumen and gives the Emegir Bulla. **M12** takes a reed bundle
   and gives an Emegir cone. Bring a second bundle and it gives a second cone.
5. **M14** takes a river stone and the door to 3.C opens. The Emegir Cylinder
   Seal is lying on the floor in there.
6. **M15** is at the bottom and has not spoken in a very long time. Its name
   means fate.
   **Fed back: S5 goes to M15.** A dream read and obeyed is a fate declared and
   carried out, which is its own office exactly. It answers with **S2**. Nobody
   leaves the underworld without leaving somebody in their place. Inanna came
   up. Dumuzi went down.
7. **Level 2.** An Emegir cone opens M5's door. A second Emegir cone buys
   **S6**. Every king who repaired the tower stamped his own bricks and laid
   them over the last man's, and where two repairs meet the rows do not line up.
8. **M6** takes the Emegir Cylinder Seal and gives the Sillum Kudurru. **M7**
   takes the Emegir Bulla and tells you **S4**. When Inanna came back up, demons
   came with her looking for a substitute, and at Umma the god Shara threw
   himself into the dust and she would not let them take him.
9. **Level 1.** The Sillum cone from room 2.E opens M1's door.
10. **M3** is a clerk named for the sun, kept underground.
   **Fed back: S6 goes to M3.** The seam in the brickwork is the join between
   two kings' stamped names, and names are its subject. It answers with **S3**.
   A name here is a god's name with *man of* in front of it.
11. **M8** does not know what its own name means or what it did. It is the only
    inhabitant that answers a question with *I do not know*.
    **Fed back: S3 and S4 go to M8.** Between them they are its name and its
    story, handed back to it. It answers with **S1**. Inanna left Nin-shubur
    standing above her with instructions, Nin-shubur obeyed them, and that is
    the only reason Inanna came up again.
12. **M2** stands at the vault. Its name means *he heard*.
    **Fed back: S1 and S2 go to M2**, with the Sillum Kudurru.
    The door opens.
13. **M2 takes the fourth price.** It holds out the Tablet with one hand and
    takes one of Arad-Gula, Nidintu or Bēl-šunu with the other, and neither half
    happens without the other. **The player chooses which one.** The rule M2 is
    applying is S2, which the party heard at the bottom and then said out loud
    to M2 themselves. They may also refuse, put the Tablet back, and walk all
    three of them up the stair with nothing in their hands. Section 17.

### The four feedbacks

Four times in the game, something one inhabitant tells you has to be carried to
another and said out loud. Nothing else in the labyrinth works that way, and
those four handovers are the spine of it.

**M10 tells you about the dream, and you relay it to M15.** M10 wanted water and
gave up something it had plainly been holding for a long time. A ruler could not
read her own dream. Somebody else read it for her and told her what to build,
and everything under that floor is down there because of a dream that another
person explained. You carry that to the last room on the bottom level, where
M15 is standing over a cylinder seal and has not spoken to anybody in an age.
Its name means a fate that has been cut. A dream read by one person and obeyed
by another is exactly that, which is why it is the one thing that will make M15
speak. It answers with what the underworld takes from anybody who leaves it.

**M5 tells you what the crack is, and you relay it to M3.** M5 wanted a second
clay cone for it. Every king who repaired this tower stamped his own name into
his own bricks and laid them over the last man's, and where two repairs meet the
rows do not line up. You carry that up to the alcove on the top level, to a
clerk sitting at an empty table with the sign for *name* written on the wall
behind him ten thousand times. The seam is the join between two kings' names,
and names are the whole of his subject. He answers by telling you how a name in
this country is built.

**M3 and M7 tell you two halves of one thing, and you relay both to M8.** M3
gives you the naming rule. M7, in a dry channel on the middle level, takes a
sealed ball of clay and gives you what happened at Umma, where a god threw
himself into the dust in front of a returning goddess and she would not let the
demons take him. Carry both of those to the busiest room in the labyrinth, where
a woman sits against the wall and nobody looks at her. Ask her what her name
means and she will tell you she does not know. She is the only one down there
who answers a question that way. What you are holding is her name and her story,
and you give them back to her. She answers with what Nin-shubur did.

**M8 and M15 have now each given you one sentence, and you relay both to M2.**
That is the last handover and it is the one the whole labyrinth is arranged
around. From M8, that the goddess who went down left somebody standing above her
with instructions, and came back only because those instructions were followed.
From M15, that nobody comes back at all without leaving somebody behind. You say
both of them to the man under the sign for *the ear*, at the top of a tower
built to carry speech upward, who has had nothing handed up to him since the
language broke. Between them those two sentences say how the way out of a place
like this works. He opens the door.

### What it adds up to

Free, by asking: what a ziggurat was for and which way it ran. That Nintu made
the first people out of river clay. That cuneiform is wedges pressed into wet
clay with a cut reed. What a cone, a bulla, a cylinder seal and a kudurru are,
and that a bulla cannot be read without being destroyed. That bitumen seeps out
of the ground in Mesopotamia on its own. That Nanshe read dreams, that Nin-shubur
was Inanna's minister, that Namtar's name means fate, and that the shrine at the
top of a ziggurat held no image of any god.

Paid for, in order: why anything is buried under a temple at all, what the
underworld takes from anyone who leaves it, why the brickwork does not line up,
what happened at Umma, how a Sumerian name is built, and what Nin-shubur was
told to do.

Put in the order the labyrinth forces, those six are one poem. A goddess goes
down. She leaves somebody above with instructions. She is killed below. The one
left above does exactly as she was told, and that is the only reason anybody
comes back. And nobody comes back for nothing, because the underworld keeps a
substitute.

```{=latex}
\begin{yellowbox}
That is the shape of this game, and the player is told it by the game itself.
You go down, you can only come up by what was arranged above, and you leave
something behind either way.
\end{yellowbox}
```

---

## The adventure

### The room with the daylight in it

A king who wants to rebuild a temple does not start by building. He starts by
digging. Somewhere under the old foundation is whatever the last builder put
there, and he is supposed to find it, read it, and lay it back down with his own
name added to it.

The man who tells you this is Nabonidus, and he is the king of Babylon. He is
standing on a trapdoor in a room off the temple court with the daylight coming
in behind him. He is old, the stair is long, and he is sending you instead.

There is a bench along one wall with five things on it. A lump of grey clay. A
bundle of cut reed. A pot of something black. A skin of water. A stone off a
riverbed. A sign is chalked on the bench in front of each one and you cannot
read any of them.

Ask him. He will tell you the first sign says clay and that clay is what you
build with. Ask again and he will tell you reed is what you write with, and he
will keep you there explaining that every word ever written in this country came
off the cut end of a reed pressed into wet clay, and that the shape of the wedge
is the shape of the cut. Bitumen is what you seal with and it comes out of the
ground here by itself. Water and stone he will not labour.

He will not open the trapdoor until you have asked about all five. He is
stubborn about it and he will tell you why. Nobody has ever come back up that
stair by being in a hurry on the way down.

Ask him about himself and he will tell you what he is proudest of, which is not
a battle. At Sippar he dug for the foundation deposit of Naram-Sin, and he found
it, and he worked out that it had been lying under there for three thousand two
hundred years. Nobody else counts. He counted.

Under this floor there is a Tablet with one sentence on it, and the sentence is
said to mean the same thing in every language in the tower. He wants it found,
read, and brought up.

So you go down equipped the way a repair crew goes down. Clay to make brick
with. Reed to write with. Bitumen to seal with. A stone, and a skin of clean
water. You have been told what every one of them is for and you were made to ask.

Nobody told you it was money.

### Going down

You go down for nothing. That is the first thing to understand about this place.
The trapdoors are not guarded and nobody asks your business on the way in. The
labyrinth will take anybody. It is the coming back that is priced, and you will
not find out what it costs until you are already at the bottom of it.

### The floor

The last ladder puts you on a floor of bitumen. A woman is sitting on it who has
not had a visitor in longer than she can say, and her name is Gudea, which was
the name of a ruler who rebuilt a temple and buried inscribed clay cylinders
underneath it. Ask her what the floor is and she will tell you it is bitumen, which is natural
asphalt, that it comes up out of the ground in this country by itself, and that it was poured
here in one night. The ladder marks are still in it.

Give her the water. She will tell you something she has clearly been waiting a
long time to tell somebody. She did not decide to build anything. She had a
dream she could not read. Another woman read it for her and told her what to
build, and everything buried under that floor is down here because of a dream
that somebody else explained.

Ashgi holds the door out of that room and wants the clay, because there is
nothing below the foundation but what things are made of. Beyond it, Lugal-bur
will give you a clay cone for a bundle of reed and will do it twice if you have
brought two, and if you ask he will tell you that every word ever written in
this country came off the cut end of a reed pressed into wet clay. Nanshe wants
the bitumen and gives up a sealed clay ball with the count inside it, which cannot
be read without being broken. Utu-hegal wants the river stone and can tell you
which river it came from.

### The one who has not spoken

Behind that last door is a room with a cylinder seal lying on the floor and a
man standing over it who has not spoken to anybody in a very long age. His name
means fate. He was the minister of the queen of the underworld, and his work was
to carry her decisions to the people they were about.

Tell him about the dream. Tell him a ruler could not read her own dream, that
somebody else read it for her, and that she went and did what she was told. That
is his own office described back to him exactly. A fate declared and carried
out, and the arrangement still working somewhere.

He will answer you, and what he says is this. Nobody leaves the underworld
without leaving somebody in their place. Inanna came up. Dumuzi went down.

Take the seal off the floor. You are at the bottom. Everything from here is the
way back.

### Climbing

You come up into a room with a clay cone lying in it, which is the first thing
this labyrinth has given you for free, and you will find out on the top level
what it is for.

Igi-dur takes one of your cones and opens his door, and takes the second and
tells you what the crack is. Every king who repaired this tower stamped his own
name into his own bricks and laid them straight over the last man's. Where two
repairs meet the rows do not line up. It is not damage. It is a join.

Behind his door is Nin-shubur, who was the minister of the goddess Inanna, and
who wants the seal and gives you a stone slab with a curse on it against anybody
who moves it. In the room next door Ku-Ningal takes the sealed clay ball and
tells you what happened at Umma. When Inanna came back up out of the underworld
the demons came with her, looking for somebody to take down in her place. They
went to Umma. Shara, who was a god there, threw himself into the dust in front
of her, and she would not let them have him.

### The crack

You climb out of the second level through the gap that Igi-dur told you about.
You came down through it without looking at it. Two kings repaired this tower
and their brickwork did not meet, and the hole they left between them is the
only reason you could get down here at all.

The free cone buys the door on the top level, and behind it is a clerk sitting
in an alcove with a flask of lamp oil and nothing to do. His name is man of Utu.
Utu is the sun. He crosses the sky once a day, he sees everything that happens
underneath him, and he is the judge of all of it. They gave that name to a clerk
and they put him underground, and he will tell you so himself, once you have
told him about the seam, because that seam is the join between two kings' names
and names are the whole of his subject.

### Going back down

Now the part that is strange, which is that you have to go back down.

There is somebody on the second level who sits in the busiest room in the
labyrinth and is walked past all day. Ask her what her name means and she will
tell you she does not know. She is the only one down here who answers a question
that way. Somebody told her once that it was a word before it was a name and she
never found out what it meant or why it was given to her.

You know both halves now. You know how a name is made in this country, and you
know what happened at Umma to the god she is named for. Give them back to her.

And she will tell you the thing she has been keeping. When Inanna went down she
left Nin-shubur standing above her with instructions. Wait three days. If I do
not come back, make the lament, go to the gods and plead for me. Nin-shubur did
exactly that, and it is the only reason Inanna came up again.

### The door

The last one stands in front of the vault, and his name means *he heard*.

He was the top of the tower. Every level under him rendered what it was given
and sent it up, and he was what it was sent up to. He never built anything and
he never spoke downward. He received. Ask him about the shrine at the top of a
ziggurat and he will tell you there was no image of any god in it, only a couch
and a golden table, and that this is not strange, because the top of a tower is
not a place to put something. It is a place to listen.

Give him the stone slab, and then tell him the two things.

Tell him that the one who went down left somebody above her with instructions,
and that she came back only because those instructions were followed. Then tell
him that nobody comes back at all without leaving somebody behind.

He has been standing at that door since the language broke, waiting for
something to come up from below. Those two sentences are the last thing the
tower was built to carry, and you carried them.

The door opens. The Tablet is given, not taken.

And then he asks for the other thing, and you already know what it is, because
you carried the sentence up here yourself and said it out loud to him. Nobody
leaves without leaving somebody in their place.

He will not choose for you. He has been at this door a very long time and he is
not going to be hurried at the end of it.

Arad-Gula, who lays brick. Nidintu, who writes. Bēl-šunu, who is old and has
spent his whole life sealering things on behalf of other people. Two of them
will say something when you look at them. You have heard this exact scene
before, told to you halfway up by a man in a dry channel, and at the time it
sounded like somebody's old story.

You may also refuse, and he will tell you so himself rather than let you find
out afterwards. Put the Tablet back. The door shuts. Three of you walk up the
stair with nothing in your hands and everything you learned still in your heads,
and you go and explain yourselves to a king who counts.

Whoever stays takes a post, and M2 says where. It does not keep them at the
vault. That is why the fifteen are spread across three levels and not stacked up
at the bottom. Every one of them was handed over at that door and sent somewhere
there was a gap. In time somebody else will come down that stair and
ask what their name means, and they will tell them, and be glad to be asked.

```{=latex}
\begin{yellowbox}
One sentence is on it, and it means the same in all three languages, because the
last level never had anywhere to send it. \emph{What is set below is what is
said above.}
\end{yellowbox}
```
