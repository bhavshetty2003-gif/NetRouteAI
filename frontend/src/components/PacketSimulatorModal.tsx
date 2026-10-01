import React, { useState } from 'react';
import { NetworkDevice, NetworkCable, PacketSimulationState, PacketHop, PacketGeneratorConfig } from '../types/network';
import { discoverRoute } from '../utils/networkRouting';
import {
  Send,
  X,
  Play,
  ArrowRight,
  CheckCircle,
  AlertCircle,
  Clock,
  Layers,
  Activity,
  Zap,
  Settings,
  Pause,
} from 'lucide-react';
import { DeviceIcon } from './DeviceIcons';

interface PacketSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: NetworkDevice[];
  cables: NetworkCable[];
  simulationState: PacketSimulationState;
  onStartSimulation: (sourceId: string, targetId: string, speedMs?: number) => void;
  onStartPacketGenerator: (config: PacketGeneratorConfig) => void;
  onStopPacketGenerator: () => void;
  packetGeneratorConfig: PacketGeneratorConfig;
}

export const PacketSimulatorModal: React.FC<PacketSimulatorModalProps> = ({
  isOpen,
  onClose,
  devices,
  cables,
  simulationState,
  onStartSimulation,
  onStartPacketGenerator,
  onStopPacketGenerator,
  packetGeneratorConfig,
}) => {
  const [sourceId, setSourceId] = useState<string>(devices[0]?.id || '');
  const [targetId, setTargetId] = useState<string>(
    devices.length > 1 ? devices[devices.length - 1]?.id : devices[0]?.id || ''
  );
  const [speed, setSpeed] = useState<number>(400); // 400ms pause between hops
  const [genCount, setGenCount] = useState<number>(100);
  const [genInterval, setGenInterval] = useState<number>(100);

  if (!isOpen) return null;

  // Calculate route preview
  const routePreview = sourceId && targetId ? discoverRoute(sourceId, targetId, devices, cables) : null;

  const deviceMap = new Map<string, NetworkDevice>();
  devices.forEach((d) => deviceMap.set(d.id, d));

  const handleTransmit = () => {
    if (!sourceId || !targetId) return;
    onStartSimulation(sourceId, targetId, speed);
  };

  return (
    <div
      id="packet-simulator-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-base/70 backdrop-blur-xs p-4 select-none"
    >
      <div
        id="packet-simulator-modal"
        className="w-full max-w-2xl bg-panel border border-accent/40 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div
          id="packet-sim-header"
          className="flex items-center justify-between px-5 py-3.5 bg-panel border-b border-line"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-ok-soft border border-ok text-ok">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                <span>Packet Transmission Simulator</span>
                <span className="text-xs px-2 py-0.5 rounded bg-accent-soft text-accent border border-accent font-mono">
                  Hop-by-Hop Engine
                </span>
              </h3>
              <p className="text-xs text-ink-muted">
                Simulate data frames traversing router and switch interfaces across graph topology
              </p>
            </div>
          </div>

          <button
            id="packet-sim-close-btn"
            onClick={onClose}
            className="p-1.5 text-ink-muted hover:text-ink hover:bg-raised rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Configuration Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Source & Destination Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Source Device */}
            <div className="p-3 rounded-xl bg-panel/80 border border-line space-y-2">
              <label className="text-xs font-semibold text-accent uppercase tracking-wider block">
                Source Device
              </label>
              <select
                id="select-packet-source"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-panel border border-line text-ink text-xs font-mono focus:border-accent focus:outline-none"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.type.toUpperCase()}) - {d.ipAddress}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-ink-muted font-mono flex items-center justify-between">
                <span>Model:</span>
                <span className="text-ink-soft">{deviceMap.get(sourceId)?.model || 'Unknown'}</span>
              </div>
            </div>

            {/* Target Device */}
            <div className="p-3 rounded-xl bg-panel/80 border border-line space-y-2">
              <label className="text-xs font-semibold text-accent uppercase tracking-wider block">
                Destination Device
              </label>
              <select
                id="select-packet-target"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-panel border border-line text-ink text-xs font-mono focus:border-accent focus:outline-none"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.type.toUpperCase()}) - {d.ipAddress}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-ink-muted font-mono flex items-center justify-between">
                <span>Model:</span>
                <span className="text-ink-soft">{deviceMap.get(targetId)?.model || 'Unknown'}</span>
              </div>
            </div>
          </div>

          {/* Speed / Hop Pause */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-panel/50 border border-line text-xs">
            <div className="flex items-center space-x-2 text-ink-soft">
              <Clock className="w-4 h-4 text-accent" />
              <span>Hop Traversal Delay (Pause):</span>
            </div>
            <div className="flex items-center space-x-2 font-mono">
              {[300, 450, 700].map((val) => (
                <button
                  key={val}
                  onClick={() => setSpeed(val)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    speed === val
                      ? 'bg-accent text-accent-ink font-bold'
                      : 'bg-panel hover:bg-overlay text-ink-soft'
                  }`}
                >
                  {val}ms
                </button>
              ))}
            </div>
          </div>

          {/* Route Discovery & Path Preview */}
          <div className="p-3.5 rounded-xl bg-panel/90 border border-line space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-ink-soft flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-accent" />
                <span>Computed Route Path</span>
              </span>
              {routePreview?.success ? (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-ok-soft text-ok border border-ok">
                  {routePreview.hops.length} Hops Discovered
                </span>
              ) : (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-bad-soft text-bad border border-bad">
                  No Valid Path
                </span>
              )}
            </div>

            {routePreview?.success ? (
              <div className="flex items-center flex-wrap gap-2 pt-1 font-mono text-xs">
                {routePreview.devicesPath.map((devId, idx) => {
                  const dev = deviceMap.get(devId);
                  const isLast = idx === routePreview.devicesPath.length - 1;
                  const hop = routePreview.hops[idx];

                  return (
                    <React.Fragment key={devId}>
                      <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-panel border border-line text-ink">
                        <span className="font-bold text-accent">{dev?.name || devId}</span>
                        <span className="text-[10px] text-ink-muted font-normal">({dev?.type})</span>
                      </div>
                      {!isLast && (
                        <div className="flex items-center text-ink-muted text-[11px]">
                          <span className="text-accent mr-1">{hop?.fromPort}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-ink-muted" />
                          <span className="text-accent ml-1">{hop?.toPort}</span>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-console-bad font-mono">
                {routePreview?.error || 'Select distinct source and destination devices.'}
              </p>
            )}
          </div>

          {/* Simulation Log Stream */}
          {simulationState.logs.length > 0 && (
            <div className="p-3 rounded-xl bg-console border border-line space-y-1.5 font-mono text-xs max-h-36 overflow-y-auto">
              <div className="text-[11px] text-console-muted font-sans font-semibold mb-1">Transmission Telemetry:</div>
              {simulationState.logs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start space-x-2 text-[11px] ${
                    log.type === 'success'
                      ? 'text-console-ok'
                      : log.type === 'error'
                      ? 'text-console-bad'
                      : 'text-console-ink'
                  }`}
                >
                  <span className="text-console-muted">[{log.timestamp}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          )}

          {/* Packet Generator */}
          <div className="p-3.5 rounded-xl bg-panel/90 border border-line space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-ink-soft flex items-center gap-1.5">
                <Settings className="w-3.5 h-3.5 text-ai" />
                <span>Packet Generator</span>
              </span>
              {packetGeneratorConfig.running && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-ai-soft text-ai border border-ai animate-pulse">
                  Running
                </span>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] text-ink-muted font-mono block mb-1">Packet Count</label>
                <input
                  type="number"
                  min={1}
                  max={1000}
                  value={genCount}
                  onChange={(e) => setGenCount(Math.max(1, Number(e.target.value)))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-panel border border-line text-ink text-xs font-mono focus:border-ai focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[11px] text-ink-muted font-mono block mb-1">Interval (ms)</label>
                <input
                  type="number"
                  min={10}
                  max={5000}
                  value={genInterval}
                  onChange={(e) => setGenInterval(Math.max(10, Number(e.target.value)))}
                  className="w-full px-2.5 py-1.5 rounded-lg bg-panel border border-line text-ink text-xs font-mono focus:border-ai focus:outline-none"
                />
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!packetGeneratorConfig.running ? (
                <button
                  onClick={() =>
                    onStartPacketGenerator({
                      packetCount: genCount,
                      intervalMs: genInterval,
                      sourceId,
                      destinationId: targetId,
                      running: true,
                    })
                  }
                  className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-gradient-to-r from-ai to-info hover:from-ai hover:to-info text-accent-ink text-xs font-semibold shadow-md transition-all cursor-pointer"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Start Generator</span>
                </button>
              ) : (
                <button
                  onClick={onStopPacketGenerator}
                  className="flex-1 flex items-center justify-center space-x-2 px-3 py-2 rounded-lg bg-bad hover:bg-bad text-ink text-xs font-semibold shadow-md transition-all cursor-pointer"
                >
                  <Pause className="w-3.5 h-3.5" />
                  <span>Stop Generator</span>
                </button>
              )}
            </div>
            <p className="text-[10px] text-ink-faint font-mono">
              Generates {genCount} packets from {sourceId} → {targetId} at {genInterval}ms intervals
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-panel border-t border-line flex items-center justify-between">
          <div className="text-xs text-ink-muted">
            Payload: Glowing 64-byte Ethernet Frame (White □□□□ with green glow)
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-ink-muted hover:text-ink hover:bg-raised transition-colors"
            >
              Close
            </button>
            <button
              id="start-packet-sim-btn"
              onClick={handleTransmit}
              disabled={!routePreview?.success || simulationState.active}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-lg transition-all ${
                routePreview?.success && !simulationState.active
                  ? 'bg-gradient-to-r from-ok to-info hover:from-ok hover:to-info text-accent-ink shadow-lift-strong cursor-pointer active:scale-98'
                  : 'bg-panel text-ink-faint cursor-not-allowed'
              }`}
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{simulationState.active ? 'Transmitting...' : 'Start Simulation'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
