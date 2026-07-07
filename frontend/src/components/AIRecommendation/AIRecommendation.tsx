import { Bot } from "lucide-react";

function AIRecommendation() {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 mt-6">

      <div className="flex items-center gap-2 mb-5">
        <Bot className="text-cyan-400" />
        <h2 className="text-xl font-semibold text-white">
          AI Recommendation
        </h2>
      </div>

      <div className="space-y-4">

        <div>
          <p className="text-gray-400 text-sm">
            Current Route
          </p>

          <p className="text-white font-medium">
            R1 → R2 → PC1
          </p>
        </div>

        <div>
          <p className="text-gray-400 text-sm">
            Recommended Route
          </p>

          <p className="text-cyan-400 font-medium">
            R1 → R3 → PC1
          </p>
        </div>

        <div>
          <p className="text-gray-400 text-sm">
            Reason
          </p>

          <ul className="text-white text-sm list-disc ml-5 space-y-1">
            <li>Lower latency</li>
            <li>Less congestion</li>
            <li>Higher available bandwidth</li>
          </ul>
        </div>

        <div>
          <p className="text-gray-400 text-sm">
            Confidence
          </p>

          <p className="text-green-400 font-semibold">
            96%
          </p>
        </div>

      </div>

    </div>
  );
}

export default AIRecommendation;