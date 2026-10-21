import React from 'react';
import { Container, Trash2, Loader2, TriangleAlert, CircleCheck } from 'lucide-react';
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
  onTeardown: () => void;
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
  onTeardown,
}) => {
  const running = Boolean(deployState?.running);
  const canDeploy = routerCount >= 2 && linkCount >= 1;

  const status = !running
    ? { text: 'No lab running', tone: 'text-ink-muted' }
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
