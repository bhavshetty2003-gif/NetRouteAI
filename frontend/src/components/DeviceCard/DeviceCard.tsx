import { Cpu, MemoryStick, Activity } from "lucide-react";

type DeviceCardProps = {
  name: string;
  status: string;
  cpu: number;
  memory: number;
  latency: string;
  uptime: string;
};

function DeviceCard({
  name,
  status,
  cpu,
  memory,
  latency,
  uptime,
}: DeviceCardProps) {
  const statusColor =
    status === "Online"
      ? "bg-green-500"
      : "bg-yellow-500";

  return (
    <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 hover:border-cyan-500 transition-all duration-300">

      <div className="flex justify-between items-center mb-5">
        <h2 className="text-xl font-semibold text-white">
          {name}
        </h2>

        <div className="flex items-center gap-2">
          <div className={`w-3 h-3 rounded-full ${statusColor}`} />
          <span className="text-gray-300 text-sm">
            {status}
          </span>
        </div>
      </div>

      <div className="space-y-4">

        <div className="flex justify-between">
          <div className="flex items-center gap-2">
            <Cpu size={18} className="text-cyan-400" />
            <span className="text-gray-400">CPU</span>
          </div>

          <span className="text-white font-semibold">
            {cpu}%
          </span>
        </div>

        <div className="flex justify-between">
          <div className="flex items-center gap-2">
            <MemoryStick size={18} className="text-green-400" />
            <span className="text-gray-400">Memory</span>
          </div>

          <span className="text-white font-semibold">
            {memory}%
          </span>
        </div>

        <div className="flex justify-between">
          <div className="flex items-center gap-2">
            <Activity size={18} className="text-purple-400" />
            <span className="text-gray-400">Latency</span>
          </div>

          <span className="text-white font-semibold">
            {latency}
          </span>
        </div>

        <div className="pt-3 border-t border-slate-800">
          <p className="text-sm text-gray-400">
            Uptime
          </p>

          <p className="text-white font-semibold">
            {uptime}
          </p>
        </div>

      </div>

    </div>
  );
}

export default DeviceCard;