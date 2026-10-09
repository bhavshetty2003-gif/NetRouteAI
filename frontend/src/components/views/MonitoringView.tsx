import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { NetworkDevice } from '../../types/network';
import {
  Radio,
  Power,
  RefreshCw,
  Loader2,
  ServerOff,
  TriangleAlert,
  ArrowDownToLine,
  ArrowUpFromLine,
} from 'lucide-react';
import { DeviceIcon } from '../DeviceIcons';
import { getLabSweep, setLinkState, type LabSweep } from '../../utils/api';

interface MonitoringViewProps {
  /** Routers drawn on the canvas. The lab sweep is filtered down to these, so
   *  this page describes the drawn topology rather than whatever else is up. */
  devices: NetworkDevice[];
}

type Interface = LabSweep['interfaces'][string]['interfaces'][number];
type Queue = LabSweep['interfaces'][string]['queues'][string];

function bytes(value: number): string {
  if (value < 1024) return `${value} B`;
  if (value < 1024 ** 2) return `${(value / 1024).toFixed(1)} KiB`;
  if (value < 1024 ** 3) return `${(value / 1024 ** 2).toFixed(1)} MiB`;
  return `${(value / 1024 ** 3).toFixed(2)} GiB`;
}

/**
 * Interface state and counters for the routers on the canvas, read from the
 * running lab.
 *
 * Every number here is a counter the kernel keeps on the interface, sampled by
 * the backend at the time shown. Toggling an interface runs `ip link set dev …`
 * inside the container, so the change is a real link going down and comes back
 * with the next sweep -- not a colour change on a drawing. When no lab is
 * running there is nothing to read, and the page says so rather than showing
 * zeroes that look like a healthy idle network.
 */
