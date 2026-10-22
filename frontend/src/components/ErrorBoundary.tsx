import React from 'react';
import { AlertTriangle, RotateCcw } from 'lucide-react';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Shown instead of the default panel. Used by the auth gate, which has its
   *  own shell. */
  fallback?: (error: Error, reset: () => void) => React.ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Catches a render-time crash and shows a recoverable panel instead of a blank
 * page.
 *
 * React unmounts the whole tree when a component throws during render, so one
 * bad value from the backend used to leave the user with an empty document and
 * no way forward except reloading. This keeps the failure local and says what
 * happened.
 *
 * The error is reported to the console rather than to a third party: nothing
 * in this project sends telemetry, and the app must not start doing so because
 * a component failed.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('NetRouteAI: a component failed to render', error, info.componentStack);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;
    if (this.props.fallback) return this.props.fallback(error, this.reset);

    return (
      <div className="min-h-screen bg-base flex items-center justify-center p-6">
        <div
          role="alert"
          className="max-w-lg w-full bg-panel border border-bad/40 rounded-xl p-6 shadow-xl"
        >
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-bad-soft border border-bad/40 text-bad shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-semibold text-ink">Something went wrong</h1>
              <p className="text-xs text-ink-muted mt-1 leading-relaxed">
                The page could not be drawn because a value it received was not what it
                expected. The details are in the browser console. Your topology is saved
                separately and has not been lost.
              </p>
              <pre className="mt-3 text-[11px] font-mono text-ink-soft bg-overlay/40 border border-line rounded-lg p-3 overflow-x-auto whitespace-pre-wrap break-words">
                {error.message || String(error)}
              </pre>
              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={this.reset}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-ink text-xs font-bold hover:opacity-90 transition-opacity"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  Try again
                </button>
                <button
                  type="button"
                  onClick={() => window.location.reload()}
                  className="px-4 py-2 rounded-lg border border-line text-xs font-semibold text-ink-soft hover:bg-overlay/40 transition-colors"
                >
                  Reload the page
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }
}
