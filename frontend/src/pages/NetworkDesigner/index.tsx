import { useState } from "react";
import Toolbar from "./Toolbar";
import DevicePalette from "./DevicePalette";
import Canvas from "./Canvas";
import PropertiesPanel from "./PropertiesPanel";
import InterfaceSelector from "./InterfaceSelector";
import CLI from "./CLI";

import type {
  Device,
  Connection,
  CableType,
  Port,
} from "./types";

function NetworkDesigner() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [connections, setConnections] = useState<Connection[]>([]);

  const [cableType, setCableType] =
    useState<CableType>("Auto");

  const [selectedDevice, setSelectedDevice] =
    useState<number | null>(null);

  const [draggingId, setDraggingId] =
    useState<number | null>(null);

  const [offset, setOffset] = useState({
    x: 0,
    y: 0,
  });

  const [connectMode, setConnectMode] =
    useState(false);

  const [showInterfacePopup, setShowInterfacePopup] =
  useState(false);

const [popupDevice, setPopupDevice] =
  useState<Device | null>(null);

const [selectedPort, setSelectedPort] =
  useState<{
    deviceId: number;
    port: Port;
  } | null>(null);  

const [showCLI, setShowCLI] = useState(false);

  const addDevice = (
    deviceType: "Router" | "Switch" | "PC"
  ) => {
    const count =
      devices.filter((d) => d.type === deviceType)
        .length + 1;

    let prefix = "";

    switch (deviceType) {
      case "Router":
        prefix = "R";
        break;
      case "Switch":
        prefix = "SW";
        break;
      case "PC":
        prefix = "PC";
        break;
    }

    let ports: Port[] = [];

    if (deviceType === "Router") {
      ports = [
        {
          id: "g0/0",
          name: "Gi0/0",
          type: "GigabitEthernet",
          connected: false,
        },
        {
          id: "g0/1",
          name: "Gi0/1",
          type: "GigabitEthernet",
          connected: false,
        },
      ];
    } else if (deviceType === "Switch") {
      ports = [
        {
          id: "fa0/1",
          name: "Fa0/1",
          type: "FastEthernet",
          connected: false,
        },
        {
          id: "fa0/2",
          name: "Fa0/2",
          type: "FastEthernet",
          connected: false,
        },
        {
          id: "fa0/3",
          name: "Fa0/3",
          type: "FastEthernet",
          connected: false,
        },
        {
          id: "fa0/4",
          name: "Fa0/4",
          type: "FastEthernet",
          connected: false,
        },
      ];
    } else {
      ports = [
        {
          id: "fa0",
          name: "Fa0",
          type: "FastEthernet",
          connected: false,
        },
      ];
    }

    const newDevice: Device = {
      id: Date.now(),
      type: deviceType,
      name: `${prefix}${count}`,
      ip: "192.168.1.1",
      subnet: "255.255.255.0",
      gateway: "192.168.1.254",
      mac:
        "00:1A:" +
        Math.floor(Math.random() * 99)
          .toString()
          .padStart(2, "0") +
        ":" +
        Math.floor(Math.random() * 99)
          .toString()
          .padStart(2, "0") +
        ":" +
        Math.floor(Math.random() * 99)
          .toString()
          .padStart(2, "0") +
        ":" +
        Math.floor(Math.random() * 99)
          .toString()
          .padStart(2, "0"),
      x: 100 + devices.length * 90,
      y: 100 + devices.length * 40,
      ports,
    };

    setDevices((prev) => [...prev, newDevice]);
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

  const handleMouseMove = (
    e: React.MouseEvent
  ) => {
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

  const device = devices.find(
    (d) => d.id === id
  );

  if (!device) return;

  setPopupDevice(device);
  setShowInterfacePopup(true);
};

const handlePortSelect = (port: Port) => {
  if (!popupDevice) return;

  // First device selected
  if (!selectedPort) {
    setSelectedPort({
      deviceId: popupDevice.id,
      port,
    });

    setShowInterfacePopup(false);
    return;
  }

  // Prevent connecting a device to itself
  if (selectedPort.deviceId === popupDevice.id) {
    alert("Cannot connect a device to itself.");
    setSelectedPort(null);
    setPopupDevice(null);
    setShowInterfacePopup(false);
    setConnectMode(false);
    return;
  }

  // Create the connection
  setConnections((prev) => [
    ...prev,
    {
      id: Date.now(),
      fromDevice: selectedPort.deviceId,
      fromPort: selectedPort.port.name,
      toDevice: popupDevice.id,
      toPort: port.name,
      cableType,
    },
  ]);

  // Mark the selected ports as connected
  setDevices((prev) =>
    prev.map((device) => {
      if (device.id === selectedPort.deviceId) {
        return {
          ...device,
          ports: device.ports.map((p) =>
            p.id === selectedPort.port.id
              ? { ...p, connected: true }
              : p
          ),
        };
      }

      if (device.id === popupDevice.id) {
        return {
          ...device,
          ports: device.ports.map((p) =>
            p.id === port.id
              ? { ...p, connected: true }
              : p
          ),
        };
      }

      return device;
    })
  );

  // Reset UI
  setSelectedPort(null);
  setPopupDevice(null);
  setShowInterfacePopup(false);
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
      <Toolbar
        cableType={cableType}
        onCableChange={setCableType}
        connectMode={connectMode}
        onConnect={() => {
        setConnectMode(!connectMode);
        setSelectedPort(null);
        setPopupDevice(null);
        }}
        onDelete={() => {
          if (selectedDevice === null) return;

          setDevices((prev) =>
            prev.filter(
              (d) => d.id !== selectedDevice
            )
          );

          setConnections((prev) =>
            prev.filter(
              (c) =>
                c.fromDevice !== selectedDevice &&
                c.toDevice !== selectedDevice
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

          alert("Topology Saved");
        }}
        onLoad={() => {
          const data =
            localStorage.getItem(
              "networkTopology"
            );

          if (!data) {
            alert("No topology found");
            return;
          }

          const topology = JSON.parse(data);

          setDevices(topology.devices);
          setConnections(topology.connections);
          setSelectedDevice(null);
          setSelectedPort(null);
          setPopupDevice(null);
        }}
      />

      <div className="flex-1 bg-slate-900 border border-slate-800 rounded-2xl flex">
        <DevicePalette
          onAddDevice={addDevice}
        />

        <Canvas
          devices={devices}
          connections={connections}
          selectedDevice={selectedDevice}
          onDeviceClick={handleDeviceClick}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
        />

        <PropertiesPanel
          selected={selected}
          connections={connections}
          setDevices={setDevices}
          onOpenCLI={() => setShowCLI(true)}
        />
      </div>

      <InterfaceSelector
  open={showInterfacePopup}
  title={
    popupDevice
      ? `${popupDevice.type} ${popupDevice.name}`
      : ""
  }
  ports={popupDevice?.ports ?? []}
  onSelect={handlePortSelect}
  onClose={() => {
    setShowInterfacePopup(false);
    setPopupDevice(null);
  }}
/>
      <CLI
  open={showCLI}
  device={selected}
  setDevices={setDevices}
  onClose={() => setShowCLI(false)}
/>

    </div>
  );
}

export default NetworkDesigner;