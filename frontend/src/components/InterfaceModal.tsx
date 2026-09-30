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
      className="fixed inset-0 z-50 flex items-center justify-center bg-base/70 backdrop-blur-xs p-4"
    >
      <div
        id="interface-selection-modal"
        className="w-full max-w-md bg-panel border border-accent/40 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Header */}
        <div
          id="interface-selection-header"
          className="flex items-center justify-between px-5 py-3.5 bg-panel border-b border-line"
        >
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-accent-soft border border-accent text-accent">
              <Network className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-ink flex items-center gap-2">
                <span>Select Interface</span>
                <span className="text-xs px-2 py-0.5 rounded bg-accent-soft text-accent border border-accent font-mono">
                  {device.name}
                </span>
              </h3>
              <p className="text-xs text-ink-muted">
                {step === 'source' ? 'Select outgoing source port' : `Connecting from ${sourceDeviceName} (${sourceInterfaceId})`}
              </p>
            </div>
          </div>
          <button
            id="interface-modal-close-btn"
            onClick={onClose}
            className="p-1.5 text-ink-muted hover:text-ink hover:bg-raised rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Device Summary Card */}
        <div className="px-5 py-3 bg-panel/50 border-b border-line flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <DeviceIcon type={device.type} size={40} />
            <div>
              <div className="text-xs font-medium text-ink">{device.name}</div>
              <div className="text-[11px] text-ink-muted font-mono">{device.model}</div>
            </div>
          </div>
          {onAddInterface && (device.type === 'router' || device.type === 'switch') && (
            <button
              id="add-interface-btn"
              onClick={() => onAddInterface(device)}
              className="flex items-center space-x-1 px-2.5 py-1 text-xs rounded bg-panel hover:bg-overlay text-accent border border-line transition-colors"
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
            <div className="text-center py-6 text-sm text-accent-ink">No interfaces available on this device.</div>
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
                      ? 'bg-panel/60 border-line opacity-50 cursor-not-allowed text-accent-ink'
                      : 'bg-panel/80 hover:bg-accent-soft/50 hover:border-accent/60 border-line/80 text-ink group cursor-pointer'
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <div
                      className={`w-2.5 h-2.5 rounded-full ${
                        isOccupied ? 'bg-warn' : isUp ? 'bg-ok' : 'bg-bad'
                      }`}
                    />
                    <div>
                      <div className="text-sm font-semibold font-mono text-ink group-hover:text-accent">
                        {iface.name} ({iface.id})
                      </div>
                      <div className="text-xs text-ink-muted font-mono">
                        {iface.ipAddress && iface.ipAddress !== 'unassigned'
                          ? `IP: ${iface.ipAddress}`
                          : 'Unassigned IP'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    {isOccupied ? (
                      <span className="text-xs px-2 py-0.5 rounded bg-panel text-ink-muted font-mono border border-line">
                        Connected: {iface.connectedTo?.deviceId} ({iface.connectedTo?.interfaceId})
                      </span>
                    ) : (
                      <span className="text-xs px-2.5 py-1 rounded bg-accent-soft text-accent font-medium border border-accent/80 group-hover:bg-accent group-hover:text-accent-ink transition-colors">
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
        <div className="px-5 py-3 bg-panel border-t border-line text-xs text-accent-ink flex items-center justify-between">
          <span>Total Interfaces: {device.interfaces.length}</span>
          <span>Unavailable / in-use ports are disabled</span>
        </div>
      </div>
    </div>
  );
};
