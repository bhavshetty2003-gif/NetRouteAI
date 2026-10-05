import React, { useEffect, useRef, useState } from 'react';

/* ------------------------------------------------------------------ *
 * Google Identity Services button.
 *
 * Google renders this button inside an iframe it controls, so the markup is
 * Google's and not ours -- we only supply a host element and the client id.
 * The client id arrives as a prop from `/api/auth/config` rather than being
 * written into the bundle, so there is exactly one place to configure it.
 *
 * The parent renders nothing at all when `clientId` is empty. That is
 * deliberate: a "Continue with Google" button that cannot work is worse than no
 * button, and it would put a broken control on the page for every developer who
 * has not set up a Google Cloud project yet.
 * ------------------------------------------------------------------ */

const GIS_SRC = 'https://accounts.google.com/gsi/client';

declare global {
  interface Window {
    google?: {
      accounts: {
        id: {
          initialize: (config: { client_id: string; callback: (response: { credential: string }) => void }) => void;
          renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
        };
      };
    };
  }
}

let gisPromise: Promise<void> | null = null;

/** Load the GIS script once per page, however many buttons ask for it. */
function loadGis(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (gisPromise) return gisPromise;

  gisPromise = new Promise<void>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement('script');
    script.src = GIS_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => {
      // Allow a later attempt to retry rather than caching the failure forever.
      gisPromise = null;
      reject(new Error("Google sign-in could not be loaded. Check your connection."));
    };
    if (!existing) document.head.appendChild(script);
  });

  return gisPromise;
}

interface GoogleButtonProps {
  clientId: string;
  onCredential: (credential: string) => void;
  onError: (message: string) => void;
  disabled?: boolean;
  text?: 'signin' | 'signup' | 'continue';
}

export const GoogleSignInButton: React.FC<GoogleButtonProps> = ({
  clientId,
  onCredential,
  onError,
  disabled = false,
  text = 'continue',
}) => {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;

    loadGis()
      .then(() => {
        if (cancelled || !hostRef.current || !window.google) return;
        window.google.accounts.id.initialize({
          client_id: clientId,
          callback: ({ credential }) => onCredential(credential),
        });
        window.google.accounts.id.renderButton(hostRef.current, {
          type: 'standard',
          theme: 'outline',
          size: 'large',
          text,
          shape: 'rectangular',
          width: 320,
          // The page is dark by default; a white-on-white logo would be
          // invisible rather than merely ugly.
          color: 'scheme_light',
          logo_alignment: 'left',
        });
        setReady(true);
      })
      .catch((error: Error) => {
        if (!cancelled) onError(error.message);
      });

    return () => {
      cancelled = true;
    };
  }, [clientId, onCredential, onError, text]);

  if (!clientId) return null;

  return (
    <div className="flex flex-col items-center gap-2">
      <div
        ref={hostRef}
        className={`flex justify-center min-h-[44px] ${disabled ? 'opacity-50 pointer-events-none' : ''}`}
        data-google-ready={ready ? 'true' : 'false'}
      />
      {!ready && (
        <span className="text-[10px] text-ink-muted font-mono">Loading Google sign-in...</span>
      )}
    </div>
  );
};