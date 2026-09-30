import React from 'react';
import { NetworkDevice, NetworkCable } from '../../types/network';
import { Radio, CheckCircle2, XCircle, Power, Server, Shield } from 'lucide-react';
import { DeviceIcon } from '../DeviceIcons';

interface MonitoringViewProps {
  devices: NetworkDevice[];
  cables: NetworkCable[];
  onToggleInterface: (deviceId: string, ifaceId: string) => void;
}

export const MonitoringView: React.FC<MonitoringViewProps> = ({
  devices,
  cables,
  onToggleInterface,
}) => {
  return (
    <div className="flex-1 h-full bg-[#050816] overflow-y-auto p-6 space-y-6 text-ink select-none">
      <div className="flex items-center justify-between border-b border-line pb-4">
        <div>
          <h2 className="text-xl font-bold text-accent-ink tracking-tight flex items-center gap-2">
            <Radio className="w-5 h-5 text-accent" />
            <span>Interface Link Health & Device Monitoring</span>
          </h2>
          <p className="text-xs text-ink-muted mt-1">
            Real-time interface state inspection. Toggle port power status to test simulated link failure and packet drops.
          </p>
        </div>
      </div>

      <div className="space-y-4">
        {devices.map((dev) => (
          <div key={dev.id} className="p-4 rounded-2xl bg-panel border border-line space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <DeviceIcon type={dev.type} size={40} />
                <div>
                  <div className="text-sm font-bold text-ink flex items-center gap-2">
                    <span>{dev.name}</span>
                    <span className="text-xs text-accent-ink font-mono">({dev.model})</span>
                  </div>
                  <div className="text-xs font-mono text-accent">IP: {dev.ipAddress}</div>
                </div>
              </div>

              <div className="text-right text-xs font-mono text-ink-muted">
                <span>Uptime: {dev.uptime}</span>
              </div>
            </div>

            {/* Interface Table */}
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2 pt-1 font-mono text-xs">
              {dev.interfaces.map((iface) => {
                const isUp = iface.status === 'up';
                const isConnected = !!iface.connectedTo;

                return (
                  <div
                    key={iface.id}
                    className="p-2.5 rounded-xl bg-panel/80 border border-line flex items-center justify-between"
                  >
                    <div>
                      <div className="font-bold text-ink">{iface.id}</div>
                      <div className="text-[10px] text-ink-muted">
                        {isConnected ? `Linked to ${iface.connectedTo?.deviceId}` : 'No Link'}
                      </div>
                    </div>

                    <button
                      onClick={() => onToggleInterface(dev.id, iface.id)}
                      className={`flex items-center space-x-1 px-2 py-1 rounded text-[10px] font-bold transition-colors cursor-pointer ${
                        isUp
                          ? 'bg-ok-soft text-ok border border-ok hover:bg-ok-soft'
                          : 'bg-bad-soft text-bad border border-bad hover:bg-bad-soft'
                      }`}
                      title="Click to toggle Up/Down"
                    >
                      <Power className="w-2.5 h-2.5" />
                      <span>{isUp ? 'UP' : 'DOWN'}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
