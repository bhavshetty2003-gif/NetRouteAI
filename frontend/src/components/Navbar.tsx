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
      className="h-14 bg-panel border-b border-line/90 px-4 flex items-center justify-between select-none z-40 shrink-0"
    >
      {/* Brand & Page Title */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 rounded-xl bg-accent-soft border border-accent/40 text-accent shadow-md shadow-black/60">
            <Network className="w-5 h-5 text-accent" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold tracking-tight text-accent-ink flex items-center gap-1.5">
                <span>NetRoute</span>
                <span className="text-accent font-mono">AI</span>
              </h1>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent font-mono">
                v2.4 Pro
              </span>
            </div>
            <p className="text-[11px] text-ink-muted hidden sm:block">
              Network Topology Designer & Packet Simulator
            </p>
          </div>
        </div>

        {/* Current Active Workspace Indicator */}
        <div className="hidden sm:flex items-center space-x-2 pl-3 ml-2 border-l border-line">
          <span className="text-xs font-mono font-semibold px-2.5 py-1 rounded-lg bg-panel border border-line text-accent capitalize">
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
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-accent to-info hover:from-accent hover:to-info text-accent-ink font-bold text-xs shadow-md shadow-black/60 transition-all cursor-pointer active:scale-98"
          >
            <Compass className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Launch Designer</span>
          </button>
        )}

        {/* Topology Quick Stats */}
        <div className="hidden lg:flex items-center space-x-3 px-3 py-1 rounded-xl bg-panel/80 border border-line text-xs font-mono text-ink-soft">
          <div className="flex items-center space-x-1.5">
            <span className="w-2 h-2 rounded-full bg-ok animate-pulse" />
            <span className="text-ink-muted">Devices:</span>
            <span className="text-accent font-bold">{deviceCount}</span>
          </div>
          <span className="text-ink-faint">|</span>
          <div className="flex items-center space-x-1.5">
            <span className="text-ink-muted">Cables:</span>
            <span className="text-accent font-bold">{cableCount}</span>
          </div>
        </div>

        {/* Theme Toggle */}
        <button
          id="navbar-theme-toggle"
          onClick={() => setIsDark(!isDark)}
          title="Toggle UI brightness theme"
          className="p-2 rounded-xl bg-panel hover:bg-raised border border-line text-ink-soft hover:text-accent transition-colors"
        >
          {isDark ? <Moon className="w-4 h-4 text-accent" /> : <Sun className="w-4 h-4 text-warn" />}
        </button>

        {/* Notifications Popover Toggle */}
        <div className="relative">
          <button
            id="navbar-notifications-btn"
            onClick={() => setShowNotifications(!showNotifications)}
            className="p-2 rounded-xl bg-panel hover:bg-raised border border-line text-ink-soft hover:text-accent relative transition-colors"
          >
            <Bell className="w-4 h-4" />
            <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-accent" />
          </button>

          {showNotifications && (
            <div
              id="notifications-popover"
              className="absolute right-0 mt-2 w-80 bg-panel border border-line rounded-xl shadow-2xl p-3 z-50 text-xs"
            >
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-line font-semibold text-ink">
                <span>System Notifications</span>
                <span className="text-[10px] text-accent font-mono">3 New</span>
              </div>
              <div className="space-y-2">
                {notifications.map((n) => (
                  <div key={n.id} className="p-2 rounded-lg bg-panel/60 border border-line/80">
                    <div className="flex items-center justify-between text-ink font-medium">
                      <span>{n.title}</span>
                      <span className="text-[10px] text-accent-ink font-mono">{n.time}</span>
                    </div>
                    <p className="text-[11px] text-ink-muted mt-0.5">{n.desc}</p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* User Profile Pill */}
        <div
          id="navbar-profile"
          className="flex items-center space-x-2 pl-2 pr-3 py-1 rounded-xl bg-panel border border-line text-xs"
        >
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-accent-deep flex items-center justify-center text-ink font-bold text-xs shadow">
            CC
          </div>
          <div className="hidden sm:block text-left font-mono leading-tight">
            <div className="text-[11px] font-semibold text-ink">NetEng User</div>
            <div className="text-[9px] text-accent">CCNA / CCNP Sim</div>
          </div>
        </div>
      </div>
    </header>
  );
};
