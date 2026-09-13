import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { AnalyticsSummary } from "./api";

type WasteChartProps = {
  data: AnalyticsSummary["categories"];
  colors: Record<string, string>;
};

export default function WasteChart({ data, colors }: WasteChartProps) {
  if (data.length === 0) {
    return <div className="chart-container chart-empty"><span>▥</span><p>لا توجد بيانات كافية للرسم بعد</p></div>;
  }

  return (
    <div className="chart-container">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 4, left: 4, bottom: 6 }}>
          <CartesianGrid vertical={false} stroke="#223047" strokeDasharray="4 4" />
          <XAxis dataKey="category" stroke="#66758c" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} />
          <YAxis stroke="#66758c" tickLine={false} axisLine={false} tick={{ fontSize: 10 }} width={36} />
          <Tooltip cursor={{ fill: "rgba(148, 163, 184, .04)" }} contentStyle={{ color: "#e8edf5", backgroundColor: "#172337", border: "1px solid #304058", borderRadius: 10, fontSize: 11 }} />
          <Bar dataKey="weight_kg" name="الوزن (كجم)" radius={[7, 7, 2, 2]} maxBarSize={48}>
            {data.map((entry) => (
              <Cell key={entry.category} fill={colors[entry.category] ?? "#7e57c2"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
