/**
 * The frontend half of the Google check: when /api/auth/config reports a client
 * id, the button must render; when it does not, nothing must render.
 *
 * The token signature itself is verified server-side, so that half of the test
 * lives in /tmp/opencode/google_verify.py where it belongs.
 */
import { JSDOM } from 'jsdom';

const BASE = 'http://127.0.0.1:8000';
const FAKE_ID = '123456789012-abcdefghijklmnopqrstuvwxyz.apps.googleusercontent.com';

let failures = 0;
const check = (label: string, ok: boolean, extra = '') => {
  console.log(`${ok ? ' PASS' : ' FAIL'}  ${label}${extra ? `  -- ${extra}` : ''}`);
  if (!ok) failures++;
};

async function renderLoginPanel(config: { google_enabled: boolean; google_client_id: string }) {
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

  // Only /api/auth/config is intercepted, so this isolates the button's
  // visibility rule. Everything else is left alone.
  const realFetch = globalThis.fetch;
  g.fetch = async (input: any, init?: any) => {
    const url = typeof input === 'string' ? input : String(input?.url ?? input);
    if (new URL(url, BASE).pathname === '/api/auth/config') {
      return new Response(JSON.stringify(config), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return realFetch(input, init);
  };

  const React = (await import('react')).default;
  const { createRoot } = await import('react-dom/client');
  const { act } = await import('react');
  const { LoginPage } = await import('../src/components/auth/LoginPage.tsx');

  const root = createRoot(dom.window.document.getElementById('root')!);
  await act(async () => {
    root.render(
      React.createElement(LoginPage, {
        onAuthenticated: () => {},
        onGoToRegister: () => {},
        onGoToForgot: () => {},
        onClose: () => {},
      }),
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 600)); });

  const host = dom.window.document.querySelector('[data-google-ready]');
  const panel = (dom.window.document.body.textContent ?? '').replace(/\s+/g, ' ');
  dom.window.close();
  return { hasHost: Boolean(host), ready: host?.getAttribute('data-google-ready'), panel };
}

console.log('\n=== Client id NOT configured ===');
{
  const { hasHost } = await renderLoginPanel({ google_enabled: false, google_client_id: '' });
  check('no Google button rendered at all', !hasHost);
}

console.log('\n=== Client id configured ===');
{
  const { hasHost, ready } = await renderLoginPanel({ google_enabled: true, google_client_id: FAKE_ID });
  check('Google button host rendered', hasHost);
  // The real button is Google's own iframe; in jsdom the script cannot load,
  // so "not ready yet" is the honest expected state rather than a failure.
  check('host is present but not yet populated', ready === 'false', `data-google-ready=${ready}`);
}

console.log(`\n${failures === 0 ? 'ALL CHECKS PASSED' : `${failures} CHECK(S) FAILED`}`);
process.exit(failures === 0 ? 0 : 1);
