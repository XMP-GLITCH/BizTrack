/* Does the summary card's meta row wrap, and does a divider dangle?

   The first version of this counted DISTINCT TOPS of every child -- including
   the hairline dividers, which sit at a different top from the text blocks --
   and so reported 3 and 4 "lines" for a card the screenshot plainly showed on
   two. Count the labelled blocks; the dividers are separators, not content. */
(() => {
  const row = document.querySelector('.bt-summaryrow');
  if (!row) return { row: false };
  const kids = Array.from(row.children).filter((c) => c.getBoundingClientRect().width > 0);
  const labelled = kids.filter((c) => (c.innerText || '').trim());
  const lineOf = (c) => Math.round(c.getBoundingClientRect().top / 8) * 8;   // 8px tolerance
  const lines = [...new Set(labelled.map(lineOf))].sort((a, b) => a - b);
  const firstLine = lines[0];
  const inFirst = kids.filter((c) => lineOf(c) === firstLine);
  const last = inFirst[inFirst.length - 1];
  return {
    rowWidth: Math.round(row.getBoundingClientRect().width),
    blocks: labelled.map((c) => (c.innerText || '').trim().split('\n')[0]),
    lines: lines.length,
    wrapped: lines.length > 1,
    // a divider ENDING the first line points at nothing
    danglingDivider: lines.length > 1 && !((last.innerText || '').trim()),
  };
})()
