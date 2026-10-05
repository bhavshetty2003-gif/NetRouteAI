import React, { useEffect, useRef, useState } from 'react';
import { Cake, Check, LogOut, Mail, Pencil, Phone, ShieldCheck, User, X } from 'lucide-react';
import { AuthAlert, AuthField } from './auth/AuthUi';
import { AuthError, updateProfile, type AuthUser } from '../utils/auth';

interface ProfileMenuProps {
  user: AuthUser;
  onUpdated: (user: AuthUser) => void;
  onSignOut: () => void;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('') || '?';

/**
 * The signed-in user's details, in the top bar, editable except the email.
 *
 * The email field is rendered `readOnly` rather than simply omitted. Hiding it
 * would make the restriction invisible, so a user who wants to change their
 * address would reasonably conclude the feature is missing rather than
 * deliberate; showing it greyed out with a "cannot be changed" note answers the
 * question before it is asked.
 */
export const ProfileMenu: React.FC<ProfileMenuProps> = ({ user, onUpdated, onSignOut }) => {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(user.name);
  const [age, setAge] = useState(String(user.age));
  const [mobile, setMobile] = useState(user.mobile);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  // Re-seed the form whenever the canonical user changes (after a save, or a
  // re-login), so the inputs never drift from what the server actually holds.
  useEffect(() => {
    setName(user.name);
    setAge(String(user.age));
    setMobile(user.mobile);
  }, [user]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
        setOpen(false);
        setEditing(false);
        setSaved(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        setEditing(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const startEditing = () => {
    setName(user.name);
    setAge(String(user.age));
    setMobile(user.mobile);
    setError(null);
    setSaved(false);
    setEditing(true);
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSaved(false);

    const ageNumber = Number(age);
    if (!name.trim() || name.trim().length < 2) {
      setError('Enter your full name.');
      return;
    }
    if (!Number.isInteger(ageNumber) || ageNumber < 10 || ageNumber > 120) {
      setError('Age must be between 10 and 120.');
      return;
    }
    if (!/^[0-9+][0-9 ()-]{6,19}$/.test(mobile.trim())) {
      setError('Enter a valid mobile number.');
      return;
    }

    setBusy(true);
    try {
      const updated = await updateProfile({
        name: name.trim(),
        age: ageNumber,
        mobile: mobile.trim(),
      });
      onUpdated(updated);
      setSaved(true);
      setEditing(false);
    } catch (failure) {
      setError(failure instanceof AuthError ? failure.message : 'Could not save your details.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative" ref={wrapperRef}>
      <button
        onClick={() => setOpen((value) => !value)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title={`Signed in as ${user.name}`}
        className="flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-xl bg-panel border border-line hover:border-accent/60 transition-colors cursor-pointer"
      >
        <span className="w-7 h-7 rounded-lg bg-gradient-to-br from-accent to-info text-accent-ink text-[11px] font-black font-mono flex items-center justify-center shrink-0">
          {initials(user.name)}
        </span>
        <span className="hidden sm:flex flex-col items-start leading-none">
          <span className="text-[11px] font-bold text-ink max-w-[9rem] truncate">{user.name}</span>
          <span className="text-[9px] font-mono text-ink-muted max-w-[9rem] truncate">{user.email}</span>
        </span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Your account"
          className="absolute right-0 top-full mt-2 w-[22rem] max-w-[calc(100vw-2rem)] bg-panel border border-line rounded-2xl shadow-2xl z-50 overflow-hidden"
        >
          <div className="flex items-center justify-between px-4 py-3 border-b border-line bg-raised/40">
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-widest text-ink-muted">Signed in</p>
              <p className="text-sm font-bold text-ink truncate">{user.name}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close account menu"
              className="p-1.5 rounded-lg text-ink-muted hover:text-accent hover:bg-raised transition-colors cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {!editing ? (
            <>
              <dl className="px-4 py-3 space-y-2.5">
                <Row icon={<User className="w-3.5 h-3.5 text-accent" />} label="Name" value={user.name} />
                <Row icon={<Cake className="w-3.5 h-3.5 text-accent" />} label="Age" value={String(user.age)} />
                <Row icon={<Mail className="w-3.5 h-3.5 text-ink-muted" />} label="Email" value={user.email} muted />
                <Row icon={<Phone className="w-3.5 h-3.5 text-accent" />} label="Mobile" value={user.mobile} />
              </dl>

              <p className="px-4 pb-3 text-[10px] text-ink-muted leading-relaxed flex items-start gap-1.5">
                <ShieldCheck className="w-3 h-3 mt-0.5 shrink-0" />
                Your email address is the account key and cannot be changed after registration. Name,
                age and mobile are editable.
              </p>

              {saved && (
                <div className="px-4 pb-3">
                  <AuthAlert tone="ok" message="Your details were saved." />
                </div>
              )}

              <div className="flex items-center gap-2 px-4 py-3 border-t border-line">
                <button
                  onClick={startEditing}
                  className="flex-1 py-2 rounded-xl bg-accent-soft border border-accent/40 text-accent text-xs font-bold hover:bg-accent hover:text-accent-ink transition-all cursor-pointer inline-flex items-center justify-center gap-1.5"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  Edit details
                </button>
                <button
                  onClick={onSignOut}
                  title="Sign out"
                  className="py-2 px-3 rounded-xl bg-panel border border-line text-ink-soft text-xs font-bold hover:border-bad/50 hover:text-bad transition-all cursor-pointer inline-flex items-center gap-1.5"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign out
                </button>
              </div>
            </>
          ) : (
            <form onSubmit={save} className="px-4 py-4 space-y-3" noValidate>
              {error && <AuthAlert message={error} />}

              <AuthField
                id="profile-name"
                label="Full Name"
                value={name}
                onChange={setName}
                icon={<User className="w-3.5 h-3.5 text-accent" />}
              />

              <div className="grid grid-cols-2 gap-3">
                <AuthField
                  id="profile-age"
                  label="Age"
                  type="number"
                  inputMode="numeric"
                  value={age}
                  onChange={setAge}
                  min={10}
                  max={120}
                  icon={<Cake className="w-3.5 h-3.5 text-accent" />}
                />
                <AuthField
                  id="profile-mobile"
                  label="Mobile"
                  type="tel"
                  inputMode="tel"
                  value={mobile}
                  onChange={setMobile}
                  icon={<Phone className="w-3.5 h-3.5 text-accent" />}
                />
              </div>

              <AuthField
                id="profile-email"
                label="Email Address"
                value={user.email}
                onChange={() => undefined}
                readOnly
                hint="Fixed at registration."
                icon={<Mail className="w-3.5 h-3.5 text-ink-muted" />}
              />

              <div className="flex items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 py-2 rounded-xl bg-gradient-to-r from-accent to-info text-accent-ink text-xs font-bold transition-all cursor-pointer disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  {busy ? 'Saving...' : 'Save changes'}
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className="py-2 px-3 rounded-xl bg-panel border border-line text-ink-soft text-xs font-bold hover:border-accent/50 transition-all cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
};

const Row: React.FC<{
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}> = ({ icon, label, value, muted }) => (
  <div className="flex items-start gap-2.5">
    <span className="mt-0.5 shrink-0">{icon}</span>
    <dt className="text-[10px] font-mono uppercase tracking-wider text-ink-muted w-12 shrink-0 pt-0.5">
      {label}
    </dt>
    <dd
      className={`text-xs font-mono break-all min-w-0 ${muted ? 'text-ink-muted' : 'text-ink'}`}
    >
      {value}
    </dd>
  </div>
);