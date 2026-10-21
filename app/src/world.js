// My PIT World — лента клуба и бойцов с лёгкой модерацией.
// Посты бойцов публикуются сразу; с ссылками / контактами / стоп-словами — уходят на проверку.
// Владелец и администратор модерируют: скрыть, вернуть, удалить. Тренер и клуб публикуют от имени клуба.

import { CLUBS } from './my.js';
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS posts (id TEXT PRIMARY KEY, club TEXT, author TEXT NOT NULL, name TEXT, kind TEXT NOT NULL, text TEXT, img TEXT, status TEXT NOT NULL, flag TEXT, likes INTEGER NOT NULL DEFAULT 0, created INTEGER NOT NULL, updated INTEGER NOT NULL, mod_by TEXT, mod_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS posts_created ON posts(created)`,
  `CREATE TABLE IF NOT EXISTS post_likes (post TEXT NOT NULL, email TEXT NOT NULL, at INTEGER NOT NULL, PRIMARY KEY(post,email))`,
];
let ok = false;
async function ensure(env) { if (ok) return; await env.DB.batch(SCHEMA.map(q => env.DB.prepare(q))); ok = true }

// лёгкая автопроверка: ссылки, контакты, явная брань/реклама → на проверку модератору
const FLAGS = [
  [/https?:\/\/|www\.|\.(com|ru|net|org|io|me|tr)\b/i, 'ссылка'],
  [/@[a-z0-9_.]{3,}|t\.me|wa\.me|whatsapp|telegram|instagram\.com/i, 'контакт'],
  [/(\+?\d[\d\s()-]{8,}\d)/, 'телефон'],
  [/\b(казино|casino|ставк|bet\b|крипт|crypto|заработ|скидк|sale|промокод|onlyfans)/i, 'реклама'],
  [/\b(хуй|пизд|еба|ёба|бля|сука|fuck|shit|bitch|orospu|siktir|amk)\w*/i, 'брань'],
];
const flagOf = t => { for (const [re, w] of FLAGS) if (re.test(t)) return w; return null };
const clean = (s, n) => String(s ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, n);

async function fighterOf(env, email) {
  const f = await env.DB.prepare('SELECT data,club,mid,lead FROM fighters WHERE email=?').bind(email).first().catch(() => null);
  if (!f) return null;
  const p = JSON.parse(f.data);
  let approved = !!f.mid;
  if (!approved && f.lead) {
    const l = await env.DB.prepare("SELECT data FROM docs WHERE col='leads' AND id=? AND deleted=0").bind(f.lead).first();
    if (l) { try { const d = JSON.parse(l.data); approved = !!(d.approved || d.mid) && !d.rejected } catch (e) { } }
  }
  return { name: `${p.first} ${String(p.last || '').slice(0, 1)}.`.trim(), club: f.club || p.club, approved };
}

const out = (r, email, staff) => ({
  id: r.id, name: r.name, kind: r.kind, text: r.text, img: r.img ? '/api/world/img/' + r.img : null, likes: r.likes, created: r.created,
  status: r.status, mine: r.author === email, liked: !!r.liked, ...(staff ? { author: r.author, flag: r.flag, modBy: r.mod_by } : {}),
});

/** me: { email, staff:'owner'|'admin'|'trainer'|null } */
export async function worldRoutes(req, env, path, me) {
  await ensure(env);
  const url = new URL(req.url), t = Date.now();
  const mod = me.staff === 'owner' || me.staff === 'admin';
  const club = env.CLUB || 'mowgli';

  if (path === '/api/world' && req.method === 'GET') {
    const st = url.searchParams.get('status') || 'feed', before = +url.searchParams.get('before') || 9e15;
    let q, b;
    if (mod && st !== 'feed') { q = 'SELECT p.*, (SELECT 1 FROM post_likes l WHERE l.post=p.id AND l.email=?) AS liked FROM posts p WHERE p.status=? AND p.created<? ORDER BY p.created DESC LIMIT 40'; b = [me.email, st, before] }
    else { q = "SELECT p.*, (SELECT 1 FROM post_likes l WHERE l.post=p.id AND l.email=?) AS liked FROM posts p WHERE (p.status='live' OR p.author=?) AND p.created<? ORDER BY p.created DESC LIMIT 40"; b = [me.email, me.email, before] }
    const r = await env.DB.prepare(q).bind(...b).all();
    const counts = mod ? await env.DB.prepare("SELECT status, COUNT(*) AS n FROM posts GROUP BY status").all() : null;
    let canPost = !!me.staff, why = null;
    if (!me.staff) { const f = await fighterOf(env, me.email); canPost = !!(f && f.approved); why = !f ? 'profile' : !f.approved ? 'approval' : null }
    return json({
      posts: (r.results || []).map(x => out(x, me.email, mod)), canPost, why, mod,
      counts: counts ? Object.fromEntries((counts.results || []).map(x => [x.status, x.n])) : null,
      club: CLUBS[club] ? { name: CLUBS[club].name, city: CLUBS[club].city } : null,
    });
  }

  if (path === '/api/world' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const text = clean(b.text, 1500), img = /^[a-f0-9]{32}$/.test(b.img || '') ? b.img : null;
    if (!text && !img) return json({ error: 'empty' }, 400);
    let name, kind, status = 'live', flag = null;
    if (me.staff) { kind = 'club'; name = CLUBS[club]?.name || 'Клуб' }
    else {
      const f = await fighterOf(env, me.email);
      if (!f) return json({ error: 'profile' }, 403);
      if (!f.approved) return json({ error: 'approval' }, 403);
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM posts WHERE author=? AND created>?').bind(me.email, t - 3600e3).first();
      if ((n?.n || 0) >= 5) return json({ error: 'rate' }, 429);
      kind = 'fighter'; name = f.name; flag = flagOf(text); if (flag) status = 'pending';
    }
    if (img) { const own = await env.DB.prepare('SELECT 1 AS x FROM files WHERE id=? AND by=?').bind(img, me.email).first(); if (!own) return json({ error: 'img' }, 400) }
    const id = 'p' + t.toString(36) + crypto.randomUUID().slice(0, 6);
    await env.DB.prepare('INSERT INTO posts(id,club,author,name,kind,text,img,status,flag,likes,created,updated) VALUES(?,?,?,?,?,?,?,?,?,0,?,?)')
      .bind(id, club, me.email, name, kind, text, img, status, flag, t, t).run();
    return json({ ok: true, status, flag, id });
  }

  if (path === '/api/world/like' && req.method === 'POST') {
    const b = await req.json().catch(() => ({})), id = String(b.id || '');
    const p = await env.DB.prepare("SELECT id,status,author FROM posts WHERE id=?").bind(id).first();
    if (!p || (p.status !== 'live' && p.author !== me.email && !mod)) return json({ error: 'not_found' }, 404);
    const had = await env.DB.prepare('SELECT 1 AS x FROM post_likes WHERE post=? AND email=?').bind(id, me.email).first();
    await env.DB.batch(had
      ? [env.DB.prepare('DELETE FROM post_likes WHERE post=? AND email=?').bind(id, me.email), env.DB.prepare('UPDATE posts SET likes=MAX(0,likes-1) WHERE id=?').bind(id)]
      : [env.DB.prepare('INSERT INTO post_likes(post,email,at) VALUES(?,?,?)').bind(id, me.email, t), env.DB.prepare('UPDATE posts SET likes=likes+1 WHERE id=?').bind(id)]);
    const r = await env.DB.prepare('SELECT likes FROM posts WHERE id=?').bind(id).first();
    return json({ liked: !had, likes: r?.likes || 0 });
  }

  if (path === '/api/world/mod' && req.method === 'POST') {
    const b = await req.json().catch(() => ({})), id = String(b.id || ''), a = b.action;
    const p = await env.DB.prepare('SELECT id,author,img FROM posts WHERE id=?').bind(id).first();
    if (!p) return json({ error: 'not_found' }, 404);
    // автор может удалить свой пост; модератор — скрыть, вернуть, удалить
    if (a === 'delete' && (mod || p.author === me.email)) {
      await env.DB.batch([env.DB.prepare('DELETE FROM posts WHERE id=?').bind(id), env.DB.prepare('DELETE FROM post_likes WHERE post=?').bind(id)]);
      if (p.img && env.FILES) { try { await env.FILES.delete(p.img) } catch (e) { } }
      return json({ ok: true });
    }
    if (!mod) return json({ error: 'forbidden' }, 403);
    const st = { hide: 'hidden', show: 'live', approve: 'live' }[a];
    if (!st) return json({ error: 'bad_action' }, 400);
    await env.DB.prepare('UPDATE posts SET status=?,mod_by=?,mod_at=?,updated=? WHERE id=?').bind(st, me.email, t, t, id).run();
    return json({ ok: true, status: st });
  }

  if (path === '/api/world/upload' && req.method === 'POST') {
    if (!env.FILES) return json({ error: 'files_off' }, 503);
    if (!me.staff) { const f = await fighterOf(env, me.email); if (!f || !f.approved) return json({ error: 'approval' }, 403) }
    const type = (req.headers.get('content-type') || '').split(';')[0];
    if (!/^image\/(jpeg|png|webp|gif)$/.test(type)) return json({ error: 'unsupported_type' }, 415);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 8 * 1024 * 1024) return json({ error: 'too_large' }, 413);
    const id = crypto.randomUUID().replace(/-/g, '');
    await env.FILES.put(id, buf, { httpMetadata: { contentType: type } });
    await env.DB.prepare('INSERT INTO files(id,type,size,by,at) VALUES(?,?,?,?,?)').bind(id, type, buf.byteLength, me.email, new Date().toISOString()).run();
    return json({ id });
  }

  const m = path.match(/^\/api\/world\/img\/([a-f0-9]{32})$/);
  if (m && req.method === 'GET') {
    const p = await env.DB.prepare('SELECT status,author FROM posts WHERE img=?').bind(m[1]).first();
    if (!p || (p.status !== 'live' && p.author !== me.email && !mod)) return new Response('Not found', { status: 404 });
    const o = env.FILES ? await env.FILES.get(m[1]) : null;
    if (!o) return new Response('Not found', { status: 404 });
    return new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType || 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
  }
  return json({ error: 'not_found' }, 404);
}
