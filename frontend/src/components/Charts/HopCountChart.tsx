import {
  ResponsiveContainer,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

const hopData = [
  { router: "R1", hops: 2 },
  { router: "R2", hops: 3 },
  { router: "R3", hops: 1 },
  { router: "R4", hops: 4 },
];

function HopCountChart() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-[350px]">

      <h2 className="text-xl font-semibold text-white mb-6">
        Hop Count Comparison
      </h2>

      <ResponsiveContainer width="100%" height="85%">
        <BarChart data={hopData}>
          <CartesianGrid stroke="#334155" />
          <XAxis dataKey="router" stroke="#94a3b8" />
          <YAxis stroke="#94a3b8" />
          <Tooltip />
          <Bar
            dataKey="hops"
            fill="#8b5cf6"
            radius={[8, 8, 0, 0]}
          />
        </BarChart>
      </ResponsiveContainer>

    </div>
  );
}

export default HopCountChart;