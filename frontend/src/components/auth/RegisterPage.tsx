import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Lock, Phone, Cake, User, ShieldCheck } from 'lucide-react';
import { AuthAlert, AuthDivider, AuthField, AuthShell, AuthSubmit } from './AuthUi';
import { GoogleSignInButton } from '../GoogleSignInButton';
import {
  AuthError,
  completeGoogleRegistration,
  fetchAuthConfig,
  registerUser,
  signInWithGoogle,
  type AuthConfig,
  type AuthUser,
} from '../../utils/auth';

interface RegisterPageProps {
  onAuthenticated: (user: AuthUser) => void;
  onGoToLogin: () => void;
  onGoToForgot: () => void;
  /** Receives the verified identity when Google sign-in needs an account made. */
  onGoToRegister: (pending?: { pending_token: string; email: string; name: string }) => void;
  onClose: () => void;
  /**
   * Set when the user arrived here by signing in with Google. Google supplies a
   * verified email and a name, but not an age or a mobile number, so those two
   * remain to be filled in before the account can exist.
   */
  googlePending?: { pending_token: string; email: string; name: string } | null;
}

/** Mirrors the backend's rule so the form can refuse a bad value immediately. */
const isEmail = (value: string) => /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(value.trim());
const isMobile = (value: string) => /^[0-9+][0-9 ()-]{6,19}$/.test(value.trim());

export const RegisterPage: React.FC<RegisterPageProps> = ({
  onAuthenticated,
  onGoToLogin,
  onGoToForgot,
  onGoToRegister,
  onClose,
  googlePending = null,
}) => {
  const [name, setName] = useState(googlePending?.name ?? '');
  const [age, setAge] = useState('');
  const [email, setEmail] = useState(googlePending?.email ?? '');
  const [mobile, setMobile] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [config, setConfig] = useState<AuthConfig>({ google_enabled: false, google_client_id: '' });

  useEffect(() => {
    void fetchAuthConfig().then(setConfig);
  }, []);

  const ageNumber = Number(age);
  const ageIsValid = age.trim() !== '' && Number.isInteger(ageNumber) && ageNumber >= 10 && ageNumber <= 120;

  const isGoogleFlow = Boolean(googlePending);

  const validate = (): boolean => {
    const next: Record<string, string> = {};

    if (name.trim().length < 2) next.name = 'Enter your full name.';
    if (!isEmail(email)) next.email = 'Enter a valid email address.';
    if (!isMobile(mobile)) next.mobile = 'Enter a valid mobile number.';
    if (!ageIsValid) next.age = 'Age must be between 10 and 120.';

    if (!isGoogleFlow) {
      if (password.length < 8) next.password = 'Password must be at least 8 characters.';
      if (password !== confirm) next.confirm = 'Passwords do not match.';
    }

    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!validate()) return;

    setBusy(true);
    try {
      if (googlePending) {
        const { user } = await completeGoogleRegistration({
          pending_token: googlePending.pending_token,
          age: ageNumber,
          mobile: mobile.trim(),
          name: name.trim(),
        });
        onAuthenticated(user);
        return;
      }

      const { user } = await registerUser({
        name: name.trim(),
        age: ageNumber,
        email: email.trim(),
        password,
        confirm_password: confirm,
        mobile: mobile.trim(),
      });
      onAuthenticated(user);
    } catch (failure) {
      if (failure instanceof AuthError) {
        setError(failure.message);
        if (failure.field) setErrors((current) => ({ ...current, [failure.field as string]: failure.message }));
      } else {
        setError('Registration failed for an unexpected reason.');
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
        // Pass the verified identity up so this same form can complete the
        // registration instead of discarding it.
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

  const subtitle = useMemo(
    () =>
      isGoogleFlow
        ? 'Finish setting up your account. Google gave us your name and email; we still need an age and mobile number.'
        : 'Create an account to open the designer. There is no demo or guest access.',
    [isGoogleFlow],
  );

  return (
    <AuthShell title="Create your NetRouteAI account" subtitle={subtitle} onClose={onClose}>
      <form onSubmit={handleSubmit} className="space-y-3.5" noValidate>
        {error && <AuthAlert message={error} />}

        {isGoogleFlow && (
          <AuthAlert
            tone="info"
            message={`Registering with ${googlePending?.email}. This address will be your sign-in handle.`}
          />
        )}

        <AuthField
          id="name"
          label="Full Name"
          value={name}
          onChange={setName}
          placeholder="Asha Rao"
          autoComplete="name"
          error={errors.name}
          icon={<User className="w-3.5 h-3.5 text-accent" />}
        />

        <div className="grid grid-cols-2 gap-3">
          <AuthField
            id="age"
            label="Age"
            type="number"
            inputMode="numeric"
            value={age}
            onChange={setAge}
            placeholder="21"
            min={10}
            max={120}
            error={errors.age}
            icon={<Cake className="w-3.5 h-3.5 text-accent" />}
          />

          <AuthField
            id="mobile"
            label="Mobile Number"
            type="tel"
            inputMode="tel"
            value={mobile}
            onChange={setMobile}
            placeholder="+91 98765 43210"
            autoComplete="tel"
            error={errors.mobile}
            icon={<Phone className="w-3.5 h-3.5 text-accent" />}
          />
        </div>

        <AuthField
          id="email"
          label="Email Address"
          type="email"
          inputMode="email"
          value={email}
          onChange={setEmail}
          placeholder="engineer@netroute.ai"
          autoComplete="email"
          // A Google identity's address is already verified and is the account
          // key, so it is shown but not editable.
          readOnly={isGoogleFlow}
          error={errors.email}
          hint={isGoogleFlow ? 'Provided by your Google account.' : 'This is your sign-in handle and cannot be changed later.'}
          icon={<Mail className="w-3.5 h-3.5 text-accent" />}
        />

        {!isGoogleFlow && (
          <>
            <AuthField
              id="password"
              label="Password"
              type="password"
              value={password}
              onChange={setPassword}
              placeholder="At least 8 characters"
              autoComplete="new-password"
              error={errors.password}
              icon={<Lock className="w-3.5 h-3.5 text-accent" />}
            />

            <AuthField
              id="confirm"
              label="Confirm Password"
              type="password"
              value={confirm}
              onChange={setConfirm}
              placeholder="Re-enter your password"
              autoComplete="new-password"
              error={errors.confirm}
              icon={<Lock className="w-3.5 h-3.5 text-accent" />}
            />

            <div className="flex justify-end">
              <button
                type="button"
                onClick={onGoToForgot}
                className="text-[11px] text-ink-muted hover:text-accent underline underline-offset-4 cursor-pointer"
              >
                Already have an account but forgot your password?
              </button>
            </div>
          </>
        )}

        <div className="pt-1">
          <AuthSubmit
            busy={busy}
            busyLabel={isGoogleFlow ? 'Creating account...' : 'Creating account...'}
            label={isGoogleFlow ? 'Finish registration' : 'Register'}
          />
        </div>
      </form>

      {!isGoogleFlow && config.google_enabled && (
        <>
          <AuthDivider>or</AuthDivider>
          <GoogleSignInButton
            clientId={config.google_client_id}
            onCredential={handleGoogle}
            onError={handleGoogleError}
            disabled={busy}
            text="signup"
          />
        </>
      )}

      <div className="pt-2 border-t border-line text-center">
        <button
          type="button"
          onClick={onGoToLogin}
          className="text-xs font-semibold text-accent underline underline-offset-4 cursor-pointer inline-flex items-center gap-1.5"
        >
          Already registered? Sign in
        </button>
      </div>

      <p className="text-[10px] text-ink-muted text-center leading-relaxed flex items-start gap-1.5 justify-center">
        <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0" />
        Your password is stored as a bcrypt hash and is never saved or shown in readable form.
      </p>
    </AuthShell>
  );
};