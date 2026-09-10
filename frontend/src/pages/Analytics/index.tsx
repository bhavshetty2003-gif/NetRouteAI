import LatencyChart from "../../components/Charts/LatencyChart";
import CpuChart from "../../components/Charts/CpuChart";
import HopCountChart from "../../components/Charts/HopCountChart";

function Analytics() {
  return (
    <div className="h-full flex flex-col">

      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          Network Analytics
        </h1>

        <p className="text-gray-400 mt-2">
          Monitor OSPF network performance using key routing metrics.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">Latency</p>
          <h2 className="text-3xl font-bold text-cyan-400 mt-2">
            8 ms
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">Bandwidth</p>
          <h2 className="text-3xl font-bold text-green-400 mt-2">
            950 Mbps
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">Hop Count</p>
          <h2 className="text-3xl font-bold text-purple-400 mt-2">
            3
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">
            Convergence Time
          </p>
          <h2 className="text-3xl font-bold text-orange-400 mt-2">
            18 ms
          </h2>
        </div>

      </div>

      {/* Second Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">Packet Loss</p>
          <h2 className="text-3xl font-bold text-yellow-400 mt-2">
            0.2%
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">Throughput</p>
          <h2 className="text-3xl font-bold text-blue-400 mt-2">
            890 Mbps
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

        <HopCountChart />

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-[350px]">

          <h2 className="text-xl font-semibold text-white mb-6">
            OSPF Network Summary
          </h2>

          <div className="space-y-5 text-gray-300">

            <p>
              ✅ Average latency remains within acceptable limits.
            </p>

            <p>
              ✅ OSPF convergence time is stable.
            </p>

            <p>
              ✅ Packet loss is below the acceptable threshold.
            </p>

            <p>
              ✅ Throughput is consistent across the network.
            </p>

            <p>
              ✅ Current hop count is optimal for the configured topology.
            </p>

            <div className="pt-4 border-t border-slate-700">
              <p className="text-green-400 font-medium">
                Network Status: OSPF Operating Normally
              </p>
            </div>

          </div>

        </div>

      </div>

    </div>
  );
}

export default Analytics;