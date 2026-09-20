import React from 'react';
import { DeviceType } from '../types/network';

interface DeviceIconProps {
  type: DeviceType;
  className?: string;
  size?: number;
  isSelected?: boolean;
  status?: 'active' | 'down';
  ledBlink?: boolean;
}

export const RouterIcon: React.FC<{ size?: number; className?: string; isSelected?: boolean; isDown?: boolean }> = ({
  size = 64,
  className = '',
  isSelected = false,
  isDown = false,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`transition-all duration-200 ${className}`}
    >
      <defs>
        <linearGradient id="routerChassis" x1="10" y1="20" x2="90" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="50%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
        <linearGradient id="routerTop" x1="20" y1="10" x2="80" y2="50" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0284C7" />
          <stop offset="100%" stopColor="#0369A1" />
        </linearGradient>
        <linearGradient id="routerRim" x1="15" y1="15" x2="85" y2="85" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="100%" stopColor="#0284C7" />
        </linearGradient>
        <filter id="routerGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0284c7" floodOpacity="0.35" />
        </filter>
      </defs>

      {/* Main Circular Chassis - Cisco 3D Cylinder / Disc shape */}
      {/* Lower Depth Ellipse */}
      <ellipse cx="50" cy="58" rx="42" ry="24" fill="#090E17" stroke="#334155" strokeWidth="1.5" />
      {/* Side Wall */}
      <path d="M 8 50 C 8 68, 92 68, 92 50 L 92 58 C 92 76, 8 76, 8 58 Z" fill="url(#routerChassis)" stroke="#1E293B" strokeWidth="1" />

      {/* Top Face Ellipse */}
      <ellipse
        cx="50"
        cy="48"
        rx="42"
        ry="23"
        fill="url(#routerChassis)"
        stroke={isSelected ? '#22D3EE' : '#38BDF8'}
        strokeWidth={isSelected ? 2.5 : 1.8}
        filter="url(#routerGlow)"
      />

      {/* Inner Metallic Disc */}
      <ellipse cx="50" cy="48" rx="36" ry="19" fill="#0B132B" stroke="#1E293B" strokeWidth="1" />

      {/* Cisco 4-Way Routing Arrows (Inward & Outward dynamic routing arrows) */}
      <g stroke={isDown ? '#64748B' : '#38BDF8'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
        {/* North Arrow: Outward */}
        <line x1="50" y1="44" x2="50" y2="35" />
        <polyline points="46,38 50,33 54,38" />

        {/* South Arrow: Outward */}
        <line x1="50" y1="52" x2="50" y2="61" />
        <polyline points="46,58 50,63 54,58" />

        {/* West Arrow: Inward */}
        <line x1="28" y1="48" x2="39" y2="48" />
        <polyline points="36,44 41,48 36,52" />

        {/* East Arrow: Inward */}
        <line x1="72" y1="48" x2="61" y2="48" />
        <polyline points="64,44 59,48 64,52" />

        {/* Center Router Hub Point */}
        <circle cx="50" cy="48" r="3" fill="#0284C7" stroke="#E0F2FE" strokeWidth="1" />
      </g>

      {/* Front Face Panel with Ports and LEDs on the lower rim */}
      <path d="M 16 63 Q 50 78 84 63" stroke="#1E293B" strokeWidth="6" strokeLinecap="round" />
      
      {/* Front Mini Gigabit Ports */}
      <rect x="25" y="63" width="5" height="4" rx="1" fill="#020617" stroke="#475569" strokeWidth="0.8" />
      <rect x="33" y="65" width="5" height="4" rx="1" fill="#020617" stroke="#475569" strokeWidth="0.8" />
      <rect x="62" y="65" width="5" height="4" rx="1" fill="#020617" stroke="#475569" strokeWidth="0.8" />
      <rect x="70" y="63" width="5" height="4" rx="1" fill="#020617" stroke="#475569" strokeWidth="0.8" />

      {/* LED Status Indicators */}
      {/* Power LED (Green) */}
      <circle cx="43" cy="67" r="1.8" fill={isDown ? '#EF4444' : '#10B981'} className={isDown ? '' : 'animate-pulse'} />
      {/* System Status LED */}
      <circle cx="48" cy="68" r="1.5" fill={isDown ? '#64748B' : '#06B6D4'} />
      {/* Activity LED */}
      <circle cx="53" cy="68" r="1.5" fill={isDown ? '#64748B' : '#22D3EE'} className="animate-ping" style={{ animationDuration: '2s' }} />
      {/* Console/AUX Port Indicator */}
      <circle cx="58" cy="67" r="1.6" fill="#0284C7" />
    </svg>
  );
};

