/** Where a signed-in account's canvas is kept between visits.
 *
 *  This used to be one global key, `netrouteai_topology_v1`, which was fine
 *  while the app had no accounts and wrong the moment it did: two people
 *  sharing a browser shared a canvas, and the second person to sign in was
 *  handed the first person's network. The account id is part of the key now.
 *
 *  What comes back is always the account's *own* last canvas, including the
 *  empty one. A cleared canvas is saved as an empty canvas, so signing back in
 *  gives back a blank workspace rather than resurrecting what was deleted --
 *  "no saved topology" and "saved an empty topology" are different states and
 *  only the second one is what the user actually left behind.
 *
 *  Every access is wrapped: private-mode Safari and a storage-blocked Firefox
 *  both throw on `localStorage` rather than returning null, and neither should
 *  leave the designer unusable.
 */

import type { NetworkCable, NetworkDevice } from '../types/network';
import type { AnnotationItem } from '../types/annotations';

export interface SavedTopology {
  devices: NetworkDevice[];
  cables: NetworkCable[];
  annotations: AnnotationItem[];
}

/** An empty workspace. Also what an account with nothing saved gets. */
export const BLANK_TOPOLOGY: SavedTopology = {
  devices: [],
  cables: [],
  annotations: [],
};

/** Per-account, so one person's canvas is never handed to another. */
export function topologyKey(userId: number): string {
  return `netrouteai_topology_v1:u${userId}`;
}

function isArray(value: unknown): value is unknown[] {
  return Array.isArray(value);
}

/** Reads an account's saved canvas. Corrupt or absent storage reads as blank
 *  rather than throwing -- a broken string must not be able to wedge sign-in. */
export function loadTopology(userId: number | null): SavedTopology {
  if (userId === null) return { ...BLANK_TOPOLOGY, devices: [], cables: [], annotations: [] };
  try {
    const raw = localStorage.getItem(topologyKey(userId));
    if (!raw) return { devices: [], cables: [], annotations: [] };
    const parsed = JSON.parse(raw) as Partial<SavedTopology>;
    return {
      devices: isArray(parsed.devices) ? (parsed.devices as NetworkDevice[]) : [],
      cables: isArray(parsed.cables) ? (parsed.cables as NetworkCable[]) : [],
      annotations: isArray(parsed.annotations) ? (parsed.annotations as AnnotationItem[]) : [],
    };
  } catch {
    return { devices: [], cables: [], annotations: [] };
  }
}

/** The outcome of a save.
 *
 *  `ok: false` means the canvas was **not** written: the browser's storage
 *  quota was exhausted, or storage was blocked. The caller has to say so --
 *  a canvas that quietly failed to save and a canvas that saved look
 *  identical from the next sign-in, and "my work is gone" is not something to
 *  discover later. */
export interface SaveResult {
  ok: boolean;
  error?: string;
}

/** Records the canvas as it stands. An empty canvas is stored, not skipped:
 *  that is how "I deleted it" survives the sign-out. */
export function saveTopology(
  userId: number | null,
  topology: SavedTopology
): SaveResult {
  if (userId === null) {
    return { ok: false, error: 'No account is signed in, so there is nowhere to save.' };
  }
  try {
    localStorage.setItem(
      topologyKey(userId),
      JSON.stringify({
        devices: topology.devices,
        cables: topology.cables,
        annotations: topology.annotations,
      }),
    );
    return { ok: true };
  } catch (error) {
    // Quota or blocked storage. The canvas still works for this session, but
    // the user is told, because it will not be there next time.
    const detail = error instanceof Error ? error.message : String(error);
    const quota =
      error instanceof DOMException &&
      (error.name === 'QuotaExceededError' || error.name === 'NS_ERROR_DOM_QUOTA_REACHED');
    return {
      ok: false,
      error: quota
        ? 'This browser is out of local storage space, so the canvas was not saved. It still works in this session, but it will be gone when you sign out.'
        : `The canvas could not be saved: ${detail}`,
    };
  }
}

/** Forgets an account's saved canvas. Used by "Reset LocalStorage Topology". */
export function clearTopology(userId: number | null): void {
  if (userId === null) return;
  try {
    localStorage.removeItem(topologyKey(userId));
  } catch {
    // Nothing to do -- the next sign-in reads whatever is still there.
  }
}

/** True when the account has a saved canvas, empty or not. */
export function hasSavedTopology(userId: number | null): boolean {
  if (userId === null) return false;
  try {
    return localStorage.getItem(topologyKey(userId)) !== null;
  } catch {
    return false;
  }
}
