/* ------------------------------------------------------------------ *
 * Accounts, sessions and Google sign-in.
 *
 * The session token lives in localStorage rather than an httpOnly cookie
 * because the API (:8000) and this UI (:3000) are different origins, so a
 * cross-site cookie would need SameSite=None plus CSRF protection to work at
 * all. A deployed build serves both from one origin, where a cookie would have
 * been fine — the token stays where it is either way, because the storage
 * layout is not something to change lightly under a running session store.
 * The cost of that choice is that the token is readable by any script on
 * the page, so nothing here ever injects it into the DOM and no HTML is ever
 * built from a user-supplied string. That is the whole threat model: an XSS bug
 * elsewhere would be able to steal the token.
 * ------------------------------------------------------------------ */

import { API_BASE } from "./config";

const TOKEN_KEY = "netrouteai_session_token";

/** The profile as the backend exposes it. `email` is read-only by design. */
export interface AuthUser {
  id: number;
  name: string;
  age: number;
  email: string;
  mobile: string;
  created_at: string;
  has_password: boolean;
  has_google: boolean;
}

export interface AuthConfig {
  google_enabled: boolean;
  google_client_id: string;
}

/** An API failure that knows which form field it belongs to. */
export class AuthError extends Error {
  field: string | null;
  status: number;

  constructor(message: string, field: string | null = null, status = 0) {
    super(message);
    this.name = "AuthError";
    this.field = field;
    this.status = status;
  }
}

/* ------------------------------------------------------------------ *
 * Token storage
 * ------------------------------------------------------------------ */

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    // Private-mode Safari and a blocked-storage Firefox both throw here rather
    // than returning null, and neither should leave the app unusable.
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* non-persistent session; the in-memory state still works this page load */
  }
}

/* ------------------------------------------------------------------ *
 * Requests
 * ------------------------------------------------------------------ */

async function authFetch<T>(
  path: string,
  init: RequestInit = {},
  action = "Request",
): Promise<T> {
  const headers = new Headers(init.headers);
  if (init.body !== undefined) headers.set("Content-Type", "application/json");

  const token = getToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE}${path}`, { ...init, headers });
  } catch {
    // The port hint is only true in the dev layout, where the browser does talk
    // to :8000 directly. In a deployed build API_BASE is "" — same origin,
    // through nginx — so there is no port 8000 for the visitor to check, and
    // naming one sends them looking at their own machine's port 8000.
    throw new AuthError(
      API_BASE
        ? "Could not reach the NetRouteAI server. Is the backend running on port 8000?"
        : "Could not reach the NetRouteAI server.",
    );
  }

  if (response.status === 204) return undefined as T;

  let body: unknown = null;
  try {
    body = await response.json();
  } catch {
    /* a non-JSON error body is handled by the status check below */
  }

  if (!response.ok) {
    // The auth routes put the message in `detail` as {message, field}; older
    // or proxy-generated errors put a plain string there. Accept both.
    const detail = (body as { detail?: unknown } | null)?.detail;
    let message = `Request failed (${response.status})`;
    let field: string | null = null;

    if (typeof detail === "string") {
      message = detail;
    } else if (detail && typeof detail === "object") {
      const record = detail as { message?: string; field?: string | null };
      if (record.message) message = record.message;
      if (record.field) field = record.field;
    } else if (typeof (body as { detail?: string })?.detail === "string") {
      message = (body as { detail: string }).detail;
    }

    throw new AuthError(message, field, response.status);
  }

  return body as T;
}

/* ------------------------------------------------------------------ *
 * Endpoints
 * ------------------------------------------------------------------ */

export async function fetchAuthConfig(): Promise<AuthConfig> {
  try {
    return await authFetch<AuthConfig>("/api/auth/config", {}, "Loading sign-in options");
  } catch {
    // The Google button is the only thing this feeds. If the config call fails
    // the button simply does not appear, which is a smaller problem than a
    // login page that cannot render because an optional endpoint is down.
    return { google_enabled: false, google_client_id: "" };
  }
}

export async function registerUser(input: {
  name: string;
  age: number;
  email: string;
  password: string;
  confirm_password: string;
  mobile: string;
}): Promise<{ user: AuthUser; token: string }> {
  const result = await authFetch<{ user: AuthUser; token: string }>(
    "/api/auth/register",
    { method: "POST", body: JSON.stringify(input) },
    "Registration",
  );
  setToken(result.token);
  return result;
}

export async function loginUser(
  email: string,
  password: string,
): Promise<{ user: AuthUser; token: string }> {
  const result = await authFetch<{ user: AuthUser; token: string }>(
    "/api/auth/login",
    { method: "POST", body: JSON.stringify({ email, password }) },
    "Sign in",
  );
  setToken(result.token);
  return result;
}

export async function logoutUser(): Promise<void> {
  try {
    await authFetch("/api/auth/logout", { method: "POST" }, "Sign out");
  } finally {
    // The local token is cleared either way: if the server call failed the
    // session may still be live, but keeping a token we could not revoke only
    // makes the next sign-in confusing. The server row expires on its own.
    setToken(null);
  }
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  try {
    const result = await authFetch<{ user: AuthUser }>("/api/auth/me", {}, "Loading your profile");
    return result.user;
  } catch (error) {
    // 401 is the expected answer for "no valid session", not a failure worth
    // showing anyone: the app simply starts signed out.
    if (error instanceof AuthError && error.status === 401) {
      setToken(null);
      return null;
    }
    throw error;
  }
}

export async function updateProfile(input: {
  name?: string;
  age?: number;
  mobile?: string;
}): Promise<AuthUser> {
  const result = await authFetch<{ user: AuthUser }>(
    "/api/auth/me",
    { method: "PATCH", body: JSON.stringify(input) },
    "Saving your details",
  );
  return result.user;
}

export async function requestPasswordReset(email: string): Promise<{
  sent: boolean;
  delivery: string;
  code?: string;
  expires_at?: string;
  note?: string;
  expires_in_minutes: number;
}> {
  return authFetch("/api/auth/forgot-password", {
    method: "POST",
    body: JSON.stringify({ email }),
  }, "Password reset");
}

export async function resetPassword(input: {
  email: string;
  code: string;
  password: string;
  confirm_password: string;
}): Promise<void> {
  await authFetch("/api/auth/reset-password", {
    method: "POST",
    body: JSON.stringify(input),
  }, "Password reset");
}

/** Exchange a Google ID token for a session, or a pending registration. */
export async function signInWithGoogle(credential: string): Promise<
  | { status: "signed_in"; user: AuthUser; token: string }
  | { status: "needs_profile"; pending_token: string; email: string; name: string }
> {
  return authFetch("/api/auth/google", {
    method: "POST",
    body: JSON.stringify({ credential }),
  }, "Google sign-in");
}

/** Finish a Google registration by supplying the two fields Google has no value for. */
export async function completeGoogleRegistration(input: {
  pending_token: string;
  age: number;
  mobile: string;
  name?: string;
}): Promise<{ user: AuthUser; token: string }> {
  const result = await authFetch<{ user: AuthUser; token: string }>(
    "/api/auth/google/complete",
    { method: "POST", body: JSON.stringify(input) },
    "Google registration",
  );
  setToken(result.token);
  return result;
}