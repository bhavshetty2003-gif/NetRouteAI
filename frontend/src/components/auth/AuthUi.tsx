import React from 'react';
import { Network } from 'lucide-react';

/* Shared chrome for the sign-in / registration / reset screens.

Every colour class used here already appears elsewhere in the app, so the
WCAG pairings are covered by `scripts/audit_contrast.py` rather than being a new
untested set of tokens.
 */

export const AuthShell: React.FC<{
  title: string;
  subtitle: string;
  onClose?: () => void;
  children: React.ReactNode;
}> = ({ title, subtitle, onClose, children }) => (
  <div className="w-full max-w-md bg-panel border border-line rounded-2xl shadow-2xl p-6 sm:p-7 space-y-5 relative">
    {onClose && (
      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-4 right-4 p-1.5 rounded-lg text-ink-muted hover:text-accent hover:bg-raised transition-colors cursor-pointer"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    )}

    <div className="text-center space-y-2">
      <div className="inline-flex p-3 rounded-2xl bg-accent-soft border border-accent/40 text-accent shadow-lg">
        <Network className="w-6 h-6 text-accent" />
      </div>
      <h2 className="text-xl font-bold text-ink tracking-tight">{title}</h2>
      <p className="text-xs text-ink-muted leading-relaxed">{subtitle}</p>
    </div>

    {children}
  </div>
);

export const AuthField: React.FC<{
  id: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string | null;
  hint?: string;
  autoComplete?: string;
  required?: boolean;
  inputMode?: 'text' | 'email' | 'tel' | 'numeric';
  readOnly?: boolean;
  min?: number;
  max?: number;
  icon?: React.ReactNode;
}> = ({
  id,
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  error,
  hint,
  autoComplete,
  required = true,
  inputMode,
  readOnly = false,
  min,
  max,
  icon,
}) => (
  <div className="space-y-1 text-left">
    <label htmlFor={id} className="text-xs font-medium text-ink-soft flex items-center gap-1.5">
      {icon}
      <span>{label}</span>
    </label>
    <input
      id={id}
      name={id}
      type={type}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      placeholder={placeholder}
      autoComplete={autoComplete}
      required={required}
      inputMode={inputMode}
      readOnly={readOnly}
      min={min}
      max={max}
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
      className={[
        'w-full px-3 py-2 bg-panel border rounded-xl text-xs text-ink font-mono',
        'focus:outline-none transition-colors',
        readOnly
          ? 'border-line/60 bg-sunken text-ink-muted cursor-not-allowed'
          : error
            ? 'border-bad focus:border-bad'
            : 'border-line/80 focus:border-accent',
      ].join(' ')}
    />
    {error ? (
      <p id={`${id}-error`} className="text-[11px] text-bad leading-snug">{error}</p>
    ) : hint ? (
      <p id={`${id}-hint`} className="text-[11px] text-ink-muted leading-snug">{hint}</p>
    ) : null}
  </div>
);

export const AuthAlert: React.FC<{ message: string; tone?: 'bad' | 'ok' | 'info' }> = ({
  message,
  tone = 'bad',
}) => {
  const toneClass =
    tone === 'ok'
      ? 'border-ok/40 bg-ok-soft text-ok'
      : tone === 'info'
        ? 'border-info/40 bg-info-soft text-info'
        : 'border-bad/40 bg-bad-soft text-bad';
  return (
    <div role="alert" className={`rounded-xl border px-3 py-2.5 text-xs leading-relaxed ${toneClass}`}>
      {message}
    </div>
  );
};

export const AuthSubmit: React.FC<{
  busy: boolean;
  busyLabel: string;
  label: string;
  disabled?: boolean;
}> = ({ busy, busyLabel, label, disabled = false }) => (
  <button
    type="submit"
    disabled={busy || disabled}
    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-accent to-info text-accent-ink font-bold text-xs shadow-lg shadow-lift transition-all cursor-pointer flex items-center justify-center space-x-2 disabled:opacity-50 disabled:cursor-not-allowed"
  >
    {busy ? (
      <>
        <span className="w-3.5 h-3.5 border-2 border-line border-t-transparent rounded-full animate-spin" />
        <span>{busyLabel}</span>
      </>
    ) : (
      <span>{label}</span>
    )}
  </button>
);

/** Horizontal rule with a centred word, used to separate password and Google. */
export const AuthDivider: React.FC<{ children: string }> = ({ children }) => (
  <div className="flex items-center gap-3 py-1">
    <span className="h-px flex-1 bg-line" />
    <span className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">{children}</span>
    <span className="h-px flex-1 bg-line" />
  </div>
);

export const AuthSpinner = ({ label }: { label: string }) => (
  <div className="flex items-center justify-center space-x-2 text-ink-muted">
    <span className="w-4 h-4 border-2 border-line border-t-transparent rounded-full animate-spin" />
    <span className="text-xs font-mono">{label}</span>
  </div>
);