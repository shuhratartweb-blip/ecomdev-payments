import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { readFile } from "node:fs/promises";
let mf: Miniflare;
let db: Awaited<ReturnType<Miniflare["getD1Database"]>>;
let seq = 90000;
before(async () => {
  const bundle = await build({
    entryPoints: ["src/server/index.ts"],
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
  });
  mf = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script: bundle.outputFiles[0].text,
      compatibilityDate: "2026-05-01",
      d1Databases: ["DB"],
      bindings: {
        TELEGRAM_WEBHOOK_SECRET: "test",
        TELEGRAM_BOT_TOKEN: "123:fake",
        TELEGRAM_ALLOWED_IDS: "123",
        TIMEZONE: "Asia/Tashkent",
      },
    }),
  );
  db = await mf.getD1Database("DB");
  for (const file of [
    "0001_init.sql",
    "0002_telegram_flow.sql",
    "0003_telegram_payment_method.sql",
  ])
    for (const sql of (await readFile("migrations/" + file, "utf8"))
      .split(";")
      .filter((x) => x.trim()))
      await db.prepare(sql).run();
  await db
    .prepare(
      "INSERT INTO students(name,phone,group_name,monthly_fee) VALUES('Ali','123','QA',10000000)",
    )
    .run();
});
after(async () => {
  await mf?.dispose();
});
async function send(text: string, updateId = ++seq) {
  const response = await mf.dispatchFetch("https://test/telegram/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-Telegram-Bot-Api-Secret-Token": "test",
    },
    body: JSON.stringify({
      update_id: updateId,
      message: {
        message_id: updateId,
        date: 1793253600,
        from: { id: 123, is_bot: false, first_name: "QA" },
        chat: { id: 123, type: "private" },
        text,
      },
    }),
  });
  assert.equal(response.status, 200);
  return (await response.json()) as {
    text: string;
    reply_markup: { keyboard: { text: string }[][] };
  };
}
test("buttons guide payment through student, amount, confirmation; retry cannot duplicate", async () => {
  const menu = await send("/start");
  assert.equal(menu.reply_markup.keyboard[0][1].text, "💳 Внести оплату");
  const list = await send("💳 Внести оплату");
  assert.equal(list.reply_markup.keyboard[0][0].text, "#1 · Ali");
  assert.match((await send("#1 · Ali")).text, /целых сумах/);
  assert.match((await send("1.01")).text, /положительную/);
  const check = await send("25 000");
  assert.match(check.text, /25000 UZS/);
  assert.equal(
    (await db
      .prepare("SELECT COUNT(*) AS n FROM payments")
      .first<{ n: number }>())!.n,
    0,
  );
  const confirmationId = ++seq;
  assert.match(
    (await send("✅ Подтвердить оплату", confirmationId)).text,
    /Оплата записана/,
  );
  await send("✅ Подтвердить оплату", confirmationId);
  assert.equal(
    (await db
      .prepare("SELECT COUNT(*) AS n FROM payments")
      .first<{ n: number }>())!.n,
    1,
  );
});
test("cancel does not save and language buttons replace menu", async () => {
  await send("💳 Внести оплату");
  await send("#1 · Ali");
  await send("30000");
  await send("↩️ В меню");
  await send("✅ Подтвердить оплату");
  assert.equal(
    (await db
      .prepare("SELECT COUNT(*) AS n FROM payments")
      .first<{ n: number }>())!.n,
    1,
  );
  await send("🌐 Язык / Til");
  const menu = await send("O‘zbekcha");
  assert.equal(menu.reply_markup.keyboard[0][1].text, "💳 To‘lov kiritish");
  assert.match((await send("📋 Qarzdorlar")).text, /75000 UZS/);
});

