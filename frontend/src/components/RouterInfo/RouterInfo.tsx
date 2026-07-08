import { useEffect, useState } from "react";
import {
  Cpu,
  MemoryStick,
  Timer,
  Wifi,
} from "lucide-react";

import routerData from "../../data/routerData";

type RouterInfoProps = {
  selectedRouter: keyof typeof routerData;
};

function RouterInfo({ selectedRouter }: RouterInfoProps) {
  const [router, setRouter] = useState(routerData[selectedRouter]);

useEffect(() => {
  setRouter(routerData[selectedRouter]);

  const interval = setInterval(() => {
    setRouter((prev) => ({
      ...prev,
      cpu: `${Math.floor(Math.random() * 40) + 20}%`,
      memory: `${Math.floor(Math.random() * 30) + 50}%`,
      latency: `${Math.floor(Math.random() * 20) + 5} ms`,
      packetLoss: `${(Math.random() * 1).toFixed(1)}%`,
    }));
  }, 3000);

  return () => clearInterval(interval);
}, [selectedRouter]);

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 h-full">

      <h2 className="text-xl font-semibold text-white mb-2">
        Router Information
      </h2>

      <p className="text-cyan-400 mb-6 font-medium">
        {selectedRouter}
      </p>

      <div className="grid grid-cols-2 gap-6">

        <div className="flex items-center gap-3">
          <Cpu className="text-cyan-400" />
          <div>
            <p className="text-gray-400 text-sm">CPU Usage</p>
            <p className="text-white font-semibold">{router.cpu}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <MemoryStick className="text-cyan-400" />
          <div>
            <p className="text-gray-400 text-sm">Memory</p>
            <p className="text-white font-semibold">{router.memory}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Timer className="text-cyan-400" />
          <div>
            <p className="text-gray-400 text-sm">Latency</p>
            <p className="text-white font-semibold">{router.latency}</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <Wifi className="text-cyan-400" />
          <div>
            <p className="text-gray-400 text-sm">Packet Loss</p>
            <p className="text-white font-semibold">{router.packetLoss}</p>
          </div>
        </div>

      </div>

      <div className="mt-6 border-t border-slate-800 pt-4">
        <p className="text-green-400 font-medium">
          Status: {router.status}
        </p>
      </div>

    </div>
  );
}

export default RouterInfo;