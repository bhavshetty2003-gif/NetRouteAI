import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

import { trafficData } from "../../data/analyticsData";

const COLORS = [
  "#06b6d4",
  "#22c55e",
  "#8b5cf6",
  "#f59e0b",
];

function TrafficChart() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-[350px]">

      <h2 className="text-xl font-semibold text-white mb-6">
        Traffic Distribution
      </h2>

      <ResponsiveContainer width="100%" height="85%">
        <PieChart>
          <Pie
            data={trafficData}
            dataKey="value"
            outerRadius={100}
            label
          >
            {trafficData.map((_, index) => (
              <Cell
                key={index}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>

          <Tooltip />
        </PieChart>
      </ResponsiveContainer>

    </div>
  );
}

export default TrafficChart;