import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";

/**
 * The profit bar chart, in its own module so Recharts can be code-split out of
 * the main bundle.
 *
 * Recharts is the single largest dependency after supabase-js, and it is needed
 * on exactly one screen that most people open occasionally, if at all. Loading
 * it on first paint means every user pays for it on the launch that matters
 * most — on a low-end Android over data they are paying for by the megabyte.
 *
 * Imported lazily by App.jsx, so it arrives only when someone actually looks at
 * Analytics. The fallback keeps the card's exact height, so nothing below it
 * jumps when the chunk lands.
 */
export default function ProfitChart({ data, format }) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={{ top: 0, right: 0, left: 0, bottom: 0 }}>
        <XAxis
          dataKey="name"
          tick={{ fontSize: 10, fill: "#9B7B5E", fontFamily: "'DM Sans', sans-serif" }}
          tickLine={false}
          axisLine={false}
        />
        <YAxis
          tickFormatter={(val) => (val >= 1000 ? val / 1000 + "k" : val)}
          tick={{ fontSize: 10, fill: "#9B7B5E", fontFamily: "'DM Sans', sans-serif" }}
          tickLine={false}
          axisLine={false}
          width={40}
        />
        <Tooltip
          cursor={{ fill: "rgba(44,24,16,0.04)" }}
          contentStyle={{
            borderRadius: 12,
            border: "none",
            boxShadow: "0 4px 16px rgba(44,24,16,0.1)",
            fontSize: 13,
            fontFamily: "'DM Sans', sans-serif",
            fontWeight: 700,
            color: "var(--text-primary)",
          }}
          itemStyle={{ color: "var(--text-primary)" }}
          formatter={(value) => [format(value), "Profit"]}
        />
        <Bar dataKey="profit" radius={[8, 8, 0, 0]}>
          {(data || []).map((entry, index) => (
            <Cell key={`cell-${index}`} fill={entry.color} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
