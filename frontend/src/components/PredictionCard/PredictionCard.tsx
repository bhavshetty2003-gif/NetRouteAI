import { Bot, ArrowRight } from "lucide-react";

type PredictionCardProps = {
  router: string;
  confidence: number;
  currentRoute: string;
  aiRoute: string;
  latencyReduction: string;
  status: string;
};

function PredictionCard({
  router,
  confidence,
  currentRoute,
  aiRoute,
  latencyReduction,
  status,
}: PredictionCardProps) {
  const statusColor =
    status === "Recommended"
      ? "text-cyan-400"
      : status === "Optimal"
      ? "text-green-400"
      : "text-yellow-400";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-cyan-500 transition-all duration-300">

      <div className="flex justify-between items-center mb-5">
        <div>
          <h2 className="text-xl font-semibold text-white">
            {router}
          </h2>

          <p className={`font-medium ${statusColor}`}>
            {status}
          </p>
        </div>

        <Bot className="text-cyan-400" size={28} />
      </div>

      <div className="space-y-4">

        <div>
          <p className="text-gray-400 text-sm">
            AI Confidence
          </p>

          <h3 className="text-2xl font-bold text-cyan-400">
            {confidence}%
          </h3>
        </div>

        <div>
          <p className="text-gray-400 text-sm">
            Current Route
          </p>

          <p className="text-white">
            {currentRoute}
          </p>
        </div>

        <div className="flex items-center gap-2 text-cyan-400">
          <ArrowRight size={18} />
          <span>{aiRoute}</span>
        </div>

        <div>
          <p className="text-gray-400 text-sm">
            Estimated Improvement
          </p>

          <p className="text-green-400 font-semibold">
            {latencyReduction} lower latency
          </p>
        </div>

      </div>

    </div>
  );
}

export default PredictionCard;