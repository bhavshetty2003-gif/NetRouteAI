import React, { useState } from 'react';
import { Mail, Lock, KeyRound, ArrowLeft, CheckCircle2 } from 'lucide-react';
import { AuthAlert, AuthField, AuthShell, AuthSubmit } from './AuthUi';
import { AuthError, requestPasswordReset, resetPassword } from '../../utils/auth';

interface ForgotPasswordPageProps {
  onGoToLogin: () => void;
  onClose: () => void;
}

/**
 * Two steps in one screen: ask for a reset code, then set a new password.
 *
 * This project has no SMTP configured, so the backend cannot email the code and
 * returns it in the response instead. That is displayed here with an explicit
 * note rather than hidden, because a user who was told to check their inbox and
 * finds nothing there has been actively misled. Wire up SMTP in
 * `auth.request_password_reset` and this note becomes untrue -- remove it then.
 */
export const ForgotPasswordPage: React.FC<ForgotPasswordPageProps> = ({ onGoToLogin, onClose }) => {
  const [stage, setStage] = useState<'request' | 'reset' | 'done'>('request');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [issuedCode, setIssuedCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const handleRequest = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await requestPasswordReset(email.trim());
      if (result.code) setIssuedCode(result.code);
      setStage('reset');
    } catch (failure) {
      setError(failure instanceof AuthError ? failure.message : 'Could not start the password reset.');
    } finally {
      setBusy(false);
    }
  };

  const handleReset = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setFieldErrors({});

    if (!code.trim()) {
      setFieldErrors({ code: 'Enter the reset code.' });
      return;
    }
    if (password.length < 8) {
      setFieldErrors({ password: 'Password must be at least 8 characters.' });
      return;
    }
    if (password !== confirm) {
      setFieldErrors({ confirm: 'Passwords do not match.' });
      return;
    }

    setBusy(true);
    try {
      await resetPassword({
        email: email.trim(),
        code: code.trim(),
        password,
        confirm_password: confirm,
      });
      setStage('done');
    } catch (failure) {
      if (failure instanceof AuthError) {
        setError(failure.message);
        if (failure.field) setFieldErrors({ [failure.field]: failure.message });
      } else {
        setError('Could not reset your password.');
      }
    } finally {
      setBusy(false);
    }
  };

  if (stage === 'done') {
    return (
      <AuthShell
        title="Password changed"
        subtitle="Your password has been updated. Every existing session has been signed out."
        onClose={onClose}
      >
        <AuthAlert
          tone="ok"
          message="Your new password is active. Sign in with it to continue."
        />
        <div className="flex justify-center">
          <button
            onClick={onGoToLogin}
            className="py-2.5 px-6 rounded-xl bg-gradient-to-r from-accent to-info text-accent-ink font-bold text-xs shadow-lg shadow-lift transition-all cursor-pointer inline-flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  if (stage === 'reset') {
    return (
      <AuthShell
        title="Set a new password"
        subtitle={`Enter the code issued for ${email.trim() || 'your email address'}.`}
        onClose={onClose}
      >
        <form onSubmit={handleReset} className="space-y-4" noValidate>
          {error && <AuthAlert message={error} />}

          {issuedCode && (
            <AuthAlert
              tone="info"
              message={`Email delivery is not configured on this server, so your reset code is ${issuedCode}. It is valid for 10 minutes.`}
            />
          )}

          <AuthField
            id="code"
            label="Reset Code"
            inputMode="numeric"
            value={code}
            onChange={setCode}
            placeholder="123456"
            error={fieldErrors.code}
            icon={<KeyRound className="w-3.5 h-3.5 text-accent" />}
          />

          <AuthField
            id="new-password"
            label="New Password"
            type="password"
            value={password}
            onChange={setPassword}
            placeholder="At least 8 characters"
            autoComplete="new-password"
            error={fieldErrors.password}
            icon={<Lock className="w-3.5 h-3.5 text-accent" />}
          />

          <AuthField
            id="confirm-password"
            label="Confirm New Password"
            type="password"
            value={confirm}
            onChange={setConfirm}
            placeholder="Re-enter your new password"
            autoComplete="new-password"
            error={fieldErrors.confirm}
            icon={<Lock className="w-3.5 h-3.5 text-accent" />}
          />

          <AuthSubmit busy={busy} busyLabel="Saving..." label="Change password" />
        </form>

        <div className="pt-2 border-t border-line text-center">
          <button
            type="button"
            onClick={onGoToLogin}
            className="text-xs font-semibold text-accent underline underline-offset-4 cursor-pointer inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to sign in
          </button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Forgot your password?"
      subtitle="Enter the email address you registered with and we will issue a reset code."
      onClose={onClose}
    >
      <form onSubmit={handleRequest} className="space-y-4" noValidate>
        {error && <AuthAlert message={error} />}

        <AuthField
          id="email"
          label="Email Address"
          type="email"
          inputMode="email"
          value={email}
          onChange={setEmail}
          placeholder="engineer@netroute.ai"
          autoComplete="email"
          icon={<Mail className="w-3.5 h-3.5 text-accent" />}
        />

        <AuthSubmit busy={busy} busyLabel="Sending..." label="Send reset code" />
      </form>

      <div className="pt-2 border-t border-line text-center">
        <button
          type="button"
          onClick={onGoToLogin}
          className="text-xs font-semibold text-accent underline underline-offset-4 cursor-pointer inline-flex items-center gap-1.5"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to sign in
        </button>
      </div>

      <p className="text-[10px] text-ink-muted text-center leading-relaxed flex items-start gap-1.5 justify-center">
        <CheckCircle2 className="w-3 h-3 mt-0.5 shrink-0" />
        The response is the same whether or not the address is registered, so this cannot be used
        to discover which emails have accounts.
      </p>
    </AuthShell>
  );
};