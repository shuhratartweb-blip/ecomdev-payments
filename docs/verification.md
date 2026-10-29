# API and frontend-model verification

## Scope and command

Checks exercise the local Worker runtime and real D1 through Miniflare v5 (`convertV4MiniflareOptions`), plus pure frontend formatting and validation functions. They use isolated databases and test-only credentials; production account and secret files are not read. These automated results are local; a separate read-only live login smoke check returned HTTP 200 on https://ustoz.rieltor.store. No live payment writes were performed during this documentation release.

```sh
npm test
npm run typecheck
npm run build
```

Use Node 22+ as required by the installed Cloudflare tooling. Verification here used bundled Node 24.

## Final local result — 2026-10-29

**34 tests passed, 0 failed.** TypeScript checking and the final Vite production build passed on source commit `595c999` (2026-10-29), including the latest Telegram all-students and Payme/Click changes.

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

The deployment configuration sends `/payments` and `/balances` aliases through the Worker before SPA fallback. Live login was checked separately (HTTP 200). Full fresh-start README execution and a fresh rendered desktop/mobile sweep were not repeated in this documentation release; historical UI checks are distinguished in web-handoff.md.

## Latest Telegram coverage

All-students pagination includes fully paid and overpaid learners; debtors excludes them. Both providers require explicit simulation confirmation, record their method, and resist replay. Cancellation and obsolete manual confirmation write nothing; Uzbek flow text is checked.
