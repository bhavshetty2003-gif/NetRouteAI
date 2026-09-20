import React, { useState, useEffect } from 'react';
import { NetworkDevice, NetworkInterface } from '../types/network';
import {
  Terminal,
  Activity,
  Cpu,
  HardDrive,
  Clock,
  ShieldCheck,
  Plus,
  Trash2,
  Edit2,
  Check,
  Power,
  Info,
  Server,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import { DeviceIcon } from './DeviceIcons';
import {
  validateIPv4,
  validateSubnetMask,
  validateDefaultGateway,
} from '../utils/validation';

interface DevicePropertiesPanelProps {
  device: NetworkDevice | null;
  onUpdateDevice: (updated: NetworkDevice) => void;
  onDeleteDevice: (deviceId: string) => void;
  onOpenCLI: (device: NetworkDevice) => void;
  onAddInterface: (device: NetworkDevice) => void;
  onDeleteInterface?: (device: NetworkDevice, interfaceId: string) => void;
}

export const DevicePropertiesPanel: React.FC<DevicePropertiesPanelProps> = ({
  device,
  onUpdateDevice,
  onDeleteDevice,
  onOpenCLI,
  onAddInterface,
}) => {
  // Local form state synced with selected device (Hooks must always be called unconditionally)
  const [name, setName] = useState(device?.name || '');
  const [ipAddress, setIpAddress] = useState(device?.ipAddress || '');
  const [subnetMask, setSubnetMask] = useState(device?.subnetMask || '');
  const [gateway, setGateway] = useState(device?.gateway || '');

  // Validation error messages
  const [ipError, setIpError] = useState<string | null>(null);
  const [subnetError, setSubnetError] = useState<string | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Interface editing state
  const [editingIfaceId, setEditingIfaceId] = useState<string | null>(null);
  const [editingIfaceIp, setEditingIfaceIp] = useState<string>('');
  const [editingIfaceMask, setEditingIfaceMask] = useState<string>('255.255.255.0');
  const [ifaceIpError, setIfaceIpError] = useState<string | null>(null);
  const [ifaceMaskError, setIfaceMaskError] = useState<string | null>(null);

  useEffect(() => {
    if (device) {
      setName(device.name);
      setIpAddress(device.ipAddress);
      setSubnetMask(device.subnetMask);
      setGateway(device.gateway);
      // Reset errors on device switch
      setIpError(null);
      setSubnetError(null);
      setGatewayError(null);
      setSaveFeedback(null);
      setEditingIfaceId(null);
    }
  }, [device?.id, device?.name, device?.ipAddress, device?.subnetMask, device?.gateway]);

  if (!device) {
    return (
      <div
        id="device-properties-empty"
        className="w-80 lg:w-88 h-full bg-slate-900 border-l border-slate-800 flex flex-col items-center justify-center p-6 text-center select-none"
      >
        <div className="w-16 h-16 rounded-2xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-slate-500 mb-4 shadow-inner">
          <Server className="w-8 h-8 text-cyan-500/50" />
        </div>
        <h3 className="text-sm font-semibold text-slate-300 mb-1">No Device Selected</h3>
        <p className="text-xs text-slate-500 max-w-[200px] leading-relaxed">
          Click any router, switch, or workstation on the canvas to configure interfaces, routing, or launch the Cisco CLI.
        </p>
      </div>
    );
  }

  // Real-time validation checks
  const validateAll = (): boolean => {
    const ipRes = validateIPv4(ipAddress, 'Primary IP Address');
    const maskRes = validateSubnetMask(subnetMask);
    const gwRes = validateDefaultGateway(gateway);

    setIpError(ipRes.isValid ? null : ipRes.error || 'Incorrect IP Address. Please rewrite.');
    setSubnetError(maskRes.isValid ? null : maskRes.error || 'Incorrect Subnet Mask. Please rewrite.');
    setGatewayError(gwRes.isValid ? null : gwRes.error || 'Incorrect Default Gateway. Please rewrite.');

    return ipRes.isValid && maskRes.isValid && gwRes.isValid;
  };

  const handleApplyChanges = () => {
    const isValid = validateAll();
    if (!isValid) {
      setSaveFeedback('Please correct the highlighted errors before applying.');
      return;
    }

    setSaveFeedback(null);
    onUpdateDevice({
      ...device,
      name: name.trim() || device.name,
      ipAddress: ipAddress.trim(),
      subnetMask: subnetMask.trim(),
      gateway: gateway.trim(),
      cliConfig: {
        ...device.cliConfig,
        hostname: name.trim() || device.name,
      },
    });

    setSaveFeedback('Saved successfully');
    setTimeout(() => setSaveFeedback(null), 2000);
  };

  const handleIpChange = (val: string) => {
    setIpAddress(val);
    const res = validateIPv4(val, 'Primary IP Address');
    setIpError(res.isValid ? null : res.error || 'Incorrect IP. Please rewrite.');
  };

  const handleSubnetChange = (val: string) => {
    setSubnetMask(val);
    const res = validateSubnetMask(val);
    setSubnetError(res.isValid ? null : res.error || 'Incorrect Subnet Mask. Please rewrite.');
  };

  const handleGatewayChange = (val: string) => {
    setGateway(val);
    const res = validateDefaultGateway(val);
    setGatewayError(res.isValid ? null : res.error || 'Incorrect Default Gateway. Please rewrite.');
  };

  const handleToggleInterface = (ifaceId: string) => {
    const updated = device.interfaces.map((i) => {
      if (i.id === ifaceId) {
        return {
          ...i,
          status: i.status === 'up' ? ('down' as const) : ('up' as const),
        };
      }
      return i;
    });
    onUpdateDevice({ ...device, interfaces: updated });
  };

  const handleStartEditIface = (iface: NetworkInterface) => {
    setEditingIfaceId(iface.id);
    setEditingIfaceIp(iface.ipAddress && iface.ipAddress !== 'unassigned' ? iface.ipAddress : '');
    setEditingIfaceMask(iface.subnetMask || '255.255.255.0');
    setIfaceIpError(null);
    setIfaceMaskError(null);
  };

  const handleSaveIfaceConfig = (ifaceId: string) => {
    const ipRes = validateIPv4(editingIfaceIp, 'Interface IP Address', true);
    const maskRes = validateSubnetMask(editingIfaceMask);

    if (!ipRes.isValid) {
      setIfaceIpError(ipRes.error || 'Incorrect interface IP. Please rewrite.');
      return;
    }
    if (!maskRes.isValid) {
      setIfaceMaskError(maskRes.error || 'Incorrect subnet mask. Please rewrite.');
      return;
    }

    const updated = device.interfaces.map((i) => {
      if (i.id === ifaceId) {
        return {
          ...i,
          ipAddress: editingIfaceIp.trim() || 'unassigned',
          subnetMask: editingIfaceMask.trim(),
        };
      }
      return i;
    });

    onUpdateDevice({ ...device, interfaces: updated });
    setEditingIfaceId(null);
  };

  const hasFormErrors = !!ipError || !!subnetError || !!gatewayError;
  const activeLinksCount = device.interfaces.filter((i) => i.connectedTo !== null).length;

  return (
    <div
      id="device-properties-panel"
      className="w-80 lg:w-88 h-full bg-slate-900 border-l border-slate-800 flex flex-col overflow-hidden select-none"
    >
      {/* Scrollable Properties Area */}
      <div id="device-properties-scrollable" className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Device Header Card */}
        <div className="p-3.5 rounded-xl bg-slate-950/80 border border-slate-800 shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <DeviceIcon type={device.type} size={48} />
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-slate-100">{device.name}</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                  {device.type}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 font-mono mt-0.5">{device.model}</div>
            </div>
          </div>
          <button
            id="delete-device-btn"
            onClick={() => onDeleteDevice(device.id)}
            title="Delete device"
            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Basic Configuration Form */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              <span>Network Configuration</span>
            </h4>
            <button
              id="apply-properties-btn"
              onClick={handleApplyChanges}
              disabled={hasFormErrors}
              className={`flex items-center space-x-1 text-xs px-2.5 py-1 rounded transition-colors ${
                hasFormErrors
                  ? 'bg-slate-800 text-slate-500 border border-slate-700 cursor-not-allowed'
                  : 'bg-cyan-900/80 hover:bg-cyan-700 text-cyan-200 border border-cyan-500/60 cursor-pointer shadow-sm'
              }`}
              title={hasFormErrors ? 'Incorrect configuration numbers. Please rewrite before applying.' : 'Apply changes'}
            >
              <Check className="w-3 h-3" />
              <span>Apply</span>
            </button>
          </div>

          {saveFeedback && (
            <div
              className={`text-[11px] font-mono px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 ${
                saveFeedback.includes('successfully')
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-rose-950/80 text-rose-300 border border-rose-800'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{saveFeedback}</span>
            </div>
          )}

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] text-slate-400 font-medium mb-1">Device Name / Hostname</label>
              <input
                id="prop-device-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleApplyChanges}
                className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono text-xs focus:border-cyan-500 focus:outline-none"
              />
            </div>

            {/* Primary IP Address with strict validation */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-400 font-medium">Primary IP Address</label>
                {ipError && (
                  <button
                    type="button"
                    onClick={() => handleIpChange(device.ipAddress)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono cursor-pointer"
                    title="Revert to last saved IP"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
              <input
                id="prop-ip-address"
                type="text"
                value={ipAddress}
                onChange={(e) => handleIpChange(e.target.value)}
                onBlur={() => {
                  if (!ipError) handleApplyChanges();
                }}
                placeholder="e.g. 192.168.1.1"
                className={`w-full px-3 py-1.5 rounded-lg font-mono text-xs transition-colors focus:outline-none ${
                  ipError
                    ? 'bg-rose-950/30 border-2 border-rose-500 text-rose-100 placeholder-rose-400/50'
                    : 'bg-slate-950 border border-slate-700 text-slate-100 focus:border-cyan-500'
                }`}
              />
              {ipError && (
                <div className="flex items-start gap-1.5 text-[11px] text-rose-400 font-mono mt-1.5 bg-rose-950/60 p-2 rounded-lg border border-rose-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="leading-tight">
                    <span className="font-bold text-rose-300">Incorrect IP: </span>
                    <span>{ipError}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Subnet Mask with strict validation */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-400 font-medium">Subnet Mask</label>
                {subnetError && (
                  <button
                    type="button"
                    onClick={() => handleSubnetChange(device.subnetMask)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono cursor-pointer"
                    title="Revert to last saved Subnet Mask"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
              <input
                id="prop-subnet-mask"
                type="text"
                value={subnetMask}
                onChange={(e) => handleSubnetChange(e.target.value)}
                onBlur={() => {
                  if (!subnetError) handleApplyChanges();
                }}
                placeholder="e.g. 255.255.255.0"
                className={`w-full px-3 py-1.5 rounded-lg font-mono text-xs transition-colors focus:outline-none ${
                  subnetError
                    ? 'bg-rose-950/30 border-2 border-rose-500 text-rose-100 placeholder-rose-400/50'
                    : 'bg-slate-950 border border-slate-700 text-slate-100 focus:border-cyan-500'
                }`}
              />
              {subnetError && (
                <div className="flex items-start gap-1.5 text-[11px] text-rose-400 font-mono mt-1.5 bg-rose-950/60 p-2 rounded-lg border border-rose-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="leading-tight">
                    <span className="font-bold text-rose-300">Incorrect Subnet Mask: </span>
                    <span>{subnetError}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Default Gateway with strict validation */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-slate-400 font-medium">Default Gateway</label>
                {gatewayError && (
                  <button
                    type="button"
                    onClick={() => handleGatewayChange(device.gateway)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono cursor-pointer"
                    title="Revert to last saved Gateway"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
              <input
                id="prop-gateway"
                type="text"
                value={gateway}
                onChange={(e) => handleGatewayChange(e.target.value)}
                onBlur={() => {
                  if (!gatewayError) handleApplyChanges();
                }}
                placeholder="e.g. 192.168.1.254 or 0.0.0.0"
                className={`w-full px-3 py-1.5 rounded-lg font-mono text-xs transition-colors focus:outline-none ${
                  gatewayError
                    ? 'bg-rose-950/30 border-2 border-rose-500 text-rose-100 placeholder-rose-400/50'
                    : 'bg-slate-950 border border-slate-700 text-slate-100 focus:border-cyan-500'
                }`}
              />
              {gatewayError && (
                <div className="flex items-start gap-1.5 text-[11px] text-rose-400 font-mono mt-1.5 bg-rose-950/60 p-2 rounded-lg border border-rose-800">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                  <div className="leading-tight">
                    <span className="font-bold text-rose-300">Incorrect Default Gateway: </span>
                    <span>{gatewayError}</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] text-slate-400 font-medium mb-1">MAC Address (Hardware)</label>
              <div className="w-full px-3 py-1.5 rounded-lg bg-slate-950/60 border border-slate-800 text-slate-400 font-mono text-xs">
                {device.macAddress}
              </div>
            </div>
          </div>
        </div>

        {/* Interfaces & Ports Section */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-cyan-400 uppercase tracking-wider flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              <span>Interfaces ({device.interfaces.length})</span>
            </h4>
            {(device.type === 'router' || device.type === 'switch') && (
              <button
                id="panel-add-port-btn"
                onClick={() => onAddInterface(device)}
                className="flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-colors cursor-pointer"
                title="Add extra interface"
              >
                <Plus className="w-3 h-3" />
                <span>Add Port</span>
              </button>
            )}
          </div>

          <div className="space-y-2">
            {device.interfaces.map((iface) => {
              const isUp = iface.status === 'up';
              const isConnected = !!iface.connectedTo;
              const isEditingThis = editingIfaceId === iface.id;

              return (
                <div
                  key={iface.id}
                  className={`p-2.5 rounded-lg border transition-all ${
                    isEditingThis
                      ? 'bg-slate-950 border-cyan-500/60 shadow-md'
                      : 'bg-slate-950/70 border-slate-800'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleToggleInterface(iface.id)}
                        title={`Click to administratively ${isUp ? 'SHUTDOWN' : 'ENABLE'} interface`}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          isUp
                            ? 'text-emerald-400 bg-emerald-950/60 hover:bg-emerald-900'
                            : 'text-rose-400 bg-rose-950/60 hover:bg-rose-900'
                        }`}
                      >
                        <Power className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-mono font-bold text-slate-200">{iface.id}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                          isUp ? 'bg-emerald-950 text-emerald-400' : 'bg-rose-950 text-rose-400'
                        }`}
                      >
                        {isUp ? 'UP' : 'DOWN'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <span className="text-[11px] font-mono text-slate-400">
                        {iface.ipAddress && iface.ipAddress !== 'unassigned' ? iface.ipAddress : 'No IP'}
                      </span>
                      <button
                        onClick={() => {
                          if (isEditingThis) {
                            setEditingIfaceId(null);
                          } else {
                            handleStartEditIface(iface);
                          }
                        }}
                        title={isEditingThis ? 'Close editor' : 'Configure interface IP'}
                        className="p-1 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Interface Editor with validation */}
                  {isEditingThis && (
                    <div className="mt-2 pt-2 border-t border-slate-800/80 space-y-2 font-mono text-[11px]">
                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Interface IP Address</label>
                        <input
                          type="text"
                          value={editingIfaceIp}
                          onChange={(e) => {
                            setEditingIfaceIp(e.target.value);
                            const res = validateIPv4(e.target.value, 'Interface IP', true);
                            setIfaceIpError(res.isValid ? null : res.error || 'Incorrect IP. Please rewrite.');
                          }}
                          placeholder="e.g. 192.168.1.1 or unassigned"
                          className={`w-full px-2 py-1 rounded bg-slate-900 text-slate-100 text-xs focus:outline-none ${
                            ifaceIpError ? 'border border-rose-500 text-rose-200' : 'border border-slate-700 focus:border-cyan-500'
                          }`}
                        />
                        {ifaceIpError && (
                          <div className="text-[10px] text-rose-400 mt-1 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{ifaceIpError}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-400 block mb-0.5">Interface Subnet Mask</label>
                        <input
                          type="text"
                          value={editingIfaceMask}
                          onChange={(e) => {
                            setEditingIfaceMask(e.target.value);
                            const res = validateSubnetMask(e.target.value);
                            setIfaceMaskError(res.isValid ? null : res.error || 'Incorrect mask. Please rewrite.');
                          }}
                          placeholder="e.g. 255.255.255.0"
                          className={`w-full px-2 py-1 rounded bg-slate-900 text-slate-100 text-xs focus:outline-none ${
                            ifaceMaskError ? 'border border-rose-500 text-rose-200' : 'border border-slate-700 focus:border-cyan-500'
                          }`}
                        />
                        {ifaceMaskError && (
                          <div className="text-[10px] text-rose-400 mt-1 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{ifaceMaskError}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end space-x-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingIfaceId(null)}
                          className="px-2 py-0.5 rounded text-slate-400 hover:text-slate-200 bg-slate-800 text-[10px] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveIfaceConfig(iface.id)}
                          disabled={!!ifaceIpError || !!ifaceMaskError}
                          className="px-2.5 py-0.5 rounded bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-slate-950 font-bold text-[10px] cursor-pointer"
                        >
                          Save Port IP
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="text-[10px] text-slate-400 flex items-center justify-between font-mono bg-slate-900/60 px-2 py-1 rounded mt-1">
                    <span>Link Status:</span>
                    <span className={isConnected ? 'text-cyan-400' : 'text-slate-500'}>
                      {isConnected
                        ? `Connected: ${iface.connectedTo?.deviceId} (${iface.connectedTo?.interfaceId})`
                        : 'Unconnected'}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Device Information / Hardware Specs */}
        <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 space-y-2 text-xs">
          <div className="flex items-center space-x-1.5 text-slate-300 font-semibold mb-1">
            <Info className="w-3.5 h-3.5 text-cyan-400" />
            <span>Device Diagnostics</span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Operating System:</span>
            <span className="text-slate-300 text-right truncate max-w-[140px]">{device.iosVersion.split(' ')[0]}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Active Cable Links:</span>
            <span className="text-cyan-400 font-bold">{activeLinksCount} active</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>System Uptime:</span>
            <span className="text-slate-300">{device.uptime}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-slate-400 font-mono">
            <span>Security Engine:</span>
            <span className="text-emerald-400 flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Active
            </span>
          </div>
        </div>
      </div>

      {/* CLI Button - ALWAYS FIXED AT BOTTOM, NEVER DISAPPEARS */}
      <div
        id="device-properties-footer-cli"
        className="p-3 bg-slate-950 border-t border-slate-800 shrink-0"
      >
        <button
          id="open-cli-fixed-btn"
          onClick={() => onOpenCLI(device)}
          className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-600 to-cyan-500 hover:from-cyan-500 hover:to-cyan-400 text-slate-950 font-semibold text-xs transition-all shadow-lg shadow-cyan-950/50 active:scale-[0.99] cursor-pointer"
        >
          <Terminal className="w-4 h-4 text-slate-950" />
          <span>Open Cisco CLI</span>
        </button>
      </div>
    </div>
  );
};
