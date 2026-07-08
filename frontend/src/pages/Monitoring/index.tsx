import DeviceCard from "../../components/DeviceCard/DeviceCard";
import { monitoringData } from "../../data/monitoringData";

function Monitoring() {
  return (
    <div className="h-full flex flex-col">

      {/* Heading */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white">
          Network Monitoring
        </h1>

        <p className="text-gray-400 mt-2">
          Monitor the health and status of every device in real time.
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-6">

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">
            Online Devices
          </p>

          <h2 className="text-3xl font-bold text-green-400 mt-2">
            3
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">
            Warning
          </p>

          <h2 className="text-3xl font-bold text-yellow-400 mt-2">
            1
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">
            Offline
          </p>

          <h2 className="text-3xl font-bold text-red-400 mt-2">
            0
          </h2>
        </div>

        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6">
          <p className="text-gray-400 text-sm">
            Average CPU
          </p>

          <h2 className="text-3xl font-bold text-cyan-400 mt-2">
            38%
          </h2>
        </div>

      </div>

      {/* Device Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {monitoringData.map((device) => (
          <DeviceCard
            key={device.id}
            name={device.name}
            status={device.status}
            cpu={device.cpu}
            memory={device.memory}
            latency={device.latency}
            uptime={device.uptime}
          />
        ))}

      </div>

    </div>
  );
}

export default Monitoring;