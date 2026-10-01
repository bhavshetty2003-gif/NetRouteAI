import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NetworkDevice, NetworkCable, Packet } from '../types/network';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Wifi,
  Link as LinkIcon,
  BarChart3,
  Radio,
  RefreshCw,
  Gauge,
  ServerOff,
} from 'lucide-react';
import {
  getDeployState,
  getLiveAnalytics,
  getLabStatus,
  measureBandwidth,
  type DeployState,
  type LiveAnalytics,
} from '../utils/api';

interface LiveMetricsPanelProps {
  devices: NetworkDevice[];
  cables: NetworkCable[];
  packets: Packet[];
  /** Ids the backend allocated on the running lab, so only routers that are
   *  really in the lab are offered as endpoints. */
  deployedRouterIds?: string[];
}

type Reading = {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: 'ok' | 'warn' | 'bad' | 'accent' | 'muted';
  note?: string;
};

const TONE: Record<Reading['tone'], string> = {
  ok: 'text-ok border-ok/30 bg-ok/10',
  warn: 'text-warn border-warn/30 bg-warn/10',
  bad: 'text-bad border-bad/30 bg-bad/10',
  accent: 'text-accent border-accent/30 bg-accent/10',
  muted: 'text-ink-muted border-line-strong/30 bg-overlay/10',
};

/** One measured figure, or a dash with a reason. There is no third option: a
 *  number is never shown unless a command produced it. */
function reading(
  label: string,
  value: number | null | undefined,
  icon: Reading['icon'],
  unit: string,
  tone: Reading['tone'] = 'accent',
  note?: string
): Reading {
  return {
    label,
    icon,
    tone,
    note,
    value: value === null || value === undefined ? '--' : `${value}${unit}`,
  };
}

const ms = (v: number | null | undefined) => (v === null || v === undefined ? '0' : v.toFixed(2));

/** Real ICMP echo requests sent end to end per measurement. Twelve makes a
 *  single dropped packet read as 8.3% rather than 17%. */
const PACKET_COUNT = 12;

