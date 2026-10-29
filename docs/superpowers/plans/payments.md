# Ecomdev payments implementation plan

Spec: user-approved conversation plan, updated 2026-10-29.

## Global constraints
TypeScript Worker + Hono, D1, React/Vite, grammY. Domain rieltor.store in latest supplied Cloudflare account. Public GitHub shuhratartweb-blip/ecomdev-payments. No credentials in git. RU/Uzbek Latin; light blue and warm green themes; Payme/Click simulation only. Dates Asia/Tashkent; UZS integer minor units. Current tariff for all months; no carryover. Password session for web/API; Telegram allowlist and webhook secret.

## Task 1: API and persistence
Write integration tests using Miniflare D1 for auth, students CRUD, validation, payments, debt calculations and idempotency. Implement migrations, domain validators, D1 service, Hono routes. Verify npm test and npm run typecheck.

## Task 2: Interface
Generate light and warm desktop/mobile concepts. Implement login, debtor dashboard, students CRUD, payment history/form, simulation, translations and saved preferences. Verify build and browser workflows at desktop/mobile sizes.

## Task 3: Telegram
Implement webhook with shared services, bilingual commands, authorized IDs and duplicate-update protection. Test webhook authorization, bilingual commands and duplicate payments. Configure live only when token supplied.

## Task 4: Delivery
Document exact clean-start/deploy/test commands, five improvements and truthful AI contribution. CI. Inspect target account/domain before publishing. Deploy D1 and Worker, set secrets, connect domain if vacant. Verify live. Publish repo via authorized account; never use unrelated CLI account to write. Final independent review and fix material findings.
