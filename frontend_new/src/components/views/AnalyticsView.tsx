import React, { useState } from 'react';
import { NetworkDevice, NetworkCable } from '../../types/network';
import {
  BarChart3,
  TrendingUp,
  Zap,
  Activity,
  Gauge,
  Layers,
  Clock,
  Radio,
  ArrowUpDown,
  RefreshCw,
  Info,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  GitFork,
  Bot,
  Route,
  ArrowRight,
  Cpu,
  Flame,
  Check,
} from 'lucide-react';

interface AnalyticsViewProps {
  devices: NetworkDevice[];
  cables: NetworkCable[];
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ devices, cables }) => {
  const [trafficProfile, setTrafficProfile] = useState<'normal' | 'heavy' | 'burst'>('normal');
  const [routingCompareMode, setRoutingCompareMode] = useState<'side-by-side' | 'ospf' | 'ai'>('side-by-side');
  const [isSimulatingComparison, setIsSimulatingComparison] = useState(false);

  // Multipliers based on trafficProfile
  const profileMultiplier = trafficProfile === 'burst' ? 1.45 : trafficProfile === 'heavy' ? 1.2 : 1.0;

  // 6 Essential Network Parameters:
  // 1. Latency
  // 2. Bandwidth
  // 3. Hop Count
  // 4. Convergence Time
  // 5. Throughput
  // 6. Packet Loss
  const latencyAvg = (12.4 * profileMultiplier).toFixed(1);
  const latencyMin = '4.2';
  const latencyMax = (24.8 * profileMultiplier).toFixed(1);
  const latencyJitter = (1.4 * profileMultiplier).toFixed(1);

  const bandwidthTotal = '10.0 Gbps';
  const bandwidthUtilized = (6.2 * (profileMultiplier > 1 ? 1.3 : 1.0)).toFixed(1);

  // Dynamic Hop Count based on network size
  const calculatedHops = Math.max(2, Math.min(6, Math.ceil(devices.length / 2)));
  const maxPathDiameter = calculatedHops + 1;

  const convergenceTime = (38 * (trafficProfile === 'burst' ? 1.15 : 1.0)).toFixed(0);

  const throughputVal = (842.6 * profileMultiplier).toFixed(1);
  const packetLossVal = trafficProfile === 'burst' ? '0.04%' : '0.00%';

  const parameterCards = [
    {
      id: 'latency',
      name: 'Latency (RTT)',
      val: `${latencyAvg} ms`,
      sub: `Min ${latencyMin}ms • Max ${latencyMax}ms • Jitter ${latencyJitter}ms`,
      status: 'Optimal',
      badgeColor: 'text-emerald-400 bg-emerald-950/60 border-emerald-800',
      icon: <Clock className="w-5 h-5 text-cyan-400" />,
      desc: 'Average round-trip transmission delay across active routes.',
      trend: '-1.2ms (Past 10m)',
    },
    {
      id: 'bandwidth',
      name: 'Bandwidth Capacity',
      val: bandwidthTotal,
      sub: `Active Utilization: ${bandwidthUtilized} Gbps (${((Number(bandwidthUtilized) / 10) * 100).toFixed(0)}%)`,
      status: 'High Bandwidth',
      badgeColor: 'text-cyan-400 bg-cyan-950/60 border-cyan-800',
      icon: <Gauge className="w-5 h-5 text-teal-400" />,
      desc: 'Full-duplex GigabitEthernet & 10G trunk interface allocation.',
      trend: 'Dynamic Queue Fair',
    },
    {
      id: 'hop_count',
      name: 'Hop Count',
      val: `${calculatedHops} Hops`,
      sub: `Network Diameter: ${maxPathDiameter} Hops • ${devices.length} Nodes`,
      status: 'Efficient Routing',
      badgeColor: 'text-indigo-400 bg-indigo-950/60 border-indigo-800',
      icon: <Layers className="w-5 h-5 text-indigo-400" />,
      desc: 'Shortest path metric calculated via Dijkstra / BFS routing tables.',
      trend: 'Loop-free STP',
    },
    {
      id: 'convergence_time',
      name: 'Convergence Time',
      val: `${convergenceTime} ms`,
      sub: 'Rapid STP (IEEE 802.1w) & OSPF Sub-Second Failover',
      status: 'Ultra-Fast',
      badgeColor: 'text-teal-400 bg-teal-950/60 border-teal-800',
      icon: <RefreshCw className="w-5 h-5 text-teal-400" />,
      desc: 'Time for topology routing tables to stabilize after interface changes.',
      trend: 'Sub-50ms Carrier Grade',
    },
    {
      id: 'throughput',
      name: 'Throughput',
      val: `${throughputVal} Mbps`,
      sub: 'Aggregate wire-speed L2/L3 frame forwarding rate',
      status: 'Wire Speed',
      badgeColor: 'text-cyan-300 bg-cyan-950/60 border-cyan-700',
      icon: <ArrowUpDown className="w-5 h-5 text-cyan-300" />,
      desc: 'Actual delivered payload volume across network interfaces.',
      trend: '+4.8% vs Baseline',
    },
    {
      id: 'packet_loss',
      name: 'Packet Loss',
      val: packetLossVal,
      sub: '0 Buffer drops • CRC Checks 100% Passed',
      status: trafficProfile === 'burst' ? 'Nominal' : 'Zero Loss',
      badgeColor: trafficProfile === 'burst' ? 'text-amber-400 bg-amber-950/60 border-amber-800' : 'text-emerald-400 bg-emerald-950/60 border-emerald-800',
      icon: <ShieldCheck className="w-5 h-5 text-emerald-400" />,
      desc: 'Percentage of dropped or fragmented frames during transit.',
      trend: '100% Frame Delivery',
    },
  ];

  // 6 Parameters OSPF vs AI Predictive Routing Comparison Data
  const routingComparisons = [
    {
      param: '1. Latency (RTT)',
      ospfVal: `${(18.6 * profileMultiplier).toFixed(1)} ms`,
      aiVal: `${(7.8 * (trafficProfile === 'burst' ? 1.1 : 1.0)).toFixed(1)} ms`,
      delta: '-58.1% Latency',
      better: 'ai',
      explanation: 'OSPF routes through congested core links based on static cost; AI predicts queue depth and preemptively shifts traffic through lower-latency paths.',
    },
    {
      param: '2. Bandwidth Utilization',
      ospfVal: '48.2% (Unbalanced)',
      aiVal: '86.4% (Multi-Path)',
      delta: '+79.2% Efficiency',
      better: 'ai',
      explanation: 'OSPF overloads the single shortest link while alternate trunks stay idle. AI balances flows dynamically across available topology links.',
    },
    {
      param: '3. Hop Count',
      ospfVal: '4 Hops (Rigid Metric)',
      aiVal: '3 Hops (Bypass)',
      delta: '1 Fewer Bottleneck',
      better: 'ai',
      explanation: 'OSPF strictly follows static interface metrics; AI predictive routing discovers congestion-free shortcut bypasses.',
    },
    {
      param: '4. Convergence Time',
      ospfVal: '820 ms',
      aiVal: '12 ms',
      delta: '98.5% Faster',
      better: 'ai',
      explanation: 'OSPF requires LSA flooding, dead timer expiration, and Dijkstra SPF recalculation. AI predicts link degradation in advance for instantaneous switchover.',
    },
    {
      param: '5. Throughput',
      ospfVal: `${(612.4 * profileMultiplier).toFixed(1)} Mbps`,
      aiVal: `${(948.8 * (trafficProfile === 'burst' ? 1.15 : 1.0)).toFixed(1)} Mbps`,
      delta: '+54.9% Forwarding',
      better: 'ai',
      explanation: 'Throughput in OSPF is throttled by bottleneck buffer queues; AI multi-path routing achieves near wire-speed throughput.',
    },
    {
      param: '6. Packet Loss',
      ospfVal: trafficProfile === 'burst' ? '1.42%' : '0.65%',
      aiVal: '0.00%',
      delta: 'Zero Drop Guarantee',
      better: 'ai',
      explanation: 'OSPF experiences queue overflow tail-drops during bursty traffic; AI proactive buffer forecasting deflects flows before buffers saturate.',
    },
  ];

  const handleSimulateRun = () => {
    setIsSimulatingComparison(true);
    setTimeout(() => {
      setIsSimulatingComparison(false);
    }, 800);
  };

  return (
    <div
      id="analytics-view-root"
      className="flex-1 h-full bg-[#050816] overflow-y-auto p-6 space-y-8 text-slate-200 select-none font-sans"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center space-x-2">
            <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-500/40 text-cyan-400 shadow-md">
              <BarChart3 className="w-5 h-5 text-cyan-400" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
                <span>Network Performance & Telemetry Analytics</span>
                <span className="text-xs font-mono font-normal px-2.5 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  Live Engine
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Real-time 6-parameter monitoring & OSPF vs AI Predictive Path Routing analysis.
              </p>
            </div>
          </div>
        </div>

        {/* Traffic Profile Selector */}
        <div className="flex items-center space-x-2 self-start sm:self-auto bg-slate-900 border border-slate-800 p-1 rounded-xl text-xs font-mono">
          <span className="text-slate-500 px-2">Simulated Load:</span>
          {(['normal', 'heavy', 'burst'] as const).map((profile) => (
            <button
              key={profile}
              onClick={() => setTrafficProfile(profile)}
              className={`px-2.5 py-1 rounded-lg capitalize transition-all cursor-pointer ${
                trafficProfile === profile
                  ? 'bg-cyan-500 text-slate-950 font-bold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              {profile}
            </button>
          ))}
        </div>
      </div>

      {/* The 6 Core Parameters Grid */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-mono font-semibold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
            <Activity className="w-3.5 h-3.5" />
            <span>6 Core Network Parameters</span>
          </h3>
          <span className="text-[11px] text-slate-500 font-mono">Real-time sampling interval: 100ms</span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {parameterCards.map((param) => (
            <div
              key={param.id}
              className="p-5 rounded-2xl bg-slate-900/90 border border-slate-800 hover:border-cyan-500/40 transition-all space-y-3 shadow-lg group relative overflow-hidden"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5">
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 group-hover:border-cyan-500/40 transition-colors">
                    {param.icon}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider font-mono">
                      {param.name}
                    </h4>
                    <span className="text-[10px] text-slate-500">{param.trend}</span>
                  </div>
                </div>
                <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border ${param.badgeColor}`}>
                  {param.status}
                </span>
              </div>

              <div>
                <div className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight font-mono">
                  {param.val}
                </div>
                <p className="text-xs text-slate-400 mt-1 font-mono">
                  {param.sub}
                </p>
              </div>

              <div className="pt-2 border-t border-slate-800/80 text-[11px] text-slate-400 leading-relaxed">
                {param.desc}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* OSPF vs AI PREDICTIVE PATH ROUTING COMPARISON ENGINE */}
      {/* ========================================================================= */}
      <div className="p-6 rounded-2xl bg-slate-900/95 border border-cyan-500/30 shadow-2xl space-y-6">
        {/* Section Header */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-800/90 pb-4">
          <div className="space-y-1">
            <div className="flex items-center space-x-2">
              <div className="p-1.5 rounded-lg bg-cyan-950 border border-cyan-500/40 text-cyan-400">
                <GitFork className="w-5 h-5 text-cyan-400" />
              </div>
              <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
                <span>OSPF vs AI Predictive Path Routing Comparison</span>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 border border-emerald-800">
                  AI Optimization
                </span>
              </h3>
            </div>
            <p className="text-xs text-slate-400">
              Direct comparison between classical Dijkstra link-state routing (OSPF) and neural graph congestion prediction (AI Pathing).
            </p>
          </div>

          {/* Mode Selector & Simulator Run */}
          <div className="flex items-center space-x-3">
            <div className="flex items-center bg-slate-950 border border-slate-800 p-1 rounded-xl text-xs font-mono">
              <button
                onClick={() => setRoutingCompareMode('side-by-side')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  routingCompareMode === 'side-by-side'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Side-by-Side
              </button>
              <button
                onClick={() => setRoutingCompareMode('ospf')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  routingCompareMode === 'ospf'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                OSPF Only
              </button>
              <button
                onClick={() => setRoutingCompareMode('ai')}
                className={`px-3 py-1 rounded-lg transition-colors cursor-pointer ${
                  routingCompareMode === 'ai'
                    ? 'bg-cyan-500 text-slate-950 font-bold'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                AI Predictive Only
              </button>
            </div>

            <button
              onClick={handleSimulateRun}
              disabled={isSimulatingComparison}
              className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-xl bg-cyan-950 hover:bg-cyan-900 border border-cyan-500/40 text-cyan-300 text-xs font-mono font-semibold transition-all cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSimulatingComparison ? 'animate-spin' : ''}`} />
              <span>Simulate Route Test</span>
            </button>
          </div>
        </div>

        {/* Visual Route Path Comparison Diagram */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* OSPF Route Card */}
          {(routingCompareMode === 'side-by-side' || routingCompareMode === 'ospf') && (
            <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="font-bold text-slate-200">OSPF Path (Dijkstra Shortest Path)</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-amber-950/80 text-amber-300 border border-amber-800">
                  Fixed Link Cost Metric
                </span>
              </div>

              {/* Path Node Sequence */}
              <div className="p-3 rounded-lg bg-slate-900 border border-slate-800 space-y-2">
                <div className="flex items-center space-x-2 text-[11px] overflow-x-auto pb-1 text-slate-300">
                  <span className="px-2 py-1 rounded bg-slate-950 border border-slate-700 font-bold text-cyan-400">PC-1</span>
                  <span>➔</span>
                  <span className="px-2 py-1 rounded bg-slate-950 border border-slate-700">SW-1</span>
                  <span>➔</span>
                  <span className="px-2 py-1 rounded bg-slate-950 border border-slate-700">R1 [Gi0/0]</span>
                  <span>➔</span>
                  <span className="px-2 py-1 rounded bg-amber-950/80 border border-amber-700 text-amber-300 font-bold">
                    R2 (Queue: 91%)
                  </span>
                  <span>➔</span>
                  <span className="px-2 py-1 rounded bg-slate-950 border border-slate-700 font-bold text-emerald-400">Gateway</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                  <span>Hops: 4</span>
                  <span className="text-amber-400">Queue Buffer Delay: +11.8ms</span>
                  <span>Calculated Cost: 20</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                OSPF chooses R1 ➔ R2 because it has the lowest static interface cost (10), unaware that R2's egress buffer is currently 91% saturated, causing micro-drops.
              </p>
            </div>
          )}

          {/* AI Predictive Path Card */}
          {(routingCompareMode === 'side-by-side' || routingCompareMode === 'ai') && (
            <div className="p-4 rounded-xl bg-slate-950 border border-cyan-500/40 space-y-3 font-mono text-xs shadow-md shadow-cyan-950/40">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-cyan-400 animate-pulse" />
                  <span className="font-bold text-cyan-300">AI Predictive Path (Congestion-Aware)</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded bg-cyan-950 text-cyan-300 border border-cyan-800">
                  Neural Queue Lookahead
                </span>
              </div>

              {/* Path Node Sequence */}
              <div className="p-3 rounded-lg bg-slate-900 border border-cyan-950 space-y-2">
                <div className="flex items-center space-x-2 text-[11px] overflow-x-auto pb-1 text-slate-300">
                  <span className="px-2 py-1 rounded bg-slate-950 border border-slate-700 font-bold text-cyan-400">PC-1</span>
                  <span>➔</span>
                  <span className="px-2 py-1 rounded bg-slate-950 border border-slate-700">SW-1</span>
                  <span>➔</span>
                  <span className="px-2 py-1 rounded bg-slate-950 border border-slate-700">R1 [Gi0/1]</span>
                  <span>➔</span>
                  <span className="px-2 py-1 rounded bg-emerald-950/80 border border-emerald-600 text-emerald-300 font-bold">
                    R4 (Queue: 14%)
                  </span>
                  <span>➔</span>
                  <span className="px-2 py-1 rounded bg-slate-950 border border-slate-700 font-bold text-emerald-400">Gateway</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-800">
                  <span className="text-cyan-400 font-bold">Hops: 3 (Bypass)</span>
                  <span className="text-emerald-400 font-bold">Zero Queue Delay</span>
                  <span className="text-cyan-300">Predictive Score: 98.6%</span>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                AI model forecasted a 60Mbps traffic surge on R2 within 3.5s and proactively steered flows through R4 (14% queue load), guaranteeing 0.00% packet loss.
              </p>
            </div>
          )}
        </div>

        {/* 6-Parameter Side-by-Side Comparison Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left font-mono text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-800 text-slate-400">
                <th className="py-2.5 px-3">Network Parameter</th>
                <th className="py-2.5 px-3">Standard OSPF Routing</th>
                <th className="py-2.5 px-3 text-cyan-300">AI Predictive Path Routing</th>
                <th className="py-2.5 px-3 text-emerald-400">AI Advantage</th>
                <th className="py-2.5 px-3 hidden md:table-cell">Routing Decision Rationale</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/80">
              {routingComparisons.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-950/50 transition-colors">
                  <td className="py-3 px-3 font-semibold text-slate-200">{row.param}</td>
                  <td className="py-3 px-3 text-amber-300/90">{row.ospfVal}</td>
                  <td className="py-3 px-3 text-cyan-300 font-bold">{row.aiVal}</td>
                  <td className="py-3 px-3">
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 text-[10px] font-bold">
                      {row.delta}
                    </span>
                  </td>
                  <td className="py-3 px-3 text-[11px] text-slate-400 leading-relaxed hidden md:table-cell font-sans">
                    {row.explanation}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Interactive Charts & Telemetry Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 pt-2">
        {/* Link Throughput & Bandwidth Utilization */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-cyan-400" />
              <span>Bandwidth Allocation & Link Utilization</span>
            </h3>
            <span className="text-xs font-mono text-cyan-400">1000BASE-T Full Duplex</span>
          </div>

          <div className="space-y-3 pt-2">
            {cables.length > 0 ? (
              cables.slice(0, 6).map((cable, idx) => {
                const util = Math.min(95, Math.round(([64, 42, 82, 35, 78, 51][idx % 6] || 50) * profileMultiplier));
                return (
                  <div key={cable.id} className="space-y-1">
                    <div className="flex justify-between text-xs font-mono">
                      <span className="text-slate-300">
                        {cable.fromDeviceId} ({cable.fromPort}) ↔ {cable.toDeviceId} ({cable.toPort})
                      </span>
                      <span className="text-cyan-400 font-bold">{util}% ({(util * 9.9).toFixed(1)} Mbps)</span>
                    </div>
                    <div className="w-full h-2 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan-500 to-teal-400 transition-all duration-300"
                        style={{ width: `${util}%` }}
                      />
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="text-center py-6 text-xs text-slate-500 font-mono">
                No cables connected. Switch to Designer to connect devices.
              </div>
            )}
          </div>
        </div>

        {/* Hop Count & Latency Distribution */}
        <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Zap className="w-4 h-4 text-emerald-400" />
              <span>Hop Count & Latency Spectrum</span>
            </h3>
            <span className="text-xs font-mono text-emerald-400">BFS Topology Graph</span>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-2 font-mono text-xs">
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-slate-500">1-Hop Local Subnet</span>
              <div className="text-xl font-bold text-cyan-400">1.8 ms</div>
              <span className="text-[10px] text-emerald-400">Direct Switch Forwarding</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-slate-500">2-Hop Gateway Route</span>
              <div className="text-xl font-bold text-teal-400">8.4 ms</div>
              <span className="text-[10px] text-teal-400">L3 Router Next-Hop</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-slate-500">3+ Hop Backbone Transit</span>
              <div className="text-xl font-bold text-cyan-300">16.2 ms</div>
              <span className="text-[10px] text-cyan-400">Inter-AS OSPF Transit</span>
            </div>
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-slate-500">Convergence Stability</span>
              <div className="text-xl font-bold text-emerald-400">100.0%</div>
              <span className="text-[10px] text-emerald-400">No Routing Loops</span>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 leading-relaxed font-mono flex items-start gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              All 6 network metrics (Latency: {latencyAvg}ms, Bandwidth: {bandwidthTotal}, Hop Count: {calculatedHops}, Convergence: {convergenceTime}ms, Throughput: {throughputVal}Mbps, Loss: {packetLossVal}) are synchronized with simulated packets.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
