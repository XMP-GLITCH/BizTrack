/* Does the floating install card actually cover content at the foot of the
   scroller? Measured, not eyeballed. Lives in its own file because a probe
   written through a heredoc loses its escapes -- recorded three times. */
(() => {
  const sc = document.querySelector('.bt-screen');
  if (!sc) return { error: 'no .bt-screen' };
  sc.scrollTop = sc.scrollHeight;
  const card = Array.from(document.querySelectorAll('div'))
    .filter((d) => /Install BizTrack/.test(d.innerText || ''))
    .sort((a, b) => a.getBoundingClientRect().height - b.getBoundingClientRect().height)[0];
  if (!card) return { installCard: false };
  const c = card.getBoundingClientRect();
  const leaves = Array.from(sc.querySelectorAll('*')).filter((el) => {
    const t = (el.innerText || '').trim();
    return t && el.children.length === 0 && t.length < 60;
  });
  const covered = leaves.filter((el) => {
    const r = el.getBoundingClientRect();
    return r.height > 0 && r.bottom > c.top && r.top < c.bottom
        && r.right > c.left && r.left < c.right;
  }).map((el) => (el.innerText || '').trim().slice(0, 34));
  return {
    card: { top: Math.round(c.top), bottom: Math.round(c.bottom) },
    screenClasses: sc.className,
    paddingBottom: getComputedStyle(sc).paddingBottom,
    atBottom: sc.scrollTop + sc.clientHeight >= sc.scrollHeight - 2,
    coveredCount: covered.length,
    covered: covered.slice(0, 8),
  };
})()
