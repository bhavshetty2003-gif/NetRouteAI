import React, { useState } from 'react';
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
} from 'lucide-react';
import { ProfileMenu } from '../ProfileMenu';
import type { AuthUser } from '../../utils/auth';
interface HomeViewProps {
  onLaunchDesigner: () => void;
  /** Opens the real sign-in / register overlay. */
  onOpenAuth: () => void;
  /** The signed-in account, so the header can show it and offer sign-out. */
  user: AuthUser | null;
  /** Persists an edit made in the profile menu. */
  onUserUpdated: (user: AuthUser) => void;
  onSignOut: () => void;
  onOpenDocs?: () => void;
  onOpenAnalytics?: () => void;
}

export const HomeView: React.FC<HomeViewProps> = ({
  onLaunchDesigner,
  onOpenAuth,
  user,
  onUserUpdated,
  onSignOut,
}) => {
  const [activeTabPreview, setActiveTabPreview] = useState<'ai' | 'ospf'>('ai');

  /* This page deliberately reads nothing from the backend.
   *
   * It used to, and that made the landing page describe one person's lab rather
   * than the product: whoever deployed last decided what a stranger saw on their
   * first visit, including their router IDs, their area count and their ABRs.
   * Two accounts, one machine, two different home pages.
   *
   * It also used to show a convergence time of "< 0.4ms", a bridge list of
   * "br-net0 ... br-net4", a latency of "18.8 ms" beside an AI figure of
   * "12.4 ms (-34%)", and a jitter of "0.8 ms" -- none of which came from
   * anywhere. Replacing those with live reads fixed the fabrication but created
   * this problem, and replacing them with fresh constants would only reintroduce
   * the first one.
   *
   * So the page now carries no numbers at all. Every figure the product produces
   * is measured in the lab on demand, and the Analytics page prints the command
   * that produced each one next to it. Nothing here is a claim about a network;
   * everything here is a description of what the software does. */

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
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center space-x-3">
          {user ? (
            <ProfileMenu user={user} onUpdated={onUserUpdated} onSignOut={onSignOut} />
          ) : (
            <button
              id="nav-login-btn"
              onClick={onOpenAuth}
              className="flex items-center space-x-2 px-4 py-2 rounded-xl bg-gradient-to-r from-accent to-info hover:from-accent hover:to-info text-accent-ink text-xs font-bold shadow-md shadow-lift hover:shadow-lift-strong transition-all cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              <span>Login</span>
            </button>
          )}
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

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              id="hero-login-entry-btn"
              onClick={user ? onLaunchDesigner : onOpenAuth}
              className="group flex items-center space-x-2.5 px-8 py-3.5 rounded-xl bg-gradient-to-r from-accent to-info hover:from-accent hover:to-info text-accent-ink font-bold text-sm shadow-xl shadow-lift hover:shadow-lift-strong transition-all duration-200 cursor-pointer active:scale-98"
            >
              <LogIn className="w-4 h-4 text-accent-ink" />
              <span>{user ? 'Open the Designer' : 'Login or Register'}</span>
              <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-1" />
            </button>
          </div>
        </div>

        {/* 3-Column Widescreen Showcase: Fills the left, center, and right sides */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 w-full items-stretch">
          
          {/* LEFT SIDE COLUMN: what gets built, and from what (3 cols on lg) */}
          <div className="lg:col-span-3 flex flex-col space-y-4">
            {/* Describes what the deploy step does. No counts: how many routers
                exist depends on the topology the reader has drawn, which is
                exactly the kind of figure that does not belong here. */}
            <div className="p-4 rounded-2xl bg-panel/80 border border-line/90 shadow-xl flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between space-x-2 pb-2.5 border-b border-line text-xs font-mono text-accent font-semibold">
                  <span className="flex items-center space-x-2">
                    <Box className="w-4 h-4 text-accent" />
                    <span>Docker &amp; FRRouting Stack</span>
                  </span>
                </div>

                <ol className="mt-3 space-y-2.5 text-xs">
                  {[
                    ['Draw it', 'Every router, switch and host you place on the canvas.'],
                    ['Address it', 'Each link is allocated a real subnet by the same plan the lab will use.'],
                    ['Run it', 'One FRRouting container per device, with its own configuration.'],
                  ].map(([step, detail], index) => (
                    <li key={step} className="flex items-start gap-2.5">
                      <span className="shrink-0 w-4 h-4 rounded bg-accent-soft border border-accent/40 text-accent text-[10px] font-mono font-bold flex items-center justify-center">
                        {index + 1}
                      </span>
                      <span className="text-ink-muted leading-relaxed">
                        <span className="text-ink font-semibold">{step}.</span> {detail}
                      </span>
                    </li>
                  ))}
                </ol>
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
                  <span className="ml-2 text-ink font-semibold">How a Path Is Chosen</span>
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

              {/* What each method decides and what it decides with. The old
                  cells here were "Method / Chosen by / Effect", where "Effect"
                  read "static routes" -- correct, and jargon that made the
                  panel look like an implementation note. These say what the
                  decision is about instead. */}
              <div className="p-3 rounded-xl bg-panel/80 border border-line text-xs font-mono grid grid-cols-3 gap-2 text-center">
                <div>
                  <div className="text-[10px] text-ink-muted uppercase">Input</div>
                  <div className="text-accent font-bold mt-0.5">
                    {activeTabPreview === 'ai' ? 'live link conditions' : 'link cost you set'}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-ink-muted uppercase">Output</div>
                  <div className="text-ink font-bold mt-0.5">one forwarding path</div>
                </div>
                <div>
                  <div className="text-[10px] text-ink-muted uppercase">Compared on</div>
                  <div className="text-info font-bold mt-0.5">latency &amp; loss</div>
                </div>
              </div>
            </div>
          </div>

          {/* RIGHT SIDE COLUMN: AI Predictive Engine & Cisco CLI Terminal (3 cols on lg) */}
          <div className="lg:col-span-3 flex flex-col space-y-4">
            {/* What the model is and is not. The row counts lived here and were
                removed: they are a property of whatever data this installation
                has collected, so they told a first-time visitor about someone
                else's work rather than about the product. The Analytics page
                still prints them, where they are relevant to a result. */}
            <div className="p-4 rounded-2xl bg-panel/80 border border-line/90 shadow-xl flex-1 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between space-x-2 pb-2.5 border-b border-line text-xs font-mono text-ok font-semibold">
                  <span className="flex items-center space-x-2">
                    <Zap className="w-4 h-4 text-ok" />
                    <span>Random Forest Model</span>
                  </span>
                </div>

                <dl className="mt-3 space-y-2 text-xs">
                  {[
                    ['Predicts', 'Low / Medium / High congestion, from features read off the live link.'],
                    ['Trained on', 'Rows collected by measuring pairs under four real network conditions.'],
                    ['Ranks', 'Candidate paths by their measured latency, loss, jitter and throughput.'],
                    ['Never does', 'Invent a figure. Anything it did not measure stays marked as such.'],
                  ].map(([term, detail]) => (
                    <div key={term} className="flex items-start gap-2">
                      <dt className="text-ink font-semibold font-mono text-[11px] w-20 shrink-0 pt-px">
                        {term}
                      </dt>
                      <dd className="text-ink-muted leading-relaxed min-w-0">{detail}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>

            {/* CLI card -- describes the capability, lists no device names. The old
                version printed the router IDs of whichever lab happened to be
                running, which was the clearest case of one person's topology
                appearing on another person's home page. */}
            <div className="p-4 rounded-2xl bg-panel/80 border border-line/90 shadow-xl space-y-2">
              <div className="text-xs font-mono font-semibold text-ink-soft flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Terminal className="w-4 h-4 text-accent" />
                  <span>Router Terminal</span>
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-base text-ink-muted font-mono text-[10px] leading-relaxed border border-line">
                <p className="text-ink-faint">
                  Open any router in the designer and run commands against it. Configuration is applied
                  through <span className="text-ok">vtysh</span> to the live router itself.
                </p>
                <p className="text-ink-faint mt-1.5">
                  <span className="text-ok">ping</span> runs for real from that router&apos;s own container
                  and prints the command&apos;s own output.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* What the site does, as a workflow. This is the part a visitor cannot
            infer from a screenshot: each card below names an action, says what
            it produces, and says which measurement backs it up. */}
        <section className="mt-16" aria-labelledby="how-it-works-heading">
          <div className="max-w-2xl">
            <h2
              id="how-it-works-heading"
              className="text-2xl sm:text-3xl font-black text-ink tracking-tight"
            >
              What NetRouteAI does
            </h2>
            <p className="mt-3 text-sm text-ink-soft leading-relaxed">
              Four steps, in order. Each one produces something you can inspect.
            </p>
          </div>

          <ol className="mt-7 grid grid-cols-1 md:grid-cols-2 gap-4 w-full list-none p-0">
            {[
              {
                icon: Compass,
                title: '1. Draw the network',
                body: 'Place routers, switches and hosts on a canvas and connect them. Every link takes a cost, an OSPF area and a classful address subnet, and routers can be grouped into areas.',
              },
              {
                icon: Box,
                title: '2. Deploy it for real',
                body: 'The drawn topology becomes one FRRouting container per device with its own FRR configuration, brought up on a real Docker network.',
              },
              {
                icon: Terminal,
                title: '3. Measure and disturb it',
                body: 'Ping and traceroute run between real routers. You can inject latency, jitter and packet loss, take an interface down, and watch the traffic counters move.',
              },
              {
                icon: Zap,
                title: '4. Compare OSPF against AI',
                body: 'The path OSPF actually forwards is read from the routers&apos; own routing tables, then compared with the one a Random Forest picks from measured link conditions.',
              },
            ].map(({ icon: Icon, title, body }) => (
              <li
                key={title}
                className="p-5 rounded-2xl bg-panel/60 border border-line/90 hover:border-accent/50 transition-all space-y-2.5"
              >
                <div className="flex items-start gap-3">
                  <div className="w-9 h-9 rounded-xl bg-accent-soft border border-accent/30 flex items-center justify-center text-accent shrink-0">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-sm font-bold text-ink font-sans pt-1.5">{title}</h3>
                </div>
                <p className="text-xs text-ink-muted leading-relaxed">{body}</p>
              </li>
            ))}
          </ol>
        </section>

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
            <h3 className="text-sm font-bold text-ink font-sans">Multi-Area OSPF</h3>
            <p className="text-xs text-ink-muted leading-relaxed">
              Assign interfaces to areas and watch the area borders form. Backbone area 0 is protected, and
              changing an area is treated as the routing change it is.
            </p>
          </div>

          <div className="p-5 rounded-2xl bg-panel/60 border border-line/90 hover:border-ok/50 transition-all space-y-2.5">
            <div className="w-9 h-9 rounded-xl bg-ok-soft border border-ok/30 flex items-center justify-center text-ok">
              <Zap className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-ink font-sans">OSPF vs AI Path Routing</h3>
            <p className="text-xs text-ink-muted leading-relaxed">
              Compare the path OSPF actually forwards against the one a Random Forest picks, on latency,
              jitter, loss, hop count and throughput.
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

    </div>
  );
};

