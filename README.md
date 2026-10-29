# Ustoz — учёт оплат учебного центра

Тестовое задание Ecomdev. TypeScript, Hono, Cloudflare Workers + D1, React/Vite, Telegram Bot API (grammY).

Веб-интерфейс: русский и узбекский (латиница), светлая и тёплая темы, ученики, должники за месяц, история и внесение оплат. Payme/Click — **симуляция**, без списания денег и подключения платёжных аккаунтов.

Демонстрация: https://ustoz.rieltor.store — пароль передаётся проверяющим отдельно.

## Запуск с нуля

Нужны Git, Node.js **22+** (проверено на 24), npm. Для локальной работы аккаунт Cloudflare не нужен.

```sh
git clone https://github.com/shuhratartweb-blip/ecomdev-payments.git
cd ecomdev-payments
npm ci
cp .env.example .dev.vars
```

В `.dev.vars` задайте `APP_PASSWORD` и случайный `SESSION_SECRET` (не менее 32 символов). Telegram-поля можно оставить пустыми. `.dev.vars` исключён из Git.

```sh
npm run db:migrate
npm run db:seed   # необязательно: только для новой пустой БД
npm run dev
```

Откройте `http://localhost:8787`, войдите с `APP_PASSWORD`. SQLite-файл локальной D1 сохраняется в `.wrangler/state/`, данные переживают перезапуск. Демоданные — вымышленные; даты демооплат относятся к текущему месяцу Ташкента. Seed предназначен для новой БД, не для объединения с рабочими данными.

Для разработки с горячим обновлением в другом терминале:

```sh
npm run web:dev
```

Откройте `http://localhost:5173`; Vite проксирует `/api` на запущенный Worker (8787).

## Проверка

```sh
npm run typecheck
npm test
npm run build
```

Тесты запускают настоящий локальный Workers runtime и отдельные временные D1, без обращения к production. Проверяются CRUD, суммы и границы месяцев, некорректные данные, конкурентные повторные оплаты, подпись/срок сессии, ограничение входа и Telegram. GitHub Actions выполняет эти же проверки.

## API

Указанные пути работают как без префикса, так и с `/api`. Веб-клиент использует `/api`. Авторизация — cookie после входа; запросы изменения с чужим Origin отклоняются.

```sh
curl -c cookies.txt -H 'Content-Type: application/json' \
  -d '{"password":"YOUR_LOCAL_PASSWORD"}' http://localhost:8787/api/login

curl -b cookies.txt -H 'Content-Type: application/json' \
  -d '{"name":"Ali Valiyev","phone":"+998900000000","group":"IELTS-1","monthlyFee":"700000.00"}' \
  http://localhost:8787/students

curl -b cookies.txt http://localhost:8787/students
curl -b cookies.txt -X PATCH -H 'Content-Type: application/json' \
  -d '{"monthlyFee":"800000.00"}' http://localhost:8787/students/1

curl -b cookies.txt -H 'Content-Type: application/json' \
  -H 'Idempotency-Key: example-payment-001' \
  -d '{"amount":"250000.00","date":"2026-10-29","method":"manual"}' \
  http://localhost:8787/students/1/payments

curl -b cookies.txt http://localhost:8787/students/1/payments
curl -b cookies.txt 'http://localhost:8787/debtors?month=2026-10'
# Удаление ученика удаляет и все его оплаты:
curl -b cookies.txt -X DELETE http://localhost:8787/students/1
```

Денежные значения в JSON — десятичные строки, в БД — целые минимальные единицы. `monthlyFee` может быть нулём; `amount` строго больше нуля. Максимум одного значения — 1 000 000 000 UZS, точность до двух знаков. Дата `YYYY-MM-DD`, месяц `YYYY-MM`.

Должник: `{id,name,phone,group,monthlyFee,paid,debt}`. Только положительный долг. Платёж: `{id,studentId,amount,date,method,simulated}`. Методы `manual`, `payme`, `click`; `telegram` доступен только боту. Для Payme/Click сервер всегда устанавливает `simulated:true`. Отмена симуляции ничего не записывает.

`Idempotency-Key` сохраняет один платёж при повторе или конкурентных запросах. Повтор с другим содержимым возвращает 409. Ключ следует сохранять при сетевом повторе и менять для нового платежа.