export const LiveMetricsPanel: React.FC<LiveMetricsPanelProps> = ({
  devices,
  cables,
  packets,
  deployedRouterIds,
}) => {
  const routers = useMemo(
    () => devices.filter((d) => d.type === 'router'),
    [devices]
  );

  // Only routers that are both on the canvas and in the running lab can be
  // measured. Offering anything else produces a request that cannot be answered.
  const measurable = useMemo(() => {
    if (!deployedRouterIds || deployedRouterIds.length === 0) return routers;
    const inLab = new Set(deployedRouterIds.map((id) => id.toUpperCase()));
    const scoped = routers.filter((d) => inLab.has(d.id.toUpperCase()));
    return scoped.length >= 2 ? scoped : routers;
  }, [routers, deployedRouterIds]);

  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [data, setData] = useState<LiveAnalytics | null>(null);
  const [throughput, setThroughput] = useState<{ mbps: number | null; basis: string } | null>(null);
  const [deployState, setDeployState] = useState<DeployState | null>(null);
  const [labOnline, setLabOnline] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [measured, setMeasured] = useState(false);

  // Default to the two ends of the first link, which is a pair the user drew
  // rather than an arbitrary first-and-last.
  useEffect(() => {
    if (source && destination) return;
    const firstLink = cables[0];
    if (firstLink) {
      setSource((s) => s || firstLink.fromDeviceId);
      setDestination((d) => d || firstLink.toDeviceId);
      return;
    }
    if (measurable.length >= 2) {
      setSource((s) => s || measurable[0].id);
      setDestination((d) => d || measurable[measurable.length - 1].id);
    }
  }, [cables, measurable, source, destination]);

  // Is there a lab to measure at all? Answered separately so the panel can say
  // "deploy first" instead of reporting a row of zeros.
  useEffect(() => {
    let cancelled = false;
    getLabStatus()
      .then((status) => {
        if (!cancelled) setLabOnline(Boolean(status.online) && status.device_count > 0);
      })
      .catch(() => {
        if (!cancelled) setLabOnline(false);
      });
    getDeployState()
      .then((state) => {
        if (cancelled) return;
        setDeployState(state);
        setLabOnline((current) =>
          current === null ? state.running : current && state.running
        );
      })
      .catch(() => {
        /* no deploy record yet: fall back to the status probe above */
      });
    return () => {
      cancelled = true;
    };
  }, [devices, cables]);

  const measure = useCallback(async () => {
    if (!source || !destination || source === destination) return;
    setBusy(true);
    setError(null);
    try {
      // 12 real ICMP echo requests. Six cannot resolve a loss percentage below
      // 17%, so a single dropped packet used to read as a sixth of the traffic
      // lost and anything smaller was impossible to express.
      const result = await getLiveAnalytics(source, destination, false, 'ospf', PACKET_COUNT);
      setData(result);
      setMeasured(true);
      // Throughput is sampled on whatever interface carries this pair's traffic,
      // so it works across several hops -- there is no reason to withhold it for
      // a non-adjacent pair the way there used to be.
      try {
        const bw = await measureBandwidth(source, destination, 2);
        setThroughput(
          bw.reachable === false
            ? {
                mbps: null,
                basis: bw.note ?? 'nothing answered, so the counters never moved',
              }
            : {
                mbps: bw.throughput_mbps,
                basis: `achieved over ${bw.sample_seconds}s from /proc/net/dev counter deltas on ${bw.measured_interface ?? '—'}`,
              }
        );
      } catch (bwErr) {
        setThroughput({ mbps: null, basis: bwErr instanceof Error ? bwErr.message : '' });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [source, destination]);

  const e2e = data?.end_to_end;
  const ospf = data?.ospf;

  const readings: Reading[] = [
    reading('Latency', e2e?.latency_ms ?? null, Clock, ' ms', 'accent', e2e?.command),
    reading('Jitter', e2e?.jitter_ms ?? null, Activity, ' ms', 'muted'),
    reading('Packet Loss', e2e?.packet_loss_percent ?? null, XCircle, ' %',
      e2e?.packet_loss_percent ? 'bad' : 'ok',
      e2e?.packets_sent
        ? `${e2e.packets_received} of ${e2e.packets_sent} replies` +
          (e2e.loss_resolution_percent
            ? ` — smallest loss this sample can show is ${e2e.loss_resolution_percent}%`
            : '')
        : undefined),
    reading('Hop Count', e2e?.hop_count ?? null, LinkIcon, ''),
    reading('Path Cost', ospf?.computed?.total_cost ?? null, BarChart3, ''),
    reading('Min Link Speed', ospf?.computed?.bandwidth ?? null, Wifi, ' Mbps', 'accent',
      ospf?.computed?.bandwidth_basis),
    reading('Throughput', throughput?.mbps ?? null, Gauge, ' Mbps', 'accent', throughput?.basis),
  ];

  // Animation counters are about the packet drawing on the canvas, not about
  // the network. They are counted here and labelled as such rather than mixed
  // in with the measured figures above.
  const sent = packets.length;
  const delivered = packets.filter((p) => p.status === 'success').length;
  const dropped = packets.filter((p) => p.status === 'dropped' || p.status === 'failed').length;
  const inFlight = packets.filter(
    (p) => p.status === 'routing' || p.status === 'transmitting'
  ).length;

  return (
    <div className="w-80 bg-base border-l border-line p-4 text-ink overflow-y-auto">
      <div className="flex items-center gap-2 mb-3">
        <BarChart3 className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-bold">Live Metrics</h2>
      </div>

      <p className="text-xs text-ink-muted mb-3 leading-snug">
        Every figure below is read from the running lab over the API. Nothing here is
        simulated, and a value that could not be measured is shown as
        <span className="font-mono"> --</span> with the reason.
      </p>

      {labOnline === false ? (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-warn/10 border border-warn/30 mb-4">
          <ServerOff className="w-4 h-4 text-warn shrink-0 mt-0.5" />
          <p className="text-xs text-ink-muted leading-snug">
            No lab is running, so there is nothing to measure. Build the topology you drew
            from the designer to start one.
          </p>
        </div>
      ) : null}

      {measurable.length >= 2 && (
        <div className="mb-4 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted">Source</span>
              <select
                value={source}
                onChange={(e) => setSource(e.target.value)}
                className="w-full mt-0.5 rounded bg-panel border border-line px-2 py-1.5 text-xs font-mono focus:border-accent focus:outline-none"
              >
                {measurable.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-[10px] uppercase tracking-wider text-ink-muted">
                Destination
              </span>
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="w-full mt-0.5 rounded bg-panel border border-line px-2 py-1.5 text-xs font-mono focus:border-accent focus:outline-none"
              >
                {measurable.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.id}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={measure}
            disabled={busy || !source || source === destination}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-accent-soft border border-accent/40 px-3 py-2 text-xs font-semibold text-accent hover:border-accent disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} />
            {busy ? 'Measuring on the lab' : 'Measure on the lab'}
          </button>
        </div>
      )}

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-bad/10 border border-bad/30 mb-4">
          <XCircle className="w-4 h-4 text-bad shrink-0 mt-0.5" />
          <p className="text-xs text-ink-muted leading-snug break-words">{error}</p>
        </div>
      )}

      {measured && e2e && !e2e.reachable && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-bad/10 border border-bad/30 mb-4">
          <XCircle className="w-4 h-4 text-bad shrink-0 mt-0.5" />
          <div className="text-xs text-ink-muted leading-snug">
            <p className="font-semibold text-bad mb-1">Not reachable</p>
            <p>{e2e.diagnosis || 'The routers did not answer.'}</p>
            {e2e.addresses_tried.length > 1 && (
              <p className="mt-1 font-mono text-[10px]">
                tried: {e2e.addresses_tried.map((a) => a.ip).join(', ')}
              </p>
            )}
          </div>
        </div>
      )}

      <div className="space-y-2">
        {readings.map((card) => (
          <div
            key={card.label}
            className={`flex items-center justify-between p-2.5 rounded-lg border ${TONE[card.tone]}`}
          >
            <div className="flex items-center gap-2 min-w-0">
              <card.icon className="w-4 h-4 shrink-0" />
              <span className="text-xs text-ink-muted truncate">{card.label}</span>
            </div>
            <span className="text-sm font-bold font-mono shrink-0">{card.value}</span>
          </div>
        ))}
      </div>

      {measured && ospf && (
        <div className="mt-4 pt-3 border-t border-line">
          <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
            Path measured
          </h3>
          <p className="text-xs font-mono text-ink-soft break-words leading-relaxed">
            {ospf.path.join(' -> ')}
          </p>
          <p className="text-[10px] text-ink-faint mt-1">{ospf.basis}</p>
          {e2e?.hops && e2e.hops.length > 0 && (
            <div className="mt-2 space-y-0.5">
              {e2e.hops.map((hop) => (
                <div
                  key={hop.hop}
                  className="flex items-center justify-between text-[10px] font-mono"
                >
                  <span className="text-ink-faint">
                    {hop.hop}. {hop.device || hop.address || '*'}
                  </span>
                  <span className="text-ink-muted">
                    {hop.rtt_ms === null ? '*' : `${ms(hop.rtt_ms)} ms`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Canvas animation, counted separately so it is never read as a
          measurement of the network. */}
      <div className="mt-4 pt-3 border-t border-line">
        <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
          Canvas animation
        </h3>
        <p className="text-[10px] text-ink-faint mb-2 leading-snug">
          Packets drawn moving across the canvas. These count the animation, not the
          network — the numbers above are the ones measured on the routers.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <div className="flex items-center justify-between p-2 rounded-lg border border-line bg-panel">
            <span className="text-[11px] text-ink-muted flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-accent" /> Drawn
            </span>
            <span className="text-xs font-bold font-mono">{sent}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-lg border border-line bg-panel">
            <span className="text-[11px] text-ink-muted flex items-center gap-1.5">
              <CheckCircle className="w-3.5 h-3.5 text-ok" /> Arrived
            </span>
            <span className="text-xs font-bold font-mono">{delivered}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-lg border border-line bg-panel">
            <span className="text-[11px] text-ink-muted flex items-center gap-1.5">
              <XCircle className="w-3.5 h-3.5 text-bad" /> Dropped
            </span>
            <span className="text-xs font-bold font-mono">{dropped}</span>
          </div>
          <div className="flex items-center justify-between p-2 rounded-lg border border-line bg-panel">
            <span className="text-[11px] text-ink-muted flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 text-info" /> Moving
            </span>
            <span className="text-xs font-bold font-mono">{inFlight}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