export const MonitoringView: React.FC<MonitoringViewProps> = ({ devices }) => {
  const [sweep, setSweep] = useState<LabSweep | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [sampledAt, setSampledAt] = useState<number | null>(null);

  const routerIds = useMemo(
    () =>
      new Set(
        devices.filter((d) => d.type === 'router').map((d) => d.id.toUpperCase())
      ),
    [devices]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getLabSweep(false);
      setSweep(result);
      setSampledAt(Date.now());
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setSweep(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const toggle = useCallback(
    async (device: string, iface: string, up: boolean) => {
      const key = `${device}/${iface}`;
      setBusy(key);
      setError(null);
      try {
        await setLinkState(device, iface, up);
        // Re-read rather than assuming: `ip link set` can be refused, and the
        // next sweep is what says whether it actually took.
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setBusy(null);
      }
    },
    [load]
  );

  const online = sweep !== null && sweep.lab.online && sweep.lab.device_count > 0;
  const deviceById = useMemo(
    () => new Map(devices.map((d) => [d.id.toUpperCase(), d] as const)),
    [devices]
  );

  // Only what is drawn and only routers: a canvas-only router has no container
  // to read, and a lab-only router is not part of the topology being monitored.
  const rows = useMemo(() => {
    if (!sweep) return [];
    return Object.entries(sweep.interfaces)
      .filter(([name]) => routerIds.has(name.toUpperCase()))
      .sort(([a], [b]) => a.localeCompare(b, undefined, { numeric: true }))
      .flatMap(([name, data]) =>
        data.interfaces
          .filter((iface) => iface.name !== 'lo')
          .map((iface) => ({
            device: name,
            drawn: deviceById.get(name.toUpperCase()),
            container: data.container,
            iface,
            queue: data.queues[iface.name],
          }))
      );
  }, [sweep, routerIds, deviceById]);

  const totalErrors = rows.reduce((sum, r) => sum + r.iface.rx_errors + r.iface.tx_errors, 0);
  const totalDrops = rows.reduce(
    (sum, r) => sum + (r.queue ? r.queue.dropped : 0),
    0
  );

  return (
    <div className="flex-1 h-full bg-base overflow-y-auto p-6 space-y-5 text-ink">
      <div className="flex items-start justify-between gap-4 border-b border-line pb-4">
        <div>
          <h2 className="text-xl font-bold text-ink tracking-tight flex items-center gap-2">
            <Radio className="w-5 h-5 text-accent" />
            <span>Interface health</span>
          </h2>
          <p className="text-xs text-ink-muted mt-1 max-w-2xl">
            Sampled {sampledAt ? new Date(sampledAt).toLocaleTimeString() : '—'}
          </p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 rounded border border-line bg-panel px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted hover:text-ink-soft hover:border-ink-faint disabled:opacity-50 shrink-0"
        >
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
          Re-read
        </button>
      </div>

      {error && (
        <div className="flex items-start gap-2 p-3 rounded-lg bg-bad/10 border border-bad/30">
          <TriangleAlert className="w-4 h-4 text-bad shrink-0 mt-0.5" />
          <p className="text-xs text-ink-muted break-words">{error}</p>
        </div>
      )}

      {!online ? (
        <div className="flex items-start gap-2 p-4 rounded-lg bg-warn/10 border border-warn/30">
          <ServerOff className="w-5 h-5 text-warn shrink-0 mt-0.5" />
          <p className="text-sm text-ink-muted">No lab is running.</p>
        </div>
      ) : (
        <>
          <div className="flex flex-wrap gap-4 text-xs text-ink-muted font-mono">
            <span>
              routers <span className="text-ink font-bold">{new Set(rows.map((r) => r.device)).size}</span>
            </span>
            <span>
              interfaces <span className="text-ink font-bold">{rows.length}</span>
            </span>
            <span>
              errors{' '}
              <span className={totalErrors ? 'text-bad font-bold' : 'text-ink font-bold'}>
                {totalErrors}
              </span>
            </span>
            <span>
              qdisc drops{' '}
              <span className={totalDrops ? 'text-warn font-bold' : 'text-ink font-bold'}>
                {totalDrops}
              </span>
            </span>
          </div>

          <div className="space-y-3">
            {rows.map((row) => (
              <InterfaceRow
                key={`${row.device}/${row.iface.name}`}
                device={row.device}
                drawnName={row.drawn?.name}
                drawnIp={row.drawn?.ipAddress}
                model={row.drawn?.model}
                container={row.container}
                iface={row.iface}
                queue={row.queue}
                busy={busy === `${row.device}/${row.iface.name}`}
                onToggle={(up) => toggle(row.device, row.iface.name, up)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
};

interface InterfaceRowProps {
  device: string;
  drawnName?: string;
  drawnIp?: string;
  model?: string;
  container: string;
  iface: Interface;
  queue?: Queue;
  busy: boolean;
  onToggle: (up: boolean) => void;
}

const InterfaceRow: React.FC<InterfaceRowProps> = ({
  device,
  drawnName,
  drawnIp,
  model,
  container,
  iface,
  queue,
  busy,
  onToggle,
}) => {
  const up = iface.state.toUpperCase() === 'UP';
  const problems = iface.rx_errors + iface.tx_errors + iface.rx_dropped + iface.tx_dropped;
  const queueDropped = queue?.dropped ?? 0;

  return (
    <div className="rounded-xl border border-line bg-panel p-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <DeviceIcon type={device.startsWith('R') ? 'router' : 'switch'} size={26} />
          <div className="min-w-0">
            <div className="text-sm font-bold text-ink">
              {drawnName || device}
              <span className="ml-2 text-[11px] font-mono text-ink-faint">
                {container}
              </span>
            </div>
            <div className="text-[11px] font-mono text-ink-muted truncate">
              {drawnIp || 'no address on the canvas'} · {model || ''}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <span
            className={`text-[10px] font-bold font-mono px-2 py-0.5 rounded border ${
              up
                ? 'text-ok border-ok/40 bg-ok/10'
                : 'text-bad border-bad/40 bg-bad/10'
            }`}
          >
            {iface.state}
          </span>
          <button
            onClick={() => onToggle(!up)}
            disabled={busy}
            className={`flex items-center gap-1.5 rounded border px-2.5 py-1 text-[11px] font-bold disabled:opacity-50 ${
              up
                ? 'border-bad/40 text-bad hover:bg-bad/10'
                : 'border-ok/40 text-ok hover:bg-ok/10'
            }`}
            title={`ip link set dev ${iface.name} ${up ? 'down' : 'up'} on ${container}`}
          >
            {busy ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Power className="w-3 h-3" />
            )}
            {up ? 'Take down' : 'Bring up'}
          </button>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 font-mono text-[11px]">
        <Counter
          icon={<ArrowDownToLine className="w-3 h-3 text-info" />}
          label="rx bytes"
          value={bytes(iface.rx_bytes)}
        />
        <Counter
          icon={<ArrowUpFromLine className="w-3 h-3 text-info" />}
          label="tx bytes"
          value={bytes(iface.tx_bytes)}
        />
        <Counter label="rx pkts" value={String(iface.rx_packets)} />
        <Counter label="tx pkts" value={String(iface.tx_packets)} />
        <Counter
          label="errors"
          value={String(iface.rx_errors + iface.tx_errors)}
          tone={iface.rx_errors + iface.tx_errors ? 'bad' : undefined}
        />
        <Counter
          label="qdisc drop"
          value={String(queueDropped)}
          tone={queueDropped ? 'warn' : undefined}
        />
      </div>

      {queue && (
        <p className="mt-2 text-[10px] font-mono text-ink-faint">
          qdisc {queue.kind} · queue {queue.queue_length} · backlog{' '}
          {queue.backlog_packets} · overlimits {queue.overlimits}
        </p>
      )}

      {problems > 0 && (
        <p className="mt-2 text-[10px] font-mono text-warn">
          kernel dropped {iface.rx_dropped} rx / {iface.tx_dropped} tx on this interface
        </p>
      )}
    </div>
  );
};

const Counter: React.FC<{
  icon?: React.ReactNode;
  label: string;
  value: string;
  tone?: 'bad' | 'warn';
}> = ({ icon, label, value, tone }) => (
  <div className="px-2 py-1.5 rounded-lg border border-line bg-sunken">
    <div className="flex items-center gap-1 text-[9px] uppercase tracking-wider text-ink-faint">
      {icon}
      {label}
    </div>
    <div
      className={`font-bold ${
        tone === 'bad' ? 'text-bad' : tone === 'warn' ? 'text-warn' : 'text-ink'
      }`}
    >
      {value}
    </div>
  </div>
);