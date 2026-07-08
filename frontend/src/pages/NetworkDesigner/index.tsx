import { useState } from "react";
import {
  Network,
  Monitor,
  Server,
  Cloud,
  Link2,
} from "lucide-react";

type Device = {
  id: number;
  type: string;
  name: string;
  ip: string;
  x: number;
  y: number;
};

type Connection = {
  from: number;
  to: number;
};

function NetworkDesigner() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);

  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const [connectMode, setConnectMode] = useState(false);
  const [firstDevice, setFirstDevice] = useState<number | null>(null);
  const [connections, setConnections] = useState<Connection[]>([]);

  const addDevice = (type: string) => {
    const count =
      devices.filter((d) => d.type === type).length + 1;

    let prefix = "";

    switch (type) {
      case "Router":
        prefix = "R";
        break;
      case "Switch":
        prefix = "SW";
        break;
      case "PC":
        prefix = "PC";
        break;
      case "Server":
        prefix = "SRV";
        break;
      default:
        prefix = "CL";
    }

    setDevices((prev) => [
      ...prev,
      {
        id: Date.now(),
        type,
        name: `${prefix}${count}`,
        ip: "192.168.1.1",
        x: 100 + prev.length * 90,
        y: 100 + prev.length * 40,
      },
    ]);
  };

  const renderIcon = (type: string) => {
    switch (type) {
      case "Router":
        return <Network size={30} className="text-cyan-400" />;

      case "Switch":
        return <Network size={30} className="text-green-400" />;

      case "PC":
        return <Monitor size={30} className="text-yellow-400" />;

      case "Server":
        return <Server size={30} className="text-purple-400" />;

      default:
        return <Cloud size={30} className="text-gray-300" />;
    }
  };

  const handleMouseDown = (
    e: React.MouseEvent,
    id: number
  ) => {
    if (connectMode) return;

    const rect =
      e.currentTarget.getBoundingClientRect();

    setDraggingId(id);

    setOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });

    setSelectedDevice(id);
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (draggingId === null) return;

    setDevices((prev) =>
      prev.map((device) =>
        device.id === draggingId
          ? {
              ...device,
              x: e.clientX - offset.x - 270,
              y: e.clientY - offset.y - 140,
            }
          : device
      )
    );
  };

  const handleMouseUp = () => {
    setDraggingId(null);
  };

  const handleDeviceClick = (id: number) => {
    setSelectedDevice(id);

    if (!connectMode) return;

    if (firstDevice === null) {
      setFirstDevice(id);
      return;
    }

    if (firstDevice !== id) {
      setConnections((prev) => [
        ...prev,
        {
          from: firstDevice,
          to: id,
        },
      ]);
    }

    setFirstDevice(null);
    setConnectMode(false);
  };

  const selected = devices.find(
    (d) => d.id === selectedDevice
  );

  return (
    <div
      className="h-full flex flex-col select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      {/* Heading */}
      <div className="mb-6 flex justify-between items-center">

        <div>
          <h1 className="text-3xl font-bold text-white">
            Network Designer
          </h1>

          <p className="text-gray-400 mt-2">
            Build, configure and simulate your own network topology.
          </p>
        </div>

        <button
          onClick={() => {
            setConnectMode(!connectMode);
            setFirstDevice(null);
          }}
          className={`flex items-center gap-2 px-5 py-3 rounded-xl transition ${
            connectMode
              ? "bg-cyan-500 text-white"
              : "bg-slate-800 text-gray-300"
          }`}
        >
          <Link2 size={18} />
          Connect
        </button>

      </div>

      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl flex">

        {/* Left */}
        <div className="w-64 border-r border-slate-800 p-6">

          <h2 className="text-xl text-white mb-6">
            Devices
          </h2>

          <div className="space-y-4">

            <button
              onClick={() => addDevice("Router")}
              className="w-full bg-slate-800 p-4 rounded-xl text-left text-white"
            >
              🛜 Router
            </button>

            <button
              onClick={() => addDevice("Switch")}
              className="w-full bg-slate-800 p-4 rounded-xl text-left text-white"
            >
              🖧 Switch
            </button>

            <button
              onClick={() => addDevice("PC")}
              className="w-full bg-slate-800 p-4 rounded-xl text-left text-white"
            >
              💻 PC
            </button>

            <button
              onClick={() => addDevice("Server")}
              className="w-full bg-slate-800 p-4 rounded-xl text-left text-white"
            >
              🖥 Server
            </button>

            <button
              onClick={() => addDevice("Cloud")}
              className="w-full bg-slate-800 p-4 rounded-xl text-left text-white"
            >
              ☁ Cloud
            </button>

          </div>

        </div>

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden">
        <svg className="absolute inset-0 w-full h-full pointer-events-none">

  {connections.map((connection, index) => {
    const from = devices.find(
      (d) => d.id === connection.from
    );

    const to = devices.find(
      (d) => d.id === connection.to
    );

    if (!from || !to) return null;

    return (
      <line
        key={index}
        x1={from.x + 40}
        y1={from.y + 40}
        x2={to.x + 40}
        y2={to.y + 40}
        stroke="#06b6d4"
        strokeWidth="3"
        strokeLinecap="round"
      />
    );
  })}

</svg>

          {devices.map((device) => (

            <div
              key={device.id}
              onClick={() => handleDeviceClick(device.id)}
              onMouseDown={(e) =>
                handleMouseDown(e, device.id)
              }
              className={`absolute cursor-move rounded-xl p-4 transition-all
                ${
                  selectedDevice === device.id
                    ? "bg-cyan-500/20 border-2 border-cyan-400"
                    : "bg-slate-800 border border-slate-700"
                }`}
              style={{
                left: device.x,
                top: device.y,
              }}
            >
              <div className="flex flex-col items-center">

                {renderIcon(device.type)}

                <p className="text-white mt-2">
                  {device.name}
                </p>

                <p className="text-xs text-gray-400">
                  {device.ip}
                </p>

              </div>
            </div>

          ))}

        </div>

        {/* Properties */}
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
              (c) =>
                c.from === selected.id ||
                c.to === selected.id
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

      </div>
    </div>
  );
}

export default NetworkDesigner;