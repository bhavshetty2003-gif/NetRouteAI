import { useState } from "react";
import type { Device } from "./types";

type CLIProps = {
  open: boolean;
  device: Device | undefined;
  onClose: () => void;
  setDevices: React.Dispatch<React.SetStateAction<Device[]>>;
};

function CLI({
  open,
  device,
  onClose,
  setDevices,
}: CLIProps) {
  const [history, setHistory] = useState<string[]>([]);
  const [command, setCommand] = useState("");
  const [privileged, setPrivileged] = useState(false);
  const [configMode, setConfigMode] = useState(false);
  const [interfaceMode, setInterfaceMode] = useState(false);
  const [selectedInterface, setSelectedInterface] = useState("");

  if (!open || !device) return null;

const runCommand = () => {
  const cmd = command.trim();

  if (cmd === "") return;

  let output = "";

const parts = cmd.split(" ");

  switch (cmd.toLowerCase()) {
    case "en":
    case "enable":
      setPrivileged(true);  
      output = "Entered privileged EXEC mode.";
      break;

    case "configure terminal":
    case "conf t":
  if (!privileged) {
    output = "% Enter privileged mode first.";
  } else {
    setConfigMode(true);
    output = "Enter configuration commands.";
  }
  break;

    case "interface gi0/0":
case "int gi0/0":
  if (!configMode) {
    output = "% Enter configuration mode first.";
  } else {
    setInterfaceMode(true);
    setSelectedInterface("Gi0/0");
    output = "Configuring interface Gi0/0";
  }
  break;

    case "interface gi0/1":
case "int gi0/1":
  if (!configMode) {
    output = "% Enter configuration mode first.";
  } else {
    setInterfaceMode(true);
    setSelectedInterface("Gi0/1");
    output = "Configuring interface Gi0/1";
  }
  break;

    case "shutdown":
  if (!interfaceMode) {
    output = "% Select an interface first.";
  } else {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === device.id
          ? {
              ...d,
              ports: d.ports.map((p) =>
                p.name === selectedInterface
                  ? { ...p, connected: false }
                  : p
              ),
            }
          : d
      )
    );

    output = `${selectedInterface} administratively down.`;
  }
  break;

case "no shutdown":
  if (!interfaceMode) {
    output = "% Select an interface first.";
  } else {
    setDevices((prev) =>
      prev.map((d) =>
        d.id === device.id
          ? {
              ...d,
              ports: d.ports.map((p) =>
                p.name === selectedInterface
                  ? { ...p, connected: true }
                  : p
              ),
            }
          : d
      )
    );

    output = `${selectedInterface} brought up.`;
  }
  break;  
  
    case "show ip interface brief":
      output = [
        "Interface\tIP Address\tStatus",
        ...device.ports.map(
          (p) =>
            `${p.name}\t${device.ip}\t${p.connected ? "up" : "down"}`
        ),
      ].join("\n");
      break;

    case "show running-config":
  output = `
hostname ${device.name}

${device.ports
  .map(
    (p) => `
interface ${p.name}
 ip address ${device.ip} ${device.subnet}
 ${p.connected ? "no shutdown" : "no shutdown"}
`
  )
  .join("\n")}

ip default-gateway ${device.gateway}
`;
  break;

    case "show version":
      output = `Cisco IOS Software
Model: ${device.type}
Hostname: ${device.name}
Memory: 256 MB`;
      break;

    case "show interfaces":
      output = device.ports
        .map(
          (p) => `${p.name} is ${p.connected ? "up" : "down"}`
        )
        .join("\n");
      break;

    case "help":
    case "?":
      output = `Available Commands

enable
configure terminal
hostname
interface
ip address
shutdown
no shutdown
show version
show interfaces
show ip interface brief
show running-config
exit`;
      break;

    case "exit":
  if (interfaceMode) {
    setInterfaceMode(false);
    setSelectedInterface("");
  } else if (configMode) {
    setConfigMode(false);
  } else {
    onClose();
    return;
  }

  output = "";
  break;

default:
  if (
    configMode &&
    parts[0].toLowerCase() === "hostname"
  ) {
    const newName = parts[1];

    if (!newName) {
      output = "% Hostname required.";
    } else {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === device.id
            ? {
                ...d,
                name: newName,
              }
            : d
        )
      );

      output = `Hostname changed to ${newName}`;
    }
  }

  else if (
    interfaceMode &&
    parts[0].toLowerCase() === "ip" &&
    parts[1]?.toLowerCase() === "address"
  ) {
    const ip = parts[2];
    const subnet = parts[3];

    if (!ip || !subnet) {
      output = "% Usage: ip address <ip> <mask>";
    } else {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === device.id
            ? {
                ...d,
                ip,
                subnet,
              }
            : d
        )
      );

      output = `${selectedInterface} IP updated.`;
    }
  }

  else {
    output = `% Unknown command: ${cmd}`;
  }

  break;
}

  setHistory((prev) => [
    ...prev,
    `${device.name}${interfaceMode
    ? "(config-if)#"
    : configMode
    ? "(config)#"
    : privileged
    ? "#"
    : ">"
} ${cmd}`,

    output,
  ]);

  setCommand("");
};

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
      <div className="w-[700px] h-[500px] bg-black rounded-xl border border-cyan-500 flex flex-col">

        <div className="flex justify-between items-center px-4 py-2 border-b border-cyan-500">
          <h2 className="text-cyan-400 font-bold">
            CLI - {device.name}
          </h2>

          <button
            onClick={onClose}
            className="text-red-400"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-auto p-4 text-green-400 font-mono whitespace-pre-wrap">
          {history.map((line, i) => (
            <div key={i}>{line}</div>
          ))}
        </div>

        <div className="border-t border-cyan-500 flex items-center p-3">
          <span className="text-green-400 font-mono mr-2">
            {device.name}
            {interfaceMode
            ? "(config-if)#"
            : configMode
            ? "(config)#"
            : privileged
            ? "#"
            : ">"}
          </span>

          <input
            autoFocus
            value={command}
            onChange={(e) =>
              setCommand(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                runCommand();
              }
            }}
            className="flex-1 bg-black outline-none text-green-400 font-mono"
          />
        </div>
      </div>
    </div>
  );
}

export default CLI;