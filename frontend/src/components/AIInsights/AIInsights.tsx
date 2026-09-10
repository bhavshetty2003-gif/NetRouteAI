import {
  Activity,
  Network,
  Clock,
  CheckCircle,
} from "lucide-react";

function AIInsights() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <div className="flex items-center gap-3 mb-5">
        <Activity className="text-cyan-400" size={28} />

        <h2 className="text-xl font-semibold text-white">
          OSPF Network Insights
        </h2>
      </div>

      <div className="space-y-5">

        <div className="flex items-start gap-3">
          <Network
            className="text-cyan-400 mt-1"
            size={20}
          />

          <p className="text-gray-300">
            Average network latency is stable and
            remains within acceptable limits.
          </p>
        </div>

        <div className="flex items-start gap-3">
          <Clock
            className="text-orange-400 mt-1"
            size={20}
          />

          <p className="text-gray-300">
            OSPF convergence time is healthy, allowing
            the network to recover quickly after topology
            changes.
          </p>
        </div>

        <div className="flex items-start gap-3">
          <CheckCircle
            className="text-green-400 mt-1"
            size={20}
          />

          <p className="text-gray-300">
            Packet loss is below the acceptable threshold,
            and overall throughput remains stable across
            the network.
          </p>
        </div>

      </div>

    </div>
  );
}

export default AIInsights;