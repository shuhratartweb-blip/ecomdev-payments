# Web interface handoff

Frontend ownership: `src/web/`, `index.html`, `public/brands/`, `tests/web-model.test.ts`.
No server, Cloudflare, secrets, package or migration files changed by the frontend task.

## Run

`npm run web:dev -- --port 5175`

- `http://localhost:5175/?preview=1`: explicitly labelled fictional in-memory preview. Reload resets preview records; no API calls or real provider charges.
- `http://localhost:5175/`: real session/login and `/api` endpoints through Vite proxy; requires backend running.

## Implemented

Russian and Uzbek Latin, persisted light/blue and warm/green themes; student creation/edit/delete forms and history; debtors by month, name/group filters and summary; payment list; manual entry and explicitly simulated Payme/Click confirmation/cancellation/success; mobile cards and accessible native dialogs. Payment requests use Idempotency-Key and integer-based money helpers.

API contract used: session/login/logout; students GET/POST/PATCH/DELETE; balances?month; payments GET; students/:id/payments GET/POST. Error handling expects `{error:{code}}`; amounts are decimal strings.

## Verified

- TypeScript check and production build pass.
- Four web-model tests pass: exact fractional totals, amount/date validation, month validation, Uzbek month display.
- Browser preview: student creation; Payme partial payment 40.25 against fee100.50 results in debt60.25; RU/UZ and themes persist after reload.
- Mobile390 and320 widths inspected. Fixed button overflow at320; document width equals viewport width.
- Browser console reported no errors.
- Real authentication, database writes, complete CRUD browser coverage and live deployment remain integration checks; preview checks do not establish those.

## Design comparison

1. Retained concept sidebar with three destinations, top-right theme/language controls.
2. Retained three financial metric cards and restrained blue/green palettes.
3. Retained table debt emphasis, avatars and inline payment action.
4. Retained stacked mobile metrics and student cards; added compact mobile navigation.
5. Retained simulated provider banner; uses official source logos (see brand-sources.md).

Intentional additions: preview banner, search/group filter, functional authentication and payment dialogs. Totals reflect actual fictional records rather than inconsistent generated-image figures. Screenshots: `docs/design/web-light.png`, `web-warm.png`, `web-mobile.png`.
