import { Bot } from "lucide-react";

type AIRecommendationProps = {
  aiEnabled: boolean;
};

function AIRecommendation({ aiEnabled }: AIRecommendationProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">

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
            {aiEnabled ? "R1 → R3 → PC1" : "R1 → R2 → PC1"}
          </p>
        </div>

        <div>
          <p className="text-gray-400 text-sm">
            Status
          </p>

          <p
            className={`font-semibold ${
              aiEnabled
                ? "text-green-400"
                : "text-yellow-400"
            }`}
          >
            {aiEnabled
              ? "AI Route Active"
              : "Using OSPF"}
          </p>
        </div>

        <div>
          <p className="text-gray-400 text-sm">
            Recommendation
          </p>

          <p className="text-cyan-400 font-medium">
            {aiEnabled
              ? "Lower latency route selected"
              : "Click 'Run AI Routing'"}
          </p>
        </div>

        <div>
          <p className="text-gray-400 text-sm">
            Confidence
          </p>

          <p className="text-green-400 font-semibold">
            {aiEnabled ? "96%" : "--"}
          </p>
        </div>

      </div>

    </div>
  );
}

export default AIRecommendation;