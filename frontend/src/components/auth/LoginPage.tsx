import React, { useCallback, useEffect, useState } from 'react';
import { Mail, Lock, UserPlus } from 'lucide-react';
import { AuthAlert, AuthDivider, AuthField, AuthShell, AuthSubmit } from './AuthUi';
import { GoogleSignInButton } from '../GoogleSignInButton';
import {
  AuthError,
  fetchAuthConfig,
  loginUser,
  signInWithGoogle,
  type AuthConfig,
  type AuthUser,
} from '../../utils/auth';

interface LoginPageProps {
  onAuthenticated: (user: AuthUser) => void;
  /** Receives the verified identity when Google sign-in needs an account made. */
  onGoToRegister: (pending?: { pending_token: string; email: string; name: string }) => void;
  onGoToForgot: () => void;
  onClose: () => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({
  onAuthenticated,
  onGoToRegister,
  onGoToForgot,
  onClose,
}) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<{ email?: string; password?: string }>({});
  const [config, setConfig] = useState<AuthConfig>({ google_enabled: false, google_client_id: '' });

  useEffect(() => {
    void fetchAuthConfig().then(setConfig);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError(null);
    setFieldError({});
    try {
      const { user } = await loginUser(email.trim(), password);
      onAuthenticated(user);
    } catch (failure) {
      if (failure instanceof AuthError) {
        setError(failure.message);
        // Only "an account already exists for this email" is attributable to a
        // single field; a generic credential failure is not.
        if (failure.field === 'email') setFieldError({ email: failure.message });
      } else {
        setError('Sign in failed for an unexpected reason.');
      }
    } finally {
      setBusy(false);
    }
  };

  const handleGoogle = useCallback(
    async (credential: string) => {
      setBusy(true);
      setError(null);
      try {
        const result = await signInWithGoogle(credential);
        if (result.status === 'signed_in') {
          onAuthenticated(result.user);
          return;
        }
        // A Google identity with no account yet has to supply age and mobile,
        // which Google does not hold. Hand the verified identity over so the
        // register form does not ask for the email again.
        onGoToRegister({
          pending_token: result.pending_token,
          email: result.email,
          name: result.name,
        });
      } catch (failure) {
        setError(failure instanceof AuthError ? failure.message : 'Google sign-in failed.');
      } finally {
        setBusy(false);
      }
    },
    [onAuthenticated, onGoToRegister],
  );

  const handleGoogleError = useCallback((message: string) => setError(message), []);

  return (
    <AuthShell
      title="Sign in to NetRouteAI"
      subtitle="Use the email and password you registered with."
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {error && <AuthAlert message={error} />}

        <AuthField
          id="email"
          label="Email Address"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={setEmail}
          placeholder="engineer@netroute.ai"
          error={fieldError.email}
          icon={<Mail className="w-3.5 h-3.5 text-accent" />}
        />

        <AuthField
          id="password"
          label="Password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={setPassword}
          placeholder="••••••••••••"
          icon={<Lock className="w-3.5 h-3.5 text-accent" />}
        />

        <div className="flex justify-end">
          <button
            type="button"
            onClick={onGoToForgot}
            className="text-[11px] text-ink-muted hover:text-accent underline underline-offset-4 cursor-pointer"
          >
            Forgot password?
          </button>
        </div>

        <AuthSubmit busy={busy} busyLabel="Signing In..." label="Sign In" />
      </form>

      {config.google_enabled && (
        <>
          <AuthDivider>or</AuthDivider>
          <GoogleSignInButton
            clientId={config.google_client_id}
            onCredential={handleGoogle}
            onError={handleGoogleError}
            disabled={busy}
            text="signin"
          />
        </>
      )}

      <div className="pt-2 border-t border-line text-center">
        <button
          type="button"
          onClick={() => onGoToRegister()}
          className="text-xs font-semibold text-accent hover:text-accent underline underline-offset-4 cursor-pointer inline-flex items-center gap-1.5"
        >
          <UserPlus className="w-3.5 h-3.5" />
          Create a new account
        </button>
      </div>

      <p className="text-[10px] text-ink-muted text-center leading-relaxed">
        Only registered accounts can open the designer. There is no guest or demo access.
      </p>
    </AuthShell>
  );
};