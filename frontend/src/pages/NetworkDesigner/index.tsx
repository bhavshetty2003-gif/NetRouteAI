import { useState } from "react";
import Toolbar from "./Toolbar";
import DevicePalette from "./DevicePalette";
import Canvas from "./Canvas";
import PropertiesPanel from "./PropertiesPanel";
import type { Device, Connection } from "./types";

function NetworkDesigner() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);
  const [cableType, setCableType] = useState<
  "Straight" | "Cross" | "Fiber"
>("Straight");
  const [selectedDevice, setSelectedDevice] = useState<number | null>(null);
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [offset, setOffset] = useState({
    x: 0,
    y: 0,
  });

  const [connectMode, setConnectMode] = useState(false);

  const [firstDevice, setFirstDevice] = useState<number | null>(null);

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

  const handleMouseDown = (
    e: React.MouseEvent,
    id: number
  ) => {
    if (connectMode) return;

    const rect = e.currentTarget.getBoundingClientRect();

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
          cableType,
        },
      ]);
    }

    setFirstDevice(null);
    setConnectMode(false);
  };

  const selected = devices.find(
    (device) => device.id === selectedDevice
  );

  return (
    <div
      className="h-full flex flex-col select-none"
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <Toolbar
        cableType={cableType}
        onCableChange={setCableType}
        connectMode={connectMode}
        onConnect={() => {
          setConnectMode(!connectMode);
          setFirstDevice(null);
        }}
        onDelete={() => {
          if (selectedDevice === null) return;

          setDevices((prev) =>
            prev.filter(
              (device) => device.id !== selectedDevice
            )
          );

          setConnections((prev) =>
            prev.filter(
              (connection) =>
                connection.from !== selectedDevice &&
                connection.to !== selectedDevice
            )
          );

          setSelectedDevice(null);
        }}
        onSave={() => {
          localStorage.setItem(
            "networkTopology",
            JSON.stringify({
              devices,
              connections,
            })
          );

          alert("Topology saved successfully!");
        }}
        onLoad={() => {
          const savedTopology =
            localStorage.getItem("networkTopology");

          if (!savedTopology) {
            alert("No saved topology found!");
            return;
          }

          const topology = JSON.parse(savedTopology);

          setDevices(topology.devices);
          setConnections(topology.connections);

          setSelectedDevice(null);
          setFirstDevice(null);

          alert("Topology loaded successfully!");
        }}
      />

      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl flex">
        <DevicePalette onAddDevice={addDevice} />

        <Canvas
          devices={devices}
          connections={connections}
          selectedDevice={selectedDevice}
          onDeviceClick={handleDeviceClick}
          onMouseDown={handleMouseDown}
        />

        <PropertiesPanel
          selected={selected}
          connections={connections}
          setDevices={setDevices}
        />
      </div>
    </div>
  );
}

export default NetworkDesigner;