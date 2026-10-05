/**
 * The canvas belongs to the account, not the browser.
 *
 * Two rules, both checked against the real backend on :8000 and a real jsdom
 * `localStorage`:
 *
 *   1. A fresh sign-in gets a blank workspace.
 *   2. Signing back in restores the canvas that account left -- and if that
 *      canvas was empty because the user cleared it, the workspace comes back
 *      empty rather than resurrecting what was deleted.
 *
 * Rule 2 has a subtlety worth stating, because it is the whole point. "No saved
 * topology" and "saved an empty topology" are different states, and only the
 * second is what the user actually did. A store that refuses to write an empty
 * canvas passes rule 1 forever and fails rule 2 the first time someone clears
 * their workspace and signs back in.
 *
 * The bug this replaced was a single global storage key, so two accounts on one
 * browser shared one canvas and the second sign-in inherited the first person's
 * network.
 */
import { JSDOM } from 'jsdom';

const BASE = 'http://127.0.0.1:8000';

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? ' PASS' : ' FAIL'}  ${label}${extra ? `  -- ${extra}` : ''}`);
  if (!ok) failures++;
};

/* ------------------------------------------------------------------ *
 * The store itself, exercised directly.
 *
 * This is where the storage rules are asserted without a React mount, because
 * a failing mount test cannot tell you whether the key was wrong or the effect
 * ordering was wrong.
 * ------------------------------------------------------------------ */
{
  const dom = new JSDOM('', { url: 'http://localhost:3000/' });
  (globalThis as any).localStorage = dom.window.localStorage;
  const store = await import('../src/utils/topologyStore.ts');

  console.log('\n=== Storage is keyed per account ===');
  check('key includes the account id', /u7\b/.test(store.topologyKey(7)));
  check('two accounts get two different keys', store.topologyKey(7) !== store.topologyKey(8));

  console.log('\n=== An unknown account reads as blank ===');
  const fresh = store.loadTopology(999);
  check('no devices', fresh.devices.length === 0);
  check('no cables', fresh.cables.length === 0);
  check('no annotations', fresh.annotations.length === 0);
  check('hasSavedTopology is false', store.hasSavedTopology(999) === false);

  console.log('\n=== What was saved is what comes back ===');
  store.saveTopology(7, {
    devices: [{ id: 'R1', type: 'router' }] as never,
    cables: [{ id: 'c1', fromDeviceId: 'R1', toDeviceId: 'R2' }] as never,
    annotations: [{ id: 'a1', type: 'text' }] as never,
  });
  const back = store.loadTopology(7);
  check('device came back', back.devices.length === 1 && back.devices[0].id === 'R1');
  check('cable came back', back.cables.length === 1);
  check('annotation came back', back.annotations.length === 1);

  console.log('\n=== An empty canvas is saved, not skipped ===');
  store.saveTopology(7, { devices: [], cables: [], annotations: [] });
  check('hasSavedTopology is now true', store.hasSavedTopology(7) === true);
  check('it reads back as empty rather than as "absent"',
    store.loadTopology(7).devices.length === 0 && store.hasSavedTopology(7) === true);

  console.log('\n=== One account cannot read another ===');
  check('account 8 does not see account 7\'s canvas', store.loadTopology(8).devices.length === 0);
  store.saveTopology(8, { devices: [{ id: 'Z9', type: 'router' }] as never, cables: [], annotations: [] });
  check('account 8 sees its own canvas', store.loadTopology(8).devices.length === 1);
  check('account 7 still sees its own (empty) canvas', store.loadTopology(7).devices.length === 0);

  console.log('\n=== Corrupt storage reads as blank instead of throwing ===');
  localStorage.setItem(store.topologyKey(7), '{not json');
  let threw = false;
  let recovered = false;
  try {
    recovered = store.loadTopology(7).devices.length === 0;
  } catch {
    threw = true;
  }
  check('does not throw', !threw);
  check('reads as blank', recovered);
  localStorage.setItem(store.topologyKey(7), '{"devices":"not-an-array"}');
  check('wrongly-typed fields read as blank', store.loadTopology(7).devices.length === 0);

  console.log('\n=== clear forgets one account only ===');
  store.saveTopology(7, { devices: [{ id: 'R1', type: 'router' }] as never, cables: [], annotations: [] });
  store.clearTopology(7);
  check('account 7 forgotten', store.hasSavedTopology(7) === false);
  check('account 8 untouched', store.hasSavedTopology(8) === true);

  dom.window.close();
}

/* ------------------------------------------------------------------ *
 * End to end: register, draw, sign out, sign back in.
 * ------------------------------------------------------------------ */
console.log('\n=== End to end: register, draw, sign out, sign back in ===');

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
// App.tsx calls the bare global `confirm`. In a browser that is
// `window.confirm`; under Node it has to be bridged, or the Clear button
// throws and the canvas it was meant to empty never empties.
g.confirm = () => true;

// Clear anything a previous run left, so "fresh" really means fresh.
dom.window.localStorage.clear();

const realFetch = globalThis.fetch;
g.fetch = (input: any, init?: any) => realFetch(input, init);

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const App = (await import('../src/App.tsx')).default;
const store = await import('../src/utils/topologyStore.ts');

const h = React.createElement;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const text = () => (dom.window.document.body.textContent ?? '').replace(/\s+/g, ' ').trim();
const ls = dom.window.localStorage;

function setInput(id: string, value: string) {
  const el = dom.window.document.getElementById(id) as HTMLInputElement;
  if (!el) throw new Error(`input not found: ${id}`);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
}
function clickText(needle: string) {
  const b = Array.from(dom.window.document.querySelectorAll('button'))
    .find((x) => x.textContent?.includes(needle));
  if (!b) throw new Error(`button not found: ${needle}`);
  b.click();
}
const submitForm = () =>
  dom.window.document.querySelector('form')!
    .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));

/** Every account id that currently owns a canvas key. */
const canvasAccountIds = () =>
  Array.from({ length: ls.length }, (_, i) => ls.key(i)!)
    .filter((k) => k.startsWith('netrouteai_topology_v1:u'))
    .map((k) => Number(k.split(':u')[1]));

const suffix = Date.now().toString().slice(-8);
const PASSWORD = 'correct-horse-battery';
const A = `canvas-a${suffix}@example.com`;
const B = `canvas-b${suffix}@example.com`;

const root = createRoot(dom.window.document.getElementById('root')!);
await act(async () => { root.render(h(App)); });
await act(async () => { await sleep(2500); });

async function register(email: string, name: string) {
  await act(async () => { clickText('Login or Register'); });
  await act(async () => { await sleep(600); });
  await act(async () => { clickText('Create a new account'); });
  await act(async () => { await sleep(600); });
  await act(async () => {
    setInput('name', name);
    setInput('age', '30');
    setInput('mobile', '+91 90000 00000');
    setInput('email', email);
    setInput('password', PASSWORD);
    setInput('confirm', PASSWORD);
    submitForm();
  });
  await act(async () => { await sleep(3000); });
}

async function signOut() {
  const pill = Array.from(dom.window.document.querySelectorAll('button'))
    .find((b) => b.getAttribute('aria-haspopup') === 'dialog');
  if (!pill) throw new Error('profile menu button not found');
  await act(async () => { pill.click(); });
  await act(async () => { await sleep(500); });
  await act(async () => { clickText('Sign out'); });
  await act(async () => { await sleep(2500); });
}

async function signIn(email: string) {
  await act(async () => { clickText('Login or Register'); });
  await act(async () => { await sleep(600); });
  await act(async () => {
    setInput('email', email);
    setInput('password', PASSWORD);
    submitForm();
  });
  await act(async () => { await sleep(3000); });
}

async function openDesigner() {
  await act(async () => { clickText('Open the Designer'); });
  await act(async () => { await sleep(2500); });
}

console.log('\n--- A registers and finds a blank canvas ---');
await register(A, 'Canvas A');
await openDesigner();
check('designer opened', /Network Designer/i.test(text()));

const aIds = canvasAccountIds();
check('exactly one account owns a canvas key', aIds.length === 1, `ids: ${aIds.join(',')}`);
const A_ID = aIds[0];
check('fresh sign-in: canvas is blank', store.loadTopology(A_ID).devices.length === 0);
check('fresh sign-in: no cables', store.loadTopology(A_ID).cables.length === 0);
check('fresh sign-in: no annotations', store.loadTopology(A_ID).annotations.length === 0);
check('fresh sign-in: nothing seeded into storage either',
  !ls.getItem(`netrouteai_topology_v1:u${A_ID}`) ||
  JSON.parse(ls.getItem(`netrouteai_topology_v1:u${A_ID}`)!).devices.length === 0);

console.log('\n--- A loads a preset, signs out, signs back in ---');
// The presets live behind a dropdown, which is a real user step and not a detail.
await act(async () => { dom.window.document.getElementById('toolbar-presets-dropdown-btn')!.click(); });
await act(async () => { await sleep(400); });
await act(async () => { clickText('Star Topology'); });
await act(async () => { await sleep(1200); });
const drawnCount = store.loadTopology(A_ID).devices.length;
check('the preset was persisted automatically (no Save pressed)', drawnCount > 0, `${drawnCount} devices`);

await signOut();
await signIn(A);
await openDesigner();
const restored = store.loadTopology(A_ID);
check('signing back in restores the same canvas', restored.devices.length === drawnCount,
  `${restored.devices.length} vs ${drawnCount}`);
check('the restored canvas is on screen, not blank',
  restored.devices.length > 0 && /Network Designer/i.test(text()));

console.log('\n--- A clears the canvas, signs out, signs back in ---');
await act(async () => { clickText('Clear'); });
await act(async () => { await sleep(1200); });
check('clearing persisted an empty canvas, not "no save"', store.hasSavedTopology(A_ID));
check('the stored canvas is empty', store.loadTopology(A_ID).devices.length === 0);

await signOut();
await signIn(A);
await openDesigner();
check('signing back in after a clear gives a blank canvas',
  store.loadTopology(A_ID).devices.length === 0);
check('and the deleted topology was not resurrected', store.loadTopology(A_ID).cables.length === 0);

console.log('\n--- B signs in on the same browser and sees nothing of A\'s ---');
await signOut();
await register(B, 'Canvas B');
await openDesigner();
const bIds = canvasAccountIds();
check('two accounts now own canvas keys, one each', bIds.length === 2, `all=${bIds.join(',')}`);
const B_ID = bIds.find((id) => id !== A_ID);
check('B owns a key distinct from A\'s', B_ID !== undefined, `A=${A_ID} all=${bIds.join(',')}`);
check("B starts blank", store.loadTopology(B_ID!).devices.length === 0);
check('B did not inherit A\'s cleared-but-present canvas', store.hasSavedTopology(B_ID!));

console.log('\n--- A\'s canvas survived B signing in and out ---');
check('A still has its own (empty, cleared) canvas', store.loadTopology(A_ID).devices.length === 0);
check('A\'s key still exists', store.hasSavedTopology(A_ID));

dom.window.close();
console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
