// Собственный вход PIT RATING: 6-значный код на e-mail → сессия в защищённом cookie.
// Код получают только сотрудники из раздела «Доступ» (и владелец). Посторонний видит тот же ответ.

const CODE_TTL = 10 * 60e3;          // код живёт 10 минут
const CODE_TRIES = 5;                // попыток ввода
const RESEND_GAP = 45e3;             // не чаще 1 письма в 45 с на адрес
const SEND_WINDOW = 3600e3, SEND_MAX = 6;   // не больше 6 писем в час на адрес
const IP_WINDOW = 3600e3, IP_MAX = 30;      // не больше 30 запросов кода в час с одного IP
const SESSION_SHORT = 7 * 864e5, SESSION_LONG = 30 * 864e5;
export const COOKIE = 'pit_sess';

const enc = new TextEncoder();
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
const sha = async s => hex(await crypto.subtle.digest('SHA-256', enc.encode(s)));
const rnd = n => { const a = new Uint8Array(n); crypto.getRandomValues(a); return hex(a) };
const json = (o, s = 200, h = {}) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...h } });
const EMAIL_RE = /^[^@\s]{1,64}@[^@\s]{1,190}\.[^@\s]{2,24}$/;
const ip = req => req.headers.get('cf-connecting-ip') || '';
const ua = req => (req.headers.get('user-agent') || '').slice(0, 200);

const SCHEMA = [`CREATE TABLE IF NOT EXISTS auth_codes (\n  email TEXT PRIMARY KEY,\n  hash TEXT NOT NULL,\n  exp INTEGER NOT NULL,\n  tries INTEGER NOT NULL DEFAULT 0,\n  sent_at INTEGER NOT NULL,\n  sent_count INTEGER NOT NULL DEFAULT 1,\n  window_start INTEGER NOT NULL\n)`, `CREATE TABLE IF NOT EXISTS sessions (\n  id TEXT PRIMARY KEY,          \n  email TEXT NOT NULL,\n  created INTEGER NOT NULL,\n  last INTEGER NOT NULL,\n  exp INTEGER NOT NULL,\n  ua TEXT,\n  ip TEXT\n)`, `CREATE INDEX IF NOT EXISTS sessions_email ON sessions(email)`, `CREATE TABLE IF NOT EXISTS ip_limits (\n  ip TEXT PRIMARY KEY,\n  window_start INTEGER NOT NULL,\n  count INTEGER NOT NULL\n)`, `CREATE TABLE IF NOT EXISTS logins (\n  at INTEGER NOT NULL,\n  email TEXT NOT NULL,\n  event TEXT NOT NULL,\n  ip TEXT,\n  ua TEXT\n)`];
let schemaOk = false;
export async function ensureSchema(env) { if (schemaOk) return; await env.DB.batch(SCHEMA.map(q => env.DB.prepare(q))); schemaOk = true }

export function cookieOf(req) { return (req.headers.get('cookie') || '').match(new RegExp(COOKIE + '=([a-f0-9]{64})'))?.[1] || null }

export async function sessionEmail(req, env) {
  const tok = cookieOf(req); if (!tok) return null;
  await ensureSchema(env);
  const id = await sha(tok), t = Date.now();
  const s = await env.DB.prepare('SELECT email,exp,last FROM sessions WHERE id=?').bind(id).first();
  if (!s || s.exp < t) return null;
  if (t - s.last > 3600e3) await env.DB.prepare('UPDATE sessions SET last=? WHERE id=?').bind(t, id).run();
  return s.email;
}

