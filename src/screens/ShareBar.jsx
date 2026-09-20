import { useEffect, useState } from "react";

/**
 * Where the profit comes from, as one bar.
 *
 * This replaced a ring, and the reason is measured rather than aesthetic. The
 * ring carried the all-time total in its hole, and that was the whole argument
 * for a ring over a pie. But the total is a money string, and this app demotes
 * the currency unit to 0.5em at 50% opacity, so the line was 27px of near
 * invisible "FCFA" followed by the digits. Every BOX was centred perfectly --
 * label dx 0, value dx 0 -- while the digits, the only part with real ink, sat
 * **13.7px right of the ring's centre**. A circle is the least forgiving shape
 * for that: it is radially symmetric, so an off-axis block is visible against
 * every part of the band at once, and the label above it was centred on a
 * different axis again.
 *
 * A bar has no centre to miss. It is anchored left and right by construction,
 * so the failure mode does not exist.
 *
 * It also answers the question better. Share is a PART TO WHOLE reading, and
 * the thing an owner wants from it is "how much of this rests on one shop",
 * which is the length of the largest run against the length of the whole. A
 * ring asks you to compare arcs; a bar puts the comparison on a straight line.
 *
 * NO LEGEND, and none is needed: the rows directly beneath carry the same
 * colours on their rank discs, and the exact figures besides. That was always
 * the answer to the legend problem, the ring simply needed a bigger one.
 *
 * No Recharts either. A stacked proportional bar is flexbox, so this section no
 * longer pulls a chart library at all.
 */
export default function ShareBar({ data }) {
  // Grows from nothing on mount. `--motion-value` is the app's step for "a bar
  // growing to a new number", which is exactly what this is, and the global
  // reduced-motion block collapses it to 0.01ms without anything here knowing.
  //
  // One transform on the whole strip rather than a width per segment: the
  // segments would then animate at different rates and arrive at different
  // times, which is the staggered-list effect this project has already refused
  // once. The bar is one fact and it arrives as one.
  const [grown, setGrown] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setGrown(true));
    return () => cancelAnimationFrame(id);
  }, []);

  const total = (data || []).reduce((sum, d) => sum + d.value, 0);
  if (!total) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        display: "flex",
        gap: 2,
        height: 16,
        transform: grown ? "scaleX(1)" : "scaleX(0)",
        transformOrigin: "left center",
        transition: "transform var(--motion-value) var(--ease-out)",
      }}
    >
      {data.map((d, i) => (
        <div
          key={d.id}
          style={{
            // `flex-grow` on the exact value, so the segments are proportional
            // by construction. Percentage widths would each round, and four
            // roundings do not add back to the whole.
            flex: d.value,
            minWidth: 0,
            background: d.color,
            // Only the outer ends are rounded. A pill per segment reads as
            // four separate bars; this is one bar with four parts.
            borderRadius: `${i === 0 ? 99 : 0}px ${i === data.length - 1 ? 99 : 0}px ${i === data.length - 1 ? 99 : 0}px ${i === 0 ? 99 : 0}px`,
          }}
        />
      ))}
    </div>
  );
}
