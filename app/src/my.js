// My PIT: самостоятельная регистрация бойца. Боец входит по коду на e-mail (как сотрудники),
// заполняет минимальную анкету и выбирает клуб. Если в CRM уже есть боец с тем же e-mail или телефоном —
// аккаунт привязывается к карточке; иначе в CRM появляется горячая заявка «PIT · регистрация».

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const now = () => new Date().toISOString();
const enc = new TextEncoder();
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
const digits = p => String(p || '').replace(/\D/g, '');
const samePhone = (a, b) => { a = digits(a); b = digits(b); return a.length >= 9 && b.length >= 9 && a.slice(-10) === b.slice(-10) };
const DISCS = ['MMA', 'Бокс', 'BJJ', 'Кикбоксинг', 'Муай-тай', 'Борьба', 'Функционал', 'Капоэйра'];
export const CLUBS = { mowgli: { id: 'mowgli', name: 'Mowgli Fight Club', city: 'Анталья' } };

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS fighters (email TEXT PRIMARY KEY, data TEXT NOT NULL, club TEXT, mid TEXT, lead TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL)`,
];
let ok = false;
async function ensure(env) { if (ok) return; await env.DB.batch(SCHEMA.map(q => env.DB.prepare(q))); ok = true }

function ageOf(d) { if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return null; const b = new Date(d + 'T00:00:00Z'), n = new Date(); let a = n.getUTCFullYear() - b.getUTCFullYear(); if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) a--; return a }
const clean = (s, n = 80) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

function putDoc(env, col, id, data, by) {
  return env.DB.prepare(
    `INSERT INTO docs(col,id,data,seq,deleted,updated_at,updated_by) VALUES(?,?,?,(SELECT COALESCE(MAX(seq),0)+1 FROM docs),0,?,?)
     ON CONFLICT(col,id) DO UPDATE SET data=excluded.data,seq=(SELECT COALESCE(MAX(seq),0)+1 FROM docs),deleted=0,updated_at=excluded.updated_at,updated_by=excluded.updated_by`
  ).bind(col, id, JSON.stringify(data), now(), by);
}
function delDoc(env, col, id, by) {
  return env.DB.prepare(`UPDATE docs SET deleted=1,seq=(SELECT COALESCE(MAX(seq),0)+1 FROM docs),updated_at=?,updated_by=? WHERE col=? AND id=?`).bind(now(), by, col, id);
}
async function getDoc(env, col, id) {
  const r = await env.DB.prepare('SELECT data,deleted FROM docs WHERE col=? AND id=?').bind(col, id).first();
  if (!r || r.deleted) return null; try { return JSON.parse(r.data) } catch (e) { return null }
}

async function findMember(env, email, phone) {
  const r = await env.DB.prepare("SELECT id,data FROM docs WHERE col='members' AND deleted=0").all();
  for (const x of r.results || []) {
    let m; try { m = JSON.parse(x.data) } catch (e) { continue }
    if ((m.email && String(m.email).toLowerCase() === email) || (phone && samePhone(m.phone, phone))) return { id: x.id, m };
  }
  return null;
}

async function view(env, email) {
  const f = await env.DB.prepare('SELECT data,club,mid,lead,created FROM fighters WHERE email=?').bind(email).first();
  if (!f) return { email, profile: null, clubs: Object.values(CLUBS), discs: DISCS };
  const profile = JSON.parse(f.data), out = { email, profile, club: CLUBS[f.club] || null, clubs: Object.values(CLUBS), discs: DISCS };
  if (!f.mid && f.lead) {
    // админ оформил абонемент по заявке — привяжем аккаунт к карточке бойца
    const l = await getDoc(env, 'leads', f.lead);
    if (l && l.mid) { f.mid = l.mid; await env.DB.prepare('UPDATE fighters SET mid=? WHERE email=?').bind(l.mid, email).run() }
  }
  if (f.mid) {
    const m = await getDoc(env, 'members', f.mid);
    if (m) {
      const v = await env.DB.prepare("SELECT data FROM docs WHERE col='visits' AND deleted=0").all();
      let total = 0, month = 0; const ym = new Date().toISOString().slice(0, 7);
      for (const x of v.results || []) { try { const d = JSON.parse(x.data); if (Array.isArray(d.ids) && d.ids.includes(f.mid)) { total++; if (String(d.date || '').startsWith(ym)) month++ } } catch (e) { } }
      out.member = { name: m.name, plan: m.plan || null, start: m.start || null, end: m.end || null, left: m.left ?? null, frozen: !!m.frozen, disc: m.disc || null, visits: { total, month } };
    }
  }
  if (f.lead) {
    const l = await getDoc(env, 'leads', f.lead);
    if (l) out.lead = { status: l.status || 'new', trialDate: l.trialDate || null };
  }
  return out;
}

export async function myRoutes(req, env, path, email) {
  await ensure(env);
  if (path === '/api/my' && req.method === 'GET') return json(await view(env, email));
  if (path !== '/api/my' || req.method !== 'POST') return json({ error: 'not_found' }, 404);
  const b = await req.json().catch(() => ({}));
  const cur = await env.DB.prepare('SELECT data,club,mid,lead,created FROM fighters WHERE email=?').bind(email).first();

  // удалить мои данные (GDPR / KVKK): анкета, незакрытая заявка и все сессии
  if (b.delete === true) {
    const st = [env.DB.prepare('DELETE FROM fighters WHERE email=?').bind(email), env.DB.prepare('DELETE FROM sessions WHERE email=?').bind(email)];
    if (cur && cur.lead) { const l = await getDoc(env, 'leads', cur.lead); if (l && (l.status || 'new') === 'new') st.push(delDoc(env, 'leads', cur.lead, 'pit:' + email)) }
    await env.DB.batch(st);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': 'pit_sess=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' } });
  }

  const p = b.profile || {};
  const last = clean(p.last, 60), first = clean(p.first, 60), dob = clean(p.dob, 10), phone = clean(p.phone, 24), disc = DISCS.includes(p.disc) ? p.disc : 'MMA';
  const club = CLUBS[p.club] ? p.club : null, kind = p.kind === 'ind' ? 'ind' : 'group';
  const age = ageOf(dob);
  if (!last || !first) return json({ error: 'name' }, 400);
  if (age == null || age < 4 || age > 90) return json({ error: 'dob' }, 400);
  if (digits(phone).length < 9) return json({ error: 'phone' }, 400);
  if (!club) return json({ error: 'club' }, 400);
  if (p.consentData !== true) return json({ error: 'consent' }, 400);
  const minor = age < 18;
  const parent = minor ? { name: clean(p.parent?.name, 80), phone: clean(p.parent?.phone, 24) } : null;
  if (minor && (!parent.name || digits(parent.phone).length < 9 || p.parentConsent !== true)) return json({ error: 'parent' }, 400);
  const profile = {
    last, first, dob, phone, disc, club, kind, note: clean(p.note, 300),
    consentData: true, photoConsent: p.photoConsent === true, consentPublic: p.consentPublic === true, consentMsg: p.consentMsg === true,
    parent, parentConsent: minor ? true : null, lang: clean(p.lang, 2) || 'ru', updatedAt: now(), createdAt: cur ? JSON.parse(cur.data).createdAt || now() : now(),
  };
  const t = Date.now(), stmts = [];
  let mid = cur?.mid || null, lead = cur?.lead || null;
  if (!mid && !lead) {
    const hit = await findMember(env, email, phone);
    if (hit) mid = hit.id;
    else {
      lead = 'pit' + (await sha(email)).slice(0, 18);
      stmts.push(putDoc(env, 'leads', lead, {
        name: last + ' ' + first, phone, email, disc, kind, age: String(age), source: 'PIT · регистрация', status: 'new', by: 'PIT',
        note: (minor ? `U18 · родитель: ${parent.name}, ${parent.phone}. ` : '') + (profile.note || ''), ts: now(), pit: true,
      }, 'pit:' + email));
    }
  } else if (lead) {
    // заявка ещё открыта — обновим данные в ней
    const l = await getDoc(env, 'leads', lead);
    if (l && (l.status || 'new') === 'new') stmts.push(putDoc(env, 'leads', lead, { ...l, name: last + ' ' + first, phone, disc, kind, age: String(age) }, 'pit:' + email));
  }
  stmts.push(env.DB.prepare(`INSERT INTO fighters(email,data,club,mid,lead,created,updated) VALUES(?,?,?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET data=excluded.data,club=excluded.club,mid=excluded.mid,lead=excluded.lead,updated=excluded.updated`)
    .bind(email, JSON.stringify(profile), club, mid, lead, cur?.created || t, t));
  await env.DB.batch(stmts);
  return json({ ok: true, ...(await view(env, email)) });
}
