import React, { useCallback, useEffect, useState } from 'react';
import {
  Network,
  ArrowRight,
  LogIn,
  Lock,
  Mail,
  Zap,
  Terminal,
  Layers,
  X,
  Compass,
  Radio,
  Server,
  Box,
  Sparkles,
  Loader2,
  ServerOff,
  TriangleAlert,
} from 'lucide-react';
import {
  getLabStatus,
  getDatasetStats,
  getOspfAreas,
  type DatasetStats,
  type LabStatus,
  type OspfAreaInventory,
} from '../../utils/api';

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

  // Real state of the lab and of the trained model, read from the backend.
  //
  // This page used to show a convergence time of "< 0.4ms", a bridge list of
  // "br-net0 ... br-net4", a latency of "18.8 ms" beside an AI figure of
  // "12.4 ms (-34%)", and a jitter of "0.8 ms" -- none of which came from
  // anywhere. A landing page is the first thing anyone sees and it was making
  // specific performance claims about a lab that had not been asked anything.
  // Everything below is either a fact read back from a running lab or an
  // explicit statement that there is nothing to read yet.
  const [lab, setLab] = useState<LabStatus | null>(null);
  const [areas, setAreas] = useState<OspfAreaInventory | null>(null);
  const [dataset, setDataset] = useState<DatasetStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    setStatusError(null);
    // Each read is independent: a lab that is down must not hide the model
    // stats, and a missing area readout must not hide the device count.
    const [labResult, areaResult, datasetResult] = await Promise.allSettled([
      getLabStatus(),
      getOspfAreas(),
      getDatasetStats(),
    ]);
    setLab(labResult.status === 'fulfilled' ? labResult.value : null);
    setAreas(areaResult.status === 'fulfilled' ? areaResult.value : null);
    setDataset(datasetResult.status === 'fulfilled' ? datasetResult.value : null);
    if (labResult.status === 'rejected') {
      setStatusError(labResult.reason instanceof Error ? labResult.reason.message : String(labResult.reason));
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

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
      className="min-h-screen bg-base text-ink flex flex-col font-sans selection:bg-accent/30 selection:text-accent relative overflow-x-hidden bg-grid-pattern"
    >
      {/* Dynamic Ambient Background Glows spanning full sides */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-accent/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute top-1/3 right-10 w-[30rem] h-[30rem] bg-info/10 rounded-full blur-3xl pointer-events-none -z-10" />
      <div className="absolute bottom-10 left-10 w-96 h-96 bg-info/10 rounded-full blur-3xl pointer-events-none -z-10" />

      {/* 1. Full-Width Responsive Navigation Bar */}
      <header
        id="home-navbar"
        className="h-16 border-b border-line/80 bg-panel/80 backdrop-blur-md px-4 sm:px-8 lg:px-12 flex items-center justify-between z-30 sticky top-0"
      >
        {/* Brand with Status */}
        <div className="flex items-center space-x-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-accent-soft to-base border border-accent/40 text-accent shadow-md shadow-lift-strong">
            <Network className="w-5 h-5 text-accent" />
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-lg sm:text-xl font-extrabold tracking-tight text-ink font-sans">
              NetRoute<span className="text-accent font-mono">AI</span>
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent font-semibold">
              v2.4 Enterprise
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          <button
            id="nav-login-btn"
            onClick={() => setLoginModalOpen(true)}
            className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-accent to-info hover:from-accent hover:to-info text-accent-ink text-xs font-bold shadow-md shadow-lift hover:shadow-lift-strong transition-all cursor-pointer"
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
          <div className="inline-flex items-center space-x-2 px-3.5 py-1.5 rounded-full bg-accent-soft/80 border border-accent/40 text-accent text-xs font-mono mb-5 shadow-sm shadow-lift-strong">
            <span className="w-2 h-2 rounded-full bg-accent animate-pulse" />
            <span className="font-semibold tracking-wide">Visual Topology Simulation & AI Predictive Routing</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-black text-ink tracking-tight leading-[1.15]">
            Build, Configure & Simulate Networks{' '}
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-accent via-info to-ok">
              Visually with AI
            </span>
          </h1>

          <p className="mt-5 text-sm sm:text-base text-ink-soft max-w-3xl mx-auto leading-relaxed font-normal">
            NetRouteAI combines traditional networking with Artificial Intelligence by allowing users to create enterprise network topologies, automate deployment using Docker and FRRouting, compare OSPF routing with AI-based routing algorithms, analyze network metrics, and recommend the optimal path based on performance.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              id="hero-login-entry-btn"
              onClick={() => setLoginModalOpen(true)}
              className="group flex items-center space-x-2.5 px-8 py-3.5 rounded-xl bg-gradient-to-r from-accent to-info hover:from-accent hover:to-info text-accent-ink font-bold text-sm shadow-xl shadow-lift hover:shadow-lift-strong transition-all duration-200 cursor-pointer active:scale-98"
            >
              <LogIn className="w-4 h-4 text-accent-ink" />
              <span>Login to NetRouteAI</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>

            <button
              id="hero-demo-entry-btn"
              onClick={() => onLaunchDesigner()}
              className="flex items-center space-x-2 px-6 py-3.5 rounded-xl bg-panel/90 hover:bg-raised border border-line/80 hover:border-accent/60 text-ink text-sm font-semibold transition-all cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-accent" />
              <span>Instant Demo Access</span>
            </button>
          </div>
        </div>

        {/* 3-Column Widescreen Showcase: Fills the left, center, and right sides */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full items-stretch">
          
          {/* LEFT SIDE COLUMN: Container Automation & Device Stack (3 cols on lg) */}
          <div className="lg:col-span-3 flex flex-col space-y-4">
            {/* Docker & FRRouting Status Card -- everything read from the lab */}
            <div className="p-4 rounded-2xl bg-panel/80 border border-line/90 shadow-xl flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between space-x-2 pb-2.5 border-b border-line text-xs font-mono text-accent font-semibold">
                  <span className="flex items-center space-x-2">
                    <Box className="w-4 h-4 text-accent" />
                    <span>Docker &amp; FRRouting Stack</span>
                  </span>
                  {loading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-ink-faint" />
                  ) : (
                    <span
                      className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${
                        lab?.online
                          ? 'text-ok border-ok/40 bg-ok/10'
                          : 'text-ink-muted border-line bg-panel'
                      }`}
                    >
                      {lab?.online ? 'running' : 'not running'}
                    </span>
                  )}
                </div>

                {statusError && (
                  <div className="mt-3 flex items-start gap-1.5 p-2 rounded-lg bg-bad/10 border border-bad/30">
                    <TriangleAlert className="w-3.5 h-3.5 text-bad shrink-0 mt-0.5" />
                    <span className="text-[10px] text-ink-muted font-mono break-words">{statusError}</span>
                  </div>
                )}

                <div className="mt-3 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between p-2 rounded-lg bg-panel/70 border border-line/80">
                    <span className="text-ink-muted font-mono">Devices up:</span>
                    <span className="text-ok font-bold font-mono">
                      {lab?.online ? `${lab.device_count}` : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-panel/70 border border-line/80">
                    <span className="text-ink-muted font-mono">Links:</span>
                    <span className="text-ink font-mono">
                      {lab?.online
                        ? `${lab.link_count} (${lab.transit_links} transit, ${lab.lan_links} LAN)`
                        : '—'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-panel/70 border border-line/80">
                    <span className="text-ink-muted font-mono">OSPF areas:</span>
                    <span className="text-ink font-mono">
                      {areas?.areas?.length
                        ? `${areas.areas.length} (${areas.areas.join(', ')})`
                        : lab?.online
                          ? '—'
                          : 'no lab'}
                    </span>
                  </div>
                  <div className="flex items-center justify-between p-2 rounded-lg bg-panel/70 border border-line/80">
                    <span className="text-ink-muted font-mono">ABRs:</span>
                    <span className="text-ink font-mono">
                      {areas?.abrs?.length ? areas.abrs.join(', ') : '—'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-line/80 text-[11px] text-ink-muted font-mono">
                Areas and ABRs are read from <span className="text-ink-faint">show ip ospf interface</span> on
                the running routers. Convergence time is measured on demand, on the Analytics page, by
                cutting a link and timing the failover.
              </div>
            </div>

            {/* Device Catalog Preview Card */}
            <div className="p-4 rounded-2xl bg-panel/80 border border-line/90 shadow-xl space-y-3">
              <div className="text-xs font-mono font-semibold text-ink-soft flex items-center gap-2">
                <Server className="w-4 h-4 text-info" />
                <span>Enterprise Device Catalog</span>
              </div>
              <div className="space-y-2 text-xs font-mono">
                <div className="p-2 rounded-lg bg-panel/70 border border-line flex items-center justify-between">
                  <span className="text-ink">Cisco ISR 2911</span>
                  <span className="text-[10px] text-accent bg-accent-soft px-1.5 py-0.5 rounded border border-accent">Router</span>
                </div>
                <div className="p-2 rounded-lg bg-panel/70 border border-line flex items-center justify-between">
                  <span className="text-ink">Catalyst 2960-24TT</span>
                  <span className="text-[10px] text-info bg-info-soft px-1.5 py-0.5 rounded border border-info">Switch</span>
                </div>
                <div className="p-2 rounded-lg bg-panel/70 border border-line flex items-center justify-between">
                  <span className="text-ink">Workstation Host</span>
                  <span className="text-[10px] text-ink-muted bg-panel px-1.5 py-0.5 rounded border border-line">PC Node</span>
                </div>
              </div>
            </div>
          </div>

          {/* CENTER STAGE: Live Interactive Topology Simulation (6 cols on lg) */}
          <div className="lg:col-span-6 flex flex-col">
            <div className="p-5 rounded-2xl bg-panel/90 border border-line shadow-2xl relative overflow-hidden flex flex-col h-full justify-between">
              {/* Card Header with Mode Toggle */}
              <div className="flex flex-wrap items-center justify-between pb-3.5 border-b border-line text-xs font-mono gap-2">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-bad/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-warn/70" />
                  <span className="w-2.5 h-2.5 rounded-full bg-ok/70" />
                  <span className="ml-2 text-ink font-semibold">Live Simulation Canvas</span>
                </div>
                
                <div className="flex items-center bg-panel p-0.5 rounded-lg border border-line">
                  <button
                    onClick={() => setActiveTabPreview('ai')}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                      activeTabPreview === 'ai'
                        ? 'bg-accent text-accent-ink font-bold shadow-sm'
                        : 'text-ink-muted hover:text-ink'
                    }`}
                  >
                    AI Predictive
                  </button>
                  <button
                    onClick={() => setActiveTabPreview('ospf')}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono transition-colors cursor-pointer ${
                      activeTabPreview === 'ospf'
                        ? 'bg-panel text-accent font-bold'
                        : 'text-ink-muted hover:text-ink'
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
                  <div className="p-3.5 rounded-xl bg-panel border border-line text-accent shadow-md">
                    <Radio className="w-5 h-5 text-accent" />
                  </div>
                  <span className="font-bold text-ink text-xs">PC-1</span>
                  <span className="text-[10px] text-ink-muted">a host on a LAN</span>
                </div>

                {/* Link 1 */}
                <div className="flex items-center text-accent">
                  <span className="h-0.5 w-6 sm:w-10 bg-gradient-to-r from-accent to-info animate-pulse" />
                  <ArrowRight className="w-3.5 h-3.5 -ml-1 text-info" />
                </div>

                {/* Node 2: Switch 1 */}
                <div className="flex flex-col items-center space-y-1.5">
                  <div className="p-3.5 rounded-xl bg-panel border border-line text-info shadow-md">
                    <Layers className="w-5 h-5 text-info" />
                  </div>
                  <span className="font-bold text-ink text-xs">SW-2960</span>
                  <span className="text-[10px] text-ink-muted">one access VLAN</span>
                </div>

                {/* Link 2 */}
                <div className="flex items-center text-info">
                  <span className="h-0.5 w-6 sm:w-10 bg-gradient-to-r from-info to-ok animate-pulse" />
                  <ArrowRight className="w-3.5 h-3.5 -ml-1 text-ok" />
                </div>

                {/* Node 3: Core Router */}
                <div className="flex flex-col items-center space-y-1.5">
                  <div className={`p-3.5 rounded-xl bg-panel border text-ok shadow-lg ${
                    activeTabPreview === 'ai' ? 'border-accent shadow-lift-strong' : 'border-line'
                  }`}>
                    <Network className="w-5 h-5 text-ok" />
                  </div>
                  <span className="font-bold text-ink text-xs">R1-2911</span>
                  <span className="text-[10px] text-accent font-semibold">
                    {activeTabPreview === 'ai' ? 'AI path selected' : 'OSPF path selected'}
                  </span>
                </div>

                {/* Link 3 */}
                <div className="flex items-center text-ok">
                  <span className="h-0.5 w-6 sm:w-10 bg-gradient-to-r from-ok to-accent animate-pulse" />
                  <ArrowRight className="w-3.5 h-3.5 -ml-1 text-accent" />
                </div>

                {/* Node 4: Gateway Cloud */}
                <div className="flex flex-col items-center space-y-1.5">
                  <div className="p-3.5 rounded-xl bg-panel border border-line text-accent shadow-md">
                    <Terminal className="w-5 h-5 text-accent" />
                  </div>
                  <span className="font-bold text-ink text-xs">Destination</span>
                  <span className="text-[10px] text-ink-muted">beyond the lab</span>
                </div>
              </div>

              {/* An illustration of the two methods, deliberately carrying no numbers.
                  The real figures are measured per pair and printed with the command
                  that produced them on the Analytics page. */}
              <p className="mt-1 text-[10px] font-mono text-ink-faint text-center">
                Illustration only — the addresses and metrics on a real run come from the lab.
              </p>

              {/* What the toggle is actually choosing between -- no invented figures. */}
              <div className="p-3 rounded-xl bg-panel/80 border border-line text-xs font-mono grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-ink-muted uppercase">Method</div>
                  <div className="text-accent font-bold mt-0.5">
                    {activeTabPreview === 'ai' ? 'Random Forest' : 'OSPF'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-ink-muted uppercase">Chosen by</div>
                  <div className="text-ink font-bold mt-0.5">
                    {activeTabPreview === 'ai' ? 'measured features' : 'interface cost'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-ink-muted uppercase">Effect</div>
                  <div className="text-info font-bold mt-0.5">static routes</div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE COLUMN: AI Predictive Engine & Cisco CLI Terminal (3 cols on lg) */}
          <div className="lg:col-span-3 flex flex-col space-y-4">
            {/* The trained model, described by what it has actually been given */}
            <div className="p-4 rounded-2xl bg-panel/80 border border-line/90 shadow-xl flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between space-x-2 pb-2.5 border-b border-line text-xs font-mono text-ok font-semibold">
                  <span className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-ok" />
                    <span>Random Forest Model</span>
                  </span>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded border font-bold ${
                      dataset?.ready_for_training
                        ? 'text-ok border-ok/40 bg-ok/10'
                        : 'text-warn border-warn/40 bg-warn/10'
                    }`}
                  >
                    {dataset?.ready_for_training ? 'ready' : 'needs rows'}
                  </span>
                </div>

                {dataset ? (
                  <div className="mt-3 space-y-2.5 text-xs font-mono">
                    <div className="flex items-center justify-between p-2 rounded-lg bg-panel/70 border border-line/80">
                      <span className="text-ink-muted">Training rows:</span>
                      <span className="text-ok font-bold">{dataset.total}</span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-panel/70 border border-line/80">
                      <span className="text-ink-muted">Measured:</span>
                      <span className="text-ink font-bold">
                        {dataset.measured} ({(dataset.measured_ratio * 100).toFixed(0)}%)
                      </span>
                    </div>
                    <div className="flex items-center justify-between p-2 rounded-lg bg-panel/70 border border-line/80">
                      <span className="text-ink-muted">Balanced seed:</span>
                      <span className="text-ink font-bold">{dataset.synthetic}</span>
                    </div>
                    <div>
                      <div className="flex justify-between text-ink-muted text-[11px] mb-1">
                        <span>Class balance</span>
                        <span className="text-ink font-bold">{Object.keys(dataset.labels).length} classes</span>
                      </div>
                      <div className="space-y-1">
                        {Object.entries(dataset.labels).map(([label, n]) => (
                          <div key={label} className="flex items-center gap-2">
                            <span className="text-[10px] text-ink-faint w-10 shrink-0">{label}</span>
                            <div className="flex-1 h-1.5 bg-panel rounded-full overflow-hidden">
                              <div
                                className="h-full bg-gradient-to-r from-info to-ok rounded-full"
                                style={{
                                  width: `${
                                    dataset.total
                                      ? Math.max(2, (n / Math.max(...Object.values(dataset.labels))) * 100)
                                      : 0
                                  }%`,
                                }}
                              />
                            </div>
                            <span className="text-[10px] text-ink-muted w-8 text-right">{n}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="mt-3 flex items-start gap-1.5 p-2 rounded-lg bg-warn/10 border border-warn/30">
                    <ServerOff className="w-3.5 h-3.5 text-warn shrink-0 mt-0.5" />
                    <span className="text-[10px] text-ink-muted font-mono">
                      {loading ? 'Reading the model store…' : 'No dataset read yet.'}
                    </span>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-3 border-t border-line/80 text-[11px] text-ink-muted font-mono">
                Counts are from <span className="text-ink-faint">GET /api/dataset</span>. What the model
                contributes to a figure — and what it does not — is spelled out per measurement on the
                Analytics page.
              </div>
            </div>

            {/* CLI card -- no invented transcript */}
            <div className="p-4 rounded-2xl bg-panel/80 border border-line/90 shadow-xl space-y-2">
              <div className="text-xs font-mono font-semibold text-ink-soft flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-accent" />
                  <span>Router Terminal</span>
                </div>
                <span className="text-[10px] text-ink-muted font-mono">
                  {lab?.online ? 'lab up' : 'no lab'}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-base text-ink-muted font-mono text-[10px] leading-relaxed border border-line">
                {lab?.online ? (
                  <>
                    <p className="text-ink-faint">Open any router in the designer to run commands.</p>
                    <p className="text-ink-faint">
                      <span className="text-ok">ping</span> runs for real from that router&apos;s container
                      and prints the command&apos;s own output.
                    </p>
                    <p className="text-ink-faint">
                      Available now:{' '}
                      {lab.devices
                        .filter((d) => d.type === 'router')
                        .slice(0, 8)
                        .map((d) => d.id)
                        .join(', ')}
                    </p>
                  </>
                ) : (
                  <p className="text-ink-faint">
                    Nothing to run commands against. Build the topology you drew and the routers become
                    real containers you can ping from.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* 4-Card Expansive Full-Width Bento Grid */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 w-full">
          <div className="p-5 rounded-2xl bg-panel/60 border border-line/90 hover:border-accent/50 transition-all space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-accent-soft border border-accent/30 flex items-center justify-center text-accent">
              <Compass className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-ink font-sans">Visual Topology Designer</h3>
            <p className="text-xs text-ink-muted leading-relaxed">
              Drag-and-drop Cisco 2911 ISR routers, Catalyst 2960 switches, and PC workstations with automatic port compatibility checks and smooth cable routing.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-panel/60 border border-line/90 hover:border-info/50 transition-all space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-info-soft border border-info/30 flex items-center justify-center text-info">
              <Box className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-ink font-sans">Docker &amp; FRRouting</h3>
            <p className="text-xs text-ink-muted leading-relaxed">
              The topology you draw becomes real routers in isolated containers running FRR, configured
              with the same addresses, costs and OSPF areas shown on the canvas.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-panel/60 border border-line/90 hover:border-ok/50 transition-all space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-ok-soft border border-ok/30 flex items-center justify-center text-ok">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-ink font-sans">OSPF vs AI Path Routing</h3>
            <p className="text-xs text-ink-muted leading-relaxed">
              Compare the path OSPF actually forwards against the one a Random Forest picks, on latency,
              jitter, loss, hop count and throughput — each read from the routers themselves.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-panel/60 border border-line/90 hover:border-info/50 transition-all space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-info-soft border border-info/30 flex items-center justify-center text-info">
              <Terminal className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-ink font-sans">Router CLI &amp; Config</h3>
            <p className="text-xs text-ink-muted leading-relaxed">
              A per-device terminal for interface addresses and admin state, with a real <span className="font-mono">ping</span>{' '}
              that runs from that router&apos;s container and prints the command&apos;s own output.
            </p>
          </div>
        </div>
      </main>

      {/* Modern High-Tech Footer */}
      <footer className="py-6 border-t border-line/80 bg-panel/60 text-xs text-ink-muted font-mono text-center">
        <div className="max-w-[1440px] mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>NetRouteAI • Visual Network Topology Designer & AI Packet Simulator</span>
          <span className="text-ink-muted">RFC 2328 OSPF • FRRouting • Cisco IOS Compatible</span>
        </div>
      </footer>

      {/* 3. The Login Modal / Page Entry Point */}
      {loginModalOpen && (
        <div className="fixed inset-0 bg-panel/85 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div
            id="login-dialog"
            className="w-full max-w-md bg-panel border border-line rounded-2xl shadow-2xl p-6 space-y-5 relative"
          >
            {/* Close Button */}
            <button
              onClick={() => setLoginModalOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-lg text-ink-muted hover:text-accent hover:bg-raised transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>

            {/* Login Header */}
            <div className="text-center space-y-2">
              <div className="inline-flex p-3 rounded-2xl bg-accent-soft border border-accent/40 text-accent shadow-lg">
                <Network className="w-6 h-6 text-accent" />
              </div>
              <h2 className="text-xl font-bold text-ink tracking-tight">Login to NetRouteAI</h2>
              <p className="text-xs text-ink-muted">
                Enter your credentials or click instant access to launch the Network Designer workspace.
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1 text-left">
                <label className="text-xs font-medium text-ink-soft flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-accent" />
                  <span>Email Address</span>
                </label>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full px-3 py-2 bg-panel border border-line/80 rounded-xl text-xs text-ink focus:outline-none focus:border-accent font-mono"
                  placeholder="engineer@netroute.ai"
                />
              </div>

              <div className="space-y-1 text-left">
                <label className="text-xs font-medium text-ink-soft flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-accent" />
                  <span>Password</span>
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 bg-panel border border-line/80 rounded-xl text-xs text-ink focus:outline-none focus:border-accent font-mono"
                  placeholder="••••••••••••"
                />
              </div>

              {/* Login Button */}
              <button
                type="submit"
                disabled={isLoggingIn}
                className="w-full py-2.5 rounded-xl bg-gradient-to-r from-accent to-info hover:from-accent hover:to-info text-accent-ink font-bold text-xs shadow-lg shadow-lift transition-all cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50"
              >
                {isLoggingIn ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-line border-t-transparent rounded-full animate-spin" />
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
            <div className="pt-2 border-t border-line text-center">
              <button
                type="button"
                onClick={() => handleLoginSubmit()}
                className="text-xs font-semibold text-accent hover:text-accent underline underline-offset-4 cursor-pointer"
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

