import { telegram } from "./telegram";
import { Hono } from "hono";
import { AppError, id, today, object } from "./domain";
import { Service } from "./service";
import { authenticated, login, logout, equal, type Env } from "./auth";
const app = new Hono<{ Bindings: Env }>();
app.use("*", async (c, next) => {
  c.header("X-Content-Type-Options", "nosniff");
  c.header("Referrer-Policy", "same-origin");
  c.header("Cache-Control", "no-store");
  if (!["GET", "HEAD", "OPTIONS"].includes(c.req.method)) {
    const origin = c.req.header("Origin");
    if (origin && origin !== new URL(c.req.url).origin)
      return c.json({ error: { code: "FORBIDDEN" } }, 403);
  }
  await next();
});
app.onError((err, c) => {
  if (err instanceof AppError)
    return c.json({ error: { code: err.code } }, err.status);
  if (err instanceof SyntaxError)
    return c.json({ error: { code: "INVALID_JSON" } }, 400);
  console.error("request_failed", err.name);
  return c.json({ error: { code: "INTERNAL_ERROR" } }, 500);
});
app.get("/api/health", (c) => c.json({ ok: true }));
app.post("/api/login", login);
app.post("/telegram/webhook", async (c) => {
  if (
    !c.env.TELEGRAM_WEBHOOK_SECRET ||
    !(await equal(
      c.req.header("X-Telegram-Bot-Api-Secret-Token") ?? "",
      c.env.TELEGRAM_WEBHOOK_SECRET,
    ))
  )
    return c.json({ error: { code: "FORBIDDEN" } }, 403);
  if (!c.env.TELEGRAM_BOT_TOKEN || !c.env.TELEGRAM_ALLOWED_IDS)
    return c.json({ error: { code: "BOT_NOT_CONFIGURED" } }, 503);
  return c.json(await telegram(await c.req.json(), c.env));
});
app.use("*", async (c, next) => {
  if (!(await authenticated(c)))
    return c.json({ error: { code: "UNAUTHORIZED" } }, 401);
  await next();
});
app.post("/api/logout", logout);
app.get("/api/session", (c) =>
  c.json({ ok: true, today: today(c.env.TIMEZONE) }),
);
const routes = new Hono<{ Bindings: Env }>();
routes.get("/students", async (c) =>
  c.json(await new Service(c.env.DB).students()),
);
routes.post("/students", async (c) =>
  c.json(await new Service(c.env.DB).create(object(await c.req.json())), 201),
);
routes.patch("/students/:id", async (c) =>
  c.json(
    await new Service(c.env.DB).update(
      id(c.req.param("id")),
      object(await c.req.json()),
    ),
  ),
);
routes.delete("/students/:id", async (c) => {
  await new Service(c.env.DB).remove(id(c.req.param("id")));
  return c.body(null, 204);
});
routes.get("/students/:id/payments", async (c) =>
  c.json(await new Service(c.env.DB).payments(id(c.req.param("id")))),
);
routes.post("/students/:id/payments", async (c) => {
  const result = await new Service(c.env.DB).pay(
    id(c.req.param("id")),
    object(await c.req.json()),
    c.req.header("Idempotency-Key"),
  );
  return c.json(result.payment, result.created ? 201 : 200);
});
routes.get("/debtors", async (c) =>
  c.json(await new Service(c.env.DB).debtors(c.req.query("month") ?? "")),
);
routes.get("/balances", async (c) =>
  c.json(await new Service(c.env.DB).balances(c.req.query("month") ?? "")),
);
routes.get("/payments", async (c) =>
  c.json(await new Service(c.env.DB).payments()),
);
app.route("/api", routes);
app.route("/", routes);
app.notFound((c) => c.json({ error: { code: "NOT_FOUND" } }, 404));
export default app;
