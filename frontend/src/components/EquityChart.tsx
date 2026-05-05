import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import type { EquityPoint } from "@/lib/api";

export default function EquityChart({ points, height = 280 }: { points: EquityPoint[]; height?: number }) {
  const data = points.map((p) => ({
    time: new Date(p.time * 1000).toLocaleDateString(),
    equity: p.equity,
  }));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <LineChart data={data} margin={{ top: 10, right: 20, bottom: 10, left: 0 }}>
        <CartesianGrid stroke="rgba(255,255,255,0.04)" />
        <XAxis dataKey="time" tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} minTickGap={50} />
        <YAxis tick={{ fontSize: 10, fill: "rgba(255,255,255,0.6)" }} />
        <Tooltip
          contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 12 }}
          labelStyle={{ color: "rgba(255,255,255,0.6)" }}
        />
        <Line type="monotone" dataKey="equity" stroke="hsl(var(--success))" strokeWidth={1.5} dot={false} />
      </LineChart>
    </ResponsiveContainer>
  );
}