async function isStaff(env, email) {
  const owners = String(env.OWNER_EMAILS || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
  if (owners.includes(email)) return true;
  return !!(await env.DB.prepare('SELECT 1 AS x FROM users WHERE email=?').bind(email).first());
}

function lang(req, b) { const l = String(b?.lang || req.headers.get('accept-language') || 'ru').slice(0, 2).toLowerCase(); return ['ru', 'en', 'tr'].includes(l) ? l : 'en' }

const T = {
  ru: { subj: c => `${c} — код входа PIT RATING`, h: 'Код для входа', p: 'Введите этот код на странице входа PIT RATING. Код действует 10 минут.', n: 'Если вы не запрашивали вход — просто проигнорируйте письмо.', club: 'Система клуба' },
  en: { subj: c => `${c} — your PIT RATING sign-in code`, h: 'Your sign-in code', p: 'Enter this code on the PIT RATING sign-in page. It expires in 10 minutes.', n: "If you didn't try to sign in, you can ignore this email.", club: 'Club system' },
  tr: { subj: c => `${c} — PIT RATING giriş kodu`, h: 'Giriş kodunuz', p: 'Bu kodu PIT RATING giriş sayfasına girin. Kod 10 dakika geçerlidir.', n: 'Giriş yapmaya çalışmadıysanız bu e-postayı yok sayabilirsiniz.', club: 'Kulüp sistemi' }
};
function mail(code, l) {
  const t = T[l] || T.en;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#15171b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ea;padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#ffffff;border:1px solid #e3ded2;border-radius:14px;overflow:hidden">
<tr><td style="background:#111418;padding:24px 28px">
<table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle"><img src="https://app.pitrating.com/brand/mail-mark.png" width="34" height="42" alt="" style="display:block;border:0"></td>
<td style="vertical-align:middle;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif">
<div style="color:#f4f1ea;font-size:26px;line-height:26px;font-weight:800;letter-spacing:1px">PIT</div>
<div style="color:#e8c35a;font-size:11px;line-height:16px;font-weight:700;letter-spacing:5px;margin-top:3px">RATING</div></td>
</tr></table>
<div style="color:#8b8b93;font-size:11px;letter-spacing:2px;text-transform:uppercase;margin-top:14px">${t.club}</div></td></tr>
<tr><td style="padding:28px">
<div style="font-size:15px;font-weight:700;margin:0 0 14px">${t.h}</div>
<div style="font-family:SFMono-Regular,Menlo,Consolas,monospace;font-size:38px;font-weight:700;letter-spacing:10px;color:#15171b;background:#f8f6f1;border:1px solid #e3ded2;border-radius:10px;padding:16px 0;text-align:center">${code}</div>
<p style="font-size:14px;line-height:1.5;color:#3d3b36;margin:18px 0 6px">${t.p}</p>
<p style="font-size:12px;line-height:1.5;color:#8b877d;margin:0">${t.n}</p>
</td></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #efeae0;font-size:11px;color:#8b877d">PIT RATING · Performance Index of Training · pitrating.com</td></tr>
</table></td></tr></table></body></html>`;
  const text = `PIT RATING\n\n${t.h}: ${code}\n\n${t.p}\n${t.n}\n\npitrating.com`;
  return { subject: t.subj(code), html, text };
}

async function log(env, email, event, req) {
  try { await env.DB.prepare('INSERT INTO logins(at,email,event,ip,ua) VALUES(?,?,?,?,?)').bind(Date.now(), email, event, ip(req), ua(req)).run() } catch (e) { }
}

export async function authRoutes(req, env, path) {
  if (!path.startsWith('/auth/')) return null;
  await ensureSchema(env);
  const t = Date.now();
  if (path === '/auth/start' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || '').trim().toLowerCase();
    if (!EMAIL_RE.test(email)) return json({ error: 'bad_email' }, 400);
    // лимит по IP
    const ipk = ip(req) || 'none';
    const li = await env.DB.prepare('SELECT window_start,count FROM ip_limits WHERE ip=?').bind(ipk).first();
    if (li && t - li.window_start < IP_WINDOW && li.count >= IP_MAX) return json({ error: 'rate' }, 429);
    await env.DB.prepare('INSERT INTO ip_limits(ip,window_start,count) VALUES(?,?,1) ON CONFLICT(ip) DO UPDATE SET count=CASE WHEN ?-window_start>=? THEN 1 ELSE count+1 END, window_start=CASE WHEN ?-window_start>=? THEN ? ELSE window_start END')
      .bind(ipk, t, t, IP_WINDOW, t, IP_WINDOW, t).run();
    // одинаковый ответ для всех адресов
    const ok = json({ ok: true });
    // код получает любой адрес: сотрудники попадают в систему клуба по роли, остальные — в кабинет бойца My PIT
    if (!(await isStaff(env, email))) await log(env, email, 'fighter', req);
    const cur = await env.DB.prepare('SELECT sent_at,sent_count,window_start FROM auth_codes WHERE email=?').bind(email).first();
    if (cur && t - cur.sent_at < RESEND_GAP) return json({ error: 'wait', wait: Math.ceil((RESEND_GAP - (t - cur.sent_at)) / 1000) }, 429);
    const inWin = cur && t - cur.window_start < SEND_WINDOW;
    if (inWin && cur.sent_count >= SEND_MAX) return json({ error: 'rate' }, 429);
    const a = new Uint32Array(1); crypto.getRandomValues(a);
    const code = String(a[0] % 1000000).padStart(6, '0');
    const hash = await sha(email + ':' + code + ':' + (env.CODE_PEPPER || 'pit'));
    await env.DB.prepare('INSERT INTO auth_codes(email,hash,exp,tries,sent_at,sent_count,window_start) VALUES(?,?,?,0,?,1,?) ON CONFLICT(email) DO UPDATE SET hash=excluded.hash,exp=excluded.exp,tries=0,sent_at=excluded.sent_at,sent_count=?,window_start=?')
      .bind(email, hash, t + CODE_TTL, t, t, inWin ? cur.sent_count + 1 : 1, inWin ? cur.window_start : t).run();
    const m = mail(code, lang(req, b));
    try {
      await env.EMAIL.send({ to: email, from: { email: 'noreply@pitrating.com', name: 'PIT RATING' }, subject: m.subject, html: m.html, text: m.text });
    } catch (e) {
      await log(env, email, 'mail_error:' + String(e && (e.code || e.message) || e).slice(0, 80), req);
      return json({ error: 'mail', code: e && e.code }, 502);
    }
    await log(env, email, 'code_sent', req);
    return ok;
  }

  if (path === '/auth/verify' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const email = String(b.email || '').trim().toLowerCase(), code = String(b.code || '').replace(/\D/g, '');
    if (!EMAIL_RE.test(email) || code.length !== 6) return json({ error: 'bad_code' }, 400);
    const c = await env.DB.prepare('SELECT hash,exp,tries FROM auth_codes WHERE email=?').bind(email).first();
    if (!c || c.exp < t) return json({ error: 'expired' }, 400);
    if (c.tries >= CODE_TRIES) return json({ error: 'tries' }, 429);
    const hash = await sha(email + ':' + code + ':' + (env.CODE_PEPPER || 'pit'));
    if (hash !== c.hash) {
      await env.DB.prepare('UPDATE auth_codes SET tries=tries+1 WHERE email=?').bind(email).run();
      await log(env, email, 'bad_code', req);
      return json({ error: 'bad_code', left: CODE_TRIES - c.tries - 1 }, 400);
    }
    await env.DB.prepare('DELETE FROM auth_codes WHERE email=?').bind(email).run();
    const tok = rnd(32), life = b.remember ? SESSION_LONG : SESSION_SHORT;
    await env.DB.prepare('INSERT INTO sessions(id,email,created,last,exp,ua,ip) VALUES(?,?,?,?,?,?,?)').bind(await sha(tok), email, t, t, t + life, ua(req), ip(req)).run();
    await log(env, email, 'login', req);
    return json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=${tok}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${Math.floor(life / 1000)}` });
  }

  if (path === '/auth/logout') {
    const tok = cookieOf(req);
    if (tok) {
      const id = await sha(tok);
      const s = await env.DB.prepare('SELECT email FROM sessions WHERE id=?').bind(id).first();
      await env.DB.prepare('DELETE FROM sessions WHERE id=?').bind(id).run();
      if (s) await log(env, s.email, 'logout', req);
    }
    const nx = new URL(req.url).searchParams.get('next') || '';
    return new Response(null, { status: 302, headers: { location: nx.startsWith('/my') ? '/login?next=%2Fmy%2F' : '/login', 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0` } });
  }
  return null;
}

// Для раздела «Доступ»: сессии и входы
export async function sessionsOf(env) {
  await ensureSchema(env);
  const r = await env.DB.prepare('SELECT email,created,last,exp,ua FROM sessions WHERE exp>? ORDER BY last DESC LIMIT 200').bind(Date.now()).all();
  return r.results || [];
}
export async function revokeAll(env, email) { await env.DB.prepare('DELETE FROM sessions WHERE email=?').bind(email).run() }
