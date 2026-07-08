import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import { cpuData } from "../../data/analyticsData";

function CpuChart() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-[350px]">

      <h2 className="text-xl font-semibold text-white mb-6">
        Router CPU Usage
      </h2>

      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={cpuData}>
          <CartesianGrid stroke="#334155" />

          <XAxis
            dataKey="router"
            stroke="#94a3b8"
          />

          <YAxis
            stroke="#94a3b8"
          />

          <Tooltip />

          <Bar
            dataKey="cpu"
            fill="#22c55e"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

    </div>
  );
}

export default CpuChart;