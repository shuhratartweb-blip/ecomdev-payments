import { object } from "./domain";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context } from "hono";
export type Env = {
  DB: D1Database;
  ASSETS: Fetcher;
  APP_PASSWORD: string;
  SESSION_SECRET: string;
  TIMEZONE: string;
  TELEGRAM_BOT_TOKEN?: string;
  TELEGRAM_WEBHOOK_SECRET?: string;
  TELEGRAM_ALLOWED_IDS?: string;
  TELEGRAM_BOT_USERNAME?: string;
};
type C = Context<{ Bindings: Env }>;
const encoder = new TextEncoder();
export async function hash(s: string) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(s))),
  )
    .map((n) => n.toString(16).padStart(2, "0"))
    .join("");
}
async function signature(value: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return Array.from(
    new Uint8Array(
      await crypto.subtle.sign("HMAC", key, encoder.encode(value)),
    ),
  )
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function equal(a: string, b: string) {
  const x = await hash(a),
    y = await hash(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x.charCodeAt(i) ^ y.charCodeAt(i);
  return diff === 0;
}
export async function authenticated(c: C) {
  if (!c.env.SESSION_SECRET || !c.env.APP_PASSWORD) return false;
  const token = getCookie(c, "ustoz_session");
  if (!token) return false;
  const [expiry, nonce, sig] = token.split(".");
  if (
    !expiry ||
    !nonce ||
    !sig ||
    !/^\d+$/.test(expiry) ||
    Number(expiry) < Date.now()
  )
    return false;
  return equal(
    sig,
    await signature(`${expiry}.${nonce}`, c.env.SESSION_SECRET),
  );
}
export async function login(c: C) {
  if (!c.env.APP_PASSWORD || !c.env.SESSION_SECRET)
    return c.json({ error: { code: "NOT_CONFIGURED" } }, 503);
  const ip = await hash(c.req.header("CF-Connecting-IP") ?? "local");
  const now = Date.now();
  await c.env.DB.prepare("DELETE FROM login_attempts WHERE expires<?")
    .bind(now)
    .run();
  const attempt = await c.env.DB.prepare(
    "INSERT INTO login_attempts(ip_hash,count,expires) VALUES(?,1,?) ON CONFLICT(ip_hash) DO UPDATE SET count=count+1 RETURNING count",
  )
    .bind(ip, now + 900000)
    .first<{ count: number }>();
  if (attempt!.count > 20)
    return c.json({ error: { code: "TOO_MANY_ATTEMPTS" } }, 429);
  const body = object(await c.req.json());
  if (
    typeof body.password !== "string" ||
    !(await equal(body.password, c.env.APP_PASSWORD))
  )
    return c.json({ error: { code: "INVALID_PASSWORD" } }, 401);
  await c.env.DB.prepare("DELETE FROM login_attempts WHERE ip_hash=?")
    .bind(ip)
    .run();
  const payload = `${now + 86400000}.${crypto.randomUUID()}`;
  setCookie(
    c,
    "ustoz_session",
    `${payload}.${await signature(payload, c.env.SESSION_SECRET)}`,
    {
      httpOnly: true,
      secure: new URL(c.req.url).protocol === "https:",
      sameSite: "Strict",
      path: "/",
      maxAge: 86400,
    },
  );
  return c.json({ ok: true });
}
export function logout(c: C) {
  deleteCookie(c, "ustoz_session", { path: "/" });
  return c.json({ ok: true });
}
