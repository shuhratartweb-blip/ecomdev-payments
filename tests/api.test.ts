import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
let mf: Miniflare, db: any, cookie: string;
before(async () => {
  const bundle = await build({
    entryPoints: ["src/server/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-05-01",
      d1Databases: ["DB"],
      bindings: {
        APP_PASSWORD: "test-password",
        SESSION_SECRET: "test-session-secret-32-characters-long",
        TIMEZONE: "Asia/Tashkent",
        TELEGRAM_WEBHOOK_SECRET: "secret",
        TELEGRAM_BOT_TOKEN: "123:fake-test-token",
        TELEGRAM_ALLOWED_IDS: "123",
      },
    }),
  );
  db = await mf.getD1Database("DB");
  const sql = (
    await Promise.all(
      ["0001_init.sql", "0002_telegram_flow.sql"].map((name) =>
        readFile("migrations/" + name, "utf8"),
      ),
    )
  ).join("\n");
  for (const stmt of sql.split(";").filter((x) => x.trim()))
    await db.prepare(stmt).run();
  const login = await req(
    "/api/login",
    "POST",
    { password: "test-password" },
    false,
  );
  cookie = login.headers.get("set-cookie")!.split(";")[0];
});
after(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await db.prepare("DELETE FROM telegram_flow").run();
  await db.prepare("DELETE FROM payments").run();
  await db.prepare("DELETE FROM students").run();
});
function req(
  path: string,
  method = "GET",
  body?: unknown,
  auth = true,
  extra = {},
) {
  return mf.dispatchFetch("https://test.local" + path, {
    method,
    headers: {
      ...(auth ? { cookie } : {}),
      "content-type": "application/json",
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function student(fee = "100") {
  const r = await req("/students", "POST", {
    name: "Ali Valiyev",
    phone: "+998901234567",
    group: "IELTS-1",
    monthlyFee: fee,
  });
  assert.equal(r.status, 201);
  return r.json() as any;
}
async function pay(id: number, amount: string, date: string, key?: string) {
  return req(
    `/students/${id}/payments`,
    "POST",
    { amount, date, method: "manual" },
    true,
    key ? { "idempotency-key": key } : {},
  );
}
test("protects data and rejects incorrect credentials", async () => {
  assert.equal((await req("/students", "GET", undefined, false)).status, 401);
  assert.equal(
    (await req("/api/login", "POST", { password: "wrong" }, false)).status,
    401,
  );
});
test("CRUD persists changes and cascades student payments", async () => {
  const s = await student();
  assert.equal(((await (await req("/students")).json()) as any[]).length, 1);
  assert.equal(
    (await req(`/students/${s.id}`, "PATCH", { name: "Updated" })).status,
    200,
  );
  assert.equal(
    ((await (await req("/students")).json()) as any[])[0].name,
    "Updated",
  );
  await pay(s.id, "20", "2026-10-01");
  assert.equal((await req(`/students/${s.id}`, "DELETE")).status, 204);
  assert.equal(
    (await db.prepare("SELECT count(*) AS n FROM payments").first()).n,
    0,
  );
  assert.equal((await req(`/students/${s.id}/payments`)).status, 404);
});
test("debts include unpaid students, sum only selected month, exclude fully paid and overpaid", async () => {
  const a = await student(),
    b = await student(),
    c = await student(),
    d = await student();
  await pay(b.id, "20", "2026-10-01");
  await pay(b.id, "30", "2026-10-31");
  await pay(b.id, "999", "2026-09-30");
  await pay(b.id, "999", "2026-11-01");
  await pay(c.id, "100", "2026-10-01");
  await pay(d.id, "110", "2026-10-01");
  const rows = (await (await req("/debtors?month=2026-10")).json()) as any[];
  assert.equal(rows.length, 2);
  assert.equal(rows.find((x) => x.id === a.id).debt, "100");
  assert.equal(rows.find((x) => x.id === b.id).debt, "50");
});
test("validates money, dates, months and unknown students", async () => {
  const s = await student();
  for (const value of ["0", "-1", "1.01", "1.001", "1e3", "999999999999999999"])
    assert.equal((await pay(s.id, value, "2026-10-01")).status, 400);
  for (const date of ["2026-02-29", "2026-13-01", "2026-1-1", "2026-04-31"])
    assert.equal((await pay(s.id, "1", date)).status, 400);
  assert.equal((await pay(s.id, "1", "2024-02-29")).status, 201);
  for (const m of ["2026-13", "2026-1", "oops"])
    assert.equal((await req("/debtors?month=" + m)).status, 400);
  assert.equal((await pay(999999, "1", "2026-10-01")).status, 404);
});
test("year boundaries and zero fee", async () => {
  const s = await student();
  await student("0");
  await pay(s.id, "25", "2025-12-31");
  await pay(s.id, "75", "2026-01-01");
  const dec = (await (await req("/debtors?month=2025-12")).json()) as any[];
  assert.equal(dec.length, 1);
  assert.equal(dec[0].debt, "75");
  assert.equal(
    ((await (await req("/debtors?month=2026-01")).json()) as any[])[0].debt,
    "25",
  );
});
test("retrying same payment key does not duplicate; changed payload conflicts", async () => {
  const s = await student();
  assert.equal(
    (await pay(s.id, "10", "2026-10-01", "test-idempotency-1")).status,
    201,
  );
  assert.equal(
    (await pay(s.id, "10", "2026-10-01", "test-idempotency-1")).status,
    200,
  );
  assert.equal(
    (await pay(s.id, "11", "2026-10-01", "test-idempotency-1")).status,
    409,
  );
  assert.equal(
    ((await (await req(`/students/${s.id}/payments`)).json()) as any[]).length,
    1,
  );
});
test("simulation records method and marker, rejects unsupported payment provider", async () => {
  const s = await student();
  const r = await req(`/students/${s.id}/payments`, "POST", {
    amount: "20",
    date: "2026-10-01",
    method: "payme",
  });
  assert.equal(r.status, 201);
  const p = (await r.json()) as any;
  assert.equal(p.simulated, true);
  assert.equal(p.method, "payme");
  assert.equal(
    (
      await req(`/students/${s.id}/payments`, "POST", {
        amount: "20",
        date: "2026-10-01",
        method: "stripe",
      })
    ).status,
    400,
  );
});
test("blocks cross-origin mutations and forged webhook", async () => {
  assert.equal(
    (
      await req("/students", "POST", {}, true, {
        origin: "https://evil.example",
      })
    ).status,
    403,
  );
  assert.equal(
    (await req("/telegram/webhook", "POST", { update_id: 1 }, false)).status,
    403,
  );
});
test("Telegram authorized payments are idempotent and language preference persists", async () => {
  const s = await student();
  const update = (update_id: number, user: number, text: string) => ({
    update_id,
    message: {
      message_id: update_id,
      date: 1793246400,
      from: { id: user, is_bot: false, first_name: "QA" },
      chat: { id: user, type: "private" },
      text,
    },
  });
  const tg = (u: unknown) =>
    req("/telegram/webhook", "POST", u, false, {
      "X-Telegram-Bot-Api-Secret-Token": "secret",
    });
  const denied = await tg(update(10, 999, "/debt"));
  assert.equal(denied.status, 200);
  assert.match(JSON.stringify(await denied.json()), /denied|доступ|ruxsat/i);
  const a = await tg(update(11, 123, `/pay ${s.id} 25`));
  assert.equal(a.status, 200);
  assert.match(JSON.stringify(await a.json()), /25/);
  await tg(update(11, 123, `/pay ${s.id} 25`));
  assert.equal(
    ((await (await req(`/students/${s.id}/payments`)).json()) as any[]).length,
    1,
  );
  await tg(update(12, 123, "/lang uz"));
  const help = await (await tg(update(13, 123, "/help"))).json();
  assert.match(JSON.stringify(help), /qarzdor|to‘lov|to'lov/i);
});
