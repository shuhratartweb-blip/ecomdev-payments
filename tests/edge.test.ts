import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";

const secret = "edge-test-only-signing-secret-32-characters";
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
let cookie: string;

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
      name: "edge",
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-05-01",
      d1Databases: ["DB"],
      bindings: {
        APP_PASSWORD: "edge-test-password",
        SESSION_SECRET: secret,
        TIMEZONE: "Asia/Tashkent",
        TELEGRAM_WEBHOOK_SECRET: "edge-secret",
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
  for (const statement of sql.split(";").filter((s) => s.trim()))
    await db.prepare(statement).run();
  const response = await request(
    "/api/login",
    "POST",
    { password: "edge-test-password" },
    "",
  );
  assert.equal(response.status, 200);
  cookie = response.headers.get("set-cookie")!.split(";")[0];
});
after(async () => {
  await mf?.dispose();
});
beforeEach(async () => {
  await db.prepare("DELETE FROM payments").run();
  await db.prepare("DELETE FROM students").run();
  await db.prepare("DELETE FROM login_attempts").run();
  await db.prepare("DELETE FROM telegram_preferences").run();
  await db.prepare("DELETE FROM telegram_flow").run();
});

function request(
  path: string,
  method = "GET",
  body?: unknown,
  session = cookie,
  extra: Record<string, string> = {},
) {
  return mf.dispatchFetch("https://edge.test" + path, {
    method,
    headers: {
      "content-type": "application/json",
      ...(session ? { cookie: session } : {}),
      ...extra,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}
async function createStudent() {
  const response = await request("/students", "POST", {
    name: "Edge Student",
    phone: "+998901112233",
    group: "QA",
    monthlyFee: "100.00",
  });
  assert.equal(response.status, 201);
  return (await response.json()) as { id: number; name: string };
}
function signedCookie(expiry: number) {
  const payload = `${expiry}.edge-test-nonce`;
  return `ustoz_session=${payload}.${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

test("rejects null JSON body as a client error on every JSON write endpoint", async () => {
  const student = await createStudent();
  const responses = await Promise.all([
    request("/api/login", "POST", null, ""),
    request("/students", "POST", null),
    request(`/students/${student.id}`, "PATCH", null),
    request(`/students/${student.id}/payments`, "POST", null),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [400, 400, 400, 400],
  );
});

test("rejects JSON arrays and primitives instead of treating them as patch objects", async () => {
  const student = await createStudent();
  for (const value of [[], ["name"], true, 4, "text"]) {
    const response = await request(`/students/${student.id}`, "PATCH", value);
    assert.equal(
      response.status,
      400,
      `PATCH ${JSON.stringify(value)} must reject a non-object body`,
    );
  }
  const students = (await (await request("/students")).json()) as {
    id: number;
    name: string;
  }[];
  assert.equal(students[0].name, "Edge Student");
});

test("rejects wrong field types without database errors or side effects", async () => {
  const student = await createStudent();
  const responses = await Promise.all([
    request("/students", "POST", {
      name: { value: "Ali" },
      phone: "123",
      group: "QA",
      monthlyFee: "100",
    }),
    request(`/students/${student.id}`, "PATCH", { monthlyFee: 100 }),
    request(`/students/${student.id}/payments`, "POST", {
      amount: "10",
      date: "2026-10-01",
      method: ["manual"],
    }),
  ]);
  assert.deepEqual(
    responses.map((r) => r.status),
    [400, 400, 400],
  );
  const payments = await (
    await request(`/students/${student.id}/payments`)
  ).json();
  assert.deepEqual(payments, []);
});

test("concurrent retries create exactly one payment and one balance change", async () => {
  const student = await createStudent();
  const responses = await Promise.all(
    Array.from({ length: 8 }, () =>
      request(
        `/students/${student.id}/payments`,
        "POST",
        { amount: "12", date: "2026-10-01", method: "click" },
        cookie,
        { "idempotency-key": "edge-concurrent-payment-1" },
      ),
    ),
  );
  assert.equal(responses.filter((r) => r.status === 201).length, 1);
  assert.equal(responses.filter((r) => r.status === 200).length, 7);
  const payments = (await (
    await request(`/students/${student.id}/payments`)
  ).json()) as unknown[];
  assert.equal(payments.length, 1);
  const debtors = (await (await request("/debtors?month=2026-10")).json()) as {
    debt: string;
  }[];
  assert.equal(debtors[0].debt, "88");
});

test("signature binds session expiry and rejects expired correctly signed sessions", async () => {
  const valid = signedCookie(Date.now() + 60000);
  assert.equal(
    (await request("/students", "GET", undefined, valid)).status,
    200,
  );
  const [prefix, nonce, signature] = valid.split(".");
  const tampered = `${prefix.slice(0, prefix.indexOf("=") + 1)}${Date.now() + 9999999}.${nonce}.${signature}`;
  assert.equal(
    (await request("/students", "GET", undefined, tampered)).status,
    401,
  );
  assert.equal(
    (
      await request(
        "/students",
        "GET",
        undefined,
        signedCookie(Date.now() - 1000),
      )
    ).status,
    401,
  );
  assert.equal(
    (await request("/students", "GET", undefined, "ustoz_session=garbage"))
      .status,
    401,
  );
});

test("login sets secure browser cookie and logout clears it", async () => {
  const login = await request(
    "/api/login",
    "POST",
    { password: "edge-test-password" },
    "",
  );
  const setCookie = login.headers.get("set-cookie")!;
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /Secure/i);
  assert.match(setCookie, /SameSite=Strict/i);
  const logout = await request("/api/logout", "POST");
  assert.equal(logout.status, 200);
  assert.match(logout.headers.get("set-cookie")!, /Max-Age=0/i);
});

test("login throttling blocks repeated guesses without exposing data", async () => {
  for (let i = 0; i < 20; i++)
    assert.equal(
      (
        await request("/api/login", "POST", { password: "wrong" }, "", {
          "CF-Connecting-IP": "192.0.2.10",
        })
      ).status,
      401,
    );
  assert.equal(
    (
      await request("/api/login", "POST", { password: "wrong" }, "", {
        "CF-Connecting-IP": "192.0.2.10",
      })
    ).status,
    429,
  );
  assert.equal((await request("/students", "GET", undefined, "")).status, 401);
});

function telegramMessage(
  updateId: number,
  text: string,
  date = Date.parse("2026-10-01T18:59:59Z") / 1000,
) {
  return {
    update_id: updateId,
    message: {
      message_id: updateId,
      date,
      from: { id: 123, is_bot: false, first_name: "QA" },
      chat: { id: 123, type: "private" },
      text,
    },
  };
}
function webhook(update: unknown) {
  return request("/telegram/webhook", "POST", update, "", {
    "X-Telegram-Bot-Api-Secret-Token": "edge-secret",
  });
}

test("Telegram delayed payment uses original message date in Tashkent", async () => {
  const student = await createStudent();
  // 18:59:59Z is 23:59:59 in Tashkent; processing/retry happens days later.
  const first = await webhook(telegramMessage(79001, `/pay ${student.id} 10`));
  assert.equal(first.status, 200);
  const original = (await first.json()) as { text: string };
  assert.match(original.text, /01-10-2026/);
  const repeat = await webhook(telegramMessage(79001, `/pay ${student.id} 10`));
  assert.equal(repeat.status, 200);
  assert.deepEqual(await repeat.json(), original);
  const payments = (await (
    await request(`/students/${student.id}/payments`)
  ).json()) as { date: string }[];
  assert.equal(payments.length, 1);
  assert.equal(payments[0].date, "2026-10-01");
});

test("Telegram payment immediately after local midnight belongs to next day", async () => {
  const student = await createStudent();
  const response = await webhook(
    telegramMessage(
      79002,
      `/pay ${student.id} 10`,
      Date.parse("2026-10-01T19:00:00Z") / 1000,
    ),
  );
  assert.equal(response.status, 200);
  const payments = (await (
    await request(`/students/${student.id}/payments`)
  ).json()) as { date: string }[];
  assert.equal(payments[0].date, "2026-10-02");
});

test("Telegram malformed nested message returns client error instead of runtime error", async () => {
  const base = telegramMessage(79003, "/help");
  const malformed = [
    { update_id: 79003, message: { from: { id: 123 }, text: "/help" } },
    { ...base, message: { ...base.message, text: 42 } },
    { ...base, message: { ...base.message, date: "not-a-timestamp" } },
    { ...base, message: { ...base.message, chat: null } },
  ];
  const responses = await Promise.all(malformed.map(webhook));
  assert.deepEqual(
    responses.map((r) => r.status),
    [400, 400, 400, 400],
  );
});

test("Telegram unauthorized private user and group commands cannot write payments", async () => {
  const student = await createStudent();
  const base = telegramMessage(79004, `/pay ${student.id} 10`);
  await webhook({
    ...base,
    message: {
      ...base.message,
      from: { ...base.message.from, id: 999 },
      chat: { id: 999, type: "private" },
    },
  });
  await webhook({
    ...base,
    message: { ...base.message, chat: { id: -100123, type: "group" } },
  });
  const payments = await (
    await request(`/students/${student.id}/payments`)
  ).json();
  assert.deepEqual(payments, []);
});

test("whole UZS rejects fractional payments and tariffs without writing them", async () => {
  const student = await createStudent();
  assert.equal(
    (
      await request(`/students/${student.id}/payments`, "POST", {
        amount: "1.01",
        date: "2026-10-01",
        method: "manual",
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await request("/students", "POST", {
        name: "Invalid fraction",
        phone: "123",
        group: "QA",
        monthlyFee: "1.01",
      })
    ).status,
    400,
  );
  assert.equal(
    (await request(`/students/${student.id}`, "PATCH", { monthlyFee: "1.01" }))
      .status,
    400,
  );
  assert.deepEqual(
    await (await request(`/students/${student.id}/payments`)).json(),
    [],
  );
});

test("legacy .00 input is normalized to whole UZS output", async () => {
  const student = await createStudent();
  const created = (await (await request("/students")).json()) as {
    id: number;
    monthlyFee: string;
  }[];
  assert.equal(created[0].monthlyFee, "100");
  const response = await request(`/students/${student.id}/payments`, "POST", {
    amount: "100.00",
    date: "2026-10-01",
    method: "manual",
  });
  assert.equal(response.status, 201);
  const payment = (await response.json()) as { amount: string };
  assert.equal(payment.amount, "100");
  const payments = (await (
    await request(`/students/${student.id}/payments`)
  ).json()) as unknown[];
  assert.equal(payments.length, 1);
});


test('payment history distinguishes effective date from UTC creation timestamp',async () => {
  const student = await createStudent();
  const response = await request(`/students/${student.id}/payments`,'POST',{amount:'100',date:'2026-10-01',method:'manual'});
  assert.equal(response.status,201);
  const payment = await response.json() as {id:number;createdAt:string};
  assert.match(payment.createdAt,/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  await db.prepare('UPDATE payments SET created_at=? WHERE id=?').bind('2026-10-02 19:01:02',payment.id).run();
  const rows = await (await request(`/students/${student.id}/payments`)).json() as {date:string;createdAt:string}[];
  assert.equal(rows[0].date,'2026-10-01');
  assert.equal(rows[0].createdAt,'2026-10-02T19:01:02Z');
});
