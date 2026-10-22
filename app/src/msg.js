// Сообщения клуба бойцам в My PIT: всем / группе / выбранным. Каждый получает текст на языке своего аккаунта.
const LANGS = ['ru', 'en', 'tr'];
const LN = { ru: 'russian', en: 'english', tr: 'turkish' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json' } });
const clean = (v, n) => String(v ?? '').replace(/\u0000/g, '').trim().slice(0, n);

async function ensure(env) {
  await env.DB.batch([
    env.DB.prepare('CREATE TABLE IF NOT EXISTS msgs (id TEXT PRIMARY KEY, created INTEGER NOT NULL, by TEXT, title TEXT, texts TEXT NOT NULL, target TEXT, total INTEGER, delivered INTEGER)'),
    env.DB.prepare('CREATE TABLE IF NOT EXISTS msg_to (msg TEXT NOT NULL, email TEXT NOT NULL, read_at INTEGER, PRIMARY KEY (msg, email))'),
    env.DB.prepare('CREATE INDEX IF NOT EXISTS msg_to_email ON msg_to(email)'),
  ]);
}

// перевод черновика на остальные языки (Workers AI, m2m100); при недоступности админ пишет переводы сам
async function translate(env, text, from, to) {
  if (!env.AI) throw new Error('ai_off');
  const r = await env.AI.run('@cf/meta/m2m100-1.2b', { text, source_lang: LN[from], target_lang: LN[to] });
  return String(r && (r.translated_text || r.response) || '').trim();
}

export async function msgRoutes(req, env, path, me) {
  const staff = me && ['owner', 'admin'].includes(me.role);
  await ensure(env);
  if (path === '/api/msg/translate' && req.method === 'POST') {
    if (!staff) return json({ error: 'forbidden' }, 403);
    const b = await req.json().catch(() => ({})), from = LANGS.includes(b.from) ? b.from : 'ru', text = clean(b.text, 2000), title = clean(b.title, 120);
    if (!text) return json({ error: 'empty' }, 400);
    const out = {};
    try {
      for (const l of LANGS) if (l !== from) out[l] = { text: await translate(env, text, from, l), title: title ? await translate(env, title, from, l) : '' };
    } catch (e) { return json({ error: String(e && e.message || e) === 'ai_off' ? 'ai_off' : 'ai_failed' }, 503) }
    return json({ ok: true, from, out });
  }
  if (path === '/api/msg/send' && req.method === 'POST') {
    if (!staff) return json({ error: 'forbidden' }, 403);
    const b = await req.json().catch(() => ({})), texts = {};
    for (const l of LANGS) { const t = b.texts && b.texts[l]; if (t && clean(t.text, 2000)) texts[l] = { title: clean(t.title, 120), text: clean(t.text, 2000) } }
    if (!Object.keys(texts).length) return json({ error: 'empty' }, 400);
    const mids = [...new Set((Array.isArray(b.mids) ? b.mids : []).map(x => String(x)).filter(Boolean))].slice(0, 2000);
    if (!mids.length) return json({ error: 'no_recipients' }, 400);
    const emails = new Set(), found = new Set();
    for (let i = 0; i < mids.length; i += 90) {
      const part = mids.slice(i, i + 90), r = await env.DB.prepare(`SELECT email, mid FROM fighters WHERE mid IN (${part.map(() => '?').join(',')})`).bind(...part).all();
      for (const x of r.results || []) { emails.add(x.email); found.add(x.mid) }
    }
    const id = 'm' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), t = Date.now();
    const st = [env.DB.prepare('INSERT INTO msgs(id,created,by,title,texts,target,total,delivered) VALUES(?,?,?,?,?,?,?,?)')
      .bind(id, t, me.email, (texts.ru || Object.values(texts)[0]).title || '', JSON.stringify(texts), JSON.stringify({ label: clean(b.label, 120), mids: mids.length }), mids.length, emails.size)];
    for (const e of emails) st.push(env.DB.prepare('INSERT OR IGNORE INTO msg_to(msg,email) VALUES(?,?)').bind(id, e));
    for (let i = 0; i < st.length; i += 90) await env.DB.batch(st.slice(i, i + 90));
    return json({ ok: true, id, total: mids.length, delivered: emails.size, missing: mids.length - found.size });
  }
  if (path === '/api/msg/list' && req.method === 'GET') {
    if (!staff) return json({ error: 'forbidden' }, 403);
    const r = await env.DB.prepare('SELECT m.*, (SELECT COUNT(*) FROM msg_to t WHERE t.msg=m.id AND t.read_at IS NOT NULL) AS readn FROM msgs m ORDER BY created DESC LIMIT 50').all();
    return json({ items: (r.results || []).map(x => ({ id: x.id, created: x.created, by: x.by, texts: JSON.parse(x.texts), target: JSON.parse(x.target || '{}'), total: x.total, delivered: x.delivered, read: x.readn })) });
  }
  return json({ error: 'not_found' }, 404);
}

// входящие бойца: текст на языке аккаунта (иначе — что есть)
export async function inbox(env, email, lang) {
  await ensure(env);
  const r = await env.DB.prepare('SELECT m.id,m.created,m.texts,t.read_at FROM msg_to t JOIN msgs m ON m.id=t.msg WHERE t.email=? ORDER BY m.created DESC LIMIT 30').bind(email).all();
  return (r.results || []).map(x => { const T = JSON.parse(x.texts), v = T[lang] || T.ru || T.en || T.tr || Object.values(T)[0] || {}; return { id: x.id, at: x.created, title: v.title || '', text: v.text || '', read: !!x.read_at } });
}
export async function markRead(env, email, ids) {
  await ensure(env);
  const t = Date.now(), L = (Array.isArray(ids) ? ids : []).slice(0, 50).map(String);
  if (L.length) await env.DB.batch(L.map(id => env.DB.prepare('UPDATE msg_to SET read_at=? WHERE msg=? AND email=? AND read_at IS NULL').bind(t, id, email)));
}
