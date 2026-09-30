import React from 'react';
import { Packet, NetworkCable } from '../types/network';
import { computeMetrics } from '../utils/simulationEngine';
import {
  Activity,
  CheckCircle,
  XCircle,
  Clock,
  Wifi,
  Zap,
  Link,
  TrendingUp,
  BarChart3,
} from 'lucide-react';

interface SimulationMetricsPanelProps {
  packets: Packet[];
  cables: NetworkCable[];
}

export const SimulationMetricsPanel: React.FC<SimulationMetricsPanelProps> = ({
  packets,
  cables,
}) => {
  const metrics = computeMetrics(packets, cables);

  const statCards = [
    {
      label: 'Packets Sent',
      value: metrics.packetsSent,
      icon: Activity,
      color: 'text-accent',
      bg: 'bg-accent/10 border-accent/30',
    },
    {
      label: 'Delivered',
      value: metrics.packetsDelivered,
      icon: CheckCircle,
      color: 'text-ok',
      bg: 'bg-ok/10 border-ok/30',
    },
    {
      label: 'Dropped',
      value: metrics.packetsDropped,
      icon: XCircle,
      color: 'text-bad',
      bg: 'bg-bad/10 border-bad/30',
    },
    {
      label: 'Delivery Ratio',
      value: `${metrics.packetDeliveryRatio}%`,
      icon: TrendingUp,
      color: 'text-ok',
      bg: 'bg-ok/10 border-ok/30',
    },
    {
      label: 'Avg Delay',
      value: `${metrics.averageDelay}ms`,
      icon: Clock,
      color: 'text-warn',
      bg: 'bg-warn/10 border-warn/30',
    },
    {
      label: 'Throughput',
      value: `${metrics.throughput} Mbps`,
      icon: Wifi,
      color: 'text-accent',
      bg: 'bg-accent/10 border-accent/30',
    },
    {
      label: 'Link Utilization',
      value: `${metrics.linkUtilization}%`,
      icon: Link,
      color: 'text-ai',
      bg: 'bg-ai/10 border-ai/30',
    },
    {
      label: 'Active Flows',
      value: metrics.activeFlows,
      icon: Zap,
      color: 'text-info',
      bg: 'bg-info/10 border-info/30',
    },
    {
      label: 'Failed Links',
      value: metrics.failedLinks,
      icon: XCircle,
      color: 'text-bad',
      bg: 'bg-bad/10 border-bad/30',
    },
    {
      label: 'Avg Hop Count',
      value: metrics.averageHopCount,
      icon: BarChart3,
      color: 'text-ink-muted',
      bg: 'bg-overlay/10 border-line-strong/30',
    },
  ];

  return (
    <div className="w-80 bg-base border-l border-line p-4 text-ink overflow-y-auto">
      <div className="flex items-center gap-2 mb-4">
        <BarChart3 className="w-5 h-5 text-accent" />
        <h2 className="text-lg font-bold">Live Metrics</h2>
        <span className="ml-auto text-[10px] px-2 py-0.5 rounded-full bg-ok/20 text-ok border border-ok/30 font-mono animate-pulse">
          LIVE
        </span>
      </div>

      <div className="space-y-2">
        {statCards.map((card) => (
          <div
            key={card.label}
            className={`flex items-center justify-between p-2.5 rounded-lg border ${card.bg}`}
          >
            <div className="flex items-center gap-2">
              <card.icon className={`w-4 h-4 ${card.color}`} />
              <span className="text-xs text-ink-muted">{card.label}</span>
            </div>
            <span className={`text-sm font-bold font-mono ${card.color}`}>
              {card.value}
            </span>
          </div>
        ))}
      </div>

      {/* Link utilization bars */}
      <div className="mt-4 pt-3 border-t border-line">
        <h3 className="text-xs font-semibold text-ink-muted uppercase tracking-wider mb-2">
          Link Utilization
        </h3>
        <div className="space-y-1.5">
          {cables
            .filter((c) => c.status === 'active')
            .map((cable) => {
              const bw = cable.bandwidth ?? 100;
              const current = cable.currentPackets ?? 0;
              const util = Math.min(100, (current / Math.max(1, bw)) * 100);
              const barColor =
                util > 90 ? 'bg-bad' :
                util > 70 ? 'bg-warn' :
                util > 30 ? 'bg-warn' :
                'bg-ok';

              return (
                <div key={cable.id} className="flex items-center gap-2">
                  <span className="text-[10px] text-ink-faint font-mono w-20 truncate">
                    {cable.fromDeviceId}→{cable.toDeviceId}
                  </span>
                  <div className="flex-1 h-1.5 bg-panel rounded-full overflow-hidden">
                    <div
                      className={`h-full ${barColor} rounded-full transition-all duration-300`}
                      style={{ width: `${util}%` }}
                    />
                  </div>
                  <span className="text-[10px] text-ink-faint font-mono w-8 text-right">
                    {Math.round(util)}%
                  </span>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
};
