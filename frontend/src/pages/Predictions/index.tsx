import PredictionCard from "../../components/PredictionCard/PredictionCard";
import { predictions } from "../../data/predictionsData";

function Predictions() {
  return (
    <div className="h-full flex flex-col">

      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          AI Route Predictions
        </h1>

        <p className="text-gray-400 mt-2">
          AI analyzes network conditions and recommends the most efficient routing paths.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6 mb-6">

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">
            AI Confidence
          </p>

          <h2 className="text-3xl font-bold text-cyan-400 mt-2">
            96%
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">
            Predictions
          </p>

          <h2 className="text-3xl font-bold text-green-400 mt-2">
            3
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">
            Recommended
          </p>

          <h2 className="text-3xl font-bold text-yellow-400 mt-2">
            1
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">
            Avg. Latency Gain
          </p>

          <h2 className="text-3xl font-bold text-purple-400 mt-2">
            18%
          </h2>
        </div>

      </div>

      {/* Prediction Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">

        {predictions.map((prediction) => (
          <PredictionCard
            key={prediction.id}
            router={prediction.router}
            confidence={prediction.confidence}
            currentRoute={prediction.currentRoute}
            aiRoute={prediction.aiRoute}
            latencyReduction={prediction.latencyReduction}
            status={prediction.status}
          />
        ))}

      </div>

    </div>
  );
}

export default Predictions;