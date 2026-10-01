import React from 'react';
import { NetworkCable } from '../types/network';
import { Cable, X, Activity, Wifi, Clock, AlertTriangle, Network, Hash } from 'lucide-react';
import { ADDRESS_CLASSES, MASK_FOR_CLASS, PREFIX_FOR_CLASS, type AddressClass } from '../utils/api';

interface CablePropertiesPanelProps {
  cable: NetworkCable | null;
  onUpdateCable: (cable: NetworkCable) => void;
  /** Address the backend has allocated. Shown, not invented: the lab is built
   *  from exactly these, so the canvas and the routers cannot drift. */
  allocatedSubnet?: string;
  allocatedSourceIp?: string;
  allocatedTargetIp?: string;
  allocatedMask?: string;
}

export const CablePropertiesPanel: React.FC<CablePropertiesPanelProps> = ({
  cable,
  onUpdateCable,
  allocatedSubnet,
  allocatedSourceIp,
  allocatedTargetIp,
  allocatedMask,
}) => {
  if (!cable) return null;

  // The allocated address wins over anything typed, because the routers are
  // configured from it. Until a plan has run these are undefined and the panel
  // says so rather than showing a made-up address.
  const subnet = cable.subnet || allocatedSubnet;
  const mask = cable.subnetMask || allocatedMask;
  const sourceIp = cable.sourceIp || allocatedSourceIp;
  const targetIp = cable.targetIp || allocatedTargetIp;
  const addressClass: AddressClass = (cable.addressClass as AddressClass) || 'C';

  return (
    <div className="w-80 bg-base border-l border-line p-4 text-ink overflow-y-auto">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Cable className="w-5 h-5 text-accent" />
          Link Properties
        </h2>
      </div>

      {/* Addressing: pick a class, the mask follows from it */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
          <div className="flex items-center gap-1.5">
            <Network className="w-3.5 h-3.5" />
            Address Class
          </div>
        </label>
        <div className="grid grid-cols-3 gap-1.5">
          {ADDRESS_CLASSES.map((cls) => (
            <button
              key={cls}
              type="button"
              onClick={() => onUpdateCable({ ...cable, addressClass: cls })}
              className={`rounded border px-2 py-2 text-xs font-semibold transition-colors ${
                addressClass === cls
                  ? 'border-accent bg-accent-soft text-accent'
                  : 'border-line bg-panel text-ink-muted hover:border-ink-faint'
              }`}
            >
              Class {cls}
              <span className="block font-mono text-[10px] font-normal opacity-80">
                /{PREFIX_FOR_CLASS[cls]}
              </span>
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-faint mt-1">
          Mask is generated from the class: <span className="font-mono">{MASK_FOR_CLASS[addressClass]}</span>
        </p>
      </div>

      {/* Allocated addresses, read-only: the lab is configured with these */}
      <div className="mb-4 p-3 bg-sunken rounded-lg border border-line">
        <div className="flex items-center gap-1.5 text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
          <Hash className="w-3.5 h-3.5" />
          Addresses on this link
        </div>
        {subnet ? (
          <div className="text-xs text-ink-muted space-y-1 font-mono">
            <p><span className="text-ink-faint">Subnet</span> {subnet}</p>
            <p><span className="text-ink-faint">Mask</span> {mask || '-'}</p>
            <p><span className="text-ink-faint">{cable.fromDeviceId}</span> {sourceIp || '-'}</p>
            <p><span className="text-ink-faint">{cable.toDeviceId}</span> {targetIp || '-'}</p>
          </div>
        ) : (
          <p className="text-xs text-ink-faint">
            No address yet. Click <span className="text-ink-soft">Plan addresses</span> to have the
            backend allocate one, or deploy the lab to allocate and verify it on the routers.
          </p>
        )}
      </div>

      {/* OSPF area for the two interfaces this link creates */}
      <div className="mb-4">
        <label className="block text-xs font-semibold text-ink-muted uppercase tracking-wider mb-1">
          <div className="flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            OSPF Area
          </div>
        </label>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            max={4294967294}
            value={cable.ospfArea ?? ''}
            placeholder="from router"
            onChange={(e) => {
              const raw = e.target.value;
              onUpdateCable({
                ...cable,
                ospfArea: raw === '' ? undefined : Math.max(0, Number(raw)),
              });
            }}
            className="w-full rounded bg-panel border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
          />
          {cable.ospfArea !== undefined && (
            <button
              type="button"
              onClick={() => onUpdateCable({ ...cable, ospfArea: undefined })}
              className="shrink-0 rounded border border-line px-2 py-2 text-ink-faint hover:text-ink-soft"
              title="Use each router's own area again"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
        <p className="text-xs text-ink-faint mt-1">
          Left blank, this link uses the area of the router it starts at. Area 0 is the
          backbone; non-zero areas only reach each other through it.
        </p>
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
