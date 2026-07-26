import type { Device, Connection } from "./types";

type PropertiesPanelProps = {
  selected: Device | undefined;
  connections: Connection[];
  setDevices: React.Dispatch<React.SetStateAction<Device[]>>;
};

function PropertiesPanel({
  selected,
  connections,
  setDevices,
}: PropertiesPanelProps) {
  return (
    <div className="w-72 border-l border-slate-800 p-6">
      <h2 className="text-xl text-white mb-5">
        Properties
      </h2>

      {selected ? (
        <div className="space-y-5">
          <div>
            <label className="text-gray-400 text-sm">
              Device Name
            </label>

            <input
              value={selected.name}
              onChange={(e) =>
                setDevices((prev) =>
                  prev.map((device) =>
                    device.id === selected.id
                      ? {
                          ...device,
                          name: e.target.value,
                        }
                      : device
                  )
                )
              }
              className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <label className="text-gray-400 text-sm">
              IP Address
            </label>

            <input
              value={selected.ip}
              onChange={(e) =>
                setDevices((prev) =>
                  prev.map((device) =>
                    device.id === selected.id
                      ? {
                          ...device,
                          ip: e.target.value,
                        }
                      : device
                  )
                )
              }
              className="mt-2 w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white outline-none focus:border-cyan-400"
            />
          </div>

          <div>
            <p className="text-gray-400 text-sm">
              Device Type
            </p>

            <p className="text-white mt-2">
              {selected.type}
            </p>
          </div>

          <div>
            <p className="text-gray-400 text-sm">
              Connections
            </p>

            <p className="text-cyan-400 mt-2 text-xl font-bold">
              {
                connections.filter(
                  (connection) =>
                    connection.from === selected.id ||
                    connection.to === selected.id
                ).length
              }
            </p>
          </div>
        </div>
      ) : (
        <p className="text-gray-500">
          Select a device.
        </p>
      )}
    </div>
  );
}

export default PropertiesPanel;