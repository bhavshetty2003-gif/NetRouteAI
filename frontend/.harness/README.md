# Verification harnesses

These are not a unit-test suite. They are five jsdom scripts that mount the real
components and drive them against the **running** backend on port 8000, because
the things worth checking here — that a session actually gates the workspace,
that a canvas belongs to the account that drew it, that an email cannot be
changed even by tampering with the DOM — only fail in a real browser and a real
server. Stubbing either would have hidden the bugs these found.

Start the backend and the dev server first:

```bash
cd ../backend && venv/bin/uvicorn main:app --port 8000
cd ../frontend && npm run dev
```

Then:

```bash
npm run test:auth        # register, validate, edit profile, sign out
npm run test:gate        # the whole App: signed out vs signed in
npm run test:google-ui   # the Google button's visibility rule
npm run test:home        # the landing page: no backend reads, no invented figures
npm run test:canvas      # per-account canvas: blank, restored, never shared
```

The Google *token signature* is checked server-side and cannot be exercised from
jsdom, so that half lives with the backend:

```bash
cd ../backend && venv/bin/python /tmp/opencode/google_verify.py
```

## What they caught

- `public_user()` read columns with `getattr` on a `sqlite3.Row`, which has no
  such attributes — so a fully-populated account serialised as all-nulls.
- `_google_public_keys()` called `load_der_public_key` on a JWK modulus. A
  modulus is a raw integer, not DER, so every key raised, the bare `except`
  swallowed it, and sign-in failed with "could not read Google's signing keys"
  for *any* token. The positive control in `google_verify.py` is what exposed it.
- The Google "needs profile" identity was dropped on the hop from the login
  panel to the register panel, so the user was asked for an email they had just
  verified.
- The canvas was stored under one global key, so a second account on the same
  browser was handed the first one's network. `test:canvas` registers two
  accounts in one jsdom and asserts each gets its own key.

## Two patterns these rely on

**A conditional has two branches; assert both.** `test:home` clicks the AI/OSPF
preview toggle before reading the DOM. Reading only the default branch is how a
label check passes against text that is not on the page.

**"Empty" and "absent" are different states.** `test:canvas` asserts
`hasSavedTopology(id) === true` *and* `loadTopology(id).devices.length === 0`
after the user clears their workspace. Asserting only the second passes just as
well for a store that never saved anything — which is the bug that resurrects a
topology the user deleted.

## Why the tamper test looks the way it does

`google_verify.py` tampers with the *decoded* payload. The obvious
`token.replace("gqa@example.com", "attacker@evil.com")` is a silent no-op — the
plaintext does not appear in the base64url segment — so the "tampered" token
verifies successfully and the test passes while proving nothing.