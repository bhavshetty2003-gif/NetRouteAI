/**
 * Light/dark theme, shared by every component that needs it.
 *
 * The toggle used to be a `useState` local to the navbar that flipped an icon
 * and changed nothing else: `index.css` declared one dark theme with no
 * `.light`/`.dark` scope and no `prefers-color-scheme` handling, so the button
 * was decorative. Theme is a property of the document, not of a component, so
 * it belongs here.
 *
 * `index.html` applies the same decision in an inline script before first
 * paint. Both read the same key, so the pre-paint class and React's state
 * cannot disagree.
 */

const STORAGE_KEY = 'netrouteai_theme';

export type Theme = 'light' | 'dark';

/** The theme actually in effect right now. */
export function currentTheme(): Theme {
  if (typeof document === 'undefined') return 'dark';
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light';
}

/**
 * Persist and apply a theme. The `dark` class on <html> is what the CSS keys
 * off, and it also sets `color-scheme`, so native scrollbars, form controls
 * and the canvas follow without any per-component work.
 */
export function applyTheme(theme: Theme): void {
  if (typeof document === 'undefined') return;
  document.documentElement.classList.toggle('dark', theme === 'dark');
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // Private browsing or a blocked storage partition. The class still
    // applies for this session, which is the part that matters visually.
  }
}

/** Flips the current theme and returns the new one. */
export function toggleTheme(): Theme {
  const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
  applyTheme(next);
  return next;
}