export const SwitchIcon: React.FC<{ size?: number; className?: string; isSelected?: boolean; isDown?: boolean }> = ({
  size = 64,
  className = '',
  isSelected = false,
  isDown = false,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`transition-all duration-200 ${className}`}
    >
      <defs>
        <linearGradient id="switchChassis" x1="10" y1="25" x2="90" y2="75" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="60%" stopColor="#0F172A" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
        <linearGradient id="switchBevel" x1="10" y1="20" x2="90" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0D9488" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
        <filter id="switchGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#0d9488" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* Main Switch Chassis - Cisco 2960/Catalyst rack rectangle */}
      {/* Shadow */}
      <rect x="12" y="32" width="76" height="42" rx="4" fill="#090E17" />
      {/* 3D Top Bevel */}
      <path d="M 12 36 L 22 24 L 78 24 L 88 36 Z" fill="#1E293B" stroke="#334155" strokeWidth="1" />
      
      {/* Front Face Box */}
      <rect
        x="10"
        y="34"
        width="80"
        height="38"
        rx="3"
        fill="url(#switchChassis)"
        stroke={isSelected ? '#22D3EE' : '#14B8A6'}
        strokeWidth={isSelected ? 2.2 : 1.6}
        filter="url(#switchGlow)"
      />

      {/* Top Cisco Opposing Arrows Pattern (Layer 2 Switching symbol) */}
      <g stroke={isDown ? '#64748B' : '#2DD4BF'} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        {/* Upper Arrow: Left to Right */}
        <line x1="28" y1="43" x2="70" y2="43" />
        <polyline points="64,39 71,43 64,47" />
        
        {/* Lower Arrow: Right to Left */}
        <line x1="72" y1="49" x2="30" y2="49" />
        <polyline points="36,45 29,49 36,53" />
      </g>

      {/* Front Port Bank Matrix (Simulated 24-Port / 8-Port Switch Bank) */}
      <g fill="#020617" stroke="#334155" strokeWidth="0.8">
        {/* Upper Port row */}
        <rect x="18" y="57" width="5" height="4" rx="0.5" />
        <rect x="25" y="57" width="5" height="4" rx="0.5" />
        <rect x="32" y="57" width="5" height="4" rx="0.5" />
        <rect x="39" y="57" width="5" height="4" rx="0.5" />
        <rect x="52" y="57" width="5" height="4" rx="0.5" />
        <rect x="59" y="57" width="5" height="4" rx="0.5" />
        <rect x="66" y="57" width="5" height="4" rx="0.5" />
        <rect x="73" y="57" width="5" height="4" rx="0.5" />

        {/* Lower Port row */}
        <rect x="18" y="63" width="5" height="4" rx="0.5" />
        <rect x="25" y="63" width="5" height="4" rx="0.5" />
        <rect x="32" y="63" width="5" height="4" rx="0.5" />
        <rect x="39" y="63" width="5" height="4" rx="0.5" />
        <rect x="52" y="63" width="5" height="4" rx="0.5" />
        <rect x="59" y="63" width="5" height="4" rx="0.5" />
        <rect x="66" y="63" width="5" height="4" rx="0.5" />
        <rect x="73" y="63" width="5" height="4" rx="0.5" />
      </g>

      {/* Port Activity Tiny LEDs */}
      <circle cx="20.5" cy="55" r="0.9" fill={isDown ? '#EF4444' : '#10B981'} />
      <circle cx="27.5" cy="55" r="0.9" fill={isDown ? '#64748B' : '#10B981'} />
      <circle cx="34.5" cy="55" r="0.9" fill={isDown ? '#64748B' : '#22D3EE'} className="animate-pulse" />
      <circle cx="41.5" cy="55" r="0.9" fill={isDown ? '#64748B' : '#10B981'} />
      
      <circle cx="54.5" cy="55" r="0.9" fill={isDown ? '#64748B' : '#10B981'} />
      <circle cx="61.5" cy="55" r="0.9" fill={isDown ? '#64748B' : '#22D3EE'} />
      <circle cx="68.5" cy="55" r="0.9" fill={isDown ? '#64748B' : '#10B981'} />
      <circle cx="75.5" cy="55" r="0.9" fill={isDown ? '#64748B' : '#10B981'} />

      {/* System & Mode Status Lights */}
      <circle cx="14" cy="40" r="1.5" fill={isDown ? '#EF4444' : '#10B981'} />
      <circle cx="14" cy="45" r="1.5" fill={isDown ? '#64748B' : '#06B6D4'} />
      <circle cx="14" cy="50" r="1.5" fill={isDown ? '#64748B' : '#F59E0B'} />
    </svg>
  );
};

