import React, { useState, useEffect, useRef } from 'react';
import { NetworkDevice, NetworkInterface } from '../types/network';
import { Terminal, X, Maximize2, Minimize2, Trash2, ArrowUp, ArrowDown } from 'lucide-react';
import { validateIPv4, validateSubnetMask, validateDefaultGateway } from '../utils/validation';

interface CiscoCLIModalProps {
  device: NetworkDevice | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateDevice: (updatedDevice: NetworkDevice) => void;
}

type CLIMode = 'user' | 'privileged' | 'config' | 'config-if';

interface OutputLine {
  text: string;
  type: 'prompt' | 'output' | 'error' | 'success';
}

export const CiscoCLIModal: React.FC<CiscoCLIModalProps> = ({
  device,
  isOpen,
  onClose,
  onUpdateDevice,
}) => {
  const [mode, setMode] = useState<CLIMode>('user');
  const [selectedInterface, setSelectedInterface] = useState<string>('');
  const [inputVal, setInputVal] = useState<string>('');
  const [lines, setLines] = useState<OutputLine[]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState<number>(-1);
  const [isMaximized, setIsMaximized] = useState<boolean>(false);

  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Initialize CLI terminal on device change or initial open
  useEffect(() => {
    if (device) {
      setMode('user');
      setSelectedInterface('');
      setInputVal('');
      setLines([
        { text: `--- NetRouteAI Cisco IOS CLI Simulator [${device.model}] ---`, type: 'output' },
        { text: `System uptime is ${device.uptime}`, type: 'output' },
        { text: `Press 'help' or '?' for available Cisco commands. Type 'enable' to begin.`, type: 'output' },
        { text: ``, type: 'output' },
      ]);
    }
  }, [device?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
      }, 100);
    }
  }, [isOpen, mode]);

  if (!isOpen || !device) return null;

  const getPrompt = (): string => {
    const host = device.cliConfig?.hostname || device.name;
    switch (mode) {
      case 'user':
        return `${host}>`;
      case 'privileged':
        return `${host}#`;
      case 'config':
        return `${host}(config)#`;
      case 'config-if':
        return `${host}(config-if)#`;
    }
  };

  const executeCommand = (cmd: string) => {
    const trimmed = cmd.trim();
    if (!trimmed) {
      setLines((prev) => [...prev, { text: `${getPrompt()} `, type: 'prompt' }]);
      return;
    }

    // Add to history
    setHistory((prev) => [...prev, trimmed]);
    setHistoryIdx(-1);

    const parts = trimmed.split(/\s+/);
    const mainCmd = parts[0].toLowerCase();
    const arg1 = parts[1]?.toLowerCase();
    const arg2 = parts[2];
    const arg3 = parts[3];

    // Log prompt with user command
    const newOutput: OutputLine[] = [{ text: `${getPrompt()} ${trimmed}`, type: 'prompt' }];

    // Help command
    if (mainCmd === 'help' || mainCmd === '?') {
      newOutput.push({ text: `Available Commands in current mode:`, type: 'success' });
      if (mode === 'user') {
        newOutput.push(
          { text: `  enable             - Turn on privileged commands`, type: 'output' },
          { text: `  show version       - Display system hardware & software status`, type: 'output' },
          { text: `  show ip int brief  - Display summary status of interfaces`, type: 'output' },
          { text: `  ping <ip>          - Send ICMP echo packets to destination`, type: 'output' },
          { text: `  clear              - Clear terminal screen`, type: 'output' },
          { text: `  exit               - Exit current session`, type: 'output' }
        );
      } else if (mode === 'privileged') {
        newOutput.push(
          { text: `  configure terminal - Enter global configuration mode`, type: 'output' },
          { text: `  disable            - Return to user EXEC mode`, type: 'output' },
          { text: `  show running-config- Display current operating configuration`, type: 'output' },
          { text: `  show ip int brief  - Display summary status of interfaces`, type: 'output' },
          { text: `  show version       - Display system hardware & software status`, type: 'output' },
          { text: `  ping <ip>          - Send ICMP echo packets to destination`, type: 'output' },
          { text: `  clear              - Clear terminal screen`, type: 'output' },
          { text: `  exit               - Exit privileged EXEC mode`, type: 'output' }
        );
      } else if (mode === 'config') {
        newOutput.push(
          { text: `  hostname <name>    - Set system network name`, type: 'output' },
          { text: `  interface <port>   - Select an interface to configure (e.g. Gi0/0, Fa0/1)`, type: 'output' },
          { text: `  exit               - Exit global configuration mode`, type: 'output' },
          { text: `  end                - Return to privileged EXEC mode`, type: 'output' }
        );
      } else if (mode === 'config-if') {
        newOutput.push(
          { text: `  ip address <ip> <mask> - Set IP address and subnet mask`, type: 'output' },
          { text: `  no shutdown            - Administratively enable interface (UP)`, type: 'output' },
          { text: `  shutdown               - Administratively disable interface (DOWN)`, type: 'output' },
          { text: `  exit                   - Return to global configuration mode`, type: 'output' },
          { text: `  end                    - Return to privileged EXEC mode`, type: 'output' }
        );
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // Clear
    if (mainCmd === 'clear') {
      setLines([]);
      return;
    }

    // Global EXIT / END
    if (mainCmd === 'exit' || mainCmd === 'quit') {
      if (mode === 'config-if') {
        setMode('config');
        setSelectedInterface('');
      } else if (mode === 'config') {
        setMode('privileged');
      } else if (mode === 'privileged') {
        setMode('user');
      } else {
        onClose();
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    if (mainCmd === 'end') {
      if (mode === 'config' || mode === 'config-if') {
        setMode('privileged');
        setSelectedInterface('');
        newOutput.push({ text: `%SYS-5-CONFIG_I: Configured from console by console`, type: 'output' });
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // ENABLE / DISABLE
    if (mainCmd === 'enable' || mainCmd === 'en') {
      if (mode === 'user') {
        setMode('privileged');
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    if (mainCmd === 'disable') {
      if (mode !== 'user') {
        setMode('user');
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // CONFIGURE TERMINAL
    if ((mainCmd === 'configure' && arg1 === 'terminal') || trimmed === 'conf t') {
      if (mode === 'privileged') {
        setMode('config');
        newOutput.push({ text: `Enter configuration commands, one per line. End with CNTL/Z or 'end'.`, type: 'output' });
      } else {
        newOutput.push({ text: `% Command not allowed in this mode. Type 'enable' first.`, type: 'error' });
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // HOSTNAME <name>
    if (mainCmd === 'hostname') {
      if (mode === 'config') {
        if (!arg1) {
          newOutput.push({ text: `% Incomplete command: hostname <name>`, type: 'error' });
        } else {
          const newName = parts[1];
          const updated: NetworkDevice = {
            ...device,
            name: newName,
            cliConfig: {
              ...device.cliConfig,
              hostname: newName,
            },
          };
          onUpdateDevice(updated);
          newOutput.push({ text: `Hostname changed to ${newName}`, type: 'success' });
        }
      } else {
        newOutput.push({ text: `% Command only available in configuration mode.`, type: 'error' });
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // INTERFACE <id>
    if (mainCmd === 'interface' || mainCmd === 'int') {
      if (mode === 'config') {
        const portIdRaw = parts[1];
        if (!portIdRaw) {
          newOutput.push({ text: `% Incomplete command: interface <id> (e.g. Gi0/0 or Fa0/1)`, type: 'error' });
        } else {
          // Normalize e.g. gi0/0 -> Gi0/0
          const matchIface = device.interfaces.find(
            (i) => i.id.toLowerCase() === portIdRaw.toLowerCase() || i.name.toLowerCase() === portIdRaw.toLowerCase()
          );

          if (matchIface) {
            setSelectedInterface(matchIface.id);
            setMode('config-if');
            newOutput.push({ text: `Configuring interface ${matchIface.name} (${matchIface.id})`, type: 'output' });
          } else {
            newOutput.push({
              text: `% Invalid interface. Available: ${device.interfaces.map((i) => i.id).join(', ')}`,
              type: 'error',
            });
          }
        }
      } else {
        newOutput.push({ text: `% Command only available in configuration mode.`, type: 'error' });
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // IP ADDRESS <ip> <mask>
    if (mainCmd === 'ip' && arg1 === 'address') {
      if (mode === 'config-if' && selectedInterface) {
        if (!arg2 || !arg3) {
          newOutput.push({ text: `% Incomplete command: ip address <IP_ADDRESS> <SUBNET_MASK>`, type: 'error' });
        } else {
          const newIp = arg2;
          const newMask = arg3;

          const ipValidation = validateIPv4(newIp, 'IP address');
          const maskValidation = validateSubnetMask(newMask);

          if (!ipValidation.isValid) {
            newOutput.push({
              text: `% Invalid input detected: ${ipValidation.error}. Please rewrite (e.g. 192.168.1.1).`,
              type: 'error',
            });
          } else if (!maskValidation.isValid) {
            newOutput.push({
              text: `% Invalid input detected: ${maskValidation.error}. Please rewrite (e.g. 255.255.255.0).`,
              type: 'error',
            });
          } else {
            const updatedInterfaces = device.interfaces.map((iface) => {
              if (iface.id === selectedInterface) {
                return { ...iface, ipAddress: newIp, subnetMask: newMask };
              }
              return iface;
            });

            const updated: NetworkDevice = {
              ...device,
              interfaces: updatedInterfaces,
              ipAddress: selectedInterface === device.interfaces[0]?.id ? newIp : device.ipAddress,
            };
            onUpdateDevice(updated);
            newOutput.push({ text: `IP address ${newIp} / ${newMask} assigned to ${selectedInterface}`, type: 'success' });
          }
        }
      } else {
        newOutput.push({ text: `% Command only available in interface configuration mode.`, type: 'error' });
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // IP DEFAULT-GATEWAY <ip>
    if (mainCmd === 'ip' && (arg1 === 'default-gateway' || arg1 === 'default-gw')) {
      if (mode === 'config') {
        if (!arg2) {
          newOutput.push({ text: `% Incomplete command: ip default-gateway <GATEWAY_IP>`, type: 'error' });
        } else {
          const gwValidation = validateDefaultGateway(arg2);
          if (!gwValidation.isValid) {
            newOutput.push({
              text: `% Invalid input detected: ${gwValidation.error}. Please rewrite (e.g. 192.168.1.254).`,
              type: 'error',
            });
          } else {
            const updated: NetworkDevice = {
              ...device,
              gateway: arg2,
            };
            onUpdateDevice(updated);
            newOutput.push({ text: `Default gateway configured to ${arg2}`, type: 'success' });
          }
        }
      } else {
        newOutput.push({ text: `% Command only available in global configuration mode.`, type: 'error' });
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // NO SHUTDOWN
    if (mainCmd === 'no' && (arg1 === 'shutdown' || arg1 === 'shut')) {
      if (mode === 'config-if' && selectedInterface) {
        const updatedInterfaces = device.interfaces.map((iface) => {
          if (iface.id === selectedInterface) {
            return { ...iface, status: 'up' as const };
          }
          return iface;
        });

        const updated: NetworkDevice = { ...device, interfaces: updatedInterfaces };
        onUpdateDevice(updated);
        newOutput.push(
          { text: `%LINK-3-UPDOWN: Interface ${selectedInterface}, changed state to up`, type: 'success' },
          { text: `%LINEPROTO-5-UPDOWN: Line protocol on Interface ${selectedInterface}, changed state to up`, type: 'success' }
        );
      } else {
        newOutput.push({ text: `% Command only valid in interface configuration mode.`, type: 'error' });
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // SHUTDOWN
    if (mainCmd === 'shutdown' || mainCmd === 'shut') {
      if (mode === 'config-if' && selectedInterface) {
        const updatedInterfaces = device.interfaces.map((iface) => {
          if (iface.id === selectedInterface) {
            return { ...iface, status: 'down' as const };
          }
          return iface;
        });

        const updated: NetworkDevice = { ...device, interfaces: updatedInterfaces };
        onUpdateDevice(updated);
        newOutput.push(
          { text: `%LINK-5-CHANGED: Interface ${selectedInterface}, changed state to administratively down`, type: 'output' },
          { text: `%LINEPROTO-5-UPDOWN: Line protocol on Interface ${selectedInterface}, changed state to down`, type: 'output' }
        );
      } else {
        newOutput.push({ text: `% Command only valid in interface configuration mode.`, type: 'error' });
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // SHOW RUNNING-CONFIG
    if ((mainCmd === 'show' || mainCmd === 'sh') && (arg1 === 'running-config' || arg1 === 'run')) {
      if (mode === 'privileged' || mode === 'config' || mode === 'config-if') {
        const hostname = device.cliConfig?.hostname || device.name;
        newOutput.push(
          { text: `Building configuration...`, type: 'output' },
          { text: `Current configuration : 1842 bytes`, type: 'output' },
          { text: `!`, type: 'output' },
          { text: `version ${device.iosVersion.split(' ')[0] || '15.5'}`, type: 'output' },
          { text: `service timestamps debug datetime msec`, type: 'output' },
          { text: `service timestamps log datetime msec`, type: 'output' },
          { text: `no service password-encryption`, type: 'output' },
          { text: `!`, type: 'output' },
          { text: `hostname ${hostname}`, type: 'output' },
          { text: `!`, type: 'output' },
          { text: `ip cef`, type: 'output' },
          { text: `no ipv6 cef`, type: 'output' },
          { text: `!`, type: 'output' }
        );

        device.interfaces.forEach((iface) => {
          newOutput.push(
            { text: `interface ${iface.name}`, type: 'output' },
            {
              text: iface.ipAddress && iface.ipAddress !== 'unassigned'
                ? ` ip address ${iface.ipAddress} ${iface.subnetMask}`
                : ` no ip address`,
              type: 'output',
            },
            { text: iface.status === 'down' ? ` shutdown` : ` no shutdown`, type: 'output' },
            { text: ` duplex auto`, type: 'output' },
            { text: ` speed auto`, type: 'output' },
            { text: `!`, type: 'output' }
          );
        });

        newOutput.push(
          { text: `ip forward-protocol nd`, type: 'output' },
          { text: `no ip http server`, type: 'output' },
          { text: `no ip http secure-server`, type: 'output' },
          { text: `!`, type: 'output' },
          { text: `line con 0`, type: 'output' },
          { text: `line vty 0 4`, type: 'output' },
          { text: ` login`, type: 'output' },
          { text: `!`, type: 'output' },
          { text: `end`, type: 'output' }
        );
      } else {
        newOutput.push({ text: `% Command available in Privileged EXEC mode ('enable')`, type: 'error' });
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // SHOW IP INTERFACE BRIEF
    if (
      (mainCmd === 'show' || mainCmd === 'sh') &&
      arg1 === 'ip' &&
      (parts[2]?.toLowerCase().startsWith('int') || parts[2]?.toLowerCase() === 'interface')
    ) {
      newOutput.push(
        {
          text: `Interface                  IP-Address      OK? Method Status                Protocol`,
          type: 'output',
        },
        {
          text: `--------------------------------------------------------------------------------`,
          type: 'output',
        }
      );

      device.interfaces.forEach((iface) => {
        const namePad = iface.name.padEnd(26, ' ');
        const ipPad = (iface.ipAddress || 'unassigned').padEnd(16, ' ');
        const okPad = 'YES '.padEnd(4, ' ');
        const methodPad = (iface.ipAddress === 'unassigned' ? 'unset ' : 'manual').padEnd(7, ' ');
        const statusPad = (iface.status === 'up' ? 'up' : 'administratively down').padEnd(22, ' ');
        const protoPad = iface.status === 'up' && iface.connectedTo ? 'up' : 'down';
        newOutput.push({
          text: `${namePad}${ipPad}${okPad}${methodPad}${statusPad}${protoPad}`,
          type: iface.status === 'up' ? 'success' : 'output',
        });
      });
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // SHOW VERSION
    if ((mainCmd === 'show' || mainCmd === 'sh') && arg1 === 'version') {
      newOutput.push(
        { text: `Cisco IOS Software, ${device.model} Software (${device.model}-UNIVERSALK9-M)`, type: 'output' },
        { text: `Technical Support: http://www.cisco.com/techsupport`, type: 'output' },
        { text: `ROM: System Bootstrap, Version 15.1(4)M4, RELEASE SOFTWARE (fc1)`, type: 'output' },
        { text: `${device.name} uptime is ${device.uptime}`, type: 'output' },
        { text: `System returned to ROM by power-on`, type: 'output' },
        { text: `System image file is "flash0:${device.model.toLowerCase()}-universalk9-mz.SPA.155-3.M4.bin"`, type: 'output' },
        { text: `Hardware: ${device.model} processor with 512MB/128MB of memory.`, type: 'output' },
        { text: `MAC Address: ${device.macAddress}`, type: 'output' },
        { text: `Configuration register is 0x2102`, type: 'output' }
      );
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // PING <ip>
    if (mainCmd === 'ping') {
      if (!arg1) {
        newOutput.push({ text: `% Incomplete command: ping <IP_ADDRESS>`, type: 'error' });
      } else {
        const pingTarget = parts[1];
        newOutput.push(
          { text: `Type escape sequence to abort.`, type: 'output' },
          { text: `Sending 5, 100-byte ICMP Echos to ${pingTarget}, timeout is 2 seconds:`, type: 'output' },
          { text: `!!!!!`, type: 'success' },
          { text: `Success rate is 100 percent (5/5), round-trip min/avg/max = 1/3/4 ms`, type: 'success' }
        );
      }
      setLines((prev) => [...prev, ...newOutput]);
      return;
    }

    // Unknown command
    newOutput.push({
      text: `% Invalid input detected at '^' marker. Type 'help' or '?' for commands.`,
      type: 'error',
    });
    setLines((prev) => [...prev, ...newOutput]);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      executeCommand(inputVal);
      setInputVal('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (history.length > 0) {
        const nextIdx = historyIdx === -1 ? history.length - 1 : Math.max(0, historyIdx - 1);
        setHistoryIdx(nextIdx);
        setInputVal(history[nextIdx] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIdx !== -1) {
        const nextIdx = historyIdx + 1;
        if (nextIdx < history.length) {
          setHistoryIdx(nextIdx);
          setInputVal(history[nextIdx] || '');
        } else {
          setHistoryIdx(-1);
          setInputVal('');
        }
      }
    }
  };

  return (
    <div
      id="cisco-cli-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-base/70 backdrop-blur-xs p-4"
    >
      <div
        id="cisco-cli-terminal-window"
        className={`flex flex-col bg-panel border border-accent/40 rounded-xl shadow-2xl overflow-hidden transition-all duration-200 ${
          isMaximized ? 'w-[96vw] h-[92vh]' : 'w-full max-w-4xl h-[650px]'
        }`}
      >
        {/* Terminal Header */}
        <div
          id="cisco-cli-header"
          className="flex items-center justify-between px-4 py-2.5 bg-panel border-b border-line select-none"
        >
          <div className="flex items-center space-x-2.5">
            <div className="p-1.5 rounded-lg bg-accent-soft text-accent border border-accent/60">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-semibold text-ink">{device.name}</span>
                <span className="text-xs px-2 py-0.5 rounded bg-panel text-accent font-mono">
                  {device.model} - Cisco IOS CLI
                </span>
              </div>
              <p className="text-[11px] text-ink-muted font-mono">
                Port Console: Serial0 | IP: {device.ipAddress}
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              id="cisco-cli-clear-btn"
              onClick={() => setLines([])}
              title="Clear terminal"
              className="p-1.5 text-ink-muted hover:text-ink hover:bg-raised rounded transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              id="cisco-cli-maximize-btn"
              onClick={() => setIsMaximized(!isMaximized)}
              className="p-1.5 text-ink-muted hover:text-ink hover:bg-raised rounded transition-colors"
            >
              {isMaximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button
              id="cisco-cli-close-btn"
              onClick={onClose}
              className="p-1.5 text-ink-muted hover:text-bad hover:bg-raised rounded transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Terminal Body */}
        <div
          id="cisco-cli-output"
          onClick={() => inputRef.current?.focus()}
          className="flex-1 p-4 font-mono text-xs sm:text-sm overflow-y-auto bg-[#030712] text-ink space-y-1 select-text leading-relaxed"
        >
          {lines.map((line, idx) => (
            <div
              key={idx}
              className={`whitespace-pre-wrap ${
                line.type === 'prompt'
                  ? 'text-accent font-semibold'
                  : line.type === 'error'
                  ? 'text-bad'
                  : line.type === 'success'
                  ? 'text-ok'
                  : 'text-ink-soft'
              }`}
            >
              {line.text}
            </div>
          ))}

          {/* Active Input Line */}
          <div className="flex items-center space-x-2 pt-1">
            <span className="text-accent font-bold whitespace-nowrap font-mono">{getPrompt()}</span>
            <input
              ref={inputRef}
              id="cisco-cli-active-input"
              type="text"
              value={inputVal}
              onChange={(e) => setInputVal(e.target.value)}
              onKeyDown={handleKeyDown}
              autoFocus
              spellCheck={false}
              autoComplete="off"
              className="flex-1 bg-transparent text-ok outline-none border-none font-mono text-xs sm:text-sm p-0 m-0 caret-accent"
            />
          </div>
          <div ref={bottomRef} />
        </div>

        {/* Quick Helper Bar */}
        <div
          id="cisco-cli-quick-bar"
          className="flex items-center justify-between px-4 py-2 bg-panel/90 border-t border-line text-xs text-ink-muted font-mono"
        >
          <div className="flex items-center space-x-2 overflow-x-auto">
            <span className="text-accent-ink">Quick:</span>
            <button
              onClick={() => executeCommand('enable')}
              className="px-2 py-0.5 rounded bg-panel hover:bg-overlay text-accent transition-colors"
            >
              enable
            </button>
            <button
              onClick={() => executeCommand('conf t')}
              className="px-2 py-0.5 rounded bg-panel hover:bg-overlay text-accent transition-colors"
            >
              conf t
            </button>
            <button
              onClick={() => executeCommand('show ip int brief')}
              className="px-2 py-0.5 rounded bg-panel hover:bg-overlay text-accent transition-colors"
            >
              sh ip int br
            </button>
            <button
              onClick={() => executeCommand('show running-config')}
              className="px-2 py-0.5 rounded bg-panel hover:bg-overlay text-accent transition-colors"
            >
              sh run
            </button>
            <button
              onClick={() => executeCommand('show version')}
              className="px-2 py-0.5 rounded bg-panel hover:bg-overlay text-accent transition-colors"
            >
              sh ver
            </button>
          </div>
          <div className="hidden sm:flex items-center space-x-2 text-[11px] text-accent-ink">
            <span>↑↓ History</span>
            <span>•</span>
            <span>'?' for Help</span>
          </div>
        </div>
      </div>
    </div>
  );
};
