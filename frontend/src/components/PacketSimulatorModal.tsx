import React, { useState } from 'react';
import { NetworkDevice, NetworkCable, PacketSimulationState, PacketHop } from '../types/network';
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
} from 'lucide-react';
import { DeviceIcon } from './DeviceIcons';

interface PacketSimulatorModalProps {
  isOpen: boolean;
  onClose: () => void;
  devices: NetworkDevice[];
  cables: NetworkCable[];
  simulationState: PacketSimulationState;
  onStartSimulation: (sourceId: string, targetId: string, speedMs?: number) => void;
}

export const PacketSimulatorModal: React.FC<PacketSimulatorModalProps> = ({
  isOpen,
  onClose,
  devices,
  cables,
  simulationState,
  onStartSimulation,
}) => {
  const [sourceId, setSourceId] = useState<string>(devices[0]?.id || '');
  const [targetId, setTargetId] = useState<string>(
    devices.length > 1 ? devices[devices.length - 1]?.id : devices[0]?.id || ''
  );
  const [speed, setSpeed] = useState<number>(400); // 400ms pause between hops

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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 select-none"
    >
      <div
        id="packet-simulator-modal"
        className="w-full max-w-2xl bg-slate-900 border border-cyan-500/40 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div
          id="packet-sim-header"
          className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-emerald-950 border border-emerald-800 text-emerald-400">
              <Send className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <span>Packet Transmission Simulator</span>
                <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
                  Hop-by-Hop Engine
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Simulate data frames traversing router and switch interfaces across graph topology
              </p>
            </div>
          </div>

          <button
            id="packet-sim-close-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Configuration Body */}
        <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
          {/* Source & Destination Selection */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Source Device */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <label className="text-xs font-semibold text-cyan-400 uppercase tracking-wider block">
                Source Device
              </label>
              <select
                id="select-packet-source"
                value={sourceId}
                onChange={(e) => setSourceId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono focus:border-cyan-500 focus:outline-none"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.type.toUpperCase()}) - {d.ipAddress}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
                <span>Model:</span>
                <span className="text-slate-300">{deviceMap.get(sourceId)?.model || 'Unknown'}</span>
              </div>
            </div>

            {/* Target Device */}
            <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 space-y-2">
              <label className="text-xs font-semibold text-cyan-400 uppercase tracking-wider block">
                Destination Device
              </label>
              <select
                id="select-packet-target"
                value={targetId}
                onChange={(e) => setTargetId(e.target.value)}
                className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-slate-200 text-xs font-mono focus:border-cyan-500 focus:outline-none"
              >
                {devices.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.type.toUpperCase()}) - {d.ipAddress}
                  </option>
                ))}
              </select>
              <div className="text-[11px] text-slate-400 font-mono flex items-center justify-between">
                <span>Model:</span>
                <span className="text-slate-300">{deviceMap.get(targetId)?.model || 'Unknown'}</span>
              </div>
            </div>
          </div>

          {/* Speed / Hop Pause */}
          <div className="flex items-center justify-between p-3 rounded-xl bg-slate-950/50 border border-slate-800 text-xs">
            <div className="flex items-center space-x-2 text-slate-300">
              <Clock className="w-4 h-4 text-cyan-400" />
              <span>Hop Traversal Delay (Pause):</span>
            </div>
            <div className="flex items-center space-x-2 font-mono">
              {[300, 450, 700].map((val) => (
                <button
                  key={val}
                  onClick={() => setSpeed(val)}
                  className={`px-2.5 py-1 rounded text-xs transition-colors ${
                    speed === val
                      ? 'bg-cyan-500 text-slate-950 font-bold'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                  }`}
                >
                  {val}ms
                </button>
              ))}
            </div>
          </div>

          {/* Route Discovery & Path Preview */}
          <div className="p-3.5 rounded-xl bg-slate-950/90 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-300 flex items-center gap-1.5">
                <Activity className="w-3.5 h-3.5 text-cyan-400" />
                <span>Computed Route Path</span>
              </span>
              {routePreview?.success ? (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
                  {routePreview.hops.length} Hops Discovered
                </span>
              ) : (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-rose-950 text-rose-400 border border-rose-800">
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
                      <div className="flex items-center space-x-1.5 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-200">
                        <span className="font-bold text-cyan-300">{dev?.name || devId}</span>
                        <span className="text-[10px] text-slate-400 font-normal">({dev?.type})</span>
                      </div>
                      {!isLast && (
                        <div className="flex items-center text-slate-500 text-[11px]">
                          <span className="text-cyan-500/80 mr-1">{hop?.fromPort}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                          <span className="text-cyan-500/80 ml-1">{hop?.toPort}</span>
                        </div>
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-rose-400/90 font-mono">
                {routePreview?.error || 'Select distinct source and destination devices.'}
              </p>
            )}
          </div>

          {/* Simulation Log Stream */}
          {simulationState.logs.length > 0 && (
            <div className="p-3 rounded-xl bg-[#030712] border border-slate-800 space-y-1.5 font-mono text-xs max-h-36 overflow-y-auto">
              <div className="text-[11px] text-slate-500 font-sans font-semibold mb-1">Transmission Telemetry:</div>
              {simulationState.logs.map((log) => (
                <div
                  key={log.id}
                  className={`flex items-start space-x-2 text-[11px] ${
                    log.type === 'success'
                      ? 'text-emerald-400'
                      : log.type === 'error'
                      ? 'text-rose-400'
                      : 'text-slate-300'
                  }`}
                >
                  <span className="text-slate-500">[{log.timestamp}]</span>
                  <span>{log.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex items-center justify-between">
          <div className="text-xs text-slate-500">
            Payload: Glowing 64-byte Ethernet Frame (White □□□□ with green glow)
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Close
            </button>
            <button
              id="start-packet-sim-btn"
              onClick={handleTransmit}
              disabled={!routePreview?.success || simulationState.active}
              className={`flex items-center space-x-2 px-4 py-2 rounded-xl text-xs font-semibold shadow-lg transition-all ${
                routePreview?.success && !simulationState.active
                  ? 'bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white shadow-emerald-950/40 cursor-pointer active:scale-98'
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'
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
