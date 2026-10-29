# API contract

Amounts are whole UZS. JSON money fields are integer strings (for example `"700000"`); zero fractional input such as `"700000.00"` is accepted for compatibility, while nonzero fractions are rejected. Monthly fee can be zero; payments must be positive. The maximum single value is 1,000,000,000 UZS. Storage remains integer minor units.

All browser API endpoints use /api prefix and HttpOnly session cookie (fetch same-origin credentials).
POST /api/login {password:string} -> {ok:true}; 401 INVALID_PASSWORD.
GET /api/session -> {ok:true,today:'YYYY-MM-DD'} or 401. POST /api/logout -> {ok:true}.
GET /api/students -> Student[]. POST /api/students {name,phone,group,monthlyFee:string} -> Student, 201.
PATCH /api/students/:id partial above. DELETE -> 204, cascades payments.
Student = {id:number,name:string,phone:string,group:string,monthlyFee:'700000'}.
GET /api/debtors?month=YYYY-MM -> Balance[] with only debt >0.
GET /api/balances?month=YYYY-MM -> Balance[] ALL students (for summary).
Balance = Student & {paid:string,debt:string}.
GET /api/payments -> Payment[] recent 500 with studentName.
GET /api/students/:id/payments -> Payment[] entire history.
POST /api/students/:id/payments {amount:string,date:'YYYY-MM-DD',method:'manual'|'payme'|'click'} -> Payment 201 or 200 on replay. Send Idempotency-Key header UUID per submitted intent, preserve key on network retry; reset key if payload changes. No write on cancel simulation. Payme/Click always simulated.
Payment={id,studentId,amount:string,date,createdAt:string,method,simulated:boolean,studentName?:string}. `date` is the accounting date in `YYYY-MM-DD`; `createdAt` is the record creation timestamp in ISO 8601 UTC. API dates remain ISO regardless of UI language.
Errors: {error:{code:string}}, codes INVALID_AMOUNT, INVALID_DATE, INVALID_MONTH, INVALID_ID, INVALID_FIELDS, INVALID_METHOD, INVALID_KEY, STUDENT_NOT_FOUND, IDEMPOTENCY_CONFLICT, UNAUTHORIZED, INVALID_PASSWORD, FORBIDDEN, TOO_MANY_ATTEMPTS, NOT_CONFIGURED, INVALID_JSON, INTERNAL_ERROR. Localize errors in client.

The browser and bot display dates as `DD-MM-YYYY` and times as `HH:mm:ss`, always in `Asia/Tashkent`; money has no fractional digits. Session `today` remains `YYYY-MM-DD` in Asia/Tashkent. No carryover. Current tariff applies all months. No real payment integration. RU/UZ Latin and two persistent themes. Concepts docs/design/light.png and warm.png. Live mode must use API, demo mode only explicitly selected and clearly labelled if included.

Telegram offers a persistent RU/UZ reply keyboard: debtors, payment entry, language selection, and menu/cancel. Payment entry selects a student from pages of 8, accepts a positive whole UZS amount, then requires confirmation. Legacy `/debt` and `/pay <id> <amount>` commands remain available. Only allowlisted private users can access bot data or record payments.
