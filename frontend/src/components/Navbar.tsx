import React, { useState } from 'react';
import { ActiveNavTab } from '../types/network';
import { currentTheme, toggleTheme, type Theme } from '../utils/theme';
import {
  Network,
  Moon,
  Sun,
  Compass,
} from 'lucide-react';
import { ProfileMenu } from './ProfileMenu';
import type { AuthUser } from '../utils/auth';

interface NavbarProps {
  deviceCount: number;
  cableCount: number;
  activeTab?: ActiveNavTab;
  onNavigate?: (tab: ActiveNavTab) => void;
  onSearchQuery?: (query: string) => void;
  /** The signed-in account. The pill is only rendered when this is set. */
  user?: AuthUser | null;
  onUserUpdated?: (user: AuthUser) => void;
  onSignOut?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  deviceCount,
  cableCount,
  activeTab = 'designer',
  onNavigate,
  user,
  onUserUpdated,
  onSignOut,
}) => {
  // Read from the document rather than initialised to `true`: `index.html` has
  // already applied the stored preference (or the OS one) to <html> before
  // React mounts, so a hardcoded default would show the wrong icon on every
  // reload in the cream theme.
  const [theme, setTheme] = useState<Theme>(() => currentTheme());

  return (
    <header
      id="app-navbar"
      className="h-14 bg-panel border-b border-line/90 px-4 flex items-center justify-between select-none z-40 shrink-0"
    >
      {/* Brand & Page Title */}
      <div className="flex items-center space-x-3">
        <div className="flex items-center space-x-3 text-left">
          <div className="p-2 rounded-xl bg-accent-soft border border-accent/40 text-accent shadow-md shadow-lift-strong">
            <Network className="w-5 h-5 text-accent" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-base font-bold tracking-tight text-ink flex items-center gap-1.5">
                <span>NetRoute</span>
                <span className="text-accent font-mono">AI</span>
              </h1>
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
            className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-accent to-info hover:from-accent hover:to-info text-accent-ink font-bold text-xs shadow-md shadow-lift-strong transition-all cursor-pointer active:scale-98"
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
          onClick={() => setTheme(toggleTheme())}
          title={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
          aria-label={theme === 'dark' ? 'Switch to the light theme' : 'Switch to the dark theme'}
          aria-pressed={theme === 'dark'}
          className="p-2 rounded-xl bg-panel hover:bg-raised border border-line text-ink-soft hover:text-accent transition-colors"
        >
          {theme === 'dark' ? <Moon className="w-4 h-4 text-accent" /> : <Sun className="w-4 h-4 text-warn" />}
        </button>

        {/* There used to be a notifications bell here. It carried three
            hardcoded lines -- "R1 and R2 formed bidirectional peer on Gi0/1",
            "All 6 initial network devices operational" -- and a permanent
            unread dot with a "3 New" counter. None of it was ever measured:
            the strings were compiled into the bundle, and the counter was a
            literal. A bell is an invitation to read the badge as news about
            the network, so a bell that always shows news is worse than no
            bell. It is gone until there is something real to report. */}

        {/* The signed-in account. This used to be a hardcoded "NetEng User /
            CCNA / CCNP Sim" pill, which asserted an identity that did not
            exist and changed nothing when clicked. */}
        {user && onUserUpdated && onSignOut && (
          <div id="navbar-profile">
            <ProfileMenu user={user} onUpdated={onUserUpdated} onSignOut={onSignOut} />
          </div>
        )}
      </div>
    </header>
  );
};
