import React from 'react';
import { Container, Rocket, Trash2, Building2, Loader2, TriangleAlert, CircleCheck } from 'lucide-react';
import type { DeployState } from '../utils/api';

interface LabDeployBarProps {
  /** Routers currently on the canvas. */
  routerCount: number;
  linkCount: number;
  deployState: DeployState | null;
  /** False when the running lab was not built from what is on the canvas. */
  matchesCanvas: boolean;
  isBusy: boolean;
  isPlanning: boolean;
  message: { kind: 'ok' | 'bad'; text: string } | null;
  onPlan: () => void;
  onDeploy: () => void;
  onTeardown: () => void;
  onDeployEnterprise: () => void;
}

/**
 * Builds the drawn topology as the lab that gets measured.
 *
 * Nothing else in the app can guarantee the analytics page describes the
 * topology the user drew: measurement targets the running lab, so the running
 * lab has to be the drawing. This bar is the one place that changes it, and it
 * says which lab is running so a mismatch is visible rather than silent.
 */
export const LabDeployBar: React.FC<LabDeployBarProps> = ({
  routerCount,
  linkCount,
  deployState,
  matchesCanvas,
  isBusy,
  isPlanning,
  message,
  onPlan,
  onDeploy,
  onTeardown,
  onDeployEnterprise,
}) => {
  const running = Boolean(deployState?.running);
  const isFallback = deployState?.source === 'enterprise-ospf-lab';
  const canDeploy = routerCount >= 2 && linkCount >= 1;

  const status = !running
    ? { text: 'No lab running', tone: 'text-ink-muted' }
    : isFallback
      ? { text: 'Running the fixed enterprise-ospf-lab', tone: 'text-warn' }
      : matchesCanvas
        ? { text: `Running this canvas (${deployState?.plan?.routers.length ?? routerCount} routers)`, tone: 'text-ok' }
        : { text: 'Running a lab that is out of step with this canvas', tone: 'text-warn' };

  return (
    <div className="border-b border-line bg-base px-3 py-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
          <Container className="w-3.5 h-3.5 text-accent" />
          Lab
        </span>

        <span className={`flex items-center gap-1.5 text-[11px] font-mono ${status.tone}`}>
          {running ? <CircleCheck className="w-3.5 h-3.5" /> : <TriangleAlert className="w-3.5 h-3.5" />}
          {status.text}
        </span>

        <div className="ml-auto flex items-center gap-1.5">
          <button
            type="button"
            onClick={onPlan}
            disabled={isBusy || isPlanning || !canDeploy}
            className="flex items-center gap-1.5 rounded border border-line bg-panel px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted hover:text-ink-soft hover:border-ink-faint disabled:opacity-40 disabled:cursor-not-allowed"
            title="Allocate an address for every unaddressed link"
          >
            {isPlanning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Container className="w-3 h-3" />}
            Plan addresses
          </button>

          <button
            type="button"
            onClick={onDeploy}
            disabled={isBusy || !canDeploy}
            className="flex items-center gap-1.5 rounded border border-accent/50 bg-accent-soft px-2.5 py-1.5 text-[11px] font-semibold text-accent hover:border-accent disabled:opacity-40 disabled:cursor-not-allowed"
            title="Build this canvas as a real lab"
          >
            {isBusy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Rocket className="w-3 h-3" />}
            {isBusy ? 'Building…' : 'Build lab from this canvas'}
          </button>

          {running && (
            <button
              type="button"
              onClick={onTeardown}
              disabled={isBusy}
              className="flex items-center gap-1.5 rounded border border-line bg-panel px-2.5 py-1.5 text-[11px] font-semibold text-ink-muted hover:text-bad hover:border-bad/50 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Stop and remove the running lab"
            >
              <Trash2 className="w-3 h-3" />
              Remove
            </button>
          )}

          <button
            type="button"
            onClick={onDeployEnterprise}
            disabled={isBusy}
            className="flex items-center gap-1.5 rounded border border-line bg-panel px-2.5 py-1.5 text-[11px] font-semibold text-ink-faint hover:text-ink-muted hover:border-ink-faint disabled:opacity-40 disabled:cursor-not-allowed"
            title="Start the pre-built 12-router reference lab"
          >
            <Building2 className="w-3 h-3" />
            Reference lab
          </button>
        </div>
      </div>

      {!canDeploy && (
        <p className="text-[10px] text-ink-faint mt-1">
          Draw at least two routers and connect them to build a lab.
        </p>
      )}

      {message && (
        <p
          className={`text-[10px] mt-1 leading-snug ${
            message.kind === 'ok' ? 'text-ok' : 'text-bad'
          }`}
        >
          {message.text}
        </p>
      )}
    </div>
  );
};
