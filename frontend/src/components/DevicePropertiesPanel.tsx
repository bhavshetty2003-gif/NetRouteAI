import React, { useState, useEffect } from 'react';
import { NetworkDevice, NetworkInterface } from '../types/network';
import {
  Terminal,
  Activity,
  Server,
  Plus,
  Trash2,
  Edit2,
  Check,
  Power,
  Info,
  AlertTriangle,
  RotateCcw,
  ShieldCheck,
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
  /** The address the backend allocated to this router on the running lab, so
   *  the canvas shows the IP the routers actually hold. */
  deployedIp?: string;
  deployedArea?: number;
}

export const DevicePropertiesPanel: React.FC<DevicePropertiesPanelProps> = ({
  device,
  onUpdateDevice,
  onDeleteDevice,
  onOpenCLI,
  onAddInterface,
  deployedIp,
  deployedArea,
}) => {
  const [name, setName] = useState(device?.name || '');
  const [ipAddress, setIpAddress] = useState(device?.ipAddress || '');
  const [subnetMask, setSubnetMask] = useState(device?.subnetMask || '');
  const [gateway, setGateway] = useState(device?.gateway || '');

  const [ipError, setIpError] = useState<string | null>(null);
  const [subnetError, setSubnetError] = useState<string | null>(null);
  const [gatewayError, setGatewayError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

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
      setIpError(null);
      setSubnetError(null);
      setGatewayError(null);
      setSaveFeedback(null);
      setEditingIfaceId(null);
    }
  }, [device?.id, device?.name, device?.ipAddress, device?.subnetMask, device?.gateway]);

  if (!device) {
    return (
      <div className="w-80 lg:w-88 h-full bg-base border-l border-line flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="w-16 h-16 rounded-2xl bg-panel/80 border border-line flex items-center justify-center text-ink-faint mb-4 shadow-inner">
          <Server className="w-8 h-8 text-accent/50" />
        </div>
        <h3 className="text-sm font-semibold text-ink-soft mb-1">No Device Selected</h3>
        <p className="text-xs text-ink-muted max-w-[200px] leading-relaxed">
          Click any router, switch, or workstation on the canvas to configure interfaces, routing, or launch the Cisco CLI.
        </p>
      </div>
    );
  }

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
    <div className="w-80 lg:w-88 h-full bg-base border-l border-line flex flex-col overflow-hidden select-none">
      {/* Scrollable Properties Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Device Header Card */}
        <div className="p-3.5 rounded-xl bg-panel border border-line shadow-sm flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <DeviceIcon type={device.type} size={48} />
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-bold text-ink">{device.name}</span>
                <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-accent-soft text-accent border border-accent">
                  {device.type}
                </span>
              </div>
              <div className="text-[11px] text-ink-muted font-mono mt-0.5">{device.model}</div>
            </div>
          </div>
          <button
            onClick={() => onDeleteDevice(device.id)}
            title="Delete device"
            className="p-1.5 text-ink-muted hover:text-bad hover:bg-raised rounded-lg transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>

        {/* Device Status Toggle */}
        <div className="p-3 rounded-xl bg-panel border border-line space-y-2">
          <h4 className="text-xs font-semibold text-accent uppercase tracking-wider flex items-center gap-1.5">
            <Power className="w-3.5 h-3.5" />
            <span>Device Status</span>
          </h4>
          <div className="flex items-center gap-4">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`device-status-${device.id}`}
                checked={device.status === 'running'}
                onChange={() => onUpdateDevice({ ...device, status: 'running' })}
                className="accent-ok"
              />
              <span className="text-xs text-ok">Running</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`device-status-${device.id}`}
                checked={device.status === 'stopped'}
                onChange={() => onUpdateDevice({ ...device, status: 'stopped' })}
                className="accent-bad"
              />
              <span className="text-xs text-bad">Stopped</span>
            </label>
          </div>
          <p className="text-[10px] text-ink-faint">
            Stopped devices are ignored by routing and packet forwarding
          </p>
        </div>

        {/* Basic Configuration Form */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-accent uppercase tracking-wider flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              <span>Network Configuration</span>
            </h4>
            <button
              onClick={handleApplyChanges}
              disabled={hasFormErrors}
              className={`flex items-center space-x-1 text-xs px-2.5 py-1 rounded transition-colors ${
                hasFormErrors
                  ? 'bg-panel text-ink-faint border border-line cursor-not-allowed'
                  : 'bg-accent-deep hover:bg-accent text-ink border border-accent cursor-pointer shadow-sm'
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
                  ? 'bg-ok-soft text-ok border border-ok'
                  : 'bg-bad-soft/80 text-bad border border-bad'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
              <span>{saveFeedback}</span>
            </div>
          )}

          <div className="space-y-3 text-xs">
            <div>
              <label className="block text-[11px] text-ink-soft font-medium mb-1">Device Name / Hostname</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onBlur={handleApplyChanges}
                className="w-full px-3 py-1.5 rounded-lg bg-panel border border-line text-ink font-mono text-xs focus:border-accent focus:outline-none"
              />
            </div>

            {/* What the running lab has on this router, read back from the
                backend. Shown beside the editable field so the two cannot be
                confused: this is what the routers hold right now. */}
            {(deployedIp || deployedArea !== undefined) && (
              <div className="mb-3 p-2.5 rounded-lg bg-sunken border border-line">
                <div className="text-[10px] font-semibold text-ink-muted uppercase tracking-wider mb-1">
                  On the running lab
                </div>
                <div className="text-[11px] font-mono text-ink-soft space-y-0.5">
                  {deployedIp && (
                    <p>
                      <span className="text-ink-faint">IP</span> {deployedIp}
                    </p>
                  )}
                  {deployedArea !== undefined && (
                    <p>
                      <span className="text-ink-faint">Area</span> {deployedArea}
                      {deployedArea === 0 && <span className="text-ink-faint"> (backbone)</span>}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* OSPF area for this router's links */}
            <div>
              <label className="text-[11px] text-ink-soft font-medium">OSPF Area</label>
              <input
                type="number"
                min={0}
                value={device?.ospfArea ?? ''}
                placeholder="0 (backbone)"
                onChange={(e) => {
                  if (!device) return;
                  const raw = e.target.value;
                  onUpdateDevice({
                    ...device,
                    ospfArea: raw === '' ? undefined : Math.max(0, Number(raw)),
                  });
                }}
                className="w-full mt-1 px-3 py-1.5 rounded-lg bg-panel border border-line text-ink font-mono text-xs focus:border-accent focus:outline-none"
              />
              <p className="text-[10px] text-ink-faint mt-1 leading-tight">
                Used by every link this router starts, unless that link sets its own area.
                Deploy to push it to the routers.
              </p>
            </div>

            {/* Primary IP Address with strict validation */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-ink-soft font-medium">Primary IP Address</label>
                {ipError && (
                  <button
                    type="button"
                    onClick={() => handleIpChange(device.ipAddress)}
                    className="text-[10px] text-accent hover:text-accent flex items-center gap-1 font-mono cursor-pointer"
                    title="Revert to last saved IP"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                value={ipAddress}
                onChange={(e) => handleIpChange(e.target.value)}
                onBlur={() => {
                  if (!ipError) handleApplyChanges();
                }}
                placeholder="e.g. 192.168.1.1"
                className={`w-full px-3 py-1.5 rounded-lg font-mono text-xs transition-colors focus:outline-none ${
                  ipError
                    ? 'bg-bad-soft/30 border-2 border-bad text-bad placeholder-ink-faint/50'
                    : 'bg-panel border border-line text-ink focus:border-accent'
                }`}
              />
              {ipError && (
                <div className="flex items-start gap-1.5 text-[11px] text-bad font-mono mt-1.5 bg-bad-soft/60 p-2 rounded-lg border border-bad">
                  <AlertTriangle className="w-3.5 h-3.5 text-bad shrink-0 mt-0.5" />
                  <div className="leading-tight">
                    <span className="font-bold text-bad">Incorrect IP: </span>
                    <span>{ipError}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Subnet Mask with strict validation */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-ink-soft font-medium">Subnet Mask</label>
                {subnetError && (
                  <button
                    type="button"
                    onClick={() => handleSubnetChange(device.subnetMask)}
                    className="text-[10px] text-accent hover:text-accent flex items-center gap-1 font-mono cursor-pointer"
                    title="Revert to last saved Subnet Mask"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                value={subnetMask}
                onChange={(e) => handleSubnetChange(e.target.value)}
                onBlur={() => {
                  if (!subnetError) handleApplyChanges();
                }}
                placeholder="e.g. 255.255.255.0"
                className={`w-full px-3 py-1.5 rounded-lg font-mono text-xs transition-colors focus:outline-none ${
                  subnetError
                    ? 'bg-bad-soft/30 border-2 border-bad text-bad placeholder-ink-faint/50'
                    : 'bg-panel border border-line text-ink focus:border-accent'
                }`}
              />
              {subnetError && (
                <div className="flex items-start gap-1.5 text-[11px] text-bad font-mono mt-1.5 bg-bad-soft/60 p-2 rounded-lg border border-bad">
                  <AlertTriangle className="w-3.5 h-3.5 text-bad shrink-0 mt-0.5" />
                  <div className="leading-tight">
                    <span className="font-bold text-bad">Incorrect Subnet Mask: </span>
                    <span>{subnetError}</span>
                  </div>
                </div>
              )}
            </div>

            {/* Default Gateway with strict validation */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] text-ink-soft font-medium">Default Gateway</label>
                {gatewayError && (
                  <button
                    type="button"
                    onClick={() => handleGatewayChange(device.gateway)}
                    className="text-[10px] text-accent hover:text-accent flex items-center gap-1 font-mono cursor-pointer"
                    title="Revert to last saved Gateway"
                  >
                    <RotateCcw className="w-2.5 h-2.5" />
                    <span>Reset</span>
                  </button>
                )}
              </div>
              <input
                type="text"
                value={gateway}
                onChange={(e) => handleGatewayChange(e.target.value)}
                onBlur={() => {
                  if (!gatewayError) handleApplyChanges();
                }}
                placeholder="e.g. 192.168.1.254 or 0.0.0.0"
                className={`w-full px-3 py-1.5 rounded-lg font-mono text-xs transition-colors focus:outline-none ${
                  gatewayError
                    ? 'bg-bad-soft/30 border-2 border-bad text-bad placeholder-ink-faint/50'
                    : 'bg-panel border border-line text-ink focus:border-accent'
                }`}
              />
              {gatewayError && (
                <div className="flex items-start gap-1.5 text-[11px] text-bad font-mono mt-1.5 bg-bad-soft/60 p-2 rounded-lg border border-bad">
                  <AlertTriangle className="w-3.5 h-3.5 text-bad shrink-0 mt-0.5" />
                  <div className="leading-tight">
                    <span className="font-bold text-bad">Incorrect Default Gateway: </span>
                    <span>{gatewayError}</span>
                  </div>
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] text-ink-soft font-medium mb-1">MAC Address (Hardware)</label>
              <div className="w-full px-3 py-1.5 rounded-lg bg-panel/60 border border-line text-ink-soft font-mono text-xs">
                {device.macAddress}
              </div>
            </div>
          </div>
        </div>

        {/* Interfaces & Ports Section */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-accent uppercase tracking-wider flex items-center gap-1.5">
              <Server className="w-3.5 h-3.5" />
              <span>Interfaces ({device.interfaces.length})</span>
            </h4>
            {(device.type === 'router' || device.type === 'switch') && (
              <button
                onClick={() => onAddInterface(device)}
                className="flex items-center space-x-1 text-[11px] px-2 py-0.5 rounded bg-panel hover:bg-raised text-accent border border-line transition-colors cursor-pointer"
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
                      ? 'bg-panel border-accent/60 shadow-md'
                      : 'bg-panel/70 border-line'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <button
                        onClick={() => handleToggleInterface(iface.id)}
                        title={`Click to administratively ${isUp ? 'SHUTDOWN' : 'ENABLE'} interface`}
                        className={`p-1 rounded transition-colors cursor-pointer ${
                          isUp
                            ? 'text-ok bg-ok-soft/60 hover:bg-ok-soft'
                            : 'text-bad bg-bad-soft/60 hover:bg-bad-soft'
                        }`}
                      >
                        <Power className="w-3 h-3" />
                      </button>
                      <span className="text-xs font-mono font-bold text-ink">{iface.id}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                          isUp ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad'
                        }`}
                      >
                        {isUp ? 'UP' : 'DOWN'}
                      </span>
                    </div>

                    <div className="flex items-center space-x-1.5">
                      <span className="text-[11px] font-mono text-ink-soft">
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
                        className="p-1 text-ink-muted hover:text-accent hover:bg-raised rounded transition-colors cursor-pointer"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* Inline Interface Editor with validation */}
                  {isEditingThis && (
                    <div className="mt-2 pt-2 border-t border-line/80 space-y-2 font-mono text-[11px]">
                      <div>
                        <label className="text-[10px] text-ink-soft block mb-0.5">Interface IP Address</label>
                        <input
                          type="text"
                          value={editingIfaceIp}
                          onChange={(e) => {
                            setEditingIfaceIp(e.target.value);
                            const res = validateIPv4(e.target.value, 'Interface IP', true);
                            setIfaceIpError(res.isValid ? null : res.error || 'Incorrect IP. Please rewrite.');
                          }}
                          placeholder="e.g. 192.168.1.1 or unassigned"
                          className={`w-full px-2 py-1 rounded bg-base text-ink text-xs focus:outline-none ${
                            ifaceIpError ? 'border border-bad text-bad' : 'border border-line focus:border-accent'
                          }`}
                        />
                        {ifaceIpError && (
                          <div className="text-[10px] text-bad mt-1 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{ifaceIpError}</span>
                          </div>
                        )}
                      </div>

                      <div>
                        <label className="text-[10px] text-ink-soft block mb-0.5">Interface Subnet Mask</label>
                        <input
                          type="text"
                          value={editingIfaceMask}
                          onChange={(e) => {
                            setEditingIfaceMask(e.target.value);
                            const res = validateSubnetMask(e.target.value);
                            setIfaceMaskError(res.isValid ? null : res.error || 'Incorrect mask. Please rewrite.');
                          }}
                          placeholder="e.g. 255.255.255.0"
                          className={`w-full px-2 py-1 rounded bg-base text-ink text-xs focus:outline-none ${
                            ifaceMaskError ? 'border border-bad text-bad' : 'border border-line focus:border-accent'
                          }`}
                        />
                        {ifaceMaskError && (
                          <div className="text-[10px] text-bad mt-1 flex items-start gap-1">
                            <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                            <span>{ifaceMaskError}</span>
                          </div>
                        )}
                      </div>

                      <div className="flex items-center justify-end space-x-1.5 pt-1">
                        <button
                          type="button"
                          onClick={() => setEditingIfaceId(null)}
                          className="px-2 py-0.5 rounded text-ink-muted hover:text-ink bg-panel text-[10px] cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSaveIfaceConfig(iface.id)}
                          disabled={!!ifaceIpError || !!ifaceMaskError}
                          className="px-2.5 py-0.5 rounded bg-accent-deep hover:bg-accent disabled:opacity-50 text-ink font-bold text-[10px] cursor-pointer"
                        >
                          Save Port IP
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="text-[10px] text-ink-soft flex items-center justify-between font-mono bg-base/60 px-2 py-1 rounded mt-1">
                    <span>Link Status:</span>
                    <span className={isConnected ? 'text-accent' : 'text-ink-muted'}>
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
        <div className="p-3 rounded-xl bg-panel/50 border border-line space-y-2 text-xs">
          <div className="flex items-center space-x-1.5 text-ink font-semibold mb-1">
            <Info className="w-3.5 h-3.5 text-accent" />
            <span>Device Diagnostics</span>
          </div>

          <div className="flex items-center justify-between text-[11px] text-ink-soft font-mono">
            <span>Operating System:</span>
            <span className="text-ink text-right truncate max-w-[140px]">{device.iosVersion.split(' ')[0]}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-ink-soft font-mono">
            <span>Active Cable Links:</span>
            <span className="text-accent font-bold">{activeLinksCount} active</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-ink-soft font-mono">
            <span>System Uptime:</span>
            <span className="text-ink">{device.uptime}</span>
          </div>
          <div className="flex items-center justify-between text-[11px] text-ink-soft font-mono">
            <span>Security Engine:</span>
            <span className="text-ok flex items-center gap-1">
              <ShieldCheck className="w-3 h-3" />
              Active
            </span>
          </div>
        </div>
      </div>

      {/* CLI Button - ALWAYS FIXED AT BOTTOM, NEVER DISAPPEARS */}
      <div className="p-3 bg-base border-t border-line shrink-0">
        <button
          onClick={() => onOpenCLI(device)}
          className="w-full flex items-center justify-center space-x-2 py-2.5 px-4 rounded-xl bg-gradient-to-r from-accent to-accent hover:from-accent hover:to-accent text-ink font-semibold text-xs transition-all shadow-lg shadow-black/50 active:scale-[0.99] cursor-pointer"
        >
          <Terminal className="w-4 h-4 text-ink" />
          <span>Open Cisco CLI</span>
        </button>
      </div>
    </div>
  );
};
