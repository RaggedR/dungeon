-- Wrap every code block (the mazes and goal charts) in a minipage so LaTeX
-- treats it as one unbreakable box. If it does not fit in the remaining space
-- it moves whole to the next page instead of splitting.
function CodeBlock(el)
  return {
    pandoc.RawBlock('latex', '\\par\\medskip\\noindent\\begin{minipage}{\\linewidth}'),
    el,
    pandoc.RawBlock('latex', '\\end{minipage}\\par\\medskip')
  }
end
