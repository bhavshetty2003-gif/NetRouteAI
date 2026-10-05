/**
 * Mounts the whole App and checks the gate: signed out, the landing page must
 * not offer a way past sign-in; signed in, the designer must open.
 *
 * Nothing is stubbed: every call goes to the real backend on :8000, so this is
 * an end-to-end test of the gate rather than a test of mocks.
 */
import { JSDOM } from 'jsdom';

const BASE = 'http://127.0.0.1:8000';

const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:3000/',
  pretendToBeVisual: true,
});

const g = globalThis as any;
g.window = dom.window;
g.document = dom.window.document;
Object.defineProperty(g, 'navigator', { value: dom.window.navigator, configurable: true, writable: true });
g.HTMLElement = dom.window.HTMLElement;
g.Element = dom.window.Element;
g.Node = dom.window.Node;
g.Event = dom.window.Event;
g.MouseEvent = dom.window.MouseEvent;
g.KeyboardEvent = dom.window.KeyboardEvent;
g.getComputedStyle = dom.window.getComputedStyle;
g.localStorage = dom.window.localStorage;
g.MutationObserver = dom.window.MutationObserver;
g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0);
g.cancelAnimationFrame = (id: any) => clearTimeout(id);
g.IS_REACT_ACT_ENVIRONMENT = true;

const realFetch = globalThis.fetch;
g.fetch = async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : String(input?.url ?? input);
  // Pathname only: a malformed URL from the harness must not be mistaken for a
  // product bug.
  const path = new URL(url, BASE).pathname;

  const res = await realFetch(input, init);
  console.log(`   [net] ${init?.method ?? 'GET'} ${path} -> ${res.status}`);
  return res;
};

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const App = (await import('../src/App.tsx')).default;

const h = React.createElement;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = () => (dom.window.document.body.textContent ?? '').replace(/\s+/g, ' ').trim();

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? ' PASS' : ' FAIL'}  ${label}${extra ? `  -- ${extra}` : ''}`);
  if (!ok) failures++;
};

const suffix = Date.now().toString().slice(-8);
const EMAIL = `gate${suffix}@example.com`;
const PASSWORD = 'correct-horse-battery';

const root = createRoot(dom.window.document.getElementById('root')!);

function setInput(id: string, value: string) {
  const el = dom.window.document.getElementById(id) as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
const clickText = (needle: string) =>
  Array.from(dom.window.document.querySelectorAll('button'))
    .find((b) => b.textContent?.includes(needle))?.click();
const submitForm = () =>
  dom.window.document.querySelector('form')!
    .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

console.log('\n=== Signed out ===');
await act(async () => { root.render(h(App)); });
await act(async () => { await sleep(3500); });

const out = text();
check('landing page rendered', /NetRoute/i.test(out));
check('NO "v2.4 Enterprise" badge', !/v2\.4\s*Enterprise/i.test(out));
check('NO "v2.4 Pro" badge', !/v2\.4\s*Pro/i.test(out));
check('NO "Instant Demo Access"', !/Instant Demo Access/i.test(out));
check('NO "Instant Access as Demo"', !/Instant Access as Demo/i.test(out));
check('NO "enterprise network topologies"', !/enterprise network topologies/i.test(out));
check('NO fake "Login to NetRouteAI" heading on the landing page', !/Login to NetRouteAI/i.test(out));
check('single CTA reading "Login or Register"', /Login or Register/i.test(out));
check('NO separate "Create a free account" button', !/Create a free account/i.test(out));
check('exactly one button in the hero CTA row',
  dom.window.document.getElementById('hero-login-entry-btn')?.parentElement?.querySelectorAll('button').length === 1);
check('designer NOT reachable (no canvas yet)', !dom.window.document.getElementById('network-canvas'));

console.log('\n=== Open the sign-in overlay ===');
await act(async () => { clickText('Login or Register'); });
await act(async () => { await sleep(700); });
check('auth overlay shown', /Sign in to NetRouteAI/.test(text()));

console.log('\n=== Wrong password is refused ===');
await act(async () => {
  setInput('email', EMAIL); setInput('password', 'wrong-password-here'); submitForm();
});
await act(async () => { await sleep(1800); });
check('unknown account rejected', /Email or password is incorrect/.test(text()));

console.log('\n=== Register through the overlay ===');
await act(async () => { clickText('Create a new account'); });
await act(async () => { await sleep(700); });
check('register form has age field', Boolean(dom.window.document.getElementById('age')));
check('register form has mobile field', Boolean(dom.window.document.getElementById('mobile')));
check('register form has confirm field', Boolean(dom.window.document.getElementById('confirm')));
check('register form has forgot-password link', /forgot your password/i.test(text()));

await act(async () => {
  setInput('name', 'Gate Tester');
  setInput('age', '26');
  setInput('mobile', '+91 91234 56789');
  setInput('email', EMAIL);
  setInput('password', PASSWORD);
  setInput('confirm', PASSWORD);
  submitForm();
});
await act(async () => { await sleep(3000); });

const signedIn = text();
check('overlay closed after register', !/Sign in to NetRouteAI/.test(signedIn));
check('profile pill shows the name', signedIn.includes('Gate Tester'));
// Still on the landing page after registering; the workspace is one click away.
check('signed-in home shows the workspace CTA', /Open the Designer/i.test(signedIn));
check('signed-in home no longer shows register CTA', !/Create a free account/i.test(signedIn));
check('signed-in home no longer shows the login-or-register CTA',
  !/Login or Register/i.test(signedIn));

await act(async () => { clickText('Open the Designer'); });
await act(async () => { await sleep(2500); });
const workspace = text();
check('designer opened', /Network Designer/i.test(workspace));
check('app navbar profile present', Boolean(dom.window.document.getElementById('navbar-profile')));
check('no v2.4 badge in the workspace', !/v2\.4/i.test(workspace));
check('no hardcoded fake identity', !/NetEng User|CCNA \/ CCNP Sim/.test(workspace));

console.log('\n=== Editing the profile from the top bar ===');
const pill = Array.from(dom.window.document.querySelectorAll('button'))
  .find((b) => b.getAttribute('aria-haspopup') === 'dialog');
await act(async () => { pill?.click(); });
await act(async () => { await sleep(600); });
const panel = text();
check('details shown at top', panel.includes('Gate Tester') && panel.includes('26') && panel.includes('+91 91234 56789'));
check('email shown and locked', panel.includes(EMAIL) && /cannot be changed/i.test(panel));

console.log('\n=== Sign out returns to the gate ===');
await act(async () => { clickText('Sign out'); });
await act(async () => { await sleep(2500); });
const afterOut = text();
check('token cleared', !dom.window.localStorage.getItem('netrouteai_session_token'));
check('back on the landing page', /Login or Register/i.test(afterOut));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
dom.window.close();
process.exit(failures === 0 ? 0 : 1);