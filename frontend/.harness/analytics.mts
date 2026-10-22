/**
 * The analytics page must report on the canvas, and refuse to report on a
 * different network.
 *
 * The bug this covers: deploying a newly drawn topology failed, so the lab
 * from the *previous* topology stayed running, and the page said
 *
 *     "The running lab is not this topology"
 *     "deployed but no longer drawn: R11, R12"
 *
 * which was true -- and useless. The page was describing a lab the user had
 * already replaced on the canvas, and it kept saying so because nothing had
 * been deployed since.
 *
 * So this drives the real component against the real backend and asserts
 * both directions:
 *
 *   1. Deploy the canvas -> the page does NOT block, and it offers the
 *      canvas's routers as source and destination.
 *   2. Deploy a DIFFERENT topology -> the page DOES block, and it names the
 *      concrete difference.
 *
 * Direction 2 is the control. A gate that never blocks passes direction 1
 * just as well, and a page that blocks on everything fails direction 1 --
 * so only asserting one of them proves half the behaviour.
 *
 * Nothing is stubbed: the deploys, the plan and the lab status all come from
 * the backend on :8000, and the Docker/FRR lab they build is real.
 */
import { JSDOM } from 'jsdom';

const BASE = 'http://127.0.0.1:8000';

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? ' PASS' : ' FAIL'}  ${label}${extra ? `  -- ${extra}` : ''}`);
  if (!ok) failures++;
};

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

// Capture the real fetch BEFORE replacing it, or the shim recurses into
// itself. Only the pathname is logged: a malformed URL from the harness must
// not be mistaken for a product bug.
//
// The request body and the body of a failed response are logged too. A
// harness that only prints the status code cannot tell "the page asked for
// the wrong thing" from "the backend said no", and those two are the
// difference between a product bug and a harness bug.
const realFetch = globalThis.fetch;
g.fetch = async (input: any, init?: any) => {
  const url = typeof input === 'string' ? input : String(input?.url ?? input);
  const path = new URL(url, BASE).pathname;
  const res = await realFetch(input, init);
  const reqBody = init?.body ? String(init.body).slice(0, 200) : '';
  console.log(`   [net] ${init?.method ?? 'GET'} ${path} -> ${res.status} ${reqBody}`);
  if (!res.ok) {
    const detail = await res.clone().text();
    console.log(`         body: ${detail.slice(0, 400)}`);
  }
  return res;
};

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const { act } = await import('react');
const { AnalyticsView } = await import('../src/components/views/AnalyticsView.tsx');

const h = React.createElement;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const bodyText = () =>
  (dom.window.document.body.textContent ?? '').replace(/\s+/g, ' ').trim();

/* ------------------------------------------------------------------ *
 * The canvases.
 * ------------------------------------------------------------------ */

/** Ten routers, four areas -- the shape the analytics page is built for. */
const CANVAS_A = {
  routers: [
    { id: 'R1', area: 0 }, { id: 'R2', area: 0 }, { id: 'R3', area: 0 }, { id: 'R4', area: 0 },
    { id: 'R5', area: 1 }, { id: 'R6', area: 1 },
    { id: 'R7', area: 2 },
    { id: 'R8', area: 3 }, { id: 'R9', area: 3 }, { id: 'R10', area: 3 },
  ],
  links: [
    ['R1', 'R2', 20, 0], ['R1', 'R3', 8, 0], ['R1', 'R4', 30, 0],
    ['R2', 'R4', 10, 0], ['R2', 'R7', 10, 2], ['R3', 'R4', 10, 0],
    ['R3', 'R5', 12, 1], ['R4', 'R7', 12, 2], ['R5', 'R6', 10, 1],
    ['R5', 'R8', 15, 3], ['R6', 'R7', 10, 2], ['R6', 'R9', 15, 3],
    ['R7', 'R10', 12, 2], ['R8', 'R9', 10, 3], ['R8', 'R10', 18, 3],
    ['R9', 'R10', 10, 3],
  ] as Array<[string, string, number, number]>,
};

/** A different network: twelve routers, a chain. */
const CANVAS_B = {
  routers: Array.from({ length: 12 }, (_, i) => ({ id: `R${i + 1}`, area: 0 })),
  links: Array.from({ length: 11 }, (_, i) => [
    `R${i + 1}`, `R${i + 2}`, 10, 0,
  ]) as Array<[string, string, number, number]>,
};

/** The canvas as the designer holds it: devices with areas, cables with costs. */
function toCanvas(shape: typeof CANVAS_A) {
  const devices = shape.routers.map((r, i) => ({
    id: r.id,
    name: r.id,
    type: 'router' as const,
    x: 80 + (i % 5) * 160,
    y: 80 + Math.floor(i / 5) * 140,
    ipAddress: '',
    subnetMask: '',
    gateway: '',
    macAddress: '',
    interfaces: [],
    ospfArea: r.area,
    model: 'cisco',
    iosVersion: '15.2',
    uptime: '',
    cliConfig: { hostname: r.id, history: [] },
    status: 'running' as const,
  }));
  const cables = shape.links.map(([from, to, cost, area], i) => ({
    id: `c${i + 1}`,
    fromDeviceId: from,
    fromPort: 'Gi0/0',
    toDeviceId: to,
    toPort: 'Gi0/0',
    controlPoint: null,
    status: 'active' as const,
    cableType: 'straight-through' as const,
    addressClass: 'C' as const,
    ospfArea: area,
    cost,
  }));
  return { devices, cables };
}

/** The deploy payload the toolbar sends for that canvas. */
function toPayload(shape: typeof CANVAS_A) {
  return {
    routers: shape.routers.map((r) => ({
      id: r.id,
      name: r.id,
      type: 'router',
      area: r.area,
    })),
    links: shape.links.map(([source, target, cost, area], i) => ({
      id: `l${i + 1}`,
      source,
      target,
      cost,
      area,
      address_class: 'C',
    })),
  };
}

async function deploy(shape: typeof CANVAS_A): Promise<number> {
  const res = await realFetch(`${BASE}/api/lab/deploy`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ topology: toPayload(shape), wait_seconds: 120 }),
  });
  const body = await res.text();
  if (res.status !== 200) throw new Error(`deploy failed: ${res.status} ${body.slice(0, 300)}`);
  return res.status;
}

async function teardown() {
  await realFetch(`${BASE}/api/lab/deploy/teardown`, { method: 'POST' });
}

/* ------------------------------------------------------------------ *
 * Mount the analytics page on a canvas.
 *
 * A *fresh* root every time: the page fetches the deployed plan in an effect
 * that runs once on mount, so re-rendering it with new props would keep the
 * plan from the previous mount and the gate would be tested against stale
 * state. That is a harness trap, not a product behaviour.
 * ------------------------------------------------------------------ */
async function show(shape: typeof CANVAS_A) {
  const canvas = toCanvas(shape);
  const host = dom.window.document.createElement('div');
  dom.window.document.body.appendChild(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(h(AnalyticsView, { devices: canvas.devices as never, cables: canvas.cables as never }));
  });
  // Let the page's own effects settle: lab status, deploy state, dataset.
  for (let i = 0; i < 25; i++) {
    await act(async () => { await sleep(200); });
  }
  const text = bodyText();
  await act(async () => { root.unmount(); });
  host.remove();
  return text;
}

/* ------------------------------------------------------------------ *
 * The test.
 * ------------------------------------------------------------------ */
console.log('\n=== A lab built from this canvas does not block the page ===');
await teardown();
console.log('   deploying the ten-router canvas...');
await deploy(CANVAS_A);

let text = await show(CANVAS_A);
check(
  'the page does not say the running lab is a different topology',
  !text.includes('The running lab is not this topology'),
  text.slice(0, 160),
);
check(
  'it does not report a topology drift',
  !text.includes('deployed but no longer drawn') && !text.includes('drawn but not deployed'),
  text.slice(0, 160),
);
check(
  'it offers the canvas\'s routers as endpoints',
  text.includes('R1') && text.includes('R10'),
  '',
);

console.log('\n=== The control: a DIFFERENT topology blocks the page ===');
console.log('   deploying the twelve-router chain over it...');
await deploy(CANVAS_B);

text = await show(CANVAS_A);
check(
  'the page says the running lab is not this topology',
  text.includes('The running lab is not this topology'),
  '',
);
check(
  'it names the concrete difference',
  text.includes('deployed but no longer drawn') || text.includes('drawn but not deployed'),
  '',
);

console.log('\n=== Deploying the canvas again clears the block ===');
await deploy(CANVAS_A);
text = await show(CANVAS_A);
check(
  'the page no longer blocks',
  !text.includes('The running lab is not this topology'),
  '',
);

await teardown();

console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
dom.window.close();
process.exit(failures === 0 ? 0 : 1);
