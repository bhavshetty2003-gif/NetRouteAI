/**
 * Drives the real auth UI in jsdom against the running backend.
 *
 * Nothing is stubbed on the API side: every request goes to
 * http://127.0.0.1:8000, so this exercises the actual registration, login,
 * profile-edit and sign-out paths rather than a mock of them.
 *
 * Run with:  frontend/node_modules/.bin/tsx /tmp/opencode/authui.mts
 */
import { JSDOM } from 'jsdom';

const BASE = 'http://127.0.0.1:8000';

function installDom() {
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: 'http://localhost:3000/',
    pretendToBeVisual: true,
  });
  const g = globalThis as any;
  g.window = dom.window;
  g.document = dom.window.document;
  // Node 22 exposes `navigator` as a getter-only global; define over it.
  Object.defineProperty(g, 'navigator', {
    value: dom.window.navigator,
    configurable: true,
    writable: true,
  });
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
  // Keep fetch on the real global; only wrap it for logging.
  const realFetch = g.fetch ?? globalThis.fetch;
  g.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input);
    const method = init?.method ?? 'GET';
    const res = await realFetch(input, init);
    console.log(`   [net] ${method} ${url} -> ${res.status}`);
    return res;
  };
  return dom;
}

const dom = installDom();

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { AuthScreen } = await import('../src/components/auth/AuthScreen.tsx');
const { ProfileMenu } = await import('../src/components/ProfileMenu.tsx');
const { logoutUser } = await import('../src/utils/auth.ts');

const h = React.createElement;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function setInput(dom: JSDOM, id: string, value: string) {
  const el = dom.window.document.getElementById(id) as HTMLInputElement | null;
  if (!el) throw new Error(`no input #${id}`);
  const proto = Object.getPrototypeOf(el);
  const setter = Object.getOwnPropertyDescriptor(proto, 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}

function readInput(dom: JSDOM, id: string) {
  return (dom.window.document.getElementById(id) as HTMLInputElement | null)?.value;
}

function submitForm(dom: JSDOM) {
  const form = dom.window.document.querySelector('form')!;
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
}

function findByText(dom: JSDOM, tag: string, text: string) {
  return Array.from(dom.window.document.querySelectorAll(tag)).find((el) =>
    (el.textContent ?? '').trim().includes(text),
  ) as HTMLElement | undefined;
}

const text = (dom: JSDOM) => (dom.window.document.body.textContent ?? '').replace(/\s+/g, ' ').trim();

const suffix = Date.now().toString().slice(-8);
const EMAIL = `qa${suffix}@example.com`;
const MOBILE = '+91 98765 43210';

let failures = 0;
function check(label: string, ok: boolean, extra = '') {
  console.log(`${ok ? ' PASS' : ' FAIL'}  ${label}${extra ? `  -- ${extra}` : ''}`);
  if (!ok) failures++;
}

// --------------------------------------------------------------------------- //
console.log('\n=== 1. Register through the form ===');
let currentUser: any = null;
const root = createRoot(dom.window.document.getElementById('root')!);

await act(async () => {
  root.render(h(AuthScreen, { onAuthenticated: (u: any) => { currentUser = u; }, onClose: () => {} }));
});
await act(async () => { await sleep(900); });

check('login panel rendered', text(dom).includes('Sign in to NetRouteAI'));
check('google button hidden (no client id)', !dom.window.document.querySelector('[data-google-ready]'));
check('no "Instant" demo wording anywhere', !/instant (demo|access)/i.test(text(dom)));

console.log('\n=== 2. Client-side validation blocks a bad registration ===');
await act(async () => {
  dom.window.document.querySelector<HTMLElement>('button') && Array.from(dom.window.document.querySelectorAll('button'))
    .find((b) => b.textContent?.includes('Create a new account'))?.click();
});
await act(async () => { await sleep(400); });
check('register panel rendered', text(dom).includes('Create your NetRouteAI account'));

for (const f of ['name', 'age', 'mobile', 'email', 'password', 'confirm']) {
  check(`  field #${f} exists`, Boolean(dom.window.document.getElementById(f)));
}

await act(async () => {
  setInput(dom, 'name', 'QA Tester');
  setInput(dom, 'age', '5');
  setInput(dom, 'mobile', 'not-a-number');
  setInput(dom, 'email', 'bad-email');
  setInput(dom, 'password', 'short');
  setInput(dom, 'confirm', 'different');
  submitForm(dom);
});
await act(async () => { await sleep(300); });
const bodyAfterBadSubmit = text(dom);
check('age rejected', /Age must be between 10 and 120/.test(bodyAfterBadSubmit));
check('mobile rejected', /valid mobile number/i.test(bodyAfterBadSubmit));
check('email rejected', /valid email address/i.test(bodyAfterBadSubmit));
check('password rejected', /at least 8 characters/.test(bodyAfterBadSubmit));
check('confirm rejected', /do not match/.test(bodyAfterBadSubmit));
check('no account created', currentUser === null);

console.log('\n=== 3. Register with valid details ===');
await act(async () => {
  setInput(dom, 'name', 'QA Tester');
  setInput(dom, 'age', '23');
  setInput(dom, 'mobile', MOBILE);
  setInput(dom, 'email', EMAIL);
  setInput(dom, 'password', 'correct-horse-battery');
  setInput(dom, 'confirm', 'correct-horse-battery');
  submitForm(dom);
});
await act(async () => { await sleep(2500); });

check('account created + signed in', currentUser !== null, currentUser?.email ?? 'null');
check('email matches', currentUser?.email === EMAIL, String(currentUser?.email));
check('age stored', currentUser?.age === 23, String(currentUser?.age));
check('mobile stored', currentUser?.mobile === MOBILE, String(currentUser?.mobile));
check('token stored in localStorage', Boolean(dom.window.localStorage.getItem('netrouteai_session_token')));
check('no password hash in the client user object', !JSON.stringify(currentUser ?? {}).includes('$2b$'));

console.log('\n=== 4. ProfileMenu shows the details and email is read-only ===');
await act(async () => {
  root.render(
    h(ProfileMenu, {
      user: currentUser,
      onUpdated: (u: any) => { currentUser = u; },
      // The real handler App.tsx installs, not a no-op stub.
      onSignOut: () => { void logoutUser(); },
    }),
  );
});
await act(async () => { await sleep(500); });

const pill = Array.from(dom.window.document.querySelectorAll('button')).find((b) =>
  b.getAttribute('aria-haspopup') === 'dialog');
await act(async () => { pill?.click(); });
await act(async () => { await sleep(400); });

const panelText = text(dom);
check('name visible at top', panelText.includes('QA Tester'));
check('age visible at top', panelText.includes('23'));
check('mobile visible at top', panelText.includes(MOBILE));
check('email visible at top', panelText.includes(EMAIL));
check('email marked unchangeable', /cannot be changed/i.test(panelText));

await act(async () => {
  Array.from(dom.window.document.querySelectorAll('button')).find((b) => b.textContent?.includes('Edit details'))?.click();
});
await act(async () => { await sleep(400); });

const emailInput = dom.window.document.getElementById('profile-email') as HTMLInputElement;
check('edit form email input is readOnly', emailInput?.readOnly === true);
check('edit form has no age/mobile email binding', readInput(dom, 'profile-email') === EMAIL);

console.log('\n=== 5. Edit name/age/mobile; email cannot be changed ===');
await act(async () => {
  setInput(dom, 'profile-name', 'QA Renamed');
  setInput(dom, 'profile-age', '24');
  setInput(dom, 'profile-mobile', '+91 90000 11111');
  submitForm(dom);
});
await act(async () => { await sleep(2200); });
check('name updated', currentUser?.name === 'QA Renamed', String(currentUser?.name));
check('age updated', currentUser?.age === 24, String(currentUser?.age));
check('mobile updated', currentUser?.mobile === '+91 90000 11111', String(currentUser?.mobile));
check('email UNCHANGED', currentUser?.email === EMAIL, String(currentUser?.email));

// Try to force an email change through the field the UI renders.
await act(async () => {
  Array.from(dom.window.document.querySelectorAll('button')).find((b) => b.textContent?.includes('Edit details'))?.click();
});
await act(async () => { await sleep(300); });
await act(async () => {
  const el = dom.window.document.getElementById('profile-email') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
  setter.call(el, 'attacker@evil.com');
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
  submitForm(dom);
});
await act(async () => { await sleep(2000); });
check('email STILL unchanged after tampering', currentUser?.email === EMAIL, String(currentUser?.email));

console.log('\n=== 6. Sign out clears the session ===');
await act(async () => {
  const after = await fetch(`${BASE}/api/auth/me`, {
    headers: { Authorization: `Bearer ${dom.window.localStorage.getItem('netrouteai_session_token')}` },
  });
  check('server still knows the token', after.status === 200, `status ${after.status}`);
});
await act(async () => {
  Array.from(dom.window.document.querySelectorAll('button')).find((b) => b.textContent?.includes('Sign out'))?.click();
});
await act(async () => { await sleep(1200); });
check('token removed from localStorage', !dom.window.localStorage.getItem('netrouteai_session_token'));

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
dom.window.close();
process.exit(failures === 0 ? 0 : 1);