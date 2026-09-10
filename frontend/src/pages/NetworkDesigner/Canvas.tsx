import { useState } from "react";
import type { Device, Connection } from "./types";

import {
  RouterIcon,
  SwitchIcon,
  PCIcon,
} from "./NetworkIcons";

type CanvasProps = {
  devices: Device[];
  connections: Connection[];
  selectedDevice: number | null;

  onDeviceClick: (id: number) => void;

  onMouseDown: (
    e: React.MouseEvent,
    id: number
  ) => void;

  onMouseMove: (e: React.MouseEvent) => void;
  onMouseUp: () => void;
};

function Canvas({
  devices,
  connections,
  selectedDevice,
  onDeviceClick,
  onMouseDown,
  onMouseMove,
  onMouseUp,
}: CanvasProps) {
  const [zoom, setZoom] = useState(1);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();

    const delta = e.deltaY < 0 ? 0.1 : -0.1;

    setZoom((prev) =>
      Math.max(0.5, Math.min(2.5, prev + delta))
    );
  };

  const renderIcon = (type: string) => {
    switch (type) {
      case "Router":
        return <RouterIcon />;

      case "Switch":
        return <SwitchIcon />;

      case "PC":
        return <PCIcon />;

      default:
        return <PCIcon />;
    }
  };

  const getCableColor = (type: string) => {
    switch (type) {
      case "Copper Straight Through":
        return "#38bdf8";

      case "Copper Cross Over":
        return "#f97316";

      case "Fiber":
        return "#a855f7";

      case "Console":
        return "#facc15";

      case "Serial DCE":
        return "#22c55e";

      case "Serial DTE":
        return "#ef4444";

      case "Coaxial":
        return "#94a3b8";

      case "Phone":
        return "#ec4899";

      default:
        return "#38bdf8";
    }
  };

  const getDashArray = (type: string) => {
    switch (type) {
      case "Copper Cross Over":
        return "8 6";

      case "Console":
        return "2 6";

      case "Coaxial":
        return "12 4";

      default:
        return "";
    }
  };

  return (
    <div
      className="flex-1 overflow-hidden bg-slate-950 relative"
      onWheel={handleWheel}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      style={{
        touchAction: "none",
        backgroundImage: `
          linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px),
          linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px)
        `,
        backgroundSize: "32px 32px",
      }}
    >
      <div
        style={{
          transform: `scale(${zoom})`,
          transformOrigin: "0 0",
          width: "100%",
          height: "100%",
        }}
      >
        {/* Connections */}

        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {connections.map((connection) => {
            const from = devices.find(
              (d) => d.id === connection.fromDevice
            );

            const to = devices.find(
              (d) => d.id === connection.toDevice
            );

            if (!from || !to) return null;

           const startX =
           from.type === "Router" ? from.x + 40 : from.x + 56;

           const startY =
           from.type === "Router" ? from.y + 18 : from.y + 32;

           const endX =
           to.type === "Router" ? to.x + 40 : to.x + 8;

           const endY =
           to.type === "Router" ? to.y + 18 : to.y + 32;

            const control1X = startX + 60;
            const control2X = endX - 60;

            return (
              <path
                key={connection.id}
                d={`M ${startX} ${startY}
                    C ${control1X} ${startY},
                      ${control2X} ${endY},
                      ${endX} ${endY}`}
                stroke={getCableColor(connection.cableType)}
                strokeWidth={3}
                fill="none"
                strokeLinecap="round"
                strokeDasharray={getDashArray(
                  connection.cableType
                )}
              />
            );
          })}
        </svg>

        {/* Devices */}

        {devices.map((device) => (
          <div
            key={device.id}
            style={{
              left: device.x,
              top: device.y,
            }}
            className="absolute cursor-move select-none"
            onClick={() => onDeviceClick(device.id)}
            onMouseDown={(e) =>
              onMouseDown(e, device.id)
            }
          >
            <div
              className={`transition-transform duration-150 ${
                selectedDevice === device.id
                  ? "scale-110"
                  : "hover:scale-105"
              }`}
            >
              {renderIcon(device.type)}
            </div>

            <p
              className={`text-xs text-center mt-1 ${
                selectedDevice === device.id
                  ? "text-cyan-300"
                  : "text-white"
              }`}
            >
              {device.name}
            </p>

            <div className="flex justify-center mt-1">
              <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></div>
            </div>
          </div>
        ))}
      </div>

      <div className="absolute bottom-4 right-4 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm">
        Zoom: {Math.round(zoom * 100)}%
      </div>
    </div>
  );
}

export default Canvas;