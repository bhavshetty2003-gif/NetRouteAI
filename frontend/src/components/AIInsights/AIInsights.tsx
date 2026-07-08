import { Bot, TrendingUp, AlertTriangle } from "lucide-react";

function AIInsights() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

      <div className="flex items-center gap-3 mb-5">
        <Bot className="text-cyan-400" size={28} />
        <h2 className="text-xl font-semibold text-white">
          AI Insights
        </h2>
      </div>

      <div className="space-y-4">

        <div className="flex items-start gap-3">
          <TrendingUp
            className="text-green-400 mt-1"
            size={20}
          />

          <p className="text-gray-300">
            AI routing reduced average latency by
            <span className="text-cyan-400 font-semibold">
              {" "}18%
            </span>
            {" "}compared to traditional OSPF.
          </p>
        </div>

        <div className="flex items-start gap-3">
          <AlertTriangle
            className="text-yellow-400 mt-1"
            size={20}
          />

          <p className="text-gray-300">
            Router R2 reached
            <span className="text-yellow-400 font-semibold">
              {" "}62% CPU
            </span>
            {" "}during peak traffic.
          </p>
        </div>

        <div className="flex items-start gap-3">
          <Bot
            className="text-cyan-400 mt-1"
            size={20}
          />

          <p className="text-gray-300">
            AI recommends routing future traffic
            through Router R3 to maintain optimal
            performance.
          </p>
        </div>

      </div>

    </div>
  );
}

export default AIInsights;