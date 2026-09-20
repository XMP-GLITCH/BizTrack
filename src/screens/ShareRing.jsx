import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

/**
 * Where the profit comes from, as a ring.
 *
 * A ring was considered and REJECTED when Analytics was rebuilt, and the
 * reasons were good ones, so it is worth saying what changed rather than
 * quietly reversing it.
 *
 * The objections were: it would be the same data a fourth time; it needs a
 * legend, which on a 390px screen is either unreadable or a colour key you have
 * to look up; and it is imprecise where a list is exact.
 *
 * Two of those have since stopped being true. **Every business now carries its
 * own colour across the whole app**, because the Home list was rebuilt around
 * exactly that: the row's ground IS the shop's colour. So the colours are
 * already learned by the time anyone reaches this screen, and the ring needs no
 * legend at all. And it is no longer a fourth copy, because the per-row share
 * BAR was removed when this was added: the ring answers concentration, which a
 * column of bars answers badly, and the rows keep the exact figures, which a
 * ring answers badly.
 *
 * The hole is not decoration. It is the only chart shape with free space in the
 * middle, and that is where the total goes, so the headline number and its
 * breakdown occupy one block instead of two.
 */
export default function ShareRing({ data, centreLabel, centreValue }) {
  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            // 70, not 62. The hole is what the total sits in, and at 62 the
            // figure measured 101px inside a 109px hole: FOUR pixels clear on
            // each side, which reads as a number that does not fit rather than
            // as a number in a ring. The file already said the fix here was
            // `innerRadius` and not a smaller type step, and this is that,
            // brought forward from "past roughly a million" because a real
            // portfolio total reached it first.
            innerRadius="70%"
            outerRadius="92%"
            paddingAngle={2}
            // From the top, clockwise. A ring that starts at three o'clock
            // reads as an arbitrary rotation; twelve is where a person expects
            // the biggest slice to begin.
            startAngle={90}
            endAngle={-270}
            stroke="none"
            isAnimationActive={false}
          >
            {(data || []).map((entry) => (
              <Cell key={entry.id} fill={entry.color} />
            ))}
          </Pie>
        </PieChart>
      </ResponsiveContainer>

      {/* Centred over the hole rather than inside the SVG: Recharts labels do
          not inherit the app's type scale, and this is the one display figure
          on the card. `pointerEvents: none` so it never eats a tap meant for
          a segment. */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          pointerEvents: "none",
          textAlign: "center",
        }}
      >
        <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: 0.6, textTransform: "uppercase", color: "var(--text-secondary)" }}>
          {centreLabel}
        </span>
        <span style={{ fontSize: 20, fontWeight: 600, color: "var(--text-primary)", letterSpacing: -0.4 }}>
          {centreValue}
        </span>
      </div>
    </div>
  );
}
