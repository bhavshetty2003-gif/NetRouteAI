import React, { useCallback, useState } from 'react';
import { AuthShell, AuthSpinner } from './AuthUi';
import { LoginPage } from './LoginPage';
import { RegisterPage } from './RegisterPage';
import { ForgotPasswordPage } from './ForgotPasswordPage';
import type { AuthUser } from '../../utils/auth';

type Mode = 'login' | 'register' | 'forgot';

/** A Google identity that has been verified but has no account yet. */
export interface GooglePending {
  pending_token: string;
  email: string;
  name: string;
}

interface AuthScreenProps {
  onAuthenticated: (user: AuthUser) => void;
  onClose: () => void;
}

/**
 * The single entry point for signing in or registering.
 *
 * It owns which panel is showing so that "create an account", "forgot password"
 * and "already registered?" are navigable from inside the overlay, instead of
 * being three separate modals the home page has to keep in sync.
 *
 * It also holds the pending Google identity. When someone signs in with Google
 * and no account exists yet, the verified email and name have to survive the hop
 * from the login panel to the register panel -- otherwise the user is asked for
 * the same email again and the backend rejects the second attempt as a
 * duplicate.
 */
export const AuthScreen: React.FC<AuthScreenProps> = ({ onAuthenticated, onClose }) => {
  const [mode, setMode] = useState<Mode>('login');
  const [googlePending, setGooglePending] = useState<GooglePending | null>(null);

  const goToRegister = useCallback((pending?: GooglePending | null) => {
    setGooglePending(pending ?? null);
    setMode('register');
  }, []);

  const goToLogin = useCallback(() => {
    setGooglePending(null);
    setMode('login');
  }, []);

  return (
    <div
      className="fixed inset-0 bg-panel/85 backdrop-blur-md flex items-start sm:items-center justify-center p-4 z-50 animate-in fade-in duration-200 overflow-y-auto"
      role="dialog"
      aria-modal="true"
      onClick={(event) => {
        // Only a click on the backdrop itself dismisses, so a click that
        // started inside a panel and ended outside does not close it.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {mode === 'login' && (
        <LoginPage
          onAuthenticated={onAuthenticated}
          onGoToRegister={goToRegister}
          onGoToForgot={() => setMode('forgot')}
          onClose={onClose}
        />
      )}

      {mode === 'register' && (
        <RegisterPage
          onAuthenticated={onAuthenticated}
          onGoToLogin={goToLogin}
          onGoToForgot={() => setMode('forgot')}
          onGoToRegister={goToRegister}
          onClose={onClose}
          googlePending={googlePending}
        />
      )}

      {mode === 'forgot' && <ForgotPasswordPage onGoToLogin={goToLogin} onClose={onClose} />}
    </div>
  );
};

/** Shown while the stored session token is being checked, before anything is known. */
export const AuthLoading: React.FC = () => (
  <div className="min-h-screen bg-base text-ink flex items-center justify-center p-4 bg-grid-pattern">
    <div className="w-full max-w-md bg-panel border border-line rounded-2xl shadow-2xl p-6 space-y-5">
      <AuthShell title="NetRouteAI" subtitle="Checking your session...">
        <div className="py-6">
          <AuthSpinner label="Loading your account" />
        </div>
      </AuthShell>
    </div>
  </div>
);