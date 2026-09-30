import React from 'react';
import { NetworkCable } from '../types/network';
import { Cable, X, Activity, Wifi, Clock, AlertTriangle } from 'lucide-react';

interface CablePropertiesPanelProps {
  cable: NetworkCable | null;
  onUpdateCable: (cable: NetworkCable) => void;
}

export const CablePropertiesPanel: React.FC<CablePropertiesPanelProps> = ({
  cable,
  onUpdateCable,
}) => {
  if (!cable) return null;

  return (
    <div className="w-80 bg-base border-l border-line p-4 text-ink overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Cable className="w-5 h-5 text-accent" />
          Link Properties
        </h2>
      </div>

      {/* Link Cost */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            Link Cost (1-100)
          </div>
        </label>
        <input
          type="number"
          min={1}
          max={100}
          value={cable.cost || 1}
          onChange={(e) =>
            onUpdateCable({
              ...cable,
              cost: Math.max(1, Math.min(100, Number(e.target.value))),
            })
          }
          className="w-full rounded bg-panel border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <p className="text-xs text-ink-faint mt-1">OSPF cost for shortest path (1=best, 100=worst)</p>
      </div>

      {/* Bandwidth */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
          <div className="flex items-center gap-1.5">
            <Wifi className="w-3.5 h-3.5" />
            Bandwidth (Mbps)
          </div>
        </label>
        <input
          type="number"
          min={1}
          max={10000}
          value={cable.bandwidth || 100}
          onChange={(e) =>
            onUpdateCable({
              ...cable,
              bandwidth: Math.max(1, Number(e.target.value)),
            })
          }
          className="w-full rounded bg-panel border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      {/* Latency */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Latency (ms)
          </div>
        </label>
        <input
          type="number"
          min={0}
          max={1000}
          value={cable.latency || 10}
          onChange={(e) =>
            onUpdateCable({
              ...cable,
              latency: Math.max(0, Number(e.target.value)),
            })
          }
          className="w-full rounded bg-panel border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
      </div>

      {/* Delay */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
          <div className="flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5" />
            Delay (ms)
          </div>
        </label>
        <input
          type="number"
          min={0}
          max={1000}
          value={cable.delay ?? 10}
          onChange={(e) =>
            onUpdateCable({
              ...cable,
              delay: Math.max(0, Number(e.target.value)),
            })
          }
          className="w-full rounded bg-panel border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <p className="text-xs text-ink-faint mt-1">Animation duration = delay × 10ms</p>
      </div>

      {/* Packet Loss */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
          <div className="flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5" />
            Packet Loss (%)
          </div>
        </label>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={cable.packetLoss ?? 0}
          onChange={(e) =>
            onUpdateCable({
              ...cable,
              packetLoss: Math.max(0, Math.min(100, Number(e.target.value))),
            })
          }
          className="w-full rounded bg-panel border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
        />
        <p className="text-xs text-ink-faint mt-1">Chance a packet is dropped on this link</p>
      </div>

      {/* Link Status */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
          Link Status
        </label>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`cable-status-${cable.id}`}
              checked={cable.status === 'active'}
              onChange={() => onUpdateCable({ ...cable, status: 'active' })}
              className="accent-ok"
            />
            <span className="text-xs text-ok">Active</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              name={`cable-status-${cable.id}`}
              checked={cable.status === 'down'}
              onChange={() => onUpdateCable({ ...cable, status: 'down' })}
              className="accent-bad"
            />
            <span className="text-xs text-bad">Down</span>
          </label>
        </div>
      </div>

      {/* Connection Info */}
      <div className="mt-6 p-3 bg-sunken rounded-lg border border-line">
        <div className="text-xs text-ink-muted space-y-1">
          <p><strong className="text-ink-soft">From:</strong> {cable.fromDeviceId}</p>
          <p><strong className="text-ink-soft">To:</strong> {cable.toDeviceId}</p>
          <p><strong className="text-ink-soft">Type:</strong> {cable.cableType}</p>
          <p><strong className="text-ink-soft">Status:</strong> {cable.status}</p>
        </div>
      </div>
    </div>
  );
};
