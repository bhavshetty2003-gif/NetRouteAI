/**
 * Where the API is, decided once and imported everywhere.
 *
 * It used to be a literal in two files (`api.ts` and `auth.ts`), which meant a
 * deployment to another machine needed both edited — and if only one was, the
 * app signed in against one server and read the lab from another. One module,
 * two modes:
 *
 *   dev  (`npm run dev`, Vite on :3000)  ->  http://127.0.0.1:8000
 *        Two origins, which is why CORS exists in `main.py` at all.
 *
 *   prod (`npm run build`, served by nginx)  ->  "" (same origin)
 *        nginx proxies `/api`, `/upload-topology` and `/health` to the backend,
 *        so the page and the API share an origin and the address can be empty.
 *        Empty is not a fallback here, it is the correct value: a page on
 *        http://192.168.1.20 asking for http://127.0.0.1:8000 would be asking
 *        the *visitor's* machine, not the server's, which is the single most
 *        confusing way a hardcoded localhost breaks after deployment.
 *
 * `VITE_API_BASE` overrides both when the UI is served from somewhere the
 * proxy does not cover (a static bundle on a CDN, say): set it to an origin
 * like `https://netrouteai.example.com`. An explicitly *empty* value still
 * yields an empty base, because `??` only replaces `undefined` — and "" means
 * same origin in either mode, so that is also right.
 *
 * The environment is read through a nullish access rather than `import.meta.env`
 * directly, and that is not paranoia: Vite injects `import.meta.env` at build
 * and dev-server time, while the verification harnesses in `.harness/` load
 * these modules as plain ESM through `tsx`, where `import.meta.env` is not
 * defined at all and reading a property off it throws. Both paths land on the
 * dev default, which is exactly what the harnesses expect.
 */

interface AppEnv {
  VITE_API_BASE?: string;
  PROD?: boolean;
}

// Vite types this as always present; it genuinely is not, outside Vite.
const env = import.meta.env as AppEnv | undefined;

const fromEnv: string | undefined = env?.VITE_API_BASE;

export const API_BASE: string = fromEnv ?? (env?.PROD ? "" : "http://127.0.0.1:8000");
