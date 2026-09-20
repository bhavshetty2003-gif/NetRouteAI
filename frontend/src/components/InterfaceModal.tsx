import React from 'react';
import { NetworkDevice, NetworkInterface } from '../types/network';
import { X, Network, CheckCircle2, AlertCircle, Plus } from 'lucide-react';
import { DeviceIcon } from './DeviceIcons';

interface InterfaceModalProps {
  device: NetworkDevice;
  isOpen: boolean;
  onClose: () => void;
  onSelectInterface: (iface: NetworkInterface) => void;
  onAddInterface?: (device: NetworkDevice) => void;
  step: 'source' | 'target';
  sourceDeviceName?: string;
  sourceInterfaceId?: string;
}

export const InterfaceModal: React.FC<InterfaceModalProps> = ({
  device,
  isOpen,
  onClose,
  onSelectInterface,
  onAddInterface,
  step,
  sourceDeviceName,
  sourceInterfaceId,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="interface-selection-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4"
    >
      <div
        id="interface-selection-modal"
        className="w-full max-w-md bg-slate-900 border border-cyan-500/40 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div
          id="interface-selection-header"
          className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-cyan-950 border border-cyan-800 text-cyan-400">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <span>Select Interface</span>
                <span className="text-xs px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800 font-mono">
                  {device.name}
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                {step === 'source' ? 'Select outgoing source port' : `Connecting from ${sourceDeviceName} (${sourceInterfaceId})`}
              </p>
            </div>
          </div>
          <button
            id="interface-modal-close-btn"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Device Summary Card */}
        <div className="px-5 py-3 bg-slate-950/50 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <DeviceIcon type={device.type} size={40} />
            <div>
              <div className="text-xs font-medium text-slate-200">{device.name}</div>
              <div className="text-[11px] text-slate-400 font-mono">{device.model}</div>
            </div>
          </div>
          {onAddInterface && (device.type === 'router' || device.type === 'switch') && (
            <button
              id="add-interface-btn"
              onClick={() => onAddInterface(device)}
              className="flex items-center space-x-1 px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition-colors"
              title="Add extra Gigabit / FastEthernet interface"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Port</span>
            </button>
          )}
        </div>

        {/* Interface List */}
        <div id="interface-list" className="p-5 max-h-80 overflow-y-auto space-y-2">
          {device.interfaces.length === 0 ? (
            <div className="text-center py-6 text-sm text-slate-500">No interfaces available on this device.</div>
          ) : (
            device.interfaces.map((iface) => {
              const isOccupied = !!iface.connectedTo;
              const isUp = iface.status === 'up';

              return (
                <button
                  key={iface.id}
                  id={`interface-btn-${iface.id.replace('/', '-')}`}
                  disabled={isOccupied}
                  onClick={() => onSelectInterface(iface)}
                  className={`w-full flex items-center justify-between p-3 rounded-lg border text-left transition-all ${
                    isOccupied
                      ? 'bg-slate-950/60 border-slate-800 opacity-50 cursor-not-allowed text-slate-500'
                      : 'bg-slate-800/80 hover:bg-cyan-950/50 hover:border-cyan-500/60 border-slate-700/80 text-slate-200 group cursor-pointer'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        isOccupied ? 'bg-amber-500' : isUp ? 'bg-emerald-400' : 'bg-rose-500'
                      }`}
                    />
                    <div>
                      <div className="text-sm font-semibold font-mono text-slate-100 group-hover:text-cyan-300">
                        {iface.name} ({iface.id})
                      </div>
                      <div className="text-xs text-slate-400 font-mono">
                        {iface.ipAddress && iface.ipAddress !== 'unassigned'
                          ? `IP: ${iface.ipAddress}`
                          : 'Unassigned IP'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    {isOccupied ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-slate-900 text-slate-400 font-mono border border-slate-800">
                        Connected: {iface.connectedTo?.deviceId} ({iface.connectedTo?.interfaceId})
                      </span>
                    ) : (
                      <span className="text-xs px-2.5 py-1 rounded bg-cyan-950 text-cyan-300 font-medium border border-cyan-800/80 group-hover:bg-cyan-500 group-hover:text-slate-950 transition-colors">
                        Available
                      </span>
                    )}
                  </div>
                </button>
              );
            })
          )}
        </div>

        {/* Footer info */}
        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 text-xs text-slate-500 flex items-center justify-between">
          <span>Total Interfaces: {device.interfaces.length}</span>
          <span>Unavailable / in-use ports are disabled</span>
        </div>
      </div>
    </div>
  );
};