test("all students includes fully paid and overpaid students, with payment buttons and pagination", async () => {
  await send("Русский");
  await db
    .prepare(
      "INSERT INTO students(id,name,phone,group_name,monthly_fee) VALUES(6,'B Paid','123','QA',10000)",
    )
    .run();
  await db
    .prepare(
      "INSERT INTO payments(student_id,amount,date,method) VALUES(6,10000,'2026-10-29','manual')",
    )
    .run();
  const menu = await send("/start");
  assert.ok(
    menu.reply_markup.keyboard.flat().some((b) => b.text === "👥 Все ученики"),
  );
  const all = await send("👥 Все ученики");
  assert.match(all.text, /#6 B Paid/);
  assert.match(all.text, /Без долга/);
  assert.ok(
    all.reply_markup.keyboard.flat().some((b) => b.text === "#6 · B Paid"),
  );
  assert.doesNotMatch((await send("📋 Должники")).text, /#6 B Paid/);
  await send("#6 · B Paid");
  await send("50");
  await send("✅ Подтвердить оплату");
  assert.match((await send("👥 Все ученики")).text, /Переплата: 50 UZS/);
  for (let i = 10; i < 19; i++)
    await db
      .prepare(
        "INSERT INTO students(id,name,phone,group_name,monthly_fee) VALUES(?,?,?, ?,?)",
      )
      .bind(i, `Z Student ${i}`, "123", "QA", 10000)
      .run();
  const first = await send("👥 Все ученики");
  assert.ok(
    first.reply_markup.keyboard.flat().some((b) => b.text === "Далее → 2"),
  );
  const second = await send("Далее → 2");
  assert.match(second.text, /#18 Z Student 18/);
  await send("O‘zbekcha");
  assert.match(
    (await send("👥 Barcha o‘quvchilar")).text,
    /Ortiqcha to‘lov: 50 UZS/,
  );
});

test("Payme and Click simulate only after explicit confirmation, record provider and resist retries", async () => {
  await send("Русский");
  for (const [button, method] of [
    ["Payme — симуляция", "payme"],
    ["Click — симуляция", "click"],
  ]) {
    const before = (await db
      .prepare("SELECT COUNT(*) AS n FROM payments")
      .first<{ n: number }>())!.n;
    await send("#1 · Ali");
    const choice = await send("12000");
    assert.ok(
      choice.reply_markup.keyboard.flat().some((b) => b.text === button),
    );
    const confirm = await send(button);
    assert.match(confirm.text, /Симуляция — деньги не списываются/);
    assert.match(
      confirm.text,
      new RegExp(method === "payme" ? "Payme" : "Click"),
    );
    assert.equal(
      (await db
        .prepare("SELECT COUNT(*) AS n FROM payments")
        .first<{ n: number }>())!.n,
      before,
    );
    // A stale manual confirmation cannot accept a simulated payment.
    await send("✅ Подтвердить оплату");
    assert.equal(
      (await db
        .prepare("SELECT COUNT(*) AS n FROM payments")
        .first<{ n: number }>())!.n,
      before,
    );
    const updateId = ++seq;
    const receipt = await send("✅ Симулировать оплату", updateId);
    assert.match(receipt.text, /Симуляция — деньги не списываются/);
    await send("✅ Симулировать оплату", updateId);
    assert.equal(
      (await db
        .prepare("SELECT COUNT(*) AS n FROM payments")
        .first<{ n: number }>())!.n,
      before + 1,
    );
    const saved = await db
      .prepare("SELECT method,amount FROM payments ORDER BY id DESC LIMIT 1")
      .first<{ method: string; amount: number }>();
    assert.equal(saved!.method, method);
    assert.equal(saved!.amount, 1200000);
  }
});
test("cancelled simulation writes nothing and Uzbek flow is translated", async () => {
  const before = (await db
    .prepare("SELECT COUNT(*) AS n FROM payments")
    .first<{ n: number }>())!.n;
  await send("O‘zbekcha");
  await send("#1 · Ali");
  await send("15000");
  const confirm = await send("Click — sinov");
  assert.match(confirm.text, /pul yechilmaydi/);
  await send("↩️ Menyuga");
  await send("✅ Sinov to‘lovini tasdiqlash");
  assert.equal(
    (await db
      .prepare("SELECT COUNT(*) AS n FROM payments")
      .first<{ n: number }>())!.n,
    before,
  );
});
