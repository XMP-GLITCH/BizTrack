import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

/**
 * The profit bar chart, in its own module so Recharts can be code-split out of
 * the main bundle.
 *
 * Recharts is the single largest dependency after supabase-js, and it is needed
 * on exactly one screen that most people open occasionally, if at all. Loading
 * it on first paint means every user pays for it on the launch that matters
 * most: on a low-end Android over data they are paying for by the megabyte.
 *
 * Imported lazily by App.jsx, so it arrives only when someone actually looks at
 * Analytics. The fallback keeps the card's exact height, so nothing below it
 * jumps when the chunk lands.
 */
/**
 * `showRevenue` makes each bar the month's REVENUE, split into what was kept
 * and what it cost, stacked.
 *
 * Grouped bars were tried first, the way a printed report does it, and they are
 * wrong on a phone: six months side by side is twelve bars across 310px, and
 * the pale one hid the other entirely. Stacked, there is one bar per month, its
 * full height is revenue, the solid part is profit, and the gap between them IS
 * the margin, readable without anyone computing a percentage.
 *
 * Off by default. The weekly chart answers "is this growing", and a second
 * series there is a second question asked over the first.
 */
export default function ProfitChart({ data, format, showRevenue = false }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 11, fill: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          // Millions get an M rather than four digits and a k. "3600k" is
          // both harder to read than "3.6M" and wide enough to overflow its
          // own tick box at 320, which the clip check caught on a business
          // whose months run to seven figures.
          tickFormatter={(val) => {
            const n = Math.abs(val);
            if (n >= 1000000) return Math.round((val / 1000000) * 10) / 10 + "M";
            if (n >= 1000) return Math.round(val / 1000) + "k";
            return val;
          }}
          tick={{ fontSize: 11, fill: "var(--text-secondary)", fontFamily: "var(--font-sans)" }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          cursor={{ fill: "rgba(44,24,16,0.04)" }}
          contentStyle={{
            borderRadius: 12,
            background: "var(--card-bg)",
            border: "1px solid var(--border-color)",
            boxShadow: "0 4px 16px rgba(44,24,16,0.1)",
            fontSize: 14,
            fontFamily: "var(--font-sans)",
            fontWeight: 700,
            color: "var(--text-primary)",
          }}
          itemStyle={{ color: "var(--text-primary)" }}
          formatter={(value, name) => [format(value), name === "cost" ? "Cost" : "Profit"]}
        />
        {/* Profit is the BOTTOM of the stack, so it shares a baseline with
            every other month and can be compared across them. Only the top
            segment is rounded, or the join between the two reads as a gap. */}
        {/* A cap, because the weekly chart now starts at the first sale
            instead of always drawing eight buckets. A shop two weeks old gets
            two bars, and two bars sharing 280px are 100px slabs that read as a
            broken layout rather than as a short history. At eight weeks this
            never binds: the bars are about 25px. */}
        {/* 400ms, which is `--motion-value`: this app's step for a bar growing
            to a new number. Recharts defaults to 1500, and that was shipping:
            nearly four times the longest duration this project allows, on a
            chart read on a mid-range Android where anything past roughly 250ms
            starts reading as the phone being slow. Nobody chose it; it was the
            library's default arriving through a component that never named the
            prop.

            Both series carry it, and that is a fix too. The cost bar had
            animation switched OFF while the profit bar beneath it animated, so
            a stacked column grew out from under a segment already drawn at
            full height. */}
        <Bar
          dataKey="profit"
          maxBarSize={44}
          animationDuration={400}
          animationEasing="ease-out"
          stackId={showRevenue ? "month" : undefined}
          radius={showRevenue ? 0 : [8, 8, 0, 0]}
        >
          {(data || []).map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
        {showRevenue && (
          <Bar dataKey="cost" maxBarSize={44} animationDuration={400} animationEasing="ease-out" stackId="month" radius={[8, 8, 0, 0]} fill="var(--control-bg)" />
        )}
      </BarChart>
    </ResponsiveContainer>
  );
}
