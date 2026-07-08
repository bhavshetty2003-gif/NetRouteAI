import {
  ResponsiveContainer,
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import { latencyData } from "../../data/analyticsData";

function LatencyChart() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-[350px]">

      <h2 className="text-xl font-semibold text-white mb-6">
        Network Latency
      </h2>

      <ResponsiveContainer width="100%" height="85%">
        <LineChart data={latencyData}>
          <CartesianGrid stroke="#334155" />

          <XAxis
            dataKey="time"
            stroke="#94a3b8"
          />

          <YAxis
            stroke="#94a3b8"
          />

          <Tooltip />

          <Line
            type="monotone"
            dataKey="latency"
            stroke="#06b6d4"
            strokeWidth={3}
          />
        </LineChart>
      </ResponsiveContainer>

    </div>
  );
}

export default LatencyChart;