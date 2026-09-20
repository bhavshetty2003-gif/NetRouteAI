import React, { useState } from 'react';
import { ActiveNavTab } from '../types/network';
import {
  Network,
  Bell,
  User,
  Moon,
  Sun,
  Layers,
  Cpu,
  ShieldCheck,
  CheckCircle2,
  Compass,
} from 'lucide-react';

interface NavbarProps {
  deviceCount: number;
  cableCount: number;
  activeTab?: ActiveNavTab;
  onNavigate?: (tab: ActiveNavTab) => void;
  onSearchQuery?: (query: string) => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  deviceCount,
  cableCount,
  activeTab = 'designer',
  onNavigate,
}) => {
  const [showNotifications, setShowNotifications] = useState(false);
  const [isDark, setIsDark] = useState(true);

  const notifications = [
    { id: '1', title: 'OSPF Adjacency Full', desc: 'R1 and R2 formed bidirectional peer on Gi0/1', time: '2m ago' },
    { id: '2', title: 'Cisco IOS Boot Complete', desc: 'All 6 initial network devices operational', time: '5m ago' },
    { id: '3', title: 'NetRouteAI Engine Ready', desc: 'Packet hop-by-hop simulator initialized', time: '10m ago' },
  ];

  return (
    <header
      id="app-navbar"
      className="h-14 bg-slate-950 border-b border-slate-800/90 px-4 flex items-center justify-between select-none z-40 shrink-0"
    >
      {/* Brand & Page Title */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 rounded-xl bg-cyan-950 border border-cyan-500/40 text-cyan-400 shadow-md shadow-cyan-950/60">
            <Network className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold tracking-tight text-white flex items-center gap-1.5">
                <span>NetRoute</span>
                <span className="text-cyan-400 font-mono">AI</span>
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-mono">
                v2.4 Pro
              </span>
            </div>
            <p className="text-[11px] text-slate-400 hidden sm:block">
              Network Topology Designer & Packet Simulator
            </p>
          </div>
        </div>

        {/* Current Active Workspace Indicator */}
        <div className="hidden sm:flex items-center space-x-2 pl-3 ml-2 border-l border-slate-800">
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-800 text-cyan-400 capitalize">
            {activeTab === 'designer' ? 'Network Designer' : activeTab}
          </span>
        </div>
      </div>

      {/* Right Controls: Stats, Notifications, Theme, Profile */}
      <div className="flex items-center space-x-3">
        {/* Quick Launch Designer CTA Button */}
        {activeTab !== 'designer' && (
          <button
            id="navbar-launch-designer-btn"
            onClick={() => onNavigate?.('designer')}
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-md shadow-cyan-950/60 transition-all cursor-pointer active:scale-98"
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Launch Designer</span>
          </button>
        )}

        {/* Topology Quick Stats */}
        <div className="hidden lg:flex items-center space-x-3 px-3 py-1 rounded-xl bg-slate-900/80 border border-slate-800 text-xs font-mono text-slate-300">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-slate-400">Devices:</span>
            <span className="text-cyan-400 font-bold">{deviceCount}</span>
          </div>
          <span className="text-slate-700">|</span>
          <div className="flex items-center space-x-1.5">
            <span className="text-slate-400">Cables:</span>
            <span className="text-cyan-400 font-bold">{cableCount}</span>
          </div>
        </div>

        {/* Theme Toggle */}
        <button
          id="navbar-theme-toggle"
          onClick={() => setIsDark(!isDark)}
          title="Toggle UI brightness theme"
          className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-300 transition-colors"
        >
          {isDark ? <Moon className="w-4 h-4 text-cyan-400" /> : <Sun className="w-4 h-4 text-amber-400" />}
        </button>

        {/* Notifications Popover Toggle */}
        <div className="relative">
          <button
            id="navbar-notifications-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-cyan-300 relative transition-colors"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-cyan-400" />
          </button>

          {showNotifications && (
            <div
              id="notifications-popover"
              className="absolute right-0 mt-2 w-80 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl p-3 z-50 text-xs"
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800 font-semibold text-slate-200">
                <span>System Notifications</span>
                <span className="text-[10px] text-cyan-400 font-mono">3 New</span>
              </div>
              <div className="space-y-2">
                {notifications.map((n) => (
                  <div key={n.id} className="p-2 rounded-lg bg-slate-950/60 border border-slate-800/80">
                    <div className="flex items-center justify-between text-slate-200 font-medium">
                      <span>{n.title}</span>
                      <span className="text-[10px] text-slate-500 font-mono">{n.time}</span>
                    </div>
                    <p className="text-[11px] text-slate-400 mt-0.5">{n.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Pill */}
        <div
          id="navbar-profile"
          className="flex items-center space-x-2 pl-2 pr-3 py-1 rounded-xl bg-slate-900 border border-slate-800 text-xs"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-600 to-cyan-800 flex items-center justify-center text-slate-100 font-bold text-xs shadow">
            CC
          </div>
          <div className="hidden sm:block text-left font-mono leading-tight">
            <div className="text-[11px] font-semibold text-slate-200">NetEng User</div>
            <div className="text-[9px] text-cyan-400">CCNA / CCNP Sim</div>
          </div>
        </div>
      </div>
    </header>
  );
};
