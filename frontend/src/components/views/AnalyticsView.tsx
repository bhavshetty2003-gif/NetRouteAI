import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  ArrowRight,
  BarChart3,
  Clock,
  Cpu,
  Database,
  GitFork,
  Info,
  Layers,
  Link2,
  Loader2,
  Plug,
  Radar,
  RefreshCw,
  ServerCog,
  ShieldCheck,
  Timer,
  TrendingUp,
  Zap,
} from 'lucide-react';
import {
  BandwidthResult,
  ConvergenceResult,
  DatasetStats,
  LabStatus,
  LiveAnalytics,
  OspfAreaApplied,
  OspfAreaInventory,
  OspfAreaPreview,
  OspfAreaRouter,
  RouteReport,
  RoutingMethod,
  TrafficGenerator,
  applyImpairment,
  collectDataset,
  getDatasetStats,
  getLabStatus,
  getLabReachability,
  getLiveAnalytics,
  getOspfAreas,
  getTraffic,
  measureBandwidth,
  setLinkState,
  setOspfArea,
  setRoutingMethod,
  setTraffic,
} from '../../utils/api';
import { NetworkDevice } from '../../types/network';

/** Format a millisecond figure without pretending to more precision than a
 *  lab container can deliver. Sub-millisecond hops are normal on a /29 link. */
function ms(value: number | null | undefined, digits = 3): string {
  if (value === null || value === undefined) return '—';
  if (value === 0) return '0';
  if (value < 1) return value.toFixed(digits);
  return value.toFixed(2);
}

function pct(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return `${value.toFixed(2)}%`;
}

function ago(epochSeconds: number | null | undefined): string {
  if (!epochSeconds) return 'never';
  const seconds = Math.max(0, Math.round(Date.now() / 1000 - epochSeconds));
  if (seconds < 60) return `${seconds}s ago`;
  return `${Math.round(seconds / 60)}m ago`;
}

const METHODS: Array<{ key: RoutingMethod; label: string; hint: string }> = [
  {
    key: 'ospf',
    label: 'OSPF',
    hint: 'what the routers forward now',
  },
  {
    key: 'ai',
    label: 'AI / Random Forest',
    hint: 'model-ranked best path',
  },
];

