import {
  BookOpen,
  Network,
  Bot,
  Cpu,
  ArrowRight,
} from "lucide-react";

function Documentation() {
  return (
    <div className="h-full">

      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          Documentation
        </h1>

        <p className="text-gray-400 mt-2">
          Learn how NetRouteAI works and understand the routing workflow.
        </p>
      </div>

      <div className="space-y-6">

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-4">
            <BookOpen className="text-cyan-400" />
            <h2 className="text-xl font-semibold text-white">
              Project Overview
            </h2>
          </div>

          <p className="text-gray-300 leading-7">
            NetRouteAI combines traditional OSPF routing with Artificial
            Intelligence to predict congestion, reduce latency and recommend
            optimal routing paths for network traffic.
          </p>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <div className="flex items-center gap-3 mb-5">
            <Network className="text-green-400" />
            <h2 className="text-xl font-semibold text-white">
              Routing Workflow
            </h2>
          </div>

          <div className="flex flex-wrap items-center gap-3 text-lg">

            <span className="bg-slate-800 px-4 py-2 rounded-lg">
              Network
            </span>

            <ArrowRight className="text-cyan-400" />

            <span className="bg-slate-800 px-4 py-2 rounded-lg">
              OSPF Analysis
            </span>

            <ArrowRight className="text-cyan-400" />

            <span className="bg-slate-800 px-4 py-2 rounded-lg">
              AI Prediction
            </span>

            <ArrowRight className="text-cyan-400" />

            <span className="bg-slate-800 px-4 py-2 rounded-lg">
              Best Route
            </span>

          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-6">

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <Bot className="text-cyan-400 mb-4" size={30} />

            <h3 className="text-xl font-semibold text-white mb-2">
              AI Engine
            </h3>

            <p className="text-gray-400">
              Evaluates latency, congestion, CPU utilization and packet loss
              before recommending the most efficient route.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
            <Cpu className="text-green-400 mb-4" size={30} />

            <h3 className="text-xl font-semibold text-white mb-2">
              Live Monitoring
            </h3>

            <p className="text-gray-400">
              Continuously tracks router health, CPU, memory, bandwidth and
              uptime to provide real-time network visibility.
            </p>
          </div>

        </div>

      </div>

    </div>
  );
}

export default Documentation;