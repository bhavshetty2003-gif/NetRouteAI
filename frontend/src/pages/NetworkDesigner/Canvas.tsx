import {
  Network,
  Monitor,
  Server,
  Cloud,
} from "lucide-react";

import type {
  Device,
  Connection,
} from "./types";

type CanvasProps = {
  devices: Device[];
  connections: Connection[];
  selectedDevice: number | null;

  onDeviceClick: (id: number) => void;
  onMouseDown: (
    e: React.MouseEvent,
    id: number
  ) => void;
};

function Canvas({
  devices,
  connections,
  selectedDevice,
  onDeviceClick,
  onMouseDown,
}: CanvasProps) {
  const renderIcon = (type: string) => {
    switch (type) {
      case "Router":
        return (
          <Network
            size={30}
            className="text-cyan-400"
          />
        );

      case "Switch":
        return (
          <Network
            size={30}
            className="text-green-400"
          />
        );

      case "PC":
        return (
          <Monitor
            size={30}
            className="text-yellow-400"
          />
        );

      case "Server":
        return (
          <Server
            size={30}
            className="text-purple-400"
          />
        );

      default:
        return (
          <Cloud
            size={30}
            className="text-gray-300"
          />
        );
    }
  };

  return (
    <div className="flex-1 relative overflow-hidden">

      {/* Connection Lines */}

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
              stroke={
  connection.cableType === "Straight"
    ? "#06b6d4"
    : connection.cableType === "Cross"
    ? "#f97316"
    : "#a855f7"
}
              strokeWidth="3"
              strokeLinecap="round"
            />
          );
        })}

      </svg>

      {/* Devices */}

      {devices.map((device) => (
        <div
          key={device.id}
          onClick={() =>
            onDeviceClick(device.id)
          }
          onMouseDown={(e) =>
            onMouseDown(e, device.id)
          }
          className={`absolute cursor-move rounded-xl p-4 transition-all ${
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
  );
}

export default Canvas;