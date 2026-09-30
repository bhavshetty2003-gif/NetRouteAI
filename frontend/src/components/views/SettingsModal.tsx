import React from 'react';
import { Settings, X, RotateCcw, Database, ShieldCheck, Check } from 'lucide-react';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onClearLocalStorage: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onClearLocalStorage,
}) => {
  if (!isOpen) return null;

  return (
    <div
      id="settings-modal-overlay"
      className="fixed inset-0 z-50 flex items-center justify-center bg-base/70 backdrop-blur-xs p-4 select-none"
    >
      <div
        id="settings-modal"
        className="w-full max-w-lg bg-panel border border-accent/40 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between px-5 py-3.5 bg-panel border-b border-line">
          <div className="flex items-center space-x-2.5 text-ink font-bold text-sm">
            <Settings className="w-4 h-4 text-accent" />
            <span>NetRouteAI Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-ink-muted hover:text-ink hover:bg-raised rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="space-y-3">
            <h4 className="font-semibold text-accent uppercase tracking-wider text-[11px]">
              Canvas & Rendering
            </h4>
            <div className="p-3 rounded-xl bg-panel border border-line space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-ink">Interactive Cable Control Handles</div>
                  <div className="text-[11px] text-ink-muted">Enables dynamic midpoint bending handles</div>
                </div>
                <span className="text-ok font-bold">Enabled</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-panel border border-line space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-ink">Packet Glow Aura Shader</div>
                  <div className="text-[11px] text-ink-muted">High-contrast SVG glow filter for data frames</div>
                </div>
                <span className="text-ok font-bold">Enabled</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="font-semibold text-accent uppercase tracking-wider text-[11px]">
              Storage & Cache Management
            </h4>
            <div className="p-3 rounded-xl bg-panel border border-line flex items-center justify-between">
              <div>
                <div className="font-medium text-ink">Reset LocalStorage Topology</div>
                <div className="text-[11px] text-ink-muted">Clears saved network topology state from browser</div>
              </div>
              <button
                onClick={() => {
                  onClearLocalStorage();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-bad-soft/60 hover:bg-bad-soft/80 text-bad border border-bad transition-colors"
              >
                Clear Data
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-panel border-t border-line flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-accent hover:bg-accent text-accent-ink font-bold text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