Ошибки: `{error:{code}}`; 400 — неверный ввод, 401 — вход необходим, 403 — запрещённый запрос, 404 — ученик не найден, 409 — конфликт повторного платежа, 429 — слишком много попыток входа. Подробный контракт: [docs/API-CONTRACT.md](docs/API-CONTRACT.md).

## Правила расчёта

- Одна валюта — UZS. Часовой пояс — `Asia/Tashkent`.
- Суммируются платежи с датой внутри запрошенного месяца, включая первый и последний день.
- Ученик без оплат должен весь месячный тариф. Полностью оплатившие и переплатившие не включаются в должников.
- Переплата не переносится между месяцами; нет распределения платежа по периоду.
- Текущий тариф используется и для прошлых месяцев. Нет истории тарифов, пропорциональных начислений или даты начала обучения.
- Удаление ученика каскадно удаляет платежи. В UI есть подтверждение.
- Реестр общих оплат показывает последние 500 записей; история конкретного ученика полная.

## Telegram

Новый отдельный бот проекта: [@ustoz_ecomdev_2026_bot](https://t.me/ustoz_ecomdev_2026_bot). Старые боты не используются.

При самостоятельном развёртывании создайте бота через `@BotFather` → `/newbot`. Настройте:

- `TELEGRAM_BOT_TOKEN` — токен созданного бота;
- `TELEGRAM_ALLOWED_IDS` — числовые ID разрешённых пользователей, через запятую;
- `TELEGRAM_WEBHOOK_SECRET` — случайная строка из букв, цифр, `_` и `-`.

После публикации задайте переменные окружения и выполните:

```sh
APP_URL=https://YOUR_APP_DOMAIN node scripts/configure-bot.mjs
```

Скрипт читает токен и секрет из окружения, а не автоматически из `.dev.vars`. Команды: `/debt`, `/pay 1 250000`, `/lang uz`, `/lang ru`, `/help`. Только личные чаты и ID из списка. Язык сохраняется в D1. Дата оплаты берётся из исходного Telegram-сообщения в часовом поясе приложения; повторная доставка `update_id` не создаёт второй платёж. Без Telegram-настроек веб и API продолжают работать.

## Развёртывание Cloudflare

Авторизуйтесь в своём аккаунте, создайте собственную БД и замените `database_id` в `wrangler.jsonc` на выданный UUID:

```sh
npx wrangler login
npx wrangler d1 create ecomdev-payments
npx wrangler d1 migrations apply DB --remote
# Только для новой демонстрационной БД:
npx wrangler d1 execute DB --remote --file scripts/seed.sql
npx wrangler secret put APP_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put TELEGRAM_BOT_TOKEN
npx wrangler secret put TELEGRAM_WEBHOOK_SECRET
npx wrangler secret put TELEGRAM_ALLOWED_IDS
npm run deploy
```

Приложение публикуется на адресе Workers. Свой домен подключается через Workers → Settings → Domains & Routes. Проект размещается отдельно на `ustoz.rieltor.store`; основной `rieltor.store` и прежние боты не изменяются. При развёртывании в другом аккаунте замените или удалите `routes` в конфигурации. Пароль проверяющим передаётся отдельно, не в публичном репозитории. Ключ Cloudflare нужен только инструменту развёртывания и не является секретом самого Worker.

## Что улучшить за неделю

1. Индивидуальные аккаунты, роли и полноценное управление доступом проверяющих.
2. История тарифов и периоды обучения для корректного пересчёта прошлых месяцев.
3. Распределение платежей по периодам, перенос переплат, возвраты и реальные интеграции Payme/Click.
4. Аудит изменений, мягкое удаление и экспорт отчётов.
5. Резервное копирование/восстановление, мониторинг и расширенные браузерные тесты.

## ИИ и статус

Исходники и тесты создаются с помощью Codex. Макеты сгенерированы Image Gen; рабочий интерфейс — React, не изображение. Реальные найденные ошибки и проверка отражены в [docs/verification.md](docs/verification.md). Текст для части 4 и фактическое время должны описывать выполненную работу; вклад пользователя нельзя приписывать автоматически.
