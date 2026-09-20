import React, { useState } from 'react';
import {
  Network,
  ArrowRight,
  LogIn,
  Lock,
  Mail,
  Shield,
  Zap,
  Terminal,
  Layers,
  CheckCircle2,
  X,
  Compass,
  Radio,
  Activity,
  Cpu,
  Server,
  Box,
  TrendingDown,
  Sparkles,
  GitBranch,
} from 'lucide-react';

interface HomeViewProps {
  onLaunchDesigner: () => void;
  onOpenDocs?: () => void;
  onOpenAnalytics?: () => void;
  onLaunchPreset?: (preset: 'default' | 'star' | 'mesh' | 'tree' | 'bus' | 'ring') => void;
  deviceCount?: number;
  cableCount?: number;
}

export const HomeView: React.FC<HomeViewProps> = ({ onLaunchDesigner }) => {
  const [loginModalOpen, setLoginModalOpen] = useState(false);
  const [email, setEmail] = useState('engineer@netroute.ai');
  const [password, setPassword] = useState('••••••••••••');
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [activeTabPreview, setActiveTabPreview] = useState<'ai' | 'ospf'>('ai');

  const handleLoginSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsLoggingIn(true);
    setTimeout(() => {
      setIsLoggingIn(false);
      setLoginModalOpen(false);
      onLaunchDesigner();
    }, 400);
  };

  return (
    <div
      id="home-landing-root"
      className="min-h-screen bg-[#050816] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden bg-grid-pattern"
    >
      {/* Dynamic Ambient Background Glows spanning full sides */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-[30rem] h-[30rem] bg-teal-500/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-indigo-500/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* 1. Full-Width Responsive Navigation Bar */}
      <header
        id="home-navbar"
        className="h-16 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-4 sm:px-8 lg:px-12 flex items-center justify-between z-30 sticky top-0"
      >
        {/* Brand with Status */}
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-cyan-950 to-slate-900 border border-cyan-500/40 text-cyan-400 shadow-md shadow-cyan-950/60">
            <Network className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-lg sm:text-xl font-extrabold tracking-tight text-white font-sans">
              NetRoute<span className="text-cyan-400 font-mono">AI</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-300 border border-cyan-800 font-semibold">
              v2.4 Enterprise
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          <button
            id="nav-login-btn"
            onClick={() => setLoginModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 text-xs font-bold shadow-md shadow-cyan-500/20 hover:shadow-cyan-500/40 transition-all cursor-pointer"
          >
            <LogIn className="w-4 h-4" />
            <span>Login to NetRouteAI</span>
          </button>
        </div>
      </header>

      {/* 2. Expansive Widescreen Hero Section - Filling the page sides */}
      <main className="flex-1 flex flex-col w-full max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-10 py-8 lg:py-12">
        {/* Top Centered Headline */}
        <div className="text-center max-w-4xl mx-auto mb-10">
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-cyan-950/80 border border-cyan-500/40 text-cyan-300 text-xs font-mono mb-5 shadow-sm shadow-cyan-950/50">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            <span className="font-semibold tracking-wide">Visual Topology Simulation & AI Predictive Routing</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.15]">
            Build, Configure & Simulate Networks{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400">
              Visually with AI
            </span>
          </h1>

          <p className="mt-5 text-sm sm:text-base text-slate-300 max-w-3xl mx-auto leading-relaxed font-normal">
            NetRouteAI combines traditional networking with Artificial Intelligence by allowing users to create enterprise network topologies, automate deployment using Docker and FRRouting, compare OSPF routing with AI-based routing algorithms, analyze network metrics, and recommend the optimal path based on performance.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              id="hero-login-entry-btn"
              onClick={() => setLoginModalOpen(true)}
              className="group flex items-center space-x-2.5 px-8 py-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-sm shadow-xl shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all duration-200 cursor-pointer active:scale-98"
            >
              <LogIn className="w-4 h-4 text-slate-950" />
              <span>Login to NetRouteAI</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>

            <button
              id="hero-demo-entry-btn"
              onClick={() => onLaunchDesigner()}
              className="flex items-center space-x-2 px-6 py-3.5 rounded-xl bg-slate-900/90 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500/60 text-slate-200 text-sm font-semibold transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <span>Instant Demo Access</span>
            </button>
          </div>
        </div>

        {/* 3-Column Widescreen Showcase: Fills the left, center, and right sides */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full items-stretch">
          
          {/* LEFT SIDE COLUMN: Container Automation & Device Stack (3 cols on lg) */}
          <div className="lg:col-span-3 flex flex-col space-y-4">
            {/* Docker & FRRouting Status Card */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-xl flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 pb-2.5 border-b border-slate-800 text-xs font-mono text-cyan-400 font-semibold">
                  <Box className="w-4 h-4 text-cyan-400" />
                  <span>Docker & FRRouting Stack</span>
                </div>

                <div className="mt-3 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                    <span className="text-slate-400 font-mono">Routing Daemons:</span>
                    <span className="text-emerald-400 font-bold font-mono">ospfd / bgpd</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                    <span className="text-slate-400 font-mono">Convergence:</span>
                    <span className="text-cyan-300 font-bold font-mono">&lt; 0.4ms</span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-slate-950/70 border border-slate-800/80">
                    <span className="text-slate-400 font-mono">Isolated Bridges:</span>
                    <span className="text-slate-200 font-mono">br-net0 ... br-net4</span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono">
                Multi-node virtual network isolation with live kernel packet forwarding.
              </div>
            </div>

            {/* Device Catalog Preview Card */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-xl space-y-3">
              <div className="text-xs font-mono font-semibold text-slate-300 flex items-center gap-2">
                <Server className="w-4 h-4 text-teal-400" />
                <span>Enterprise Device Catalog</span>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-200">Cisco ISR 2911</span>
                  <span className="text-[10px] text-cyan-400 bg-cyan-950 px-1.5 py-0.5 rounded border border-cyan-800">Router</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-200">Catalyst 2960-24TT</span>
                  <span className="text-[10px] text-teal-400 bg-teal-950 px-1.5 py-0.5 rounded border border-teal-800">Switch</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-950/70 border border-slate-800 flex items-center justify-between">
                  <span className="text-slate-200">Workstation Host</span>
                  <span className="text-[10px] text-slate-400 bg-slate-900 px-1.5 py-0.5 rounded border border-slate-800">PC Node</span>
                </div>
              </div>
            </div>
          </div>

          {/* CENTER STAGE: Live Interactive Topology Simulation (6 cols on lg) */}
          <div className="lg:col-span-6 flex flex-col">
            <div className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-2xl relative overflow-hidden flex flex-col h-full justify-between">
              {/* Card Header with Mode Toggle */}
              <div className="flex flex-wrap items-center justify-between pb-3.5 border-b border-slate-800 text-xs font-mono gap-2">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-500/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
                  <span className="ml-2 text-slate-200 font-semibold">Live Simulation Canvas</span>
                </div>
                
                <div className="flex items-center bg-slate-950 p-0.5 rounded-lg border border-slate-800">
                  <button
                    onClick={() => setActiveTabPreview('ai')}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                      activeTabPreview === 'ai'
                        ? 'bg-cyan-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    AI Predictive
                  </button>
                  <button
                    onClick={() => setActiveTabPreview('ospf')}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                      activeTabPreview === 'ospf'
                        ? 'bg-slate-800 text-cyan-300 font-bold'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    Standard OSPF
                  </button>
                </div>
              </div>

              {/* Topology Diagram Node Graph */}
              <div className="py-8 px-2 flex flex-wrap items-center justify-center gap-3 sm:gap-6 font-mono text-xs my-auto">
                {/* Node 1: PC1 */}
                <div className="flex flex-col items-center space-y-1.5">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-700 text-cyan-400 shadow-md">
                    <Radio className="w-5 h-5 text-cyan-400" />
                  </div>
                  <span className="font-bold text-slate-200 text-xs">PC-1</span>
                  <span className="text-[10px] text-slate-400">192.168.1.10</span>
                </div>

                {/* Link 1 */}
                <div className="flex items-center text-cyan-500">
                  <span className="h-0.5 w-6 sm:w-10 bg-gradient-to-r from-cyan-500 to-teal-400 animate-pulse" />
                  <ArrowRight className="w-3.5 h-3.5 -ml-1 text-teal-400" />
                </div>

                {/* Node 2: Switch 1 */}
                <div className="flex flex-col items-center space-y-1.5">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-700 text-teal-400 shadow-md">
                    <Layers className="w-5 h-5 text-teal-400" />
                  </div>
                  <span className="font-bold text-slate-200 text-xs">SW-2960</span>
                  <span className="text-[10px] text-slate-400">VLAN 10</span>
                </div>

                {/* Link 2 */}
                <div className="flex items-center text-teal-400">
                  <span className="h-0.5 w-6 sm:w-10 bg-gradient-to-r from-teal-400 to-emerald-400 animate-pulse" />
                  <ArrowRight className="w-3.5 h-3.5 -ml-1 text-emerald-400" />
                </div>

                {/* Node 3: Core Router */}
                <div className="flex flex-col items-center space-y-1.5">
                  <div className={`p-3.5 rounded-xl bg-slate-950 border text-emerald-400 shadow-lg ${
                    activeTabPreview === 'ai' ? 'border-cyan-400 shadow-cyan-950/60' : 'border-slate-700'
                  }`}>
                    <Network className="w-5 h-5 text-emerald-400" />
                  </div>
                  <span className="font-bold text-slate-200 text-xs">R1-2911</span>
                  <span className="text-[10px] text-cyan-300 font-semibold">
                    {activeTabPreview === 'ai' ? 'AI Optimized' : 'OSPF Cost: 10'}
                  </span>
                </div>

                {/* Link 3 */}
                <div className="flex items-center text-emerald-400">
                  <span className="h-0.5 w-6 sm:w-10 bg-gradient-to-r from-emerald-400 to-cyan-400 animate-pulse" />
                  <ArrowRight className="w-3.5 h-3.5 -ml-1 text-cyan-400" />
                </div>

                {/* Node 4: Gateway Cloud */}
                <div className="flex flex-col items-center space-y-1.5">
                  <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-700 text-cyan-300 shadow-md">
                    <Terminal className="w-5 h-5 text-cyan-300" />
                  </div>
                  <span className="font-bold text-slate-200 text-xs">Gateway</span>
                  <span className="text-[10px] text-slate-400">10.0.0.1</span>
                </div>
              </div>

              {/* Performance Comparison Strip */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-mono grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Routing Metric</div>
                  <div className="text-cyan-400 font-bold mt-0.5">
                    {activeTabPreview === 'ai' ? 'Predictive Jitter' : 'Static Hop Cost'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Simulated Latency</div>
                  <div className="text-emerald-400 font-bold mt-0.5">
                    {activeTabPreview === 'ai' ? '12.4 ms (-34%)' : '18.8 ms'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-slate-500 uppercase">Packet Loss</div>
                  <div className="text-teal-400 font-bold mt-0.5">0.00%</div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE COLUMN: AI Predictive Engine & Cisco CLI Terminal (3 cols on lg) */}
          <div className="lg:col-span-3 flex flex-col space-y-4">
            {/* AI Optimization Telemetry Deck */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-xl flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center space-x-2 pb-2.5 border-b border-slate-800 text-xs font-mono text-emerald-400 font-semibold">
                  <Zap className="w-4 h-4 text-emerald-400" />
                  <span>AI Telemetry Engine</span>
                </div>

                <div className="mt-3 space-y-2.5 text-xs font-mono">
                  <div>
                    <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                      <span>Latency Reduction</span>
                      <span className="text-emerald-400 font-bold">-34.2%</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div className="w-3/4 h-full bg-gradient-to-r from-teal-500 to-emerald-400 rounded-full" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                      <span>Jitter Stability</span>
                      <span className="text-cyan-300 font-bold">0.8 ms</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div className="w-[88%] h-full bg-gradient-to-r from-cyan-500 to-teal-400 rounded-full" />
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-slate-400 text-[11px] mb-1">
                      <span>Congestion Avoidance</span>
                      <span className="text-teal-300 font-bold">Active</span>
                    </div>
                    <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden">
                      <div className="w-[95%] h-full bg-cyan-400 rounded-full" />
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800/80 text-[11px] text-slate-400 font-mono">
                Multi-objective reinforcement model computes optimal forwarding paths.
              </div>
            </div>

            {/* Cisco CLI Quick Card */}
            <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/90 shadow-xl space-y-2">
              <div className="text-xs font-mono font-semibold text-slate-300 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-cyan-400" />
                  <span>Cisco IOS Terminal</span>
                </div>
                <span className="text-[10px] text-emerald-400 font-mono">READY</span>
              </div>
              <div className="p-2.5 rounded-lg bg-black text-emerald-400 font-mono text-[10px] leading-relaxed border border-slate-800">
                <p className="text-slate-500"># show ip route ospf</p>
                <p>O 192.168.2.0/24 [110/2] via 10.0.0.2</p>
                <p>O 10.0.0.0/30 [110/1] via Gi0/0</p>
                <p className="text-cyan-400">Router(config)# _</p>
              </div>
            </div>
          </div>
        </div>

        {/* 4-Card Expansive Full-Width Bento Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-cyan-500/50 transition-all space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-950 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Compass className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-100 font-sans">Visual Topology Designer</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Drag-and-drop Cisco 2911 ISR routers, Catalyst 2960 switches, and PC workstations with automatic port compatibility checks and smooth cable routing.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-teal-500/50 transition-all space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-teal-950 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Box className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-100 font-sans">Docker & FRRouting</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Automate multi-node Linux network topologies inside containerized environments with high-performance OSPF and BGP routing daemons.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-emerald-500/50 transition-all space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-950 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-100 font-sans">OSPF vs AI Path Routing</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Hop-by-hop packet simulation comparing classical Dijkstra SPF with AI predictive path routing across latency, jitter, packet loss, and throughput.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-slate-900/60 border border-slate-800/90 hover:border-indigo-500/50 transition-all space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-950 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
              <Terminal className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-100 font-sans">Cisco IOS CLI & Config</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Access real Cisco terminal modes: privilege level escalation, interface ip address assignments, no shutdown, running-config, and ICMP tests.
            </p>
          </div>
        </div>
      </main>

      {/* Modern High-Tech Footer */}
      <footer className="py-6 border-t border-slate-800/80 bg-slate-950/60 text-xs text-slate-500 font-mono text-center">
        <div className="max-w-[1440px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>NetRouteAI • Visual Network Topology Designer & AI Packet Simulator</span>
          <span className="text-slate-400">RFC 2328 OSPF • FRRouting • Cisco IOS Compatible</span>
        </div>
      </footer>

      {/* 3. The Login Modal / Page Entry Point */}
      {loginModalOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div
            id="login-dialog"
            className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 relative"
          >
            {/* Close Button */}
            <button
              onClick={() => setLoginModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Login Header */}
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 rounded-2xl bg-cyan-950 border border-cyan-500/40 text-cyan-400 shadow-lg">
                <Network className="w-6 h-6 text-cyan-400" />
              </div>
              <h2 className="text-xl font-bold text-white tracking-tight">Login to NetRouteAI</h2>
              <p className="text-xs text-slate-400">
                Enter your credentials or click instant access to launch the Network Designer workspace.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1 text-left">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Email Address</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  placeholder="engineer@netroute.ai"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-cyan-400" />
                  <span>Password</span>
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-cyan-500 font-mono"
                  placeholder="••••••••••••"
                />
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-400 hover:from-cyan-400 hover:to-teal-300 text-slate-950 font-bold text-xs shadow-lg shadow-cyan-500/20 transition-all cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isLoggingIn ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Signing In...</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Sign In & Launch Designer</span>
                  </>
                )}
              </button>
            </form>

            {/* Instant Demo Access Button */}
            <div className="pt-2 border-t border-slate-800 text-center">
              <button
                type="button"
                onClick={() => handleLoginSubmit()}
                className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 underline underline-offset-4 cursor-pointer"
              >
                Instant Access as Demo Network Engineer →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

