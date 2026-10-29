// Secrets are provided via environment. Never print Bot API URLs or tokens.
const { TELEGRAM_BOT_TOKEN: token, TELEGRAM_WEBHOOK_SECRET: secret, APP_URL: appUrl } = process.env;
if (!token || !secret || !appUrl) throw new Error('Set TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET and APP_URL');
const url = new URL(appUrl);
if (url.protocol !== 'https:') throw new Error('APP_URL must use HTTPS');
async function call(method, body) {
  let response;
  try { response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}); }
  catch { throw new Error(`Telegram ${method}: network failure`); }
  const data = await response.json();
  if (!data.ok) throw new Error(`Telegram ${method} failed (HTTP ${response.status})`);
  console.log(`${method}: OK`);
}
await call('setMyCommands', {commands:[
  {command:'debt',description:'Должники / Qarzdorlar'},
  {command:'pay',description:'Оплата: /pay ID сумма'},
  {command:'lang',description:'Язык: /lang ru или /lang uz'},
  {command:'help',description:'Инструкция / Yordam'}
]});
await call('setWebhook', {url:new URL('/telegram/webhook',url).href,secret_token:secret,allowed_updates:['message']});
