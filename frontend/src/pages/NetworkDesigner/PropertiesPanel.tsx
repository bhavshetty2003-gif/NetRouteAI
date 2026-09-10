import type { Device, Connection } from "./types";

type PropertiesPanelProps = {
  selected: Device | undefined;
  connections: Connection[];
  setDevices: React.Dispatch<React.SetStateAction<Device[]>>;
  onOpenCLI: () => void;
};

function PropertiesPanel({
  selected,
  connections,
  setDevices,
  onOpenCLI,
}: PropertiesPanelProps) {
  if (!selected) {
    return (
      <div className="w-80 border-l border-slate-800 bg-slate-900 p-6">
        <h2 className="text-xl font-bold text-white mb-4">
          Device Configuration
        </h2>

        <p className="text-gray-500">
          Select a Router, Switch or PC.
        </p>
      </div>
    );
  }

  // IPv4 Validation
  const isValidIPv4 = (ip: string) => {
    const regex =
      /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

    return regex.test(ip);
  };

  const updateDevice = (
    field: keyof Device,
    value: string
  ) => {
    setDevices((prev) =>
      prev.map((device) =>
        device.id === selected.id
          ? {
              ...device,
              [field]: value,
            }
          : device
      )
    );
  };

  const connectionCount = connections.filter(
    (c) =>
      c.fromDevice === selected.id ||
      c.toDevice === selected.id
  ).length;

  return (
    <div className="w-80 border-l border-slate-800 bg-slate-900 p-6 overflow-y-auto">

      <h2 className="text-xl font-bold text-white mb-6">
        Device Configuration
      </h2>

      {/* Device Name */}

      <div className="mb-4">
        <label className="text-gray-400 text-sm">
          Device Name
        </label>

        <input
          value={selected.name}
          onChange={(e) =>
            updateDevice("name", e.target.value)
          }
          className="mt-2 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white"
        />
      </div>

      {/* IP */}

      <div className="mb-4">
        <label className="text-gray-400 text-sm">
          IP Address
        </label>

        <input
          value={selected.ip}
          onChange={(e) =>
            updateDevice("ip", e.target.value)
          }
          className={`mt-2 w-full rounded-lg px-3 py-2 text-white bg-slate-800 border ${
            isValidIPv4(selected.ip)
              ? "border-slate-700"
              : "border-red-500"
          }`}
        />

        {!isValidIPv4(selected.ip) && (
          <p className="text-red-400 text-xs mt-1">
            Invalid IPv4 Address
          </p>
        )}
      </div>

      {/* Subnet */}

      <div className="mb-4">
        <label className="text-gray-400 text-sm">
          Subnet Mask
        </label>

        <input
          value={selected.subnet}
          onChange={(e) =>
            updateDevice("subnet", e.target.value)
          }
          className="mt-2 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white"
        />
      </div>

      {/* Gateway */}

      <div className="mb-4">
        <label className="text-gray-400 text-sm">
          Default Gateway
        </label>

        <input
          value={selected.gateway}
          onChange={(e) =>
            updateDevice("gateway", e.target.value)
          }
          className="mt-2 w-full rounded-lg bg-slate-800 border border-slate-700 px-3 py-2 text-white"
        />
      </div>

      {/* MAC */}

      <div className="mb-6">
        <label className="text-gray-400 text-sm">
          MAC Address
        </label>

        <input
          value={selected.mac}
          readOnly
          className="mt-2 w-full rounded-lg bg-slate-700 border border-slate-600 px-3 py-2 text-gray-300"
        />
      </div>

      {/* Interfaces */}

      <div className="rounded-xl bg-slate-800 p-4 mb-6">
        <h3 className="text-cyan-400 font-semibold mb-3">
          Interfaces
        </h3>

        <div className="space-y-2">
          {selected.ports.map((port) => (
            <div
              key={port.id}
              className="flex justify-between items-center rounded-lg bg-slate-900 px-3 py-2"
            >
              <span className="text-white">
                {port.name}
              </span>

              <span
                className={`text-xs font-semibold ${
                  port.connected
                    ? "text-green-400"
                    : "text-gray-500"
                }`}
              >
                {port.connected ? "Connected" : "Free"}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Device Info */}

      <div className="rounded-xl bg-slate-800 p-4">
        <h3 className="text-cyan-400 font-semibold mb-3">
          Device Information
        </h3>

        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-400">
              Type
            </span>

            <span className="text-white">
              {selected.type}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">
              Connections
            </span>

            <span className="text-cyan-400 font-semibold">
              {connectionCount}
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-400">
              Interfaces
            </span>

            <span className="text-white">
              {selected.ports.length}
            </span>
          </div>
        </div>
      </div>

      <button
  onClick={onOpenCLI}
  className="mt-6 w-full rounded-lg bg-cyan-600 hover:bg-cyan-700 transition py-3 text-white font-semibold"
>
  Open CLI
</button>
    </div>
  );
}

export default PropertiesPanel;