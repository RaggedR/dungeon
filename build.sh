#!/bin/bash
# Build THEME.pdf from THEME.md.
#
# Two steps rather than one, for a specific reason: pandoc emits every table as
# a `longtable`, which is *designed* to split across pages. Patching it from the
# preamble does not work -- longtable redefines \\ after any \AtBeginEnvironment
# hook runs, clobbering the patch. So we generate the LaTeX, rewrite each
# longtable into a plain `tabular` inside a minipage (which LaTeX treats as one
# unbreakable box), and only then compile.
set -euo pipefail
cd "$(dirname "$0")"

python3 mkappendix.py
cat THEME.md .appendix.md > .THEME.full.md

pandoc .THEME.full.md -t latex -s \
  --include-in-header=.theme-header.tex \
  --lua-filter=.keep-together.lua \
  -V geometry:a4paper -V geometry:margin=1.8cm -V fontsize=10pt \
  -V mainfont="Palatino" -V monofont="Menlo" \
  -V title="The Labyrinth" \
  -V subtitle="A minimal implementation of the container game" \
  -V author="Robin Langer \& Claude" \
  \
  --number-sections --shift-heading-level-by=-1 \
  -o .THEME.tex

python3 - <<'PY'
import re
t = open('.THEME.tex').read()
t = t.replace(r'\begin{longtable}[]{',
              '\\par\\medskip\\noindent\\begin{minipage}{\\linewidth}\\begin{tabular}{')
t = t.replace(r'\end{longtable}',
              '\\end{tabular}\\end{minipage}\\par\\medskip')
t = re.sub(r'^\\endhead\n', '', t, flags=re.M)      # header-repeat is meaningless now
t = re.sub(r'^\\endfirsthead\n', '', t, flags=re.M)
t = re.sub(r'^\\endlastfoot\n', '', t, flags=re.M)
open('.THEME.tex','w').write(t)
PY

tectonic -X compile .THEME.tex --outdir . --keep-logs=false >/dev/null 2>&1 \
  || tectonic .THEME.tex >/dev/null 2>&1
mv -f .THEME.pdf THEME.pdf
rm -f .THEME.tex .THEME.full.md
echo "built THEME.pdf"
