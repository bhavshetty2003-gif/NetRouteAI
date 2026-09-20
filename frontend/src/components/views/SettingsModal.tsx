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
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 select-none"
    >
      <div
        id="settings-modal"
        className="w-full max-w-lg bg-slate-900 border border-cyan-500/40 rounded-xl shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-150"
      >
        <div className="flex items-center justify-between px-5 py-3.5 bg-slate-950 border-b border-slate-800">
          <div className="flex items-center space-x-2.5 text-slate-100 font-bold text-sm">
            <Settings className="w-4 h-4 text-cyan-400" />
            <span>NetRouteAI Settings</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div className="space-y-3">
            <h4 className="font-semibold text-cyan-400 uppercase tracking-wider text-[11px]">
              Canvas & Rendering
            </h4>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-200">Interactive Cable Control Handles</div>
                  <div className="text-[11px] text-slate-400">Enables dynamic midpoint bending handles</div>
                </div>
                <span className="text-emerald-400 font-bold">Enabled</span>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium text-slate-200">Packet Glow Aura Shader</div>
                  <div className="text-[11px] text-slate-400">High-contrast SVG glow filter for data frames</div>
                </div>
                <span className="text-emerald-400 font-bold">Enabled</span>
              </div>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <h4 className="font-semibold text-cyan-400 uppercase tracking-wider text-[11px]">
              Storage & Cache Management
            </h4>
            <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-200">Reset LocalStorage Topology</div>
                <div className="text-[11px] text-slate-400">Clears saved network topology state from browser</div>
              </div>
              <button
                onClick={() => {
                  onClearLocalStorage();
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-red-950/60 hover:bg-red-900/80 text-red-300 border border-red-800 transition-colors"
              >
                Clear Data
              </button>
            </div>
          </div>
        </div>

        <div className="px-5 py-3 bg-slate-950 border-t border-slate-800 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold text-xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
