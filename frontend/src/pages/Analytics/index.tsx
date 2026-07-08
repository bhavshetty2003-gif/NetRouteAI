import LatencyChart from "../../components/Charts/LatencyChart";
import CpuChart from "../../components/Charts/CpuChart";
import TrafficChart from "../../components/Charts/TrafficChart";
import AIInsights from "../../components/AIInsights/AIInsights";

function Analytics() {
  return (
    <div className="h-full flex flex-col">

      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          Network Analytics
        </h1>

        <p className="text-gray-400 mt-2">
          Monitor network performance and AI routing insights.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">
            Average Latency
          </p>

          <h2 className="text-3xl font-bold text-cyan-400 mt-2">
            8 ms
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">
            AI Accuracy
          </p>

          <h2 className="text-3xl font-bold text-green-400 mt-2">
            96%
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">
            Active Routers
          </p>

          <h2 className="text-3xl font-bold text-purple-400 mt-2">
            4
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">
            Packet Loss
          </p>

          <h2 className="text-3xl font-bold text-yellow-400 mt-2">
            0.2%
          </h2>
        </div>

      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">

        <LatencyChart />

        <CpuChart />

      </div>

      {/* Bottom Section */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-6">

        <TrafficChart />

        <AIInsights />

      </div>

    </div>
  );
}

export default Analytics;