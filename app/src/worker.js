// PIT RATING — app.pitrating.com
// Вход: собственный (код на e-mail → сессия), на переходный период также Cloudflare Access. Роли: owner | admin | trainer.
import { authRoutes, sessionEmail, sessionsOf, revokeAll } from './auth.js';
// Данные: D1 (документы коллекций), файлы: R2.

const ROLES = { owner: 3, admin: 2, trainer: 1 };
// Коллекции, закрытые для тренера (касса, журнал действий)
const FIN_COLS = new Set(['payments', 'expenses', 'audit']);
const COL_RE = /^[a-z][a-z0-9_]{0,40}$/;
const ID_RE = /^[A-Za-z0-9_\-.~:@+]{1,200}$/;

const json = (o, s = 200) => new Response(JSON.stringify(o), {
  status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});
const now = () => new Date().toISOString();

/* ---------- Cloudflare Access JWT ---------- */
let JWKS = null, JWKS_AT = 0;
const b64u = s => Uint8Array.from(atob(s.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((s.length + 3) % 4)), c => c.charCodeAt(0));
async function verifyAccess(req, env) {
  const tok = req.headers.get('cf-access-jwt-assertion') || (req.headers.get('cookie') || '').match(/CF_Authorization=([^;]+)/)?.[1];
  if (!tok || !env.ACCESS_AUD || env.ACCESS_AUD.startsWith('REPLACE')) return null;
  const [h, p, s] = tok.split('.');
  if (!s) return null;
  const head = JSON.parse(new TextDecoder().decode(b64u(h)));
  const pay = JSON.parse(new TextDecoder().decode(b64u(p)));
  if (Date.now() - JWKS_AT > 3600e3 || !JWKS) {
    const r = await fetch(`https://${env.ACCESS_TEAM}.cloudflareaccess.com/cdn-cgi/access/certs`);
    JWKS = (await r.json()).keys; JWKS_AT = Date.now();
  }
  const jwk = JWKS.find(k => k.kid === head.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, b64u(s), new TextEncoder().encode(h + '.' + p));
  if (!ok) return null;
  const aud = Array.isArray(pay.aud) ? pay.aud : [pay.aud];
  if (!aud.includes(env.ACCESS_AUD)) return null;
  if (pay.exp && pay.exp * 1000 < Date.now()) return null;
  if (pay.iss && pay.iss !== `https://${env.ACCESS_TEAM}.cloudflareaccess.com`) return null;
  return String(pay.email || '').toLowerCase() || null;
}

async function whoami(req, env) {
  // локальная проверка: .dev.vars (не публикуется) — DEV=1, DEV_EMAIL=…
  const email = env.DEV === '1' && env.DEV_EMAIL ? String(req.headers.get('x-dev-email') || env.DEV_EMAIL).toLowerCase() : ((await sessionEmail(req, env)) || (await verifyAccess(req, env)));
  if (!email) return null;
  const owners = String(env.OWNER_EMAILS || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
  if (owners.includes(email)) {
    const u = await env.DB.prepare('SELECT name FROM users WHERE email=?').bind(email).first();
    return { email, role: 'owner', name: u?.name || 'Владелец' };
  }
  const u = await env.DB.prepare('SELECT role,name FROM users WHERE email=?').bind(email).first();
  if (!u || !ROLES[u.role]) return { email, role: null, name: null };
  return { email, role: u.role, name: u.name || email };
}
const canCol = (me, col) => me.role === 'owner' || me.role === 'admin' || (me.role === 'trainer' && !FIN_COLS.has(col));
// тренер пишет в журнал действий, но не читает его
const canWriteCol = (me, col) => canCol(me, col) || (me.role === 'trainer' && col === 'audit');

/* ---------- API ---------- */
async function api(req, env, me, path) {
  const url = new URL(req.url);
  if (path === '/api/me') return json(me);

  // Синхронизация: все изменения после seq
  if (path === '/api/sync' && req.method === 'GET') {
    const since = Math.max(0, parseInt(url.searchParams.get('since') || '0', 10) || 0);
    const r = await env.DB.prepare('SELECT col,id,data,seq,deleted FROM docs WHERE seq>? ORDER BY seq LIMIT 5000').bind(since).all();
    const rows = (r.results || []).filter(x => canCol(me, x.col));
    const last = (r.results || []).reduce((a, x) => Math.max(a, x.seq), since);
    return json({ since: last, more: (r.results || []).length === 5000, docs: rows.map(x => ({ c: x.col, i: x.id, d: x.deleted ? null : JSON.parse(x.data) })) });
  }

  // Запись: set | update | delete
  if (path === '/api/write' && req.method === 'POST') {
    const b = await req.json().catch(() => null);
    const ops = Array.isArray(b?.ops) ? b.ops : [b];
    const stmts = [];
    for (const o of ops) {
      if (!o || !COL_RE.test(o.col || '') || !ID_RE.test(o.id || '') || !['set', 'update', 'delete', 'push'].includes(o.op)) return json({ error: 'bad_request' }, 400);
      if (!canWriteCol(me, o.col)) return json({ error: 'forbidden', col: o.col }, 403);
      if (o.op !== 'delete' && o.op !== 'push' && (typeof o.data !== 'object' || o.data === null || Array.isArray(o.data))) return json({ error: 'bad_data' }, 400);
      let data = o.data;
      if (o.op === 'push') {
        // дописать элемент в массив (журнал действий) без чтения на клиенте
        if (!/^[a-z]{1,20}$/.test(o.field || '')) return json({ error: 'bad_field' }, 400);
        const cur = await env.DB.prepare('SELECT data,deleted FROM docs WHERE col=? AND id=?').bind(o.col, o.id).first();
        const base = cur && !cur.deleted ? JSON.parse(cur.data) : { ...(o.base || {}) };
        const arr = Array.isArray(base[o.field]) ? base[o.field] : [];
        arr.push(o.value);
        base[o.field] = arr.slice(-(Math.min(2000, +o.max || 800)));
        data = base;
      }
      if (o.op === 'update') {
        if (!canCol(me, o.col)) return json({ error: 'forbidden', col: o.col }, 403);
        const cur = await env.DB.prepare('SELECT data,deleted FROM docs WHERE col=? AND id=?').bind(o.col, o.id).first();
        if (!cur || cur.deleted) return json({ error: 'not_found', col: o.col, id: o.id }, 404);
        data = { ...JSON.parse(cur.data), ...o.data };
      }
      const s = o.op === 'delete' ? null : JSON.stringify(data);
      if (s && s.length > 900000) return json({ error: 'too_large' }, 413);
      stmts.push(env.DB.prepare(
        `INSERT INTO docs(col,id,data,seq,deleted,updated_at,updated_by) VALUES(?,?,?,(SELECT COALESCE(MAX(seq),0)+1 FROM docs),?,?,?)
         ON CONFLICT(col,id) DO UPDATE SET data=excluded.data,seq=(SELECT COALESCE(MAX(seq),0)+1 FROM docs),deleted=excluded.deleted,updated_at=excluded.updated_at,updated_by=excluded.updated_by`
      ).bind(o.col, o.id, s, o.op === 'delete' ? 1 : 0, now(), me.email));
    }
    await env.DB.batch(stmts);
    return json({ ok: true });
  }

  // Файлы (фото, чеки) → R2
  if (path === '/api/upload' && req.method === 'POST') {
    if (!env.FILES) return json({ error: 'files_off' }, 503);
    const type = (req.headers.get('content-type') || 'application/octet-stream').split(';')[0];
    if (!/^(image\/(jpeg|png|webp|heic|heif|gif)|application\/pdf)$/.test(type)) return json({ error: 'unsupported_type' }, 415);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 20 * 1024 * 1024) return json({ error: 'too_large' }, 413);
    const id = crypto.randomUUID().replace(/-/g, '');
    await env.FILES.put(id, buf, { httpMetadata: { contentType: type } });
    await env.DB.prepare('INSERT INTO files(id,type,size,by,at) VALUES(?,?,?,?,?)').bind(id, type, buf.byteLength, me.email, now()).run();
    return json({ id });
  }

  // Пользователи и роли (владелец и администратор)
  if (path === '/api/users') {
    if (!(me.role === 'owner' || me.role === 'admin')) return json({ error: 'forbidden' }, 403);
    if (req.method === 'GET') {
      const r = await env.DB.prepare('SELECT email,role,name,added_at FROM users ORDER BY role,email').all();
      const owners = String(env.OWNER_EMAILS || '').toLowerCase().split(/[,\s]+/).filter(Boolean);
      const lg = await env.DB.prepare("SELECT at,email,event FROM logins WHERE event IN ('login','logout','bad_code') ORDER BY at DESC LIMIT 30").all().catch(() => ({ results: [] }));
      return json({ owners, users: r.results || [], sessions: await sessionsOf(env).catch(() => []), logins: lg.results || [] });
    }
    if (req.method === 'POST') {
      const b = await req.json().catch(() => ({}));
      const email = String(b.email || '').trim().toLowerCase();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return json({ error: 'bad_email' }, 400);
      if (b.revoke) { await revokeAll(env, email); return json({ ok: true }) }
      if (b.remove) {
        await env.DB.prepare('DELETE FROM users WHERE email=?').bind(email).run();
        await revokeAll(env, email);
        return json({ ok: true });
      }
      const role = String(b.role || '');
      if (!['admin', 'trainer'].includes(role)) return json({ error: 'bad_role' }, 400);
      if (role === 'admin' && me.role !== 'owner') return json({ error: 'owner_only' }, 403);
      await env.DB.prepare('INSERT INTO users(email,role,name,added_by,added_at) VALUES(?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET role=excluded.role,name=excluded.name')
        .bind(email, role, String(b.name || '').slice(0, 80) || null, me.email, now()).run();
      let invited = false;
      if (b.invite !== false && env.EMAIL) {
        try { await env.EMAIL.send(invite(email, role, String(b.name || ''))); invited = true } catch (e) { }
      }
      return json({ ok: true, invited });
    }
  }

  // Имена для журнала действий
  if (path === '/api/names' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const ids = (Array.isArray(b.ids) ? b.ids : []).slice(0, 64).map(x => String(x).toLowerCase());
    const out = {};
    for (const e of ids) {
      const u = await env.DB.prepare('SELECT name FROM users WHERE email=?').bind(e).first();
      out[e] = { name: u?.name || e.split('@')[0] };
    }
    return json(out);
  }

  // Разовый импорт данных из прототипа CRM (только владелец)
  if (path === '/api/import' && req.method === 'POST') {
    if (me.role !== 'owner') return json({ error: 'owner_only' }, 403);
    const b = await req.json().catch(() => null);
    if (!b || typeof b !== 'object') return json({ error: 'bad_request' }, 400);
    let n = 0; const stmts = [];
    for (const [col, docs] of Object.entries(b)) {
      if (!COL_RE.test(col) || typeof docs !== 'object') continue;
      for (const [id, data] of Object.entries(docs)) {
        if (!ID_RE.test(id) || typeof data !== 'object') continue;
        stmts.push(env.DB.prepare(
          `INSERT INTO docs(col,id,data,seq,deleted,updated_at,updated_by) VALUES(?,?,?,(SELECT COALESCE(MAX(seq),0)+1 FROM docs),0,?,?)
           ON CONFLICT(col,id) DO UPDATE SET data=excluded.data,seq=(SELECT COALESCE(MAX(seq),0)+1 FROM docs),deleted=0,updated_at=excluded.updated_at,updated_by=excluded.updated_by`
        ).bind(col, id, JSON.stringify(data), now(), 'import'));
        n++;
      }
    }
    for (let i = 0; i < stmts.length; i += 50) await env.DB.batch(stmts.slice(i, i + 50));
    return json({ ok: true, imported: n });
  }

  return json({ error: 'not_found' }, 404);
}

function invite(to, role, name) {
  const rn = { admin: 'администратор', trainer: 'тренер' }[role] || role;
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#15171b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#fff;border:1px solid #e3ded2;border-radius:14px;overflow:hidden">
<tr><td style="background:#111418;padding:24px 28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle"><img src="https://app.pitrating.com/brand/mail-mark.png" width="34" height="42" alt="" style="display:block;border:0"></td>
<td style="vertical-align:middle"><div style="color:#f4f1ea;font-size:26px;line-height:26px;font-weight:800;letter-spacing:1px">PIT</div><div style="color:#e8c35a;font-size:11px;line-height:16px;font-weight:700;letter-spacing:5px;margin-top:3px">RATING</div></td>
</tr></table></td></tr>
<tr><td style="padding:28px"><div style="font-size:17px;font-weight:700;margin:0 0 12px">${name ? name.replace(/[<>&"]/g, '') + ', в' : 'В'}ас добавили в систему клуба</div>
<p style="font-size:14px;line-height:1.5;margin:0 0 18px">Роль: <b>${rn}</b>. Вход — по коду, который придёт на этот e-mail. Пароль не нужен.</p>
<a href="https://app.pitrating.com/login" style="display:inline-block;background:#e8c35a;color:#141414;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:10px">Войти в PIT RATING</a>
<p style="font-size:12px;color:#8b877d;margin:18px 0 0">Если вы не ждали это письмо — просто проигнорируйте его.</p></td></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #efeae0;font-size:11px;color:#8b877d">PIT RATING · Performance Index of Training · pitrating.com</td></tr></table></td></tr></table></body></html>`;
  return { to, from: { email: 'noreply@pitrating.com', name: 'PIT RATING' }, subject: 'Доступ к системе клуба · PIT RATING', html, text: `Вас добавили в систему клуба PIT RATING (роль: ${rn}). Вход: https://app.pitrating.com/login — по коду на этот e-mail.` };
}

const NO_ACCESS = (email) => new Response(`<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width,initial-scale=1"><title>PIT RATING</title>
<body style="font-family:-apple-system,system-ui,sans-serif;background:#f4f1ea;color:#15171b;display:grid;place-items:center;min-height:100vh;margin:0;padding:16px">
<div style="max-width:420px;text-align:center"><h1 style="font-size:22px">Нет доступа</h1>
<p>${email ? `Адрес <b>${email.replace(/[<>&"]/g, '')}</b> пока не добавлен в клуб.` : 'Не удалось подтвердить вход.'} Попросите администратора клуба добавить вас в разделе «Доступ».</p>
<p><a href="/auth/logout">Выйти и войти с другим e-mail</a></p></div></body>`, { status: 403, headers: { 'content-type': 'text/html; charset=utf-8' } });

export default {
  async fetch(req, env) {
    const url = new URL(req.url), path = url.pathname;
    // открыто без входа: страница входа, логотипы, методы входа
    if (path === '/login' || path === '/login.html' || path.startsWith('/brand/')) return env.ASSETS.fetch(req);
    if (path.startsWith('/auth/')) {
      try { const r = await authRoutes(req, env, path); if (r) return r } catch (e) { return json({ error: 'server' }, 500) }
      return json({ error: 'not_found' }, 404);
    }
    const me = await whoami(req, env);
    if (!me) {
      if (path.startsWith('/api/')) return json({ error: 'unauthorized' }, 401);
      return new Response(null, { status: 302, headers: { location: '/login' + (path !== '/' ? '?next=' + encodeURIComponent(path + url.search) : '') } });
    }
    if (!me.role) {
      if (path.startsWith('/api/')) return json({ error: 'unauthorized' }, 401);
      return NO_ACCESS(me.email);
    }
    if (path.startsWith('/api/')) {
      try { return await api(req, env, me, path); }
      catch (e) { return json({ error: 'server', message: String(e && e.message || e) }, 500); }
    }
    if (path.startsWith('/_blob/')) {
      const id = path.slice(7);
      if (!/^[a-f0-9]{32}$/.test(id)) return new Response('Not found', { status: 404 });
      if (!env.FILES) return new Response('Not found', { status: 404 });
      const o = await env.FILES.get(id);
      if (!o) return new Response('Not found', { status: 404 });
      return new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType || 'application/octet-stream', 'cache-control': 'private, max-age=3600' } });
    }
    // Тренеру касса и отчёты недоступны на уровне данных (FIN_COLS), интерфейс прячет их сам
    return env.ASSETS.fetch(req);
  }
};
