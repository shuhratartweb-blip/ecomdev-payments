import { Api } from "grammy";
import type { Update } from "grammy/types";
import type { Env } from "./auth";
import { AppError, id, today, money, decimal } from "./domain";
import { Service } from "./service";
type Lang = "ru" | "uz";
const copy = {
  ru: {
    denied: "Доступ закрыт. Обратитесь к владельцу приложения.",
    help: "Ustoz — учёт оплат. Выберите действие кнопкой ниже.",
    empty: "Должников нет.",
    debt: "📋 Должники",
    all: "👥 Все ученики",
    noStudents: "Ученики пока не добавлены.",
    fee: "Тариф",
    received: "Оплачено",
    owed: "Долг",
    settled: "Без долга",
    overpaid: "Переплата",
    pay: "💳 Внести оплату",
    language: "🌐 Язык / Til",
    cancel: "↩️ В меню",
    confirm: "✅ Подтвердить оплату",
    payme: "Payme — симуляция",
    click: "Click — симуляция",
    simulate: "✅ Симулировать оплату",
    simulation: "Симуляция — деньги не списываются",
    chooseMethod:
      "Выберите Payme/Click для симуляции или подтвердите обычную запись оплаты:",
    choose: "Выберите ученика:",
    amount: "Введите сумму в целых сумах:",
    check: "Проверьте оплату и подтвердите:",
    paid: "Оплата записана",
    lang: "Язык: Русский",
    invalid: "Введите положительную сумму в целых сумах.",
    notfound: "Ученик не найден.",
    expired: "Выберите действие заново.",
    next: "Далее →",
    prev: "← Назад",
  },
  uz: {
    denied: "Kirish yopiq. Ilova egasiga murojaat qiling.",
    help: "Ustoz — to‘lovlar hisobi. Quyidagi tugmalardan birini tanlang.",
    empty: "Qarzdorlar yo‘q.",
    debt: "📋 Qarzdorlar",
    all: "👥 Barcha o‘quvchilar",
    noStudents: "O‘quvchilar hali qo‘shilmagan.",
    fee: "Tarif",
    received: "To‘langan",
    owed: "Qarz",
    settled: "Qarz yo‘q",
    overpaid: "Ortiqcha to‘lov",
    pay: "💳 To‘lov kiritish",
    language: "🌐 Язык / Til",
    cancel: "↩️ Menyuga",
    confirm: "✅ To‘lovni tasdiqlash",
    payme: "Payme — sinov",
    click: "Click — sinov",
    simulate: "✅ Sinov to‘lovini tasdiqlash",
    simulation: "Sinov to‘lovi — pul yechilmaydi",
    chooseMethod:
      "Sinov uchun Payme/Click ni tanlang yoki oddiy to‘lov yozuvini tasdiqlang:",
    choose: "O‘quvchini tanlang:",
    amount: "Summani butun so‘mda kiriting:",
    check: "To‘lovni tekshiring va tasdiqlang:",
    paid: "To‘lov saqlandi",
    lang: "Til: O‘zbekcha",
    invalid: "Musbat summani butun so‘mda kiriting.",
    notfound: "O‘quvchi topilmadi.",
    expired: "Amalni qayta tanlang.",
    next: "Keyingi →",
    prev: "← Oldingi",
  },
};
const dateLabel = (s: string) => s.split("-").reverse().join("-");
const timeLabel = (seconds: number) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Tashkent",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(seconds * 1000));
export async function telegram(
  update: Update,
  env: Env,
): Promise<Record<string, unknown>> {
  if (!update || !Number.isSafeInteger(update.update_id))
    throw new AppError("INVALID_FIELDS");
  const msg = "message" in update ? update.message : undefined;
  if (!msg) return { ok: true };
  if (
    !msg.chat ||
    !Number.isSafeInteger(msg.chat.id) ||
    !Number.isSafeInteger(msg.date) ||
    msg.date < 946684800 ||
    msg.date > 253402214400 ||
    (msg.text !== undefined && typeof msg.text !== "string")
  )
    throw new AppError("INVALID_FIELDS");
  if (
    !msg.from ||
    !Number.isSafeInteger(msg.from.id) ||
    !msg.text ||
    msg.chat.type !== "private"
  )
    return { ok: true };
  const uid = msg.from.id;
  const allowed = (env.TELEGRAM_ALLOWED_IDS ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  const reply = (text: string, rows?: string[][]) => ({
    method: "sendMessage",
    chat_id: msg.chat.id,
    text,
    ...(rows
      ? {
          reply_markup: {
            keyboard: rows.map((row) => row.map((text) => ({ text }))),
            resize_keyboard: true,
            is_persistent: true,
          },
        }
      : {}),
  });
  if (!allowed.includes(String(uid))) return reply(copy.ru.denied);
  const pref = await env.DB.prepare(
    "SELECT lang FROM telegram_preferences WHERE user_id=?",
  )
    .bind(uid)
    .first<{ lang: Lang }>();
  let lang: Lang = pref?.lang ?? "ru";
  const input = msg.text.trim();
  const [raw, ...args] = input.split(/\s+/);
  const command = raw.split("@")[0];
  const chosen =
    input === "Русский"
      ? "ru"
      : input === "O‘zbekcha"
        ? "uz"
        : command === "/lang" && ["ru", "uz"].includes(args[0])
          ? args[0]
          : undefined;
  if (chosen) {
    lang = chosen as Lang;
    await env.DB.prepare(
      "INSERT INTO telegram_preferences(user_id,lang) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET lang=excluded.lang",
    )
      .bind(uid, lang)
      .run();
  }
  const t = copy[lang],
    service = new Service(env.DB);
  const current = today(env.TIMEZONE, new Date(msg.date * 1000));
  const menu = [[t.debt, t.pay], [t.all], [t.language]],
    back = [[t.cancel]];
  const clear = () =>
    env.DB.prepare("DELETE FROM telegram_flow WHERE user_id=?").bind(uid).run();
  if (chosen) return reply(t.lang, menu);
  if (
    command === "/start" ||
    command === "/help" ||
    Object.values(copy).some((c) => input === c.cancel)
  ) {
    await clear();
    return reply(t.help, menu);
  }
  if (input === t.language)
    return reply("Выберите язык / Tilni tanlang", [
      ["Русский", "O‘zbekcha"],
      [t.cancel],
    ]);
  const selection = input.match(/^#(\d+) · /);
  const pageMatch = input.match(
    /^(?:Далее →|← Назад|Keyingi →|← Oldingi) (\d+)$/,
  );
  if (
    input === t.pay ||
    input === t.all ||
    command === "/students" ||
    pageMatch
  ) {
    await clear();
    const students = await service.balances(current.slice(0, 7));
    const page = Math.min(
      Math.max(0, Math.ceil(students.length / 8) - 1),
      Math.max(0, Number(pageMatch?.[1] ?? 1) - 1),
    );
    const visible = students.slice(page * 8, page * 8 + 8);
    const rows = visible.map((s) => [`#${s.id} · ${s.name.slice(0, 70)}`]);
    const navigation = [];
    if (page > 0) navigation.push(`${t.prev} ${page}`);
    if ((page + 1) * 8 < students.length)
      navigation.push(`${t.next} ${page + 2}`);
    if (navigation.length) rows.push(navigation);
    rows.push([t.cancel]);
    const details = visible
      .map((s) => {
        const extra = Number(s.paid) - Number(s.monthlyFee);
        const status =
          Number(s.debt) > 0
            ? `${t.owed}: ${s.debt} UZS`
            : extra > 0
              ? `${t.overpaid}: ${extra} UZS`
              : t.settled;
        return `#${s.id} ${s.name} · ${s.group}\n${t.fee}: ${s.monthlyFee} UZS · ${t.received}: ${s.paid} UZS\n${status}`;
      })
      .join("\n\n");
    return reply(
      `${t.all} · ${current.slice(0, 7).split("-").reverse().join("-")} · ${page + 1}/${Math.max(1, Math.ceil(students.length / 8))}\n\n${details || t.noStudents}\n\n${students.length ? t.choose : ""}`,
      rows,
    );
  }
  if (selection) {
    try {
      const student = await service.find(id(selection[1]));
      await env.DB.prepare(
        "INSERT INTO telegram_flow(user_id,student_id,amount,nonce,updated_at) VALUES(?,?,NULL,?,?) ON CONFLICT(user_id) DO UPDATE SET student_id=excluded.student_id,amount=NULL,method='telegram',nonce=excluded.nonce,updated_at=excluded.updated_at",
      )
        .bind(uid, student.id, `tg:flow:${update.update_id}`, msg.date)
        .run();
      return reply(`${student.name}\n${t.amount}`, back);
    } catch (e) {
      if (e instanceof AppError) return reply(t.notfound, menu);
      throw e;
    }
  }
  const receipt = async (
    sid: number,
    amount: string,
    key: string,
    method: "telegram" | "payme" | "click" = "telegram",
  ) => {
    const result = await service.pay(
      sid,
      { amount, date: current, method },
      key,
      true,
    );
    const student = await service.find(sid);
    return reply(
      `${t.paid}${result.payment.simulated ? `\n${method === "payme" ? "Payme" : "Click"} · ${t.simulation}` : ""}\n#${sid} ${student.name}\n${result.payment.amount} UZS · ${dateLabel(result.payment.date)} ${timeLabel(msg.date)}`,
      menu,
    );
  };
  if (command === "/pay") {
    try {
      if (args.length !== 2) throw new AppError("INVALID_FIELDS");
      return await receipt(
        id(args[0]),
        args[1].replace(",", "."),
        `tg:payment:${update.update_id}`,
      );
    } catch (e) {
      if (e instanceof AppError)
        return reply(e.status === 404 ? t.notfound : t.invalid, menu);
      throw e;
    }
  }
  if (command === "/debt" || input === t.debt) {
    await clear();
    const month = current.slice(0, 7),
      rows = await service.debtors(month);
    if (!rows.length)
      return reply(
        `${t.debt} · ${month.split("-").reverse().join("-")}\n${t.empty}`,
        menu,
      );
    const chunks: string[] = [];
    let chunk = `${t.debt} · ${month.split("-").reverse().join("-")}\n`;
    for (const s of rows) {
      const line = `\n#${s.id} ${s.name} · ${s.group}: ${s.debt} UZS`;
      if (chunk.length + line.length > 3500) {
        chunks.push(chunk);
        chunk = "";
      }
      chunk += line;
    }
    chunks.push(chunk);
    if (chunks.length > 1) {
      const api = new Api(env.TELEGRAM_BOT_TOKEN!);
      for (const part of chunks.slice(0, -1))
        await api.sendMessage(msg.chat.id, part);
    }
    return reply(chunks.at(-1)!, menu);
  }
  const state = await env.DB.prepare(
    "SELECT student_id,amount,nonce,updated_at,method FROM telegram_flow WHERE user_id=?",
  )
    .bind(uid)
    .first<{
      student_id: number;
      method: "telegram" | "payme" | "click";
      amount: string | null;
      nonce: string;
      updated_at: number;
    }>();
  if (state) {
    if (msg.date - state.updated_at > 1800) {
      await clear();
      return reply(t.expired, menu);
    }
    try {
      if ((input === t.payme || input === t.click) && state.amount) {
        const method = input === t.payme ? "payme" : "click";
        await env.DB.prepare(
          "UPDATE telegram_flow SET method=?,updated_at=? WHERE user_id=? AND nonce=?",
        )
          .bind(method, msg.date, uid, state.nonce)
          .run();
        const student = await service.find(state.student_id);
        return reply(
          `${t.check}\n${student.name}\n${state.amount} UZS\n${method === "payme" ? "Payme" : "Click"}\n${t.simulation}`,
          [[t.simulate], [t.cancel]],
        );
      }
      if (
        input === (state.method === "telegram" ? t.confirm : t.simulate) &&
        state.amount
      ) {
        const result = await receipt(
          state.student_id,
          state.amount,
          state.nonce,
          state.method,
        );
        await clear();
        return result;
      }
      const amount = decimal(money(input.replace(/\s/g, "")));
      const student = await service.find(state.student_id);
      await env.DB.prepare(
        "UPDATE telegram_flow SET amount=?,method='telegram',updated_at=? WHERE user_id=? AND nonce=?",
      )
        .bind(amount, msg.date, uid, state.nonce)
        .run();
      return reply(
        `${t.check}\n${student.name}\n${amount} UZS\n\n${t.chooseMethod}`,
        [[t.payme, t.click], [t.confirm], [t.cancel]],
      );
    } catch (e) {
      if (e instanceof AppError)
        return reply(
          e.status === 404 ? t.notfound : t.invalid,
          state.amount
            ? [
                [state.method === "telegram" ? t.confirm : t.simulate],
                [t.cancel],
              ]
            : back,
        );
      throw e;
    }
  }
  return reply(t.help, menu);
}
