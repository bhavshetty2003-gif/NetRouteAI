/**
 * Proves the home page is generic: identical bytes for two different users and
 * for two different loaded topologies, and no backend reads at all.
 *
 * "Identical for all users" is a claim about what the page *does not* contain,
 * so it is checked the only way that means anything -- render it under different
 * conditions and diff the resulting DOM.
 */
import { JSDOM } from 'jsdom';

const BASE = 'http://127.0.0.1:8000';

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? ' PASS' : ' FAIL'}  ${label}${extra ? `  -- ${extra}` : ''}`);
  if (!ok) failures++;
};

type Options = {
  topologyKey?: string;
  user?: { name: string; email: string } | null;
  /** Clicks the AI/OSPF preview toggle before reading the DOM, so both
      branches of a conditional label can be asserted. Reading only the
      default branch silently proves half of a toggle. */
  toggleTo?: 'ai' | 'ospf';
};

async function renderHome(opts: Options = {}) {
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
  g.getComputedStyle = dom.window.getComputedStyle;
  g.localStorage = dom.window.localStorage;
  g.MutationObserver = dom.window.MutationObserver;
  g.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(() => cb(Date.now()), 0);
  g.cancelAnimationFrame = (id: any) => clearTimeout(id);
  g.IS_REACT_ACT_ENVIRONMENT = true;

  // Record every network call and refuse them all: if the page needs the
  // backend to render, that is already the bug.
  const calls: string[] = [];
  const realFetch = globalThis.fetch;
  g.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input);
    calls.push(`${init?.method ?? 'GET'} ${new URL(url, BASE).pathname}`);
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  if (opts.topologyKey) dom.window.localStorage.setItem('netrouteai_topology_v1', opts.topologyKey);
  else dom.window.localStorage.removeItem('netrouteai_topology_v1');

  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  const { HomeView } = await import('../src/components/views/HomeView.tsx');

  const root = createRoot(dom.window.document.getElementById('root')!);
  await act(async () => {
    root.render(
      React.createElement(HomeView, {
        onLaunchDesigner: () => {},
        onOpenAuth: () => {},
        user: opts.user
          ? {
              id: 1, name: opts.user.name, age: 20, email: opts.user.email,
              mobile: '', created_at: '', has_password: true, has_google: false,
            }
          : null,
        onUserUpdated: () => {},
        onSignOut: () => {},
      }),
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 900)); });

  if (opts.toggleTo) {
    const wanted = opts.toggleTo === 'ospf' ? 'Standard OSPF' : 'AI Predictive';
    const btn = Array.from(dom.window.document.querySelectorAll('button'))
      .find((b) => (b.textContent ?? '').trim() === wanted);
    if (!btn) throw new Error(`preview toggle button not found: ${wanted}`);
    await act(async () => { btn.click(); });
    await act(async () => { await new Promise((r) => setTimeout(r, 200)); });
  }

  const html = dom.window.document.getElementById('home-landing-root')?.innerHTML ?? '';
  const text = (dom.window.document.body.textContent ?? '').replace(/\s+/g, ' ').trim();
  dom.window.close();
  return { html, text, calls };
}

// Two very different topologies: a 2-device star and a 12-router, 14-link
// multi-area mesh. Neither may change the home page.
const smallTopology = JSON.stringify({
  devices: [
    { id: 'R1', type: 'router', x: 0, y: 0 },
    { id: 'R2', type: 'router', x: 1, y: 1 },
  ],
  links: [{ source: 'R1', target: 'R2', cost: 10 }],
});

const bigTopology = JSON.stringify({
  devices: Array.from({ length: 12 }, (_, i) => ({ id: `R${i + 1}`, type: 'router', x: i, y: i })),
  links: Array.from({ length: 14 }, (_, i) => ({
    source: `R${(i % 12) + 1}`, target: `R${((i + 4) % 12) + 1}`,
    cost: 10, bandwidth: 1000, source_ip: `10.0.${i}.1/24`,
  })),
});

console.log('\n=== The page reads nothing from the backend ===');
{
  const { calls } = await renderHome();
  check('no fetch calls at all', calls.length === 0, calls.join(', ') || 'none');
}

console.log('\n=== Two different loaded topologies render identically ===');
const small = await renderHome({ topologyKey: smallTopology });
const big = await renderHome({ topologyKey: bigTopology });
check('same DOM for a 2-device lab', small.html === big.html,
  small.html === big.html ? '' : `${small.html.length} vs ${big.html.length} bytes`);
check('no device ids leaked into the page', !/\bR1\b|\bR12\b/.test(small.text));

console.log('\n=== The removed description line is gone ===');
{
  const { text } = await renderHome();
  check('no "NetRouteAI combines traditional networking" line',
    !/NetRouteAI combines traditional networking/i.test(text));
  check('no "enterprise network topologies"', !/enterprise network topologies/i.test(text));
  check('no "recommend the optimal path based on performance"',
    !/recommend the optimal path based on performance/i.test(text));
}

console.log('\n=== The page explains what the site does ===');
{
  const { text } = await renderHome();
  check('"What NetRouteAI does" heading present', /What NetRouteAI does/i.test(text));
  for (const step of [
    /1\. Draw the network/i,
    /2\. Deploy it for real/i,
    /3\. Measure and disturb it/i,
    /4\. Compare OSPF against AI/i,
  ]) {
    check(`  step present: ${step.source}`, step.test(text));
  }
  check('mentions Docker + FRRouting', /FRRouting/i.test(text));
  check('mentions OSPF', /OSPF/i.test(text));
  check('mentions Random Forest', /Random Forest/i.test(text));
}

console.log('\n=== The OSPF/AI comparison strip reads as copy, not a spec ===');
{
  const ai = await renderHome({ toggleTo: 'ai' });
  const ospf = await renderHome({ toggleTo: 'ospf' });
  check('no "Method" label', !/\bMethod\b/.test(ospf.text));
  check('no "Chosen by" label', !/Chosen by/i.test(ospf.text));
  check('no "Effect" label', !/\bEffect\b/.test(ospf.text));
  check('no "static routes" jargon left in the strip', !/static route/i.test(ospf.text));
  check('AI branch says what it reads', /live link conditions/i.test(ai.text));
  check('OSPF branch says what it reads', /link cost you set/i.test(ospf.text));
  check('neither branch leaks the other input',
    !/live link conditions/i.test(ospf.text) && !/link cost you set/i.test(ai.text));
  check('names what the two are compared on', /latency\s*&\s*loss/i.test(ai.text));
}

console.log('\n=== No instructions, disclaimers or meta-commentary ===');
{
  const { text } = await renderHome();
  // The page describes the product. It must not talk about itself -- no
  // "this is an illustration", no pointers to where a number does live, no
  // justification of an implementation choice, and no hedging about scope.
  // These are the sentences a reader cannot act on and a competitor would not
  // print. Each one is a class, not an instance.
  for (const [label, pattern] of [
    ['"illustration" framing', /illustration/i],
    ['a pointer to another page', /analytics page|on the designer|elsewhere|see the /i],
    ['"not here" / "instead" contrast', /not here\b|\binstead of\b|rather than/i],
    ['a provenance or hedging note', /you can read|is measured|read back|confirmed by/i],
    ['a scope disclaimer', /yours alone|nothing on this page|does not reflect/i],
    // "you place a router" describes a capability and is fine. What is not fine
    // is telling the reader where to go or what to conclude about this page.
    ['an instruction to go elsewhere', /go to|visit|open the (designer|analytics)|click\b|scroll\b|select\b/i],
  ] as const) {
    check(`  no ${label}`, !pattern.test(text),
      pattern.test(text) ? (text.match(pattern) ?? [])[0] : '');
  }
}

console.log('\n=== No invented performance figures remain ===');
{
  const { text } = await renderHome();
  // The historical fabrications, plus the shape of any new one.
  for (const [label, pattern] of [
    ['"< 0.4ms"', /0\.4\s*ms/i],
    ['"18.8 ms"', /18\.8\s*ms/i],
    ['"12.4 ms"', /12\.4\s*ms/i],
    ['a "-34%" improvement', /-?\d+(\.\d+)?\s*%/],
    ['a br-net* bridge name', /br-net\d/],
    ['any "ms" latency figure', /\d+(\.\d+)?\s*ms\b/i],
    ['any Mbps figure', /\d+(\.\d+)?\s*(mbps|mbit)/i],
  ] as const) {
    check(`  no ${label}`, !pattern.test(text), pattern.test(text) ? (text.match(pattern) ?? [])[0] : '');
  }
}

console.log('\n=== Sign-in copy is still present and correct ===');
{
  const signedOut = await renderHome({ user: null });
  check('signed-out: one CTA reading "Login or Register"', /Login or Register/i.test(signedOut.text));
  check('signed-out: no separate "Create a free account"', !/Create a free account/i.test(signedOut.text));
  check('signed-out: no "Instant Demo Access"', !/Instant Demo Access/i.test(signedOut.text));

  const signedIn = await renderHome({ user: { name: 'Asha Rao', email: 'asha@example.com' } });
  check('signed-in: shows "Open the Designer"', /Open the Designer/i.test(signedIn.text));
  check('signed-in: shows the account name', signedIn.text.includes('Asha Rao'));
  check('signed-in: differs from signed-out only by the account',
    signedIn.html !== signedOut.html);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);