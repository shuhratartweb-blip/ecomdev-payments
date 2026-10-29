# Independent API edge verification

## Scope

Local Worker runtime and real D1 via Miniflare. Tests use isolated databases and test-only credentials; no production account or secret files are read. This check covers API request boundaries, duplicate submission, and browser session handling. It does not claim live deployment, Telegram, or frontend verification.

Run:

```sh
node --import tsx --test tests/edge.test.ts
```

Node 22+ is required by the installed Cloudflare tooling. The initial run used the bundled Node executable.

## Initial result — 2026-10-29

**7 tests: 4 passed, 3 failed.** Source changes belong to the main implementer; this independent pass adds only tests and this report.

Confirmed defects:

1. Sending JSON `null` to login, student creation, student update, or payment creation yields HTTP 500. Invalid request shapes should be rejected as HTTP 400 before accessing fields.
2. `PATCH /students/:id` accepts arrays and primitives as successful no-op updates. The JSON body must be a non-null object, excluding arrays.
3. Payment `method: ["manual"]` passes string-coercion validation and reaches D1 as an unsupported bind value, producing HTTP 500. Require a string before checking the allowed methods.

Passing behavior:

- Eight concurrent requests with the same idempotency key create exactly one payment. Seven retries return the original payment; the balance is reduced once.
- A session signature binds its expiry. Changing expiry without re-signing is rejected; an expired correctly signed session is rejected.
- HTTPS login sets Secure, HttpOnly, SameSite=Strict cookies. Logout clears the cookie.
- Repeated incorrect passwords are throttled and cannot access student data.

## Acceptance

Rerun the entire suite after fixes. A green edge suite is necessary but not sufficient for release: the clean-start README, live domain, frontend mobile flows, and live Telegram commands require their own verification.

## Follow-up API and Telegram verification

The main implementer fixed the three initial API defects. All seven original edge tests now pass. Miniflare was upgraded to v5, so the test harness now uses its exported `convertV4MiniflareOptions` adapter.

Four Telegram checks were added. Latest edge run: **11 tests, 10 passed, 1 failed**.

Additional passing behavior:

- A delayed `/pay` uses the original Telegram message timestamp converted to Asia/Tashkent, rather than processing time. Repeating it returns the same receipt and preserves a single payment.
- The exact Tashkent midnight boundary is handled: `2026-10-01T18:59:59Z` is October 1 locally; `2026-10-01T19:00:00Z` is October 2.
- Unauthorized private users and group messages cannot write payments.

Remaining finding: a valid-secret webhook with malformed nested message data (`chat` missing/null, non-string `text`, or invalid `date`) raises TypeError/RangeError and returns 500. It should reject malformed payloads with 400 before processing fields. This is covered by `Telegram malformed nested message returns client error instead of runtime error`.
