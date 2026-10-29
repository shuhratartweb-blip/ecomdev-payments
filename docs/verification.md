# API and frontend-model verification

## Scope and command

Checks exercise the local Worker runtime and real D1 through Miniflare v5 (`convertV4MiniflareOptions`), plus pure frontend formatting and validation functions. They use isolated databases and test-only credentials; production account and secret files are not read. This report does not claim live-deployment or browser UI verification.

```sh
npm test
npm run typecheck
npm run build
```

Use Node 22+ as required by the installed Cloudflare tooling. Verification here used bundled Node 24.

## Final local result — 2026-10-29

**31 tests passed, 0 failed.** TypeScript checking passed. The Vite production build passed before the final small receipt timestamp addition; the main implementer performs the final deployment build.

Covered behavior:

- Students CRUD, payment validation, monthly debt calculation, month/year boundaries, zero tariffs, full payment and overpayment.
- Non-object JSON bodies and incorrectly typed fields return client errors rather than reaching D1.
- Eight concurrent submissions with one idempotency key produce exactly one payment and one balance change.
- Session signatures bind expiry; tampered/expired sessions cannot read students. HTTPS cookies use Secure, HttpOnly and SameSite=Strict; logout clears the cookie.
- Repeated incorrect login attempts are throttled.
- Telegram malformed nested messages are rejected; unauthorized private users and group commands cannot write payments.
- Telegram payments use original message time in Asia/Tashkent, including the local midnight boundary. Repeated delivery does not duplicate payment.
- Telegram button flow selects student and amount, confirms once, supports cancellation and language switching.
- Whole UZS only: fractional payments and tariffs are rejected, while legacy `100.00` input is normalized to `100`. Both frontend locales display no fractional digits.
- Payment dates display and accept `DD-MM-YYYY`; wire dates remain ISO `YYYY-MM-DD`.
- Creation timestamps are returned as ISO UTC and shown separately from the effective payment date in Asia/Tashkent using `DD-MM-YYYY HH:mm:ss`.

## Implementation follow-through

All initial independent review regressions were reproduced before fixes: null request bodies, array/primitive PATCH inputs, array payment methods, and malformed Telegram message data. Their regression tests now pass.

Frontend amount fields use integer steps and numeric keyboards; editable form fields are disabled during submission. A payment form obtains today's date when opened instead of reusing login-time date. History shows effective date and recorded-at timestamp separately, and successful payment receipts show recorded time.

The deployment configuration sends `/payments` and `/balances` aliases through the Worker before SPA fallback. Live domain, fresh-start README execution and rendered desktop/mobile verification remain separate release checks owned by the main implementer.
