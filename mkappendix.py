#!/usr/bin/env python3
"""Generate the monster-prompt appendix from monsters/M*/CLAUDE.md.

The files are the source of truth. This script only quotes them. Run by build.sh.
"""
import glob, re, sys

def section(text, head):
    m = re.search(r'^## ' + re.escape(head) + r'\s*\n(.*?)(?=\n## |\Z)', text, re.S | re.M)
    return m.group(1).strip() if m else ""

def answer(text, question):
    m = re.search(r'^\*\*' + re.escape(question) + r'\*\*\s*\n+> (.*?)(?=\n\n)', text, re.S | re.M)
    return " ".join(m.group(1).replace("\n> ", " ").split()) if m else ""

files = sorted(glob.glob("monsters/M*/CLAUDE.md"),
               key=lambda p: int(re.search(r'M(\d+)', p).group(1)))
if not files:
    sys.exit("no monster files found")

first = open(files[0]).read()
out = ["```{=latex}\n\\newpage\n```\n",
       "## Appendix. The monster prompts\n",
       "Each inhabitant is a separate process with its own `CLAUDE.md`, which it reads",
       "on startup and cannot write to. It sees no other file and no other monster's",
       "prompt. Every file opens with the same preamble and the same seven rules. What",
       "follows is only what differs between them.\n"]
for p in files:
    t = open(p).read()
    n = re.search(r'M(\d+)', p).group(1)
    who = section(t, "What you are")
    name = re.search(r'\*\*(.+?)\*\*', who)
    signs = re.findall(r'^- \*\*(.+?)\*\* is ', section(t, "The writing in your room"), re.M)
    facts = [re.sub(r'^- ', '', l).rstrip('.') for l in who.split("\n") if l.startswith("- ")]
    out.append(f"### M{n}. {name.group(1) if name else ''}\n")
    out.append("  ".join(f"*{f}.*" for f in facts[1:]) + "\n")
    if signs:
        out.append("**Signs it can read.** " + ", ".join(f"**{s}**" for s in signs) + "\n")
    a = answer(t, "What does your name mean?")
    if a:
        out.append(f"**What does your name mean?** {a}\n")
    want = section(t, "What you want") or section(t, "Why you are sending them")
    if want:
        want = want.split("\n\nWhen you are satisfied")[0].strip()
        out.append("**What it wants.** " + " ".join(want.split()) + "\n")
    sec = section(t, "Your secret")
    if sec:
        m = re.search(r'^> (.*)', sec, re.M | re.S)
        if m:
            out.append("**Its secret.** " + " ".join(m.group(1).split()) + "\n")
open(".appendix.md", "w").write("\n".join(out) + "\n")
print(f"appendix: {len(files)} monsters")
