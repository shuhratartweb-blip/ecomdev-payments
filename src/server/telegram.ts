import { Api } from 'grammy';
import type { Update } from 'grammy/types';
import type { Env } from './auth';
import { AppError,id,today } from './domain';
import { Service } from './service';
type Lang='ru'|'uz';
const copy={ru:{denied:'Доступ закрыт. Обратитесь к владельцу приложения.',help:'Ustoz — учёт оплат\n/debt — должники текущего месяца\n/pay <id> <сумма> — внести оплату\n/lang uz — O‘zbekcha\n/lang ru — Русский',empty:'Должников нет.',debt:'Должники',paid:'Оплата записана',lang:'Язык: Русский',invalid:'Проверьте команду, ID и сумму. Пример: /pay 1 100000',notfound:'Ученик не найден.',problem:'Не удалось выполнить команду. Повторите позже.'},uz:{denied:'Kirish yopiq. Ilova egasiga murojaat qiling.',help:'Ustoz — to‘lovlar hisobi\n/debt — joriy oy qarzdorlari\n/pay <id> <summa> — to‘lov kiritish\n/lang uz — O‘zbekcha\n/lang ru — Русский',empty:'Qarzdorlar yo‘q.',debt:'Qarzdorlar',paid:'To‘lov saqlandi',lang:'Til: O‘zbekcha',invalid:'Buyruq, ID va summani tekshiring. Misol: /pay 1 100000',notfound:'O‘quvchi topilmadi.',problem:'Buyruq bajarilmadi. Keyinroq urinib ko‘ring.'}};
export async function telegram(update:Update,env:Env):Promise<Record<string,unknown>> {
 if(!update||!Number.isSafeInteger(update.update_id))throw new AppError('INVALID_FIELDS');
 const msg='message' in update?update.message:undefined;
 if(!msg)return {ok:true};
 if(!msg.chat||!Number.isSafeInteger(msg.chat.id)||!Number.isSafeInteger(msg.date)||msg.date<946684800||msg.date>253402214400||(msg.text!==undefined&&typeof msg.text!=='string'))throw new AppError('INVALID_FIELDS');
 if(!msg.from||!Number.isSafeInteger(msg.from.id)||!msg.text||msg.chat.type!=='private')return {ok:true};
 const uid=msg.from.id;const allowed=(env.TELEGRAM_ALLOWED_IDS??'').split(',').map(x=>x.trim()).filter(Boolean);
 const reply=(text:string)=>({method:'sendMessage',chat_id:msg.chat.id,text});
 if(!allowed.includes(String(uid)))return reply(copy.ru.denied);
 const pref=await env.DB.prepare('SELECT lang FROM telegram_preferences WHERE user_id=?').bind(uid).first<{lang:Lang}>();let lang:Lang=pref?.lang??'ru';
 const [raw,...args]=msg.text.trim().split(/\s+/);const command=raw.split('@')[0];
 if(command==='/lang'&&['ru','uz'].includes(args[0])){lang=args[0] as Lang;await env.DB.prepare('INSERT INTO telegram_preferences(user_id,lang) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET lang=excluded.lang').bind(uid,lang).run();return reply(copy[lang].lang)}
 const t=copy[lang],service=new Service(env.DB);const current=today(env.TIMEZONE,new Date(msg.date*1000));
 if(command==='/start'||command==='/help')return reply(t.help);
 if(command==='/pay'){
  try{if(args.length!==2)throw new AppError('INVALID_FIELDS');const sid=id(args[0]);const result=await service.pay(sid,{amount:args[1].replace(',','.'),date:current,method:'telegram'},`tg:payment:${update.update_id}`,true);const student=await service.find(sid);return reply(`${t.paid}\n#${sid} ${student.name}\n${result.payment.amount} UZS · ${result.payment.date}`)}
  catch(e){if(e instanceof AppError)return reply(e.status===404?t.notfound:t.invalid);throw e}
 }
 if(command==='/debt'){
  const month=current.slice(0,7),rows=await service.debtors(month);if(!rows.length)return reply(`${t.debt} · ${month}\n${t.empty}`);
  const chunks:string[]=[];let chunk=`${t.debt} · ${month}\n`;
  for(const s of rows){const line=`\n#${s.id} ${s.name} · ${s.group}: ${s.debt} UZS`;if(chunk.length+line.length>3500){chunks.push(chunk);chunk=''}chunk+=line}chunks.push(chunk);
  if(chunks.length>1){const api=new Api(env.TELEGRAM_BOT_TOKEN!);for(const part of chunks.slice(0,-1))await api.sendMessage(msg.chat.id,part)}
  return reply(chunks.at(-1)!);
 }
 return reply(t.help);
}