export const PCIcon: React.FC<{ size?: number; className?: string; isSelected?: boolean; isDown?: boolean }> = ({
  size = 64,
  className = '',
  isSelected = false,
  isDown = false,
}) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={`transition-all duration-200 ${className}`}
    >
      <defs>
        <linearGradient id="screenBg" x1="20" y1="20" x2="65" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#0B132B" />
          <stop offset="100%" stopColor="#020617" />
        </linearGradient>
        <linearGradient id="towerGrad" x1="68" y1="24" x2="86" y2="76" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#1E293B" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>
        <filter id="pcGlow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#06b6d4" floodOpacity="0.25" />
        </filter>
      </defs>

      {/* Monitor Outer Frame */}
      <rect
        x="12"
        y="20"
        width="54"
        height="38"
        rx="3"
        fill="#0F172A"
        stroke={isSelected ? '#22D3EE' : '#475569'}
        strokeWidth={isSelected ? 2.2 : 1.5}
        filter="url(#pcGlow)"
      />

      {/* Monitor Display Glass */}
      <rect x="15" y="23" width="48" height="30" rx="1.5" fill="url(#screenBg)" stroke="#1E293B" strokeWidth="1" />

      {/* Terminal Lines on Screen */}
      <g stroke={isDown ? '#64748B' : '#06B6D4'} strokeWidth="1.4" strokeLinecap="round">
        <line x1="19" y1="28" x2="38" y2="28" />
        <line x1="19" y1="33" x2="48" y2="33" />
        <line x1="19" y1="38" x2="30" y2="38" />
        <line x1="19" y1="43" x2="42" y2="43" />
      </g>
      {/* Terminal prompt cursor */}
      <rect x="45" y="42" width="2" height="3" fill="#22D3EE" className="animate-pulse" />

      {/* Monitor Stand */}
      <rect x="36" y="58" width="6" height="8" fill="#334155" />
      <path d="M 28 66 L 50 66" stroke="#475569" strokeWidth="2.5" strokeLinecap="round" />

      {/* PC Tower / Workstation alongside */}
      <rect
        x="70"
        y="24"
        width="20"
        height="50"
        rx="2"
        fill="url(#towerGrad)"
        stroke={isSelected ? '#22D3EE' : '#334155'}
        strokeWidth={isSelected ? 2 : 1.2}
      />

      {/* Optical Drive / Vent Slots */}
      <rect x="74" y="28" width="12" height="2" rx="0.5" fill="#020617" />
      <rect x="74" y="32" width="12" height="2" rx="0.5" fill="#020617" />

      {/* Power Button LED (Cyan/Green) */}
      <circle cx="80" cy="40" r="2" fill={isDown ? '#EF4444' : '#10B981'} className={isDown ? '' : 'animate-pulse'} />

      {/* USB Ports on Tower */}
      <rect x="76" y="46" width="3" height="1.5" fill="#020617" />
      <rect x="81" y="46" width="3" height="1.5" fill="#020617" />

      {/* Ventilation Grille on Tower */}
      <line x1="74" y1="54" x2="86" y2="54" stroke="#020617" strokeWidth="1" />
      <line x1="74" y1="58" x2="86" y2="58" stroke="#020617" strokeWidth="1" />
      <line x1="74" y1="62" x2="86" y2="62" stroke="#020617" strokeWidth="1" />
      <line x1="74" y1="66" x2="86" y2="66" stroke="#020617" strokeWidth="1" />

      {/* Slim Keyboard & Mouse */}
      <rect x="18" y="70" width="38" height="4" rx="1" fill="#1E293B" stroke="#334155" strokeWidth="0.8" />
      <ellipse cx="61" cy="72" rx="2.5" ry="3.5" fill="#334155" />
    </svg>
  );
};

export const DeviceIcon: React.FC<DeviceIconProps> = ({
  type,
  className = '',
  size = 64,
  isSelected = false,
  status = 'active',
}) => {
  const isDown = status === 'down';
  switch (type) {
    case 'router':
      return <RouterIcon size={size} className={className} isSelected={isSelected} isDown={isDown} />;
    case 'switch':
      return <SwitchIcon size={size} className={className} isSelected={isSelected} isDown={isDown} />;
    case 'pc':
      return <PCIcon size={size} className={className} isSelected={isSelected} isDown={isDown} />;
    default:
      return null;
  }
};
