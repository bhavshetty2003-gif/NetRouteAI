import React from 'react';
import { ActiveNavTab } from '../types/network';
import {
  Compass,
  BarChart3,
  Settings,
  LogOut,
} from 'lucide-react';

interface SidebarProps {
  activeTab: ActiveNavTab;
  onTabChange: (tab: ActiveNavTab) => void;
  onLogout: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  onTabChange,
  onLogout,
}) => {
  const menuItems: Array<{ id: ActiveNavTab; label: string; icon: React.ReactNode; badge?: string }> = [
    { id: 'designer', label: 'Network Designer', icon: <Compass className="w-4 h-4" />, badge: 'Core' },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
  ];

  return (
    <aside
      id="app-sidebar"
      className="w-56 lg:w-60 bg-panel border-r border-line/90 flex flex-col justify-between select-none shrink-0 z-30"
    >
      {/* Navigation List */}
      <div className="p-3 space-y-1 overflow-y-auto">
        <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-ink-muted">
          Navigation
        </div>

        {menuItems.map((item) => {
          const isActive = activeTab === item.id;

          return (
            <button
              key={item.id}
              id={`sidebar-item-${item.id}`}
              onClick={() => onTabChange(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-semibold transition-all duration-150 ${
                isActive
                  ? 'bg-gradient-to-r from-accent-soft/80 to-base text-accent border border-accent/40 shadow-sm shadow-lift-strong'
                  : 'text-ink-muted hover:text-ink hover:bg-panel/80'
              }`}
            >
              <div className="flex items-center space-x-2.5">
                <span className={isActive ? 'text-accent' : 'text-ink-muted'}>{item.icon}</span>
                <span>{item.label}</span>
              </div>

              {item.badge && (
                <span
                  className={`text-[9px] font-mono px-1.5 py-0.5 rounded ${
                    isActive ? 'bg-accent text-accent-ink font-bold' : 'bg-panel text-ink-muted'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Bottom Status & Logout */}
      <div className="p-3 border-t border-line/80 space-y-2 bg-panel/40">
        {/* A status widget used to sit here: a green pulsing dot, the words
            "Engine Online", and "0.4ms Latency". The latency was a string
            literal, so it reported a measurement that was never taken, and
            "Engine Online" claimed a running engine without checking one.
            Showing the *real* lab state instead is not an option here: the lab
            is one shared lab, so its device count would tell every visitor
            whose network was deployed last -- the same leak the landing page
            was rebuilt to avoid. Until there is a per-user fact to show, the
            widget is gone rather than made-up. */}

        {/* Logout Button */}
        <button
          id="sidebar-logout-btn"
          onClick={onLogout}
          className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-xl text-xs font-medium text-ink-muted hover:text-bad hover:bg-bad-soft/30 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </div>
    </aside>
  );
};