function PathChain({ path, highlight }: { path: string[]; highlight: string }) {
  if (path.length === 0) {
    return <span className="text-ink-faint font-mono text-xs">no path</span>;
  }
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {path.map((node, index) => (
        <React.Fragment key={`${node}-${index}`}>
          {index > 0 && <ArrowRight className="w-3 h-3 text-ink-faint shrink-0" />}
          <span
            className={`px-2 py-1 rounded-md border font-mono text-[11px] font-bold ${
              node === highlight
                ? 'bg-accent-soft text-accent border-accent'
                : 'bg-panel text-ink-soft border-line-strong'
            }`}
          >
            {node}
          </span>
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * Live telemetry for the running Docker/FRR lab, scoped to the drawn topology.
 *
 * The routers offered as endpoints are the ones present in *both* the topology
 * on the canvas and the running lab: a router that only exists on the canvas
 * has nothing to measure, and one that only exists in the lab is not part of
 * the network the user is looking at. Everything measured still comes from the
 * lab over the API; the topology only decides what may be selected. With no
 * routers on the canvas the page shows nothing rather than lab-wide figures.
 */
export const AnalyticsView: React.FC<{ devices: NetworkDevice[] }> = ({ devices }) => {
  const [lab, setLab] = useState<LabStatus | null>(null);
  const [labError, setLabError] = useState<string | null>(null);
  const [dataset, setDataset] = useState<DatasetStats | null>(null);
  const [live, setLive] = useState<LiveAnalytics | null>(null);
  const [throughput, setThroughput] = useState<BandwidthResult | null>(null);
  const [convergence, setConvergence] = useState<ConvergenceResult | null>(null);

  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [includeConvergence, setIncludeConvergence] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [method, setMethod] = useState<RoutingMethod>('ospf');

  const [busy, setBusy] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [reachedLab, setReachedLab] = useState(false);
  const [reachability, setReachability] = useState<Record<string, Record<string, boolean>>>({});
  const [steering, setSteering] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  // Routers drawn on the canvas. This is what scopes the page: with none, there
  // is no topology to report on and the lab's own figures are not shown.
  const topologyRouters = useMemo(
    () => devices.filter((d) => d.type === 'router'),
    [devices]
  );
  const hasTopologyRouters = topologyRouters.length > 0;
  const topologyRouterIds = useMemo(
    () => new Set(topologyRouters.map((d) => d.id)),
    [topologyRouters]
  );

  // Endpoints are the routers that exist in the live lab *and* on the canvas:
  // a canvas-only router has nothing to measure, and a lab-only router is not
  // part of the network the user is looking at.
  const routerIds = useMemo(
    () =>
      lab?.devices
        .filter((d) => d.type === 'router' && topologyRouterIds.has(d.id))
        .map((d) => d.id) ?? [],
    [lab, topologyRouterIds]
  );

  /** Load lab topology + dataset facts. Safe to call repeatedly. */
  const loadLab = useCallback(async () => {
    try {
      const status = await getLabStatus();
      setLab(status);
      setLabError(null);
    } catch (error) {
      setLab(null);
      setLabError(error instanceof Error ? error.message : String(error));
    } finally {
      // Settle the loading state on failure too, otherwise an unreachable
      // backend leaves the page spinning forever instead of showing the error
      // and the retry button.
      setReachedLab(true);
    }
  }, []);

  useEffect(() => {
    // Nothing to measure with no routers on the canvas, and the reachability
    // sweep is expensive (a ping per pair over the whole device matrix), so it
    // is not run at all in that state.
    if (!hasTopologyRouters) return;
    loadLab();
    getDatasetStats()
      .then(setDataset)
      .catch(() => setDataset(null));
    // Probe the whole matrix, not a prefix of it. With a 60-pair cap the sweep
    // stopped before reaching later device pairs, so the reachability hints were
    // silently absent for pairs that had never been tested.
    getLabReachability(400)
      .then((r) => {
        const map: Record<string, Record<string, boolean>> = {};
        for (const p of r.pairs) {
          map[p.source] = map[p.source] || {};
          map[p.source][p.destination] = p.reachable;
          map[p.destination] = map[p.destination] || {};
          map[p.destination][p.source] = p.reachable;
        }
        setReachability(map);
      })
      .catch(() => setReachability({}));
  }, [loadLab, hasTopologyRouters]);

  // Keep the source and destination valid whenever the selectable set changes
  // (a topology edit, a lab restart, or a different pair of overlapping
  // routers). Both must name distinct routers or there is nothing to measure.
  useEffect(() => {
    if (routerIds.length === 0) return;
    const nextSource = routerIds.includes(source) ? source : routerIds[0];
    if (nextSource !== source) setSource(nextSource);
    if (!routerIds.includes(destination) || destination === nextSource) {
      setDestination(routerIds.find((id) => id !== nextSource) ?? nextSource);
    }
  }, [routerIds, source, destination]);

  const run = useCallback(async () => {
    if (!lab?.online || !source || !destination || source === destination) return;
    setBusy(true);
    setRunError(null);
    try {
      const result = await getLiveAnalytics(source, destination, includeConvergence, method);
      setLive(result);
      if (result.convergence) setConvergence(result.convergence);
    } catch (error) {
      setRunError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [lab?.online, source, destination, includeConvergence, method]);

  /** Install or drop the static routes that make the selected method real. */
  const applyMethod = useCallback(
    async (apply: boolean) => {
      setSteering(true);
      setRunError(null);
      try {
        const result = await setRoutingMethod(source, destination, method, apply);
        setNote(
          result.commands?.length ? `${result.message} (${result.commands.join('; ')})` : result.message
        );
        // Re-measure rather than optimistically flipping local state: the page
        // should only claim a method is in effect once a traceroute confirms it.
        await run();
      } catch (error) {
        setRunError(error instanceof Error ? error.message : String(error));
      } finally {
        setSteering(false);
      }
    },
    [source, destination, method, run]
  );

  // Measure whenever the pair or the selected method changes, so the panel always
  // describes what the lab is being asked to do right now.
  useEffect(() => {
    if (hasTopologyRouters && lab?.online && source && source !== destination) run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasTopologyRouters, lab?.online, source, destination, method]);

  // Throughput is a separate probe: it drives real traffic and samples the
  // interface byte counters, so it is not folded into the comparison call.
  const runThroughput = useCallback(async () => {
    // Throughput needs a directly adjacent peer; a remote pair measures nothing.
    // Falls back to any transit neighbour of the source.
    const neighbour =
      lab?.links.find(
        (l) =>
          (l.source === source || l.target === source) &&
          l.kind === 'transit' &&
          (l.source === source ? l.target : l.source) !== destination
      ) ?? null;
    const peer = neighbour ? (neighbour.source === source ? neighbour.target : neighbour.source) : null;
    if (!peer) {
      setThroughput(null);
      return;
    }
    try {
      setThroughput(await measureBandwidth(source, peer, 2));
    } catch {
      setThroughput(null);
    }
  }, [lab, source, destination]);

  useEffect(() => {
    if (!hasTopologyRouters || !lab?.online) return;
    runThroughput();
  }, [hasTopologyRouters, lab?.online, source, runThroughput]);

  // Refresh once a minute so the path chain, interface counters and the
  // trained-model figures stay current instead of freezing at page load.
  useEffect(() => {
    if (!hasTopologyRouters || !lab?.online) return;
    const timer = setInterval(run, 60000);
    return () => clearInterval(timer);
  }, [hasTopologyRouters, lab?.online, run]);

  // Auto refresh on top of that, for watching an impairment take effect.
  useEffect(() => {
    if (!autoRefresh || !hasTopologyRouters || !lab?.online) return;
    const timer = setInterval(run, 15000);
    return () => clearInterval(timer);
  }, [autoRefresh, hasTopologyRouters, lab?.online, run]);

  /** Front-to-front latency samples, so the trend is visible rather than implied. */
  const history = useRef<Array<{ at: number; latency: number | null }>>([]);
  const [trend, setTrend] = useState<Array<{ at: number; latency: number | null }>>([]);

  useEffect(() => {
    if (!live) return;
    history.current = [
      ...history.current,
      { at: live.measured_at, latency: live.end_to_end.latency_ms },
    ].slice(-20);
    setTrend([...history.current]);
  }, [live]);

  const e2e = live?.end_to_end;
  const measured = e2e?.reachable === true;

  /** Reachability of the current pair from the lab sweep, when it was probed. */
  const pairState = (() => {
    const row = reachability[source];
    if (!row || !(destination in row)) return null;
    return { known: row[destination] !== undefined, reachable: row[destination] === true };
  })();

  // The traced path is the ground truth for "where do packets actually go" --
  // but only when every hop answered. With a gap the chain is unknown, so it is
  // not rendered as a path at all rather than as a shorter, wrong one.
  const walked = live?.path_taken ?? [];
  const tracedComplete = live ? live.path_taken_complete !== false : true;
  const tracedHops = e2e?.hops ?? [];

  const activeReport: RouteReport | undefined = live ? live[method] : undefined;

  const ospfLinks = activeReport?.links ?? [];

  // The steer plan and in-effect flag describe `live.active_method`. If the user
  // has since picked a different method, deriving them from `active` alone would
  // enable or disable the button for the wrong path.
  // The steer plan describes `live.active_method`. Until a re-measure for the
  // newly selected method lands, the plan is unknown -- so treat "unknown" as
  // steerable and let the backend refuse with a reason, rather than showing a
  // dead button with no explanation.
  const steerForSelection =
    live?.active.method === method ? live.active.steer : undefined;
  const steerable = steerForSelection ? steerForSelection.applicable : true;
  const methodAlreadyInEffect = live?.path_taken_matches?.[method] === true;
  const queueDrops = ospfLinks.reduce((sum, l) => sum + (l.qdisc_drops || 0), 0);
  const interfaceErrors = ospfLinks.reduce((sum, l) => sum + (l.errors || 0), 0);
  const pathBandwidth = activeReport?.computed.bandwidth ?? null;

  // ---------------------------------------------------------------- render

  if (!hasTopologyRouters) {
    return (
      <div id="analytics-view-root" className="flex-1 h-full bg-base overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto mt-16 card p-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-warn-soft border border-warn text-warn">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">No topology to analyse</h2>
              <p className="text-sm text-ink-soft">
                This page reports on the routers in the topology on the designer
                canvas. Add one or more routers there, then come back — until then
                there is nothing to measure.
              </p>
            </div>
          </div>
          <p className="text-xs font-mono text-ink-muted">
            No routers are present on the canvas, so the running lab is not shown.
          </p>
        </div>
      </div>
    );
  }

  if (!reachedLab) {
    return (
      <div className="flex-1 h-full bg-base overflow-y-auto p-8 flex items-center justify-center">
        <div className="flex items-center gap-3 text-ink-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="font-mono text-sm">Connecting to the measurement backend…</span>
        </div>
      </div>
    );
  }

  if (!lab?.online) {
    return (
      <div id="analytics-view-root" className="flex-1 h-full bg-base overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto mt-16 card p-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-bad-soft border border-bad text-bad">
              <Plug className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">No lab is running</h2>
              <p className="text-sm text-ink-soft">
                Analytics reports values measured from real routers, so it needs the
                Docker/FRR lab to be up.
              </p>
            </div>
          </div>
          <pre className="bg-sunken border border-line rounded-lg p-4 text-xs font-mono text-ink-soft overflow-x-auto">
            cd enterprise-ospf-lab && docker compose up -d
          </pre>
          {labError && (
            <p className="text-xs font-mono text-bad-soft border border-bad/50 rounded-lg p-3">
              {labError}
            </p>
          )}
          <button onClick={loadLab} className="btn-secondary">
            <RefreshCw className="w-3.5 h-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  // The lab is up, but none of the canvas routers are in it. Saying so beats
  // silently listing lab routers the user never drew.
  if (routerIds.length === 0) {
    const labRouters = lab.devices.filter((d) => d.type === 'router').map((d) => d.id);
    return (
      <div id="analytics-view-root" className="flex-1 h-full bg-base overflow-y-auto p-8">
        <div className="max-w-2xl mx-auto mt-16 card p-8 space-y-4">
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-xl bg-warn-soft border border-warn text-warn">
              <Layers className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-ink">No overlapping routers</h2>
              <p className="text-sm text-ink-soft">
                None of the routers in the topology are present in the running lab,
                so there is no measured pair to report.
              </p>
            </div>
          </div>
          <div className="space-y-1 text-xs font-mono text-ink-muted">
            <p>On the canvas: {topologyRouters.map((d) => d.id).join(', ')}</p>
            <p>In the running lab: {labRouters.join(', ') || '—'}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div id="analytics-view-root" className="flex-1 h-full bg-base overflow-y-auto p-6 space-y-6 select-none">
      {/* ------------------------------------------------------------ header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-accent-soft border border-accent">
            <BarChart3 className="w-5 h-5 text-accent" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2 flex-wrap">
              <span>Network Performance Analytics</span>
              <span className="pill-ok">
                <span className="w-1.5 h-1.5 rounded-full bg-ok" />
                Lab online
              </span>
            </h2>
            <p className="text-sm text-ink-soft mt-0.5">
              {routerIds.length} of {topologyRouters.length} topology router
              {topologyRouters.length === 1 ? '' : 's'} present in the live lab &middot;{' '}
              every figure below is measured, not modelled
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="analytics-source">Source</label>
            <select
              id="analytics-source"
              className="field w-32"
              value={source}
              onChange={(e) => setSource(e.target.value)}
            >
              {routerIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
          </div>
          <ArrowRight className="w-4 h-4 text-ink-faint mb-3" />
          <div>
            <label className="label" htmlFor="analytics-destination">Destination</label>
            <select
              id="analytics-destination"
              className="field w-32"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
            >
              {routerIds.map((id) => (
                <option key={id} value={id}>{id}</option>
              ))}
            </select>
            {pairState && (
              <p
                className={`text-[10px] font-mono mt-1 ${pairState.reachable ? 'text-ok' : 'text-bad'}`}
              >
                {pairState.known === false
                  ? 'pair not yet probed'
                  : pairState.reachable
                    ? 'confirmed reachable'
                    : 'no path — pick another'}
              </p>
            )}
          </div>
          <button
            id="analytics-measure"
            onClick={run}
            disabled={busy || source === destination}
            className="btn-primary mb-px"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Radar className="w-3.5 h-3.5" />}
            {busy ? 'Measuring…' : 'Measure now'}
          </button>
          <label className="btn-secondary mb-px cursor-pointer">
            <input
              type="checkbox"
              className="accent-accent"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            Auto
          </label>
        </div>
      </div>

      {/* ------------------------------------------ routing method selector */}
      <div className="card p-4 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-lg bg-ai-soft border border-ai">
              <GitFork className="w-4 h-4 text-ai" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-ink">Routing method</h3>
              <p className="text-[11px] text-ink-muted font-mono">
                Both are measured below; this selects which one the lab is asked to forward.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => applyMethod(true)}
              disabled={steering || !steerable || methodAlreadyInEffect}
              className="btn-ai"
            >
              {steering ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
              Apply to lab
            </button>
            <button
              onClick={() => applyMethod(false)}
              disabled={steering || method === 'ospf'}
              className="btn-secondary"
            >
              Revert to OSPF
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {METHODS.map((m) => {
            const isActive = method === m.key;
            const matches = live?.path_taken_matches?.[m.key];
            return (
              <button
                key={m.key}
                onClick={() => setMethod(m.key)}
                className={`text-left p-3 rounded-xl border transition-colors ${
                  isActive
                    ? 'border-accent bg-accent-soft'
                    : 'border-line bg-panel hover:border-line-strong'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className={`text-xs font-bold ${isActive ? 'text-accent' : 'text-ink'}`}>
                    {m.label}
                  </span>
                  {matches !== undefined &&
                    // With an unanswered hop in the trace, neither a match nor a
                    // mismatch can be claimed. Saying "not forwarding" there
                    // would report a routing difference that was never observed.
                    (live?.path_taken_complete === false ? (
                      <span className="pill-faint" title="A hop in the traceroute went unanswered, so the path the packet walked is not fully known">
                        unverified
                      </span>
                    ) : matches ? (
                      <span className="pill-ok">in effect</span>
                    ) : (
                      <span className="pill">not forwarding</span>
                    ))}
                </div>
                <p className="text-[10px] font-mono text-ink-muted mt-1">{m.hint}</p>
                {live && (
                  <p className="text-[10px] font-mono text-ink-soft mt-1 truncate">
                    {(live[m.key].path ?? []).join(' → ') || 'no path'}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        {live && (
          <p
            className={`text-[11px] font-mono ${
              live.active.method === method && methodAlreadyInEffect ? 'text-ok' : 'text-warn'
            }`}
          >
            {live.active.method === method && methodAlreadyInEffect ? '✓ ' : '! '}
            {live.active.method === method
              ? live.active.note
              : `${live.active.label} is the method being measured. Selecting a different method re-measures.`}
          </p>
        )}

        {steerForSelection?.commands && steerForSelection.commands.length > 0 && (
          <div className="text-[10px] font-mono text-ink-muted">
            Would install: {steerForSelection.commands.join(' · ')}
          </div>
        )}

        {note && (
          <p className="text-[11px] font-mono text-ok flex items-start gap-2">
            <span className="shrink-0">✓</span>
            <span className="break-words">{note}</span>
          </p>
        )}
      </div>

      {runError && (
        <div className="flex items-start gap-2 rounded-xl bg-bad-soft border border-bad p-4 text-sm text-ink">
          <Info className="w-4 h-4 text-bad shrink-0 mt-0.5" />
          <div>
            <div className="font-bold text-bad">Measurement failed</div>
            <div className="text-ink-soft font-mono text-xs mt-1 break-words">{runError}</div>
          </div>
        </div>
      )}

      {!live && busy && (
        <div className="flex items-center gap-3 p-8 card justify-center text-ink-muted">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="font-mono text-sm">Pinging the lab, tracing hops, reading interfaces…</span>
        </div>
      )}

      {live && (
        <>
          {/* ------------------------------------------------ reachability */}
          {!measured && (
            <div className="flex items-start gap-2 rounded-xl bg-warn-soft border border-warn p-4 text-sm">
              <Info className="w-4 h-4 text-warn shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-warn">
                  {source} → {destination} is not reachable end to end
                </div>
                {e2e?.diagnosis && (
                  <div className="text-ink-soft text-xs mt-1 leading-relaxed">{e2e.diagnosis}</div>
                )}
                <div className="text-ink-muted text-xs mt-1 font-mono">
                  Tried: {(e2e?.addresses_tried ?? []).map((a) => a.ip).join(', ') || '—'}
                </div>
              </div>
            </div>
          )}

          {/* ------------------------------------------ the traced packet path */}
          <div className="card p-5 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-base font-bold text-ink flex items-center gap-2">
                <Radar className="w-4 h-4 text-accent" />
                Path the packets actually take
              </h3>
              <span className="text-[10px] font-mono text-ink-muted">
                recovered from traceroute hop addresses
              </span>
            </div>

            {walked.length === 0 ? (
              <p className="text-sm text-ink-faint font-mono">
                {tracedComplete
                  ? `No hop answered, so there is no forwarding path to show. ${e2e?.diagnosis ?? ''}`
                  : `The packet reached ${destination}, but ${
                      live?.path_taken_gaps?.join(' and ') ?? 'a hop'
                    } never answered its traceroute probe, so the routers it passed through cannot be listed. ${e2e?.diagnosis ?? ''}`}
              </p>
            ) : (
              <>
                <PathChain path={walked} highlight={walked[walked.length - 1] ?? ''} />
                <div className="overflow-x-auto">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Hop</th>
                        <th>Address</th>
                        <th>Router</th>
                        <th className="text-right">RTT</th>
                        <th>Matches</th>
                      </tr>
                    </thead>
                    <tbody>
                      {tracedHops.map((hop) => (
                        <tr key={`${hop.hop}-${hop.address ?? 'star'}`}>
                          <td className="font-mono text-ink-muted">{hop.hop}</td>
                          <td className="font-mono">{hop.address ?? '*'}</td>
                          <td className="font-mono text-ink">
                            {hop.device ?? <span className="text-ink-faint">unattributed</span>}
                          </td>
                          <td className="text-right font-mono">
                            {hop.rtt_ms === null ? '—' : `${ms(hop.rtt_ms)} ms`}
                          </td>
                          <td>
                            {hop.device &&
                            METHODS.some((m) => live?.[m.key].path.includes(hop.device as string)) ? (
                              <span className="pill-ok">on path</span>
                            ) : (
                              <span className="pill-faint">—</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            {live && (
              <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-line/60">
                <span className="text-[10px] font-mono uppercase tracking-wider text-ink-muted">
                  matches
                </span>
                {live.path_taken_complete === false ? (
                  <span className="text-[10px] font-mono text-warn">
                    unverified — a hop in the traceroute went unanswered
                    {live.path_taken_gaps?.length
                      ? ` (${live.path_taken_gaps.join(', ')})`
                      : ''}
                    , so the path the packet walked is not fully known
                    {live.end_to_end?.traceroute_attempts
                      ? ` after ${live.end_to_end.traceroute_attempts} traceroute attempts`
                      : ''}
                    . No match or mismatch is claimed.
                  </span>
                ) : (
                  <>
                    {METHODS.map((m) => (
                      <span
                        key={m.key}
                        className={live.path_taken_matches?.[m.key] ? 'pill-ok' : 'pill-faint'}
                      >
                        {m.label}
                      </span>
                    ))}
                    {live.path_taken_matches?.ai && (
                      <span className="text-[10px] font-mono text-ink-muted">
                        AI and OSPF produced the same path here, so the routers
                        cannot be forwarding one rather than the other.
                      </span>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* --------------------------------------------- 6 core parameters */}
          <div className="space-y-3">
            <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-ink-muted flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5" />
              <span>Measured parameters &middot; {source} → {destination}</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
              <MetricCard
                icon={<Clock className="w-4 h-4 text-accent" />}
                label="Latency (RTT)"
                value={measured ? `${ms(e2e?.latency_ms)} ms` : 'unreachable'}
                detail={
                  measured
                    ? `min ${ms(e2e?.rtt_min_ms)} · max ${ms(e2e?.rtt_max_ms)} ms · ${e2e?.packets_received}/${e2e?.packets_sent} replies`
                    : e2e?.diagnosis ?? 'no reply from the destination'
                }
                source={e2e?.command}
                tone={measured ? 'ok' : 'bad'}
                action={trend.length > 1 ? <Sparkline points={trend} /> : undefined}
              />
              <MetricCard
                icon={<Zap className="w-4 h-4 text-ai" />}
                label="Jitter"
                value={measured ? `${ms(e2e?.jitter_ms)} ms` : '—'}
                detail="Mean deviation between consecutive replies"
                source={e2e?.command}
              />
              <MetricCard
                icon={<ShieldCheck className="w-4 h-4 text-ok" />}
                label="Packet loss"
                value={measured ? pct(e2e?.packet_loss_percent) : '—'}
                detail={
                  measured
                    ? `${e2e?.packets_received}/${e2e?.packets_sent} replies received`
                    : 'no replies'
                }
                source={e2e?.command}
                tone={(e2e?.packet_loss_percent ?? 0) > 0 ? 'bad' : 'ok'}
              />
              <MetricCard
                icon={<Layers className="w-4 h-4 text-info" />}
                label="Hop count"
                value={measured ? `${e2e?.hop_count ?? '—'}` : '—'}
                detail={
                  e2e?.traceroute_command
                    ? 'Hops answered along the live path'
                    : 'Traceroute unavailable'
                }
                source={e2e?.traceroute_command}
              />
              <MetricCard
                icon={<TrendingUp className="w-4 h-4 text-accent" />}
                label="Throughput (observed)"
                value={throughput ? `${throughput.throughput_mbps.toFixed(1)} Mbps` : '—'}
                detail={
                  throughput
                    ? `${(throughput.rx_bytes / 1e6).toFixed(2)} MB in / ${(throughput.tx_bytes / 1e6).toFixed(2)} MB out over ${throughput.sample_seconds}s on ${throughput.container}`
                    : 'Run a throughput probe to populate'
                }
                source={throughput ? 'byte-counter delta from /proc/net/dev' : undefined}
                action={<button onClick={runThroughput} className="btn-ghost !px-2 !py-1 text-[10px]">probe</button>}
              />
              <MetricCard
                icon={<Timer className="w-4 h-4 text-warn" />}
                label="Convergence time"
                value={
                  convergence?.convergence_ms !== null && convergence?.convergence_ms !== undefined
                    ? `${convergence.convergence_ms.toFixed(0)} ms`
                    : 'not measured'
                }
                detail={
                  convergence
                    ? `Link ${convergence.link.container}/${convergence.link.interface} → ${convergence.detected ? 'recovered' : 'no recovery within timeout'}`
                    : 'Breaks a live link and times recovery — opt in below'
                }
                source={convergence ? 'timed link-down + reachability poll' : undefined}
                tone={convergence?.detected ? 'ok' : undefined}
                action={
                  <label className="btn-ghost !px-2 !py-1 text-[10px] cursor-pointer">
                    <input
                      type="checkbox"
                      className="accent-accent"
                      checked={includeConvergence}
                      onChange={(e) => setIncludeConvergence(e.target.checked)}
                    />
                    enable
                  </label>
                }
              />
            </div>
          </div>

          {/* ------------------------------------------ OSPF vs AI comparison */}
          <div className="card p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-lg bg-accent-soft border border-accent">
                  <GitFork className="w-4 h-4 text-accent" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-ink">OSPF vs AI path</h3>
                  <p className="text-xs text-ink-muted font-mono">
                    {live.model} &middot; confidence {live.confidence}%
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-3 text-[10px] font-mono text-ink-muted">
                <span>measured {ago(live.measured_at)}</span>
                {includeConvergence && convergence && (
                  <span className={convergence.detected ? 'text-ok' : 'text-bad'}>
                    convergence {convergence.convergence_ms?.toFixed(0) ?? '—'} ms
                  </span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <RouteCard
                title="OSPF (what the routers forward)"
                tone="warn"
                report={live.ospf}
                segments={live.ospf.segments}
                selected={method === 'ospf'}
                forwarding={live.path_taken_matches?.ospf === true}
              />
              <RouteCard
                title="AI (Random Forest selection)"
                tone="accent"
                report={live.ai}
                segments={live.ai.segments}
                confidence={live.confidence}
                selected={method === 'ai'}
                forwarding={live.path_taken_matches?.ai === true}
              />
            </div>

            <div className="overflow-x-auto">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Parameter</th>
                    <th>OSPF</th>
                    <th>AI</th>
                    <th>Better</th>
                  </tr>
                </thead>
                <tbody>
                  {live.comparison.rows.map((row) => (
                    <tr key={row.parameter}>
                      <td className="font-semibold text-ink">{row.parameter}</td>
                      <td className="font-mono">{row.ospf}</td>
                      <td className="font-mono">{row.ai}</td>
                      <td>
                        <span
                          className={
                            row.winner === 'ai'
                              ? 'pill-ok'
                              : row.winner === 'ospf'
                                ? 'pill-warn'
                                : 'pill'
                          }
                        >
                          {row.winner === 'tie' ? 'tie' : row.winner === 'n/a' ? 'n/a' : row.winner}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* ------------------------------------------ per-link interface stats */}
          <div className="card p-5 space-y-3">
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <Link2 className="w-4 h-4 text-accent" />
              Interface counters on the {METHODS.find((m) => m.key === method)?.label} path
            </h3>
            {ospfLinks.length === 0 ? (
              <p className="text-sm text-ink-faint font-mono">
                No interface on this path could be resolved.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Hop</th>
                      <th>Interface</th>
                      <th>State</th>
                      <th className="text-right">Rx pkts</th>
                      <th className="text-right">Tx pkts</th>
                      <th className="text-right">Rx MB</th>
                      <th className="text-right">Tx MB</th>
                      <th className="text-right">Queue len</th>
                      <th className="text-right">Qdisc drops</th>
                      <th className="text-right">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ospfLinks.map((link, index) => (
                      <tr key={`${link.container}-${link.interface}-${index}`}>
                        <td className="font-mono text-ink">
                          {link.from} → {link.to}
                        </td>
                        <td className="font-mono text-xs">
                          {link.container}/{link.interface}
                          <span className="block text-ink-faint">{link.local_ip}</span>
                        </td>
                        <td>
                          <span className={link.state === 'up' ? 'pill-ok' : 'pill-bad'}>
                            {link.state}
                          </span>
                        </td>
                        <td className="text-right font-mono">{link.rx_packets.toLocaleString()}</td>
                        <td className="text-right font-mono">{link.tx_packets.toLocaleString()}</td>
                        <td className="text-right font-mono">{(link.rx_bytes / 1e6).toFixed(2)}</td>
                        <td className="text-right font-mono">{(link.tx_bytes / 1e6).toFixed(2)}</td>
                        <td className="text-right font-mono">{link.queue_length}</td>
                        <td className={`text-right font-mono ${link.qdisc_drops > 0 ? 'text-bad' : ''}`}>
                          {link.qdisc_drops}
                        </td>
                        <td className={`text-right font-mono ${link.errors > 0 ? 'text-bad' : ''}`}>
                          {link.errors}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="flex flex-wrap gap-4 pt-1 text-[11px] font-mono text-ink-muted">
              <span>Path capacity: {pathBandwidth ? `${pathBandwidth} Mbps` : '—'}</span>
              <span>qdisc drops: <span className={queueDrops > 0 ? 'text-bad' : 'text-ok'}>{queueDrops}</span></span>
              <span>interface errors: <span className={interfaceErrors > 0 ? 'text-bad' : 'text-ok'}>{interfaceErrors}</span></span>
            </div>
          </div>

          {/* ------------------------------------------------- AI path ranking */}
          <div className="card p-5 space-y-3">
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <Cpu className="w-4 h-4 text-ai" />
              Candidate paths scored by {live.model}
            </h3>
            <div className="space-y-2">
              {live.ai_ranking.map((candidate, index) => (
                <div key={candidate.path.join('>')} className="space-y-1">
                  <div className="flex items-center justify-between gap-3 text-xs font-mono">
                    <span className="flex items-center gap-2 min-w-0">
                      <span className={index === 0 ? 'pill-ai' : 'pill'}>{index === 0 ? 'chosen' : `#${index + 1}`}</span>
                      <span className="truncate text-ink-soft">{candidate.path.join(' → ')}</span>
                    </span>
                    <span className="text-ink shrink-0">
                      q={(candidate.quality * 100).toFixed(1)}% &middot; {candidate.hop_count}h &middot; cost {candidate.total_cost}
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-sunken overflow-hidden border border-line">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-accent to-info"
                      style={{ width: `${Math.max(2, candidate.quality * 100)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* ------------------------------------------------------ provenance */}
          <div className="card p-5 space-y-3">
            <h3 className="text-base font-bold text-ink flex items-center gap-2">
              <ServerCog className="w-4 h-4 text-info" />
              How these numbers were produced
            </h3>
            <p className="text-xs text-ink-soft leading-relaxed">
              Each figure above came from a command executed inside the lab containers.
              Nothing on this page is a placeholder.
            </p>
            <div className="space-y-1.5 font-mono text-[11px] text-ink-muted">
              <CommandLine label="end-to-end ping" command={e2e?.command} />
              <CommandLine label="hop trace" command={e2e?.traceroute_command} />
              {throughput && (
                <CommandLine
                  label="throughput"
                  command={`/proc/net/dev deltas on ${throughput.container} over ${throughput.sample_seconds}s`}
                />
              )}
              {convergence && (
                <CommandLine
                  label="convergence"
                  command={`ip link set ${convergence.link.interface} down on ${convergence.link.container}, then poll reachability`}
                />
              )}
            </div>
          </div>
        </>
      )}

      {/* -------------------------------------------------------- OSPF areas */}
      {lab && <OspfAreas routerIds={routerIds} onChanged={run} />}

      {/* ------------------------------------------------------ lab controls */}
      {lab && (
        <LabControls
          lab={lab}
          onChanged={() => {
            loadLab();
            run();
          }}
        />
      )}

      {/* ------------------------------------------------------- dataset card */}
      {dataset && (
        <div className="card p-5 space-y-3">
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <Database className="w-4 h-4 text-accent" />
            Random Forest training set
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 font-mono">
            <Figure label="Rows" value={String(dataset.total)} />
            <Figure
              label="Measured"
              value={String(dataset.measured)}
              tone={dataset.measured_ratio > 0.5 ? 'ok' : 'warn'}
            />
            <Figure label="Synthetic" value={String(dataset.synthetic)} />
            <Figure
              label="Measured %"
              value={`${(dataset.measured_ratio * 100).toFixed(1)}%`}
              tone={dataset.measured_ratio > 0.5 ? 'ok' : 'warn'}
            />
            <Figure
              label="Ready"
              value={dataset.ready_for_training ? 'yes' : 'no'}
              tone={dataset.ready_for_training ? 'ok' : 'warn'}
            />
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            {Object.entries(dataset.labels).map(([label, count]) => (
              <span key={label} className="pill-accent">
                {label}: {count}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

/* ------------------------------------------------------------------ pieces */

/**
 * OSPF areas across the live lab, read from each router's OSPF process.
 *
 * Area 0 is the backbone and is shown as such rather than as a value to pick.
 * Changing an interface's area genuinely re-floods the area, so a change is
 * previewed -- with the pairs it puts at risk -- and only then applied.
 */
function OspfAreas({
  routerIds,
  onChanged,
}: {
  /** Routers to show: the drawn topology's routers that are present in the lab. */
  routerIds: string[];
  onChanged: () => void;
}) {
  const [inventory, setInventory] = useState<OspfAreaInventory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [device, setDevice] = useState('');
  const [iface, setIface] = useState('');
  const [target, setTarget] = useState('');

  const [preview, setPreview] = useState<OspfAreaPreview | null>(null);
  const [result, setResult] = useState<OspfAreaApplied | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await getOspfAreas();
      setInventory(data);
      setError(null);
    } catch (err) {
      // Keep the last good inventory rather than blanking the panel: a single
      // failed re-read should not look like the lab went away.
      setError(err instanceof Error ? err.message : String(err));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  // Only the routers this page is scoped to. The inventory is lab-wide, so it
  // is filtered here rather than shown wholesale.
  const routers = useMemo(
    () => inventory?.routers.filter((r) => routerIds.includes(r.device)) ?? [],
    [inventory, routerIds]
  );

  const router: OspfAreaRouter | null =
    routers.find((r) => r.device === device) ?? null;
  const selectedIface = router?.interfaces.find((i) => i.interface === iface) ?? null;

  // Default the pickers to the first router and its first interface once the
  // inventory arrives, and keep them valid across a reload.
  useEffect(() => {
    if (!routers.length) return;
    if (!routers.some((r) => r.device === device)) {
      setDevice(routers[0].device);
      return;
    }
    const first = routers.find((r) => r.device === device);
    if (first && !first.interfaces.some((i) => i.interface === iface)) {
      setIface(first.interfaces[0]?.interface ?? '');
    }
  }, [routers, device, iface]);

  // The suggested target is the first non-backbone area this lab already runs,
  // so the default is a real area rather than an invented one.
  useEffect(() => {
    if (target || !inventory?.areas.length) return;
    const first = inventory.areas.find((a) => a !== inventory.backbone_area);
    setTarget(first === undefined ? '1' : String(first));
  }, [inventory, target]);

  /** Run a preview or an apply, then re-read the live areas on success. */
  const guard = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
      setError(null);
      await load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  if (!inventory) {
    return (
      <div className="card p-5 space-y-2">
        <h3 className="text-base font-bold text-ink flex items-center gap-2">
          <GitFork className="w-4 h-4 text-ai" />
          OSPF areas
        </h3>
        {error ? (
          <p className="text-xs text-bad font-mono">{error}</p>
        ) : (
          <p className="text-xs text-ink-muted">Reading area state from the routers…</p>
        )}
      </div>
    );
  }

  const backbone = inventory.backbone_dotted;
  const abrs = new Set(inventory.abrs);

  return (
    <div className="card p-5 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-bold text-ink flex items-center gap-2">
            <GitFork className="w-4 h-4 text-ai" />
            OSPF areas
          </h3>
          <p className="text-xs text-ink-soft mt-0.5">
            Read from each router with{' '}
            <span className="font-mono text-ink">show ip ospf interface</span>. Area{' '}
            <span className="font-mono text-ink">{backbone}</span> is the backbone ·
            areas in use {inventory.areas_dotted.join(', ')}
          </p>
        </div>
        <button className="btn-secondary" onClick={load} disabled={busy !== null}>
          <RefreshCw className={`w-3.5 h-3.5 ${busy ? 'animate-spin' : ''}`} /> Re-read
        </button>
      </div>

      {/* ------------------------------------------------------- per-router */}
      <div className="overflow-x-auto">
        <table className="data-table w-full text-xs">
          <thead>
            <tr>
              <th className="text-left">Router</th>
              <th className="text-left">Role</th>
              <th className="text-left">Router ID</th>
              <th className="text-left">Areas</th>
              <th className="text-left">Interfaces</th>
            </tr>
          </thead>
          <tbody>
            {routers.map((r) => (
              <tr key={r.device}>
                <td className="font-mono text-ink">{r.device}</td>
                <td>
                  <span className={abrs.has(r.device) ? 'pill-info' : 'pill-faint'}>
                    {r.role}
                  </span>
                </td>
                <td className="font-mono text-ink-soft">{r.router_id ?? '—'}</td>
                <td className="font-mono text-ink-soft">{r.areas_dotted.join(', ')}</td>
                <td className="font-mono text-[11px] text-ink-muted">
                  {r.interfaces
                    .map((i) => `${i.interface}:${i.area === 0 ? '0' : i.area}`)
                    .join('  ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* ------------------------------------------------------- area editor */}
      <div className="bg-panel border border-line rounded-xl p-4 space-y-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
          Move an interface to another area
        </span>

        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="label" htmlFor="ospf-device">Router</label>
            <select
              id="ospf-device"
              className="field w-28"
              value={device}
              onChange={(e) => {
                setDevice(e.target.value);
                setPreview(null);
                setResult(null);
              }}
            >
              {routers.map((r) => (
                <option key={r.device} value={r.device}>{r.device}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ospf-iface">Interface</label>
            <select
              id="ospf-iface"
              className="field w-28"
              value={iface}
              onChange={(e) => {
                setIface(e.target.value);
                setPreview(null);
                setResult(null);
              }}
            >
              {(router?.interfaces ?? []).map((i) => (
                <option key={i.interface} value={i.interface}>
                  {i.interface} · area {i.area === 0 ? '0' : i.area}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label" htmlFor="ospf-target">Target area</label>
            <input
              id="ospf-target"
              className="field w-24"
              value={target}
              onChange={(e) => {
                setTarget(e.target.value);
                setPreview(null);
              }}
            />
          </div>
          <button
            className="btn-primary"
            disabled={busy !== null || !selectedIface || selectedIface.area === 0}
            onClick={() =>
              guard('preview', async () => {
                const p = await setOspfArea(device, iface, target, true);
                // The backend returns one shape or the other; a preview that
                // came back applied would mean the two calls were crossed.
                if (p.preview) {
                  setPreview(p);
                  setResult(null);
                }
              })
            }
          >
            {busy === 'preview' ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Radar className="w-3.5 h-3.5" />
            )}
            Preview change
          </button>
        </div>

        {selectedIface?.area === 0 && (
          <p className="text-[11px] text-warn leading-relaxed">
            {iface} is on the backbone, so it cannot be moved into another area — that
            would strand {device}, because non-backbone areas only learn about each
            other through area 0. Add an interface in the target area to make{' '}
            {device} an ABR instead.
          </p>
        )}

        {/* --------------------------------------------------------- preview */}
        {preview && (
          <div className="border border-warn rounded-xl p-3 space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-wider text-warn">
              Preview · {preview.device}/{preview.interface} {preview.from_area_dotted} →{' '}
              {preview.to_area_dotted}
            </p>
            <p className="text-xs text-ink-soft leading-relaxed">{preview.warning}</p>
            {preview.at_risk_count > 0 && (
              <div className="font-mono text-[11px] text-ink-muted max-h-24 overflow-y-auto">
                {preview.at_risk_pairs.map((p) => (
                  <div key={`${p.source}-${p.destination}`}>
                    {p.source} → {p.destination}
                  </div>
                ))}
              </div>
            )}
            {(preview.would_become_abr || preview.was_abr) && (
              <p className="text-[11px] text-info">
                {preview.would_become_abr
                  ? `${preview.device} becomes an ABR: it will hold interfaces in more than one area.`
                  : `${preview.device} stops being an ABR.`}
              </p>
            )}
            <button
              className="btn-danger"
              disabled={busy !== null}
              onClick={() =>
                guard('apply', async () => {
                  const applied = await setOspfArea(device, iface, target, false);
                  if (!applied.preview) {
                    setResult(applied);
                    setPreview(null);
                  }
                })
              }
            >
              {busy === 'apply' ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Zap className="w-3.5 h-3.5" />
              )}
              Apply area change
            </button>
          </div>
        )}

        {/* ---------------------------------------------------------- result */}
        {result && (
          <div className="border border-ok rounded-xl p-3 space-y-1">
            <p className="text-[11px] font-bold uppercase tracking-wider text-ok">
              Applied · measured read-back
            </p>
            <p className="text-xs text-ink-soft leading-relaxed">{result.message}</p>
          </div>
        )}

        {error && <p className="text-xs text-bad font-mono leading-relaxed">{error}</p>}

        {inventory.errors.length > 0 && (
          <p className="text-[11px] text-warn font-mono">
            {inventory.errors.length} router(s) did not report areas:{' '}
            {inventory.errors.map((e) => e.device).join(', ')}
          </p>
        )}
      </div>

      <p className="text-[11px] text-ink-muted leading-relaxed">
        Changing an area is a routing change, not a label: OSPF only forms an adjacency
        between interfaces in the same area, so moving one side of a link leaves the
        far side unable to route over it until it follows. The change is applied through{' '}
        <span className="font-mono text-ink">vtysh</span> and confirmed by reading the
        OSPF process back — a refused command still exits 0, so exit status alone proves
        nothing.
      </p>
    </div>
  );
}

/**
 * Direct control of the lab: degrade a real link, take a real link down, and
 * trigger a real dataset collection. Without this the measured numbers have
 * no visible cause, and the training-set composition cannot be changed from
 * the UI at all.
 */
function LabControls({
  lab,
  onChanged,
}: {
  lab: LabStatus;
  onChanged: () => void;
}) {
  const [device, setDevice] = useState(lab.devices[0]?.id ?? '');
  const [iface, setIface] = useState('eth0');
  const [delay, setDelay] = useState(0);
  const [loss, setLoss] = useState(0);
  const [rate, setRate] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [log, setLog] = useState<{ text: string; tone: 'ok' | 'bad' | 'info' }[]>([]);
  // Named `trafficList` rather than `traffic` so it does not collide with the
  // imported `setTraffic` API call used by the buttons below.
  const [trafficList, setTrafficList] = useState<TrafficGenerator[]>([]);
  const [trafficDevice, setTrafficDevice] = useState('R1');
  const [trafficInterval, setTrafficInterval] = useState(0.2);

  const selected = lab.devices.find((d) => d.id === device);
  const interfaces = selected ? Object.keys(selected.addresses) : [];

  // Only routers originate transit traffic. A host's neighbours are other LAN
  // members, so pinging them would load the LAN rather than the routed links
  // whose counters this page reports.
  const routers = lab.devices
    .filter((d) => d.type === 'router')
    .map((d) => d.id);

  // Keep the interface valid when the device changes.
  useEffect(() => {
    if (interfaces.length && !interfaces.includes(iface)) setIface(interfaces[0]);
  }, [interfaces.join(','), iface]);

  // Whether traffic is flowing is a measurement condition rather than a network
  // property, so it is polled instead of being inferred from a counter that may
  // have stopped for any other reason.
  const refreshTraffic = useCallback(async () => {
    try {
      const result = await getTraffic();
      setTrafficList(result.generators);
    } catch {
      setTrafficList([]);
    }
  }, []);

  useEffect(() => {
    refreshTraffic();
    const timer = setInterval(refreshTraffic, 10000);
    return () => clearInterval(timer);
  }, [refreshTraffic]);

  useEffect(() => {
    if (routers.length && !routers.includes(trafficDevice)) {
      setTrafficDevice(routers[0]);
    }
  }, [routers.join(','), trafficDevice]);

  const note = (text: string, tone: 'ok' | 'bad' | 'info' = 'info') =>
    setLog((prev) => [{ text, tone }, ...prev].slice(0, 5));

  const guard = async (key: string, fn: () => Promise<string>) => {
    setBusy(key);
    try {
      note(await fn());
      onChanged();
    } catch (error) {
      note(error instanceof Error ? error.message : String(error), 'bad');
    } finally {
      setBusy(null);
    }
  };

  const impairing = delay > 0 || loss > 0 || rate > 0;

  return (
    <div className="card p-5 space-y-4">
      <h3 className="text-base font-bold text-ink flex items-center gap-2">
        <Plug className="w-4 h-4 text-warn" />
        Lab controls
      </h3>
      <p className="text-xs text-ink-soft leading-relaxed">
        Applies real <span className="font-mono text-ink">tc</span> impairment and real{' '}
        <span className="font-mono text-ink">ip link</span> state changes inside the containers.
        Change something, then measure again to see the effect.
      </p>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* ------------------------------------------------ traffic source */}
        <div className="bg-panel border border-line rounded-xl p-4 space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            Traffic generator
          </span>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor="traffic-device">Source</label>
              <select
                id="traffic-device"
                className="field w-28"
                value={trafficDevice}
                onChange={(e) => setTrafficDevice(e.target.value)}
              >
                {routers.map((id) => (
                  <option key={id} value={id}>{id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="traffic-interval">Ping every (s)</label>
              <input
                id="traffic-interval"
                type="number"
                min={0.2}
                step={0.1}
                className="field w-20"
                value={trafficInterval}
                onChange={(e) => setTrafficInterval(Number(e.target.value) || 0.2)}
              />
            </div>
            <button
              disabled={busy !== null}
              className="btn-primary"
              onClick={() =>
                guard('traffic', async () => {
                  const r = await setTraffic(trafficDevice, true, trafficInterval);
                  await refreshTraffic();
                  return r.message;
                })
              }
            >
              {busy === 'traffic' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
              Start traffic
            </button>
            <button
              disabled={busy !== null}
              className="btn-secondary"
              onClick={() =>
                guard('traffic', async () => {
                  const r = await setTraffic(trafficDevice, false);
                  await refreshTraffic();
                  return r.message;
                })
              }
            >
              Stop traffic
            </button>
          </div>

          {trafficList.length > 0 ? (
            <ul className="space-y-1">
              {trafficList.map((g) => (
                <li
                  key={g.device}
                  className="text-[11px] font-mono text-ok flex flex-wrap items-center gap-2"
                >
                  <span className="pill-ok">running</span>
                  <span>
                    {g.device} → {g.targets.join(', ')} every {g.interval_seconds}s,{' '}
                    {g.running_seconds}s elapsed
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[11px] text-ink-muted leading-relaxed">
              No generator is running, so the interface counters hold their last
              values. Start one to make them advance.
            </p>
          )}
        </div>

        {/* --------------------------------------------------- impairment */}
        <div className="bg-panel border border-line rounded-xl p-4 space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            Impair a link (tc netem / tbf)
          </span>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="label" htmlFor="impair-device">Device</label>
              <select
                id="impair-device"
                className="field w-28"
                value={device}
                onChange={(e) => setDevice(e.target.value)}
              >
                {lab.devices.map((d) => (
                  <option key={d.id} value={d.id}>{d.id}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="impair-iface">Interface</label>
              <select
                id="impair-iface"
                className="field w-28"
                value={iface}
                onChange={(e) => setIface(e.target.value)}
              >
                {interfaces.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label" htmlFor="impair-delay">Delay ms</label>
              <input
                id="impair-delay"
                type="number"
                min={0}
                className="field w-20"
                value={delay}
                onChange={(e) => setDelay(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="label" htmlFor="impair-loss">Loss %</label>
              <input
                id="impair-loss"
                type="number"
                min={0}
                max={100}
                className="field w-20"
                value={loss}
                onChange={(e) => setLoss(Number(e.target.value) || 0)}
              />
            </div>
            <div>
              <label className="label" htmlFor="impair-rate">Cap Mbps</label>
              <input
                id="impair-rate"
                type="number"
                min={0}
                className="field w-20"
                value={rate}
                onChange={(e) => setRate(Number(e.target.value) || 0)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy !== null || !impairing}
              className="btn-danger"
              onClick={() =>
                guard('impair', async () => {
                  const r = await applyImpairment({
                    device,
                    interface: iface,
                    delay: delay || undefined,
                    loss: loss || undefined,
                    bandwidth: rate || undefined,
                  });
                  if (r.errors?.length) throw new Error(r.errors.join('; '));
                  return `Applied ${delay || 0}ms delay, ${loss || 0}% loss, ${rate ? `${rate}Mbps cap` : 'no cap'} to ${device}/${iface}`;
                })
              }
            >
              {busy === 'impair' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Activity className="w-3.5 h-3.5" />}
              Apply
            </button>
            <button
              disabled={busy !== null}
              className="btn-secondary"
              onClick={() =>
                guard('clear', async () => {
                  const r = await applyImpairment({ device, interface: iface, clear: true });
                  if (r.errors?.length) throw new Error(r.errors.join('; '));
                  setDelay(0);
                  setLoss(0);
                  setRate(0);
                  return `Cleared impairment on ${device}/${iface}`;
                })
              }
            >
              Clear
            </button>
          </div>
        </div>

        {/* ------------------------------------------------- link + dataset */}
        <div className="bg-panel border border-line rounded-xl p-4 space-y-3">
          <span className="text-[11px] font-bold uppercase tracking-wider text-ink-muted">
            Link failure and training data
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              disabled={busy !== null}
              className="btn-danger"
              onClick={() =>
                guard('down', async () => {
                  const r = await setLinkState(device, iface, false);
                  return `Took ${device}/${iface} down: ${r.output.trim().split('\n').pop() ?? 'ok'}`;
                })
              }
            >
              <Plug className="w-3.5 h-3.5" /> Take link down
            </button>
            <button
              disabled={busy !== null}
              className="btn-secondary"
              onClick={() =>
                guard('up', async () => {
                  const r = await setLinkState(device, iface, true);
                  return `Brought ${device}/${iface} up: ${r.output.trim().split('\n').pop() ?? 'ok'}`;
                })
              }
            >
              Bring link up
            </button>
            <button
              disabled={busy !== null}
              className="btn-ai"
              onClick={() =>
                guard('collect', async () => {
                  const r = await collectDataset(66);
                  return `${r.message}. This runs in the background and takes several minutes.`;
                })
              }
            >
              {busy === 'collect' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Database className="w-3.5 h-3.5" />}
              Collect measured dataset
            </button>
          </div>
          <p className="text-[11px] text-ink-muted leading-relaxed">
            Collection measures every reachable router pair under five real conditions
            (clean, mild, moderate, heavy, loaded) so the Random Forest sees genuine
            latency, loss and queue backlog rather than a single flat operating point.
          </p>
        </div>
      </div>

      {log.length > 0 && (
        <div className="space-y-1 border-t border-line pt-3">
          {log.map((entry, index) => (
            <div
              key={`${entry.text}-${index}`}
              className={`text-[11px] font-mono flex items-start gap-2 ${
                entry.tone === 'bad'
                  ? 'text-bad'
                  : entry.tone === 'ok'
                    ? 'text-ok'
                    : 'text-ink-muted'
              }`}
            >
              <span className="shrink-0">{entry.tone === 'bad' ? '✗' : entry.tone === 'ok' ? '✓' : '›'}</span>
              <span className="break-words">{entry.text}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/** Rolling latency trend from the last N measurements. Gaps stay gaps: a
 *  missing sample is drawn as a break rather than interpolated into a line. */
function Sparkline({ points }: { points: Array<{ at: number; latency: number | null }> }) {
  const values = points.map((p) => p.latency).filter((v): v is number => v !== null);
  if (values.length < 2) return null;

  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = hi - lo || 1;
  const W = 64;
  const H = 18;

  const coords = points.map((p, i) =>
    p.latency === null
      ? null
      : {
          x: (i / Math.max(1, points.length - 1)) * W,
          y: H - ((p.latency - lo) / span) * (H - 3) - 1.5,
        }
  );

  // Split into contiguous runs so unanswered samples break the line.
  const runs: string[] = [];
  let current: string[] = [];
  for (const c of coords) {
    if (c === null) {
      if (current.length > 1) runs.push(current.join(' '));
      current = [];
    } else {
      current.push(`${current.length === 0 ? 'M' : 'L'}${c.x.toFixed(1)},${c.y.toFixed(1)}`);
    }
  }
  if (current.length > 1) runs.push(current.join(' '));

  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} className="shrink-0" aria-label="latency trend">
      {runs.map((d, i) => (
        <path key={i} d={d} fill="none" stroke="currentColor" strokeWidth="1.25" className="text-accent" />
      ))}
    </svg>
  );
}

function MetricCard({
  icon,
  label,
  value,
  detail,
  source,
  tone,
  action,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  detail: string;
  source?: string | null;
  tone?: 'ok' | 'bad' | 'warn';
  action?: React.ReactNode;
}) {
  const toneClass =
    tone === 'bad'
      ? 'text-bad'
      : tone === 'warn'
        ? 'text-warn'
        : 'text-ink';

  return (
    <div className="bg-panel border border-line rounded-xl p-4 space-y-2 hover:border-line-strong transition-colors">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wider text-ink-muted">
          {icon}
          {label}
        </span>
        {action}
      </div>
      <div className={`text-2xl font-extrabold font-mono tracking-tight ${toneClass}`}>{value}</div>
      <div className="text-[11px] text-ink-muted font-mono leading-relaxed">{detail}</div>
      {source && (
        <div className="text-[10px] text-ink-faint font-mono truncate pt-1 border-t border-line/60" title={source}>
          {source}
        </div>
      )}
    </div>
  );
}

function RouteCard({
  title,
  tone,
  report,
  segments,
  confidence,
  selected,
  forwarding,
}: {
  title: string;
  tone: 'warn' | 'accent' | 'info';
  report: RouteReport;
  segments: RouteReport['segments'];
  confidence?: number;
  selected?: boolean;
  forwarding?: boolean;
}) {
  const border = tone === 'warn' ? 'border-warn' : tone === 'info' ? 'border-info' : 'border-accent';
  const heading = tone === 'warn' ? 'text-warn' : tone === 'info' ? 'text-info' : 'text-accent';
  const pill = tone === 'warn' ? 'pill-warn' : tone === 'info' ? 'pill-info' : 'pill-accent';

  return (
    <div
      className={`bg-panel border rounded-xl p-4 space-y-3 ${
        selected ? 'border-2 ring-1 ring-accent/40' : border
      }`}
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <span className={`text-sm font-bold ${heading}`}>{title}</span>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {forwarding && <span className="pill-ok">forwarding</span>}
          {selected && <span className="pill-accent">selected</span>}
          <span className={pill}>{report.basis}</span>
        </div>
      </div>

      <PathChain
              path={report.path}
              highlight={report.path[report.path.length - 1] ?? ''}
            />
            {report.hops.length > 0 && (
              <div className="text-[10px] font-mono text-ink-muted truncate" title="traceroute">
                {report.hops
                  .map((h) => (h.device ?? h.address ?? '*'))
                  .join(' → ')}
              </div>
            )}

      <div className="grid grid-cols-3 gap-2 font-mono text-[11px]">
        <Figure label="Measured" value={`${ms(report.latency_ms)} ms`} small />
        <Figure label="Hops" value={String(report.hop_count)} small />
        <Figure label="Segments" value={`${report.measured_segments}/${report.hop_count}`} small />
      </div>

      {confidence !== undefined && (
        <div className="text-[11px] font-mono text-ink-muted">
          model confidence <span className="text-accent font-bold">{confidence}%</span>
        </div>
      )}

      {segments.length > 0 && (
        <div className="space-y-1 pt-1 border-t border-line/60">
          {segments.map((segment) => (
            <div key={`${segment.from}-${segment.to}`} className="flex items-center justify-between font-mono text-[11px]">
              <span className="text-ink-muted">
                {segment.from} → {segment.to}
              </span>
              <span className={segment.reachable ? 'text-ink' : 'text-bad'}>
                {segment.reachable ? `${ms(segment.latency_ms)} ms` : 'unreachable'}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
  small,
}: {
  label: string;
  value: string;
  tone?: 'ok' | 'warn';
  small?: boolean;
}) {
  const valueClass =
    tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-ink';
  return (
    <div className="space-y-0.5">
      <div className="text-[10px] uppercase tracking-wider text-ink-muted">{label}</div>
      <div className={`font-bold ${small ? 'text-sm' : 'text-lg'} ${valueClass}`}>{value}</div>
    </div>
  );
}

function CommandLine({ label, command }: { label: string; command?: string | null }) {
  if (!command) return null;
  return (
    <div className="flex gap-2 items-start">
      <span className="text-ink-faint shrink-0 w-28 text-right">{label}</span>
      <span className="text-ink-soft break-all">{command}</span>
    </div>
  );
}
