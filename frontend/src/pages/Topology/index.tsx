import { useState } from "react";
import NetworkGraph from "../../components/NetworkGraph/NetworkGraph";
import RouterInfo from "../../components/RouterInfo/RouterInfo";
import AIRecommendation from "../../components/AIRecommendation/AIRecommendation";
import routerData from "../../data/routerData";

function Topology() {
  const [selectedRouter, setSelectedRouter] = useState<
    keyof typeof routerData
  >("Router R1");

  return (
    <div className="h-[calc(100vh-90px)] flex flex-col">

      {/* Heading */}
      <div className="mb-4">
        <h1 className="text-3xl font-bold text-white">
          Network Topology
        </h1>

        <p className="text-gray-400 mt-2">
          Compare traditional OSPF routing with AI-powered routing decisions.
        </p>
      </div>

      {/* Main Layout */}
      <div className="grid grid-cols-4 gap-6 flex-1 min-h-0">

        {/* Left Side */}
        <div className="col-span-3">

          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-full flex flex-col">

            {/* Header */}
            <div className="flex justify-between items-center mb-5">

              <h2 className="text-xl font-semibold text-white">
                Live Network Map
              </h2>

              <div className="flex gap-6">

                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-green-500"></div>
                  <span className="text-gray-300 text-sm">
                    OSPF Route
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-cyan-400"></div>
                  <span className="text-gray-300 text-sm">
                    AI Route
                  </span>
                </div>

              </div>

            </div>

            {/* Graph */}
            <div className="flex-1 rounded-xl border border-slate-700 overflow-hidden">

              <NetworkGraph
                setSelectedRouter={setSelectedRouter}
              />

            </div>

          </div>

        </div>

        {/* Right Side */}
        <div className="col-span-1 flex flex-col gap-6">

          <RouterInfo selectedRouter={selectedRouter} />

          <AIRecommendation />

        </div>

      </div>

    </div>
  );
}

export default Topology;