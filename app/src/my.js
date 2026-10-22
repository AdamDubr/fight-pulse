// My PIT: анкета бойца и её верификация клубом.
// Боец сам заполняет и правит анкету (профиль, соревнования, титулы, клубы, ссылки на профили).
// Подтверждает всегда администратор клуба, к которому приписан боец: только тогда ✓ Verified.
// Регистрация → заявка в CRM (совпадение по e-mail/телефону — подсказка админу). Клуб может пригласить бойца сам.

const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' } });
const now = () => new Date().toISOString();
const enc = new TextEncoder();
const sha = async s => [...new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)))].map(x => x.toString(16).padStart(2, '0')).join('');
const digits = p => String(p || '').replace(/\D/g, '');
const samePhone = (a, b) => { a = digits(a); b = digits(b); return a.length >= 9 && b.length >= 9 && a.slice(-10) === b.slice(-10) };
const DISCS = ['MMA', 'Бокс', 'BJJ', 'Кикбоксинг', 'Капоэйра'];
export const CLUBS = { mowgli: { id: 'mowgli', name: 'Mowgli Fight Club', city: 'Анталья', cityEn: 'Antalya', country: 'TR', lat: 36.8969, lon: 30.7133, logo: '/brand/clubs/mowgli.png', discs: ['MMA', 'BJJ', 'Бокс', 'Кикбоксинг', 'Капоэйра'] } };
const LEVELS = ['club', 'city', 'regional', 'national', 'international', 'pro'];
const KINDS = ['comp', 'title', 'club', 'link'];

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS fighters (email TEXT PRIMARY KEY, data TEXT NOT NULL, club TEXT, mid TEXT, lead TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL)`,
  `CREATE TABLE IF NOT EXISTS fighter_items (id TEXT PRIMARY KEY, email TEXT NOT NULL, kind TEXT NOT NULL, data TEXT NOT NULL, status TEXT NOT NULL, note TEXT, created INTEGER NOT NULL, updated INTEGER NOT NULL, mod_by TEXT, mod_at INTEGER)`,
  `CREATE INDEX IF NOT EXISTS fighter_items_email ON fighter_items(email)`,
];
const ADD_COLS = ['verified INTEGER DEFAULT 0', 'pending TEXT', 'ver_by TEXT', 'ver_at INTEGER', 'note TEXT', 'invited INTEGER'];
let ok = false;
async function ensure(env) {
  if (ok) return;
  await env.DB.batch(SCHEMA.map(q => env.DB.prepare(q)));
  for (const c of ADD_COLS) { try { await env.DB.prepare('ALTER TABLE fighters ADD COLUMN ' + c).run() } catch (e) { } }
  ok = true;
}

function ageOf(d) { if (!/^\d{4}-\d{2}-\d{2}$/.test(d || '')) return null; const b = new Date(d + 'T00:00:00Z'), n = new Date(); let a = n.getUTCFullYear() - b.getUTCFullYear(); if (n.getUTCMonth() < b.getUTCMonth() || (n.getUTCMonth() === b.getUTCMonth() && n.getUTCDate() < b.getUTCDate())) a--; return a }
const clean = (s, n = 80) => String(s ?? '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);
const url = s => { const u = clean(s, 300); return /^https?:\/\/[^\s]+\.[^\s]+/i.test(u) ? u : '' };
const ym = s => /^\d{4}-\d{2}(-\d{2})?$/.test(s || '') ? s : '';

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


// ближайшие занятия клуба для самостоятельной записи на пробное (14 дней, только будущие)
const isoTR = d => new Date(d.getTime() + 3 * 3600e3).toISOString().slice(0, 10); // Анталья, UTC+3
async function trialSlots(env, days = 14) {
  const sc = (await getDoc(env, 'club', 'schedule')) || {}, cls = sc.classes || [], co = sc.coaches || [], out = [];
  const nowTR = new Date(Date.now() + 3 * 3600e3), hhmm = nowTR.toISOString().slice(11, 16), td = nowTR.toISOString().slice(0, 10);
  for (let i = 0; i < days; i++) {
    const d = new Date(Date.parse(td + 'T12:00:00Z') + i * 864e5), ds = d.toISOString().slice(0, 10), dw = d.getUTCDay() || 7;
    for (const c of cls) { if (!(c.dow || []).includes(dw)) continue; if (ds === td && String(c.time) <= hhmm) continue;
      const k = co.find(z => z.k === c.coach); out.push({ cls: c.id, date: ds, time: c.time, disc: c.disc, dur: c.dur || 60, coach: k ? k.n : null, ck: c.coach || null, cph: k && k.photo ? '/api/my/cphoto/' + k.photo : null }) }
  }
  return out.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
}


// «Мой клуб» для членов клуба: тренеры с фото и регалиями, честная статистика клуба (без выдуманного рейтинга)
async function clubInfo(env, club) {
  const sc = (await getDoc(env, 'club', 'schedule')) || {}, cls = sc.classes || [];
  const coaches = (sc.coaches || []).map(c => ({ n: c.n, photo: c.photo ? '/api/my/cphoto/' + c.photo : null, discs: c.discs && c.discs.length ? c.discs : [...new Set(cls.filter(x => x.coach === c.k).map(x => x.disc))], titles: c.titles || [], exp: c.exp || [], bio: c.bio || '', groups: cls.filter(x => x.coach === c.k).length }));
  const td = new Date().toISOString().slice(0, 10);
  const ms = await env.DB.prepare("SELECT data FROM docs WHERE col='members' AND deleted=0").all();
  let active = 0; for (const x of ms.results || []) { try { const m = JSON.parse(x.data); if (m.kind !== 'staff' && !m.frozen && (!m.end || m.end >= td)) active++ } catch (e) { } }
  const ver = await env.DB.prepare('SELECT COUNT(*) AS n FROM fighters WHERE club=? AND verified=1 AND mid IS NOT NULL').bind(club).first();
  const it = await env.DB.prepare("SELECT i.data FROM fighter_items i JOIN fighters f ON f.email=i.email WHERE f.club=? AND i.status='ok' AND i.kind='comp'").bind(club).all();
  const med = { g: 0, s: 0, b: 0 }, comps = (it.results || []).length;
  for (const x of it.results || []) { try { const d = JSON.parse(x.data); if (d.rtype !== 'bout') { if (d.pos === '1') med.g++; else if (d.pos === '2') med.s++; else if (d.pos === '3') med.b++ } } catch (e) { } }
  return { ...(CLUBS[club] || {}), coaches, stats: { active, verified: ver ? ver.n : 0, comps, med, groups: cls.length } };
}
// полная анкета члена клуба: фото, вес, город (+ родитель для U18 уже обязателен при регистрации)
function fullMissing(p, photo) { const m = []; if (!photo) m.push('photo'); if (!p.weight) m.push('weight'); if (!p.city) m.push('city'); return m }
// пробное занятие: дата, время, группа, тренер — из заявки и расписания клуба
async function trialInfo(env, l) {
  if (!l || l.status !== 'booked' || !l.trialDate) return null;
  const sc = (await getDoc(env, 'club', 'schedule')) || {}, c = (sc.classes || []).find(z => z.id === l.trialClass) || null;
  const co = c && (sc.coaches || []).find(k => k.k === c.coach);
  return { date: l.trialDate, time: c ? c.time : (l.trialTime || null), disc: c ? c.disc : (l.trialDisc || null), dur: c ? (c.dur || 60) : null, coach: co ? co.n : null, fmt: l.fmtName || null };
}
async function leadByEmail(env, email) {
  const r = await env.DB.prepare("SELECT id,data FROM docs WHERE col='leads' AND deleted=0 AND data LIKE ?").bind('%' + email.replace(/[%_]/g, '') + '%').all();
  for (const x of r.results || []) { try { const l = JSON.parse(x.data); if (String(l.email || (l.reg && l.reg.email) || '').toLowerCase() === email && l.status === 'booked') return l } catch (e) { } }
  return null;
}
const DOW_RU = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function trialMail(to, name, clubName, t) {
  const d = new Date(t.date + 'T12:00:00'), ds = String(d.getDate()).padStart(2, '0') + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + d.getFullYear() + ' (' + DOW_RU[d.getDay()] + ')';
  const esc = v => String(v || '').replace(/[<>&"]/g, '');
  const rows = [['Дата', ds], ['Время', t.time || 'уточнит администратор'], ['Группа', t.disc || ''], ['Тренер', t.coach || '']].filter(r => r[1]);
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#15171b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#fff;border:1px solid #e3ded2;border-radius:14px;overflow:hidden">
<tr><td style="background:#111418;padding:24px 28px"><div style="color:#f4f1ea;font-size:22px;font-weight:800;letter-spacing:1px">${esc(clubName)}</div><div style="color:#e8c35a;font-size:11px;letter-spacing:2px;font-weight:700">ПРОБНОЕ ЗАНЯТИЕ</div></td></tr>
<tr><td style="padding:28px"><div style="font-size:17px;font-weight:700;margin:0 0 14px">${name ? esc(name) + ', вы' : 'Вы'} записаны на пробное занятие</div>
<table role="presentation" cellpadding="0" cellspacing="0" style="font-size:15px;margin:0 0 18px">${rows.map(r => `<tr><td style="color:#8b877d;padding:3px 16px 3px 0">${r[0]}</td><td style="font-weight:700;padding:3px 0">${esc(r[1])}</td></tr>`).join('')}</table>
<p style="font-size:14px;line-height:1.5;margin:0 0 18px">Возьмите спортивную форму, воду и полотенце. Приходите за 10 минут до начала.</p>
<a href="https://app.pitrating.com/my/" style="display:inline-block;background:#e8c35a;color:#141414;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:10px">Открыть My PIT</a>
<p style="font-size:12px;color:#8b877d;margin:18px 0 0">Если планы изменились — ответьте администратору клуба, мы перенесём занятие.</p></td></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #efeae0;font-size:11px;color:#8b877d">PIT RATING · pitrating.com</td></tr></table></td></tr></table></body></html>`;
  return { to, from: { email: 'noreply@pitrating.com', name: clubName }, subject: `Пробное занятие ${ds}${t.time ? ' в ' + t.time : ''} — ${clubName}`, html, text: `Вы записаны на пробное занятие: ${rows.map(r => r[0] + ': ' + r[1]).join(', ')}. My PIT: https://app.pitrating.com/my/` };
}
// уведомить клиента о записи на пробное (письмо); вызывает CRM после записи
export async function notifyTrial(req, env, me) {
  if (!me || !['owner', 'admin', 'trainer'].includes(me.role)) return new Response(JSON.stringify({ error: 'forbidden' }), { status: 403, headers: { 'content-type': 'application/json' } });
  const b = await req.json().catch(() => ({})), l = b.id ? await getDoc(env, 'leads', String(b.id)) : null;
  const ok = o => new Response(JSON.stringify(o), { headers: { 'content-type': 'application/json' } });
  if (!l) return ok({ sent: false, reason: 'not_found' });
  const t = await trialInfo(env, l), to = String(l.email || (l.reg && l.reg.email) || '').trim().toLowerCase();
  if (!t) return ok({ sent: false, reason: 'not_booked' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) return ok({ sent: false, reason: 'no_email' });
  try { await env.EMAIL.send(trialMail(to, String(l.name || '').trim().split(/\s+/)[0], CLUBS.mowgli.name, t)); return ok({ sent: true, to }) } catch (e) { return ok({ sent: false, reason: 'send_failed' }) }
}
async function findMember(env, email, phone) {
  const r = await env.DB.prepare("SELECT id,data FROM docs WHERE col='members' AND deleted=0").all();
  for (const x of r.results || []) {
    let m; try { m = JSON.parse(x.data) } catch (e) { continue }
    if ((m.email && String(m.email).toLowerCase() === email) || (phone && samePhone(m.phone, phone))) return { id: x.id, m };
  }
  return null;
}
const photoUrl = id => id ? '/api/my/photo/' + id : null;
const itemOut = r => { let d = {}; try { d = JSON.parse(r.data) } catch (e) { } return { id: r.id, kind: r.kind, data: d, status: r.status, note: r.note || null, updated: r.updated } };

// поля анкеты, которые подтверждает клуб (согласия — личный выбор бойца, применяются сразу)
const VERIFY_FIELDS = ['last', 'first', 'dob', 'phone', 'disc', 'kind', 'note', 'weight', 'stance', 'belt', 'city', 'photo', 'parent'];

async function view(env, email) {
  const f = await env.DB.prepare('SELECT * FROM fighters WHERE email=?').bind(email).first();
  const base = { email, clubs: Object.values(CLUBS), discs: DISCS, levels: LEVELS };
  if (!f) return { ...base, profile: null };
  const profile = JSON.parse(f.data), out = { ...base, profile, club: CLUBS[f.club] || null, verified: !!f.verified, pending: f.pending ? JSON.parse(f.pending) : null, note: f.note || null, verAt: f.ver_at || null };
  out.photo = photoUrl((out.pending && out.pending.photo) || profile.photo);
  let lead = null;
  if (f.lead) lead = await getDoc(env, 'leads', f.lead);
  if (!f.mid && lead && lead.mid && (lead.approved || lead.status === 'bought')) { f.mid = lead.mid; await env.DB.prepare('UPDATE fighters SET mid=? WHERE email=?').bind(lead.mid, email).run() }
  // одобрение регистрации даёт пробное; членство в клубе (✓ Verified) — после покупки абонемента и проверки полной анкеты в «Анкетах»
  if (f.mid) {
    const m = await getDoc(env, 'members', f.mid);
    if (m) {
      const v = await env.DB.prepare("SELECT data FROM docs WHERE col='visits' AND deleted=0").all();
      let total = 0, month = 0; const ym = new Date().toISOString().slice(0, 7);
      for (const x of v.results || []) { try { const d = JSON.parse(x.data); if (Array.isArray(d.ids) && d.ids.includes(f.mid)) { total++; if (String(d.date || '').startsWith(ym)) month++ } } catch (e) { } }
      const tl = await getDoc(env, 'club', 'tariffs'), TN = { grp12: 'Групповые · 12 занятий', kids12: 'Дети MMA · 12 занятий', ind10m: 'Индивидуальные MMA/BJJ · 10 сеансов', ind10b: 'Индивидуальные Бокс/Кикбоксинг · 10 сеансов', ind8: 'Индивидуальные · 8 сеансов', free: 'Безлимит · все дисциплины', staff: 'Безлимит' };
      const tName = k => { const t = tl && Array.isArray(tl.list) ? tl.list.find(z => z.key === k) : null; return t ? t.name : (TN[k] || k || null) };
      out.member = { name: m.first && m.last ? m.first + ' ' + m.last : m.name, plan: tName(m.plan), subs: Array.isArray(m.subs) ? m.subs.map(u => ({ plan: tName(u.plan), disc: u.disc || null, end: u.end || null, left: u.left ?? null })) : [], start: m.start || null, end: m.end || null, left: m.left ?? null, frozen: !!m.frozen, disc: m.disc || null, visits: { total, month } };
    }
  }
  const tl = lead && lead.status === 'booked' ? lead : (!f.mid ? await leadByEmail(env, email) : null);
  out.trial = await trialInfo(env, tl);
  if (!f.mid && lead && !lead.rejected && ['new', 'booked', 'think', 'done'].includes(lead.status || 'new')) out.slots = await trialSlots(env);
  // шаги клиента: регистрация → пробное → абонемент → полная анкета → проверка клубом → доступ ко всему клубу и My PIT World
  out.missing = fullMissing(profile, out.photo);
  out.submitted = profile.submittedAt || null;
  out.access = !!(f.mid && f.verified);
  if (out.access) { out.schedule = await trialSlots(env, 14); out.clubInfo = await clubInfo(env, f.club) }
  if (lead) out.lead = { status: lead.rejected ? 'rejected' : (!lead.approved && (lead.status || 'new') === 'new') ? 'pending' : (lead.status || 'new'), trialDate: lead.trialDate || null };
  const it = await env.DB.prepare('SELECT * FROM fighter_items WHERE email=? ORDER BY created DESC').bind(email).all();
  out.items = (it.results || []).map(itemOut);
  return out;
}

function validItem(kind, d) {
  d = d || {};
  if (kind === 'comp') {
    const o = {
      date: ym(d.date), name: clean(d.name, 120), place: clean(d.place, 80), org: clean(d.org, 80), disc: clean(d.disc, 40), weight: clean(d.weight, 30),
      level: LEVELS.includes(d.level) ? d.level : 'club', rtype: d.rtype === 'bout' ? 'bout' : 'place',
      pos: ['1', '2', '3', 'part'].includes(String(d.pos)) ? String(d.pos) : 'part', res: ['W', 'L', 'D'].includes(d.res) ? d.res : '', method: clean(d.method, 40), opp: clean(d.opp, 80),
      link: url(d.link), desc: clean(d.desc, 500),
    };
    if (!o.name || !o.date) return null;
    if (o.rtype === 'bout' && !o.res) return null;
    return o;
  }
  if (kind === 'title') { const o = { name: clean(d.name, 120), year: /^\d{4}$/.test(d.year || '') ? d.year : '', org: clean(d.org, 80), link: url(d.link), desc: clean(d.desc, 300) }; return o.name ? o : null }
  if (kind === 'club') { const o = { name: clean(d.name, 80), city: clean(d.city, 60), from: ym(d.from), to: ym(d.to), desc: clean(d.desc, 200) }; return o.name ? o : null }
  if (kind === 'link') { const o = { url: url(d.url), site: clean(d.site, 40) }; return o.url ? o : null }
  return null;
}

/** email: вход по коду; staff: роль сотрудника или null */
export async function myRoutes(req, env, path, email, staff) {
  await ensure(env);
  const t = Date.now();
  if (path === '/api/my' && req.method === 'GET') return json(await view(env, email));

  // фото анкеты: владелец и сотрудники клуба
  const pm = path.match(/^\/api\/my\/photo\/([a-f0-9]{32})$/);
  if (pm && req.method === 'GET') {
    const own = await env.DB.prepare('SELECT 1 AS x FROM files WHERE id=? AND by=?').bind(pm[1], email).first();
    if (!own && !staff) return new Response('Not found', { status: 404 });
    const o = env.FILES ? await env.FILES.get(pm[1]) : null;
    if (!o) return new Response('Not found', { status: 404 });
    return new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType || 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
  }
  const cp = path.match(/^\/api\/my\/cphoto\/([a-f0-9]{32})$/);
  if (cp && req.method === 'GET') {
    const sc = (await getDoc(env, 'club', 'schedule')) || {};
    if (!(sc.coaches || []).some(c => c.photo === cp[1]) || !env.FILES) return new Response('Not found', { status: 404 });
    const o = await env.FILES.get(cp[1]);
    if (!o) return new Response('Not found', { status: 404 });
    return new Response(o.body, { headers: { 'content-type': o.httpMetadata?.contentType || 'image/jpeg', 'cache-control': 'private, max-age=86400' } });
  }
  if (req.method !== 'POST') return json({ error: 'not_found' }, 404);
  const cur = await env.DB.prepare('SELECT * FROM fighters WHERE email=?').bind(email).first();

  if (path === '/api/my/submit') {
    if (!cur) return json({ error: 'profile' }, 403);
    if (!cur.mid) return json({ error: 'no_member' }, 409);
    const d = JSON.parse(cur.data), miss = fullMissing(d, d.photo ? 1 : 0);
    if (miss.length) return json({ error: 'incomplete', missing: miss }, 400);
    await env.DB.prepare('UPDATE fighters SET data=?,note=NULL,updated=? WHERE email=?').bind(JSON.stringify({ ...d, submittedAt: new Date().toISOString() }), t, email).run();
    return json({ ok: true, ...(await view(env, email)) });
  }

  if (path === '/api/my/trial') {
    if (!cur || !cur.lead) return json({ error: 'profile' }, 403);
    const l = await getDoc(env, 'leads', cur.lead);
    if (!l || l.rejected || !['new', 'booked', 'think', 'done'].includes(l.status || 'new')) return json({ error: 'closed' }, 409);
    const b = await req.json().catch(() => ({})), at = new Date().toISOString();
    const touch = text => [...(Array.isArray(l.touches) ? l.touches : []), { at, by: email, ch: 'My PIT', text }];
    if (b.cancel === true) {
      if (l.status !== 'booked') return json({ error: 'not_booked' }, 409);
      await env.DB.batch([putDoc(env, 'leads', cur.lead, { ...l, status: 'new', trialDate: null, trialClass: null, trialTime: null, trialDisc: null, trialBy: null, trialAt: at, touches: touch('Клиент отменил запись на пробное ' + (l.trialDate || '')) }, 'pit:' + email)]);
      return json({ ok: true, ...(await view(env, email)) });
    }
    const sl = (await trialSlots(env, 21)).find(z => z.cls === String(b.cls || '') && z.date === String(b.date || ''));
    if (!sl) return json({ error: 'slot' }, 400);
    const nl = { ...l, status: 'booked', trialDate: sl.date, trialClass: sl.cls, trialTime: sl.time, trialDisc: sl.disc, trialBy: 'client', trialAt: at, trialNotified: { at, to: email, ch: 'email' }, touches: touch(`Клиент сам выбрал пробное: ${sl.date} ${sl.time} · ${sl.disc}`) };
    await env.DB.batch([putDoc(env, 'leads', cur.lead, nl, 'pit:' + email)]);
    try { const tI = await trialInfo(env, nl); if (tI) await env.EMAIL.send(trialMail(email, String(l.name || '').trim().split(/\s+/)[0], CLUBS.mowgli.name, tI)) } catch (e) { }
    return json({ ok: true, ...(await view(env, email)) });
  }

  if (path === '/api/my/photo') {
    if (!cur) return json({ error: 'profile' }, 403);
    if (!env.FILES) return json({ error: 'files_off' }, 503);
    const type = (req.headers.get('content-type') || '').split(';')[0];
    if (!/^image\/(jpeg|png|webp)$/.test(type)) return json({ error: 'unsupported_type' }, 415);
    const buf = await req.arrayBuffer();
    if (buf.byteLength > 5 * 1024 * 1024) return json({ error: 'too_large' }, 413);
    const id = crypto.randomUUID().replace(/-/g, '');
    await env.FILES.put(id, buf, { httpMetadata: { contentType: type } });
    await env.DB.prepare('INSERT INTO files(id,type,size,by,at) VALUES(?,?,?,?,?)').bind(id, type, buf.byteLength, email, now()).run();
    if (cur.verified) { const p = cur.pending ? JSON.parse(cur.pending) : {}; p.photo = id; await env.DB.prepare('UPDATE fighters SET pending=?,updated=? WHERE email=?').bind(JSON.stringify(p), t, email).run() }
    else { const d = JSON.parse(cur.data); d.photo = id; await env.DB.prepare('UPDATE fighters SET data=?,updated=? WHERE email=?').bind(JSON.stringify(d), t, email).run() }
    return json({ ok: true, ...(await view(env, email)) });
  }

  if (path === '/api/my/item') {
    if (!cur) return json({ error: 'profile' }, 403);
    const b = await req.json().catch(() => ({}));
    if (!KINDS.includes(b.kind)) return json({ error: 'kind' }, 400);
    const d = validItem(b.kind, b.data);
    if (!d) return json({ error: 'item' }, 400);
    if (b.id) {
      const r = await env.DB.prepare('SELECT id FROM fighter_items WHERE id=? AND email=?').bind(b.id, email).first();
      if (!r) return json({ error: 'not_found' }, 404);
      await env.DB.prepare("UPDATE fighter_items SET data=?,status='pending',note=NULL,updated=? WHERE id=?").bind(JSON.stringify(d), t, b.id).run();
    } else {
      const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM fighter_items WHERE email=?').bind(email).first();
      if ((n?.n || 0) >= 300) return json({ error: 'limit' }, 429);
      await env.DB.prepare("INSERT INTO fighter_items(id,email,kind,data,status,created,updated) VALUES(?,?,?,?,'pending',?,?)").bind('i' + t.toString(36) + crypto.randomUUID().slice(0, 6), email, b.kind, JSON.stringify(d), t, t).run();
    }
    return json({ ok: true, ...(await view(env, email)) });
  }
  if (path === '/api/my/item/del') {
    const b = await req.json().catch(() => ({}));
    await env.DB.prepare('DELETE FROM fighter_items WHERE id=? AND email=?').bind(String(b.id || ''), email).run();
    return json({ ok: true, ...(await view(env, email)) });
  }
  if (path !== '/api/my') return json({ error: 'not_found' }, 404);
  const b = await req.json().catch(() => ({}));

  // удалить мои данные (GDPR / KVKK): анкета, достижения, незакрытая заявка и все сессии
  if (b.delete === true) {
    const st = [env.DB.prepare('DELETE FROM fighters WHERE email=?').bind(email), env.DB.prepare('DELETE FROM fighter_items WHERE email=?').bind(email), env.DB.prepare('DELETE FROM sessions WHERE email=?').bind(email)];
    if (cur && cur.lead) { const l = await getDoc(env, 'leads', cur.lead); if (l && (l.status || 'new') === 'new') st.push(delDoc(env, 'leads', cur.lead, 'pit:' + email)) }
    await env.DB.batch(st);
    return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json', 'set-cookie': 'pit_sess=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0' } });
  }

  const p = b.profile || {};
  const last = clean(p.last, 60), first = clean(p.first, 60), dob = clean(p.dob, 10), phone = clean(p.phone, 24), disc = DISCS.includes(p.disc) ? p.disc : 'MMA';
  const club = CLUBS[p.club] ? p.club : (cur && cur.club) || null, kind = p.kind === 'ind' ? 'ind' : 'group';
  const age = ageOf(dob);
  if (!last || !first) return json({ error: 'name' }, 400);
  if (age == null || age < 4 || age > 90) return json({ error: 'dob' }, 400);
  if (digits(phone).length < 9) return json({ error: 'phone' }, 400);
  if (!club) return json({ error: 'club' }, 400);
  if (p.consentData !== true) return json({ error: 'consent' }, 400);
  const minor = age < 18;
  const parent = minor ? { name: clean(p.parent?.name, 80), phone: clean(p.parent?.phone, 24) } : null;
  if (minor && (!parent.name || digits(parent.phone).length < 9 || p.parentConsent !== true)) return json({ error: 'parent' }, 400);
  const prev = cur ? JSON.parse(cur.data) : {};
  const fields = {
    last, first, dob, phone, disc, kind, note: clean(p.note, 300), weight: clean(p.weight, 20), stance: clean(p.stance, 20), belt: clean(p.belt, 30), city: clean(p.city, 60), parent,
  };
  const consents = { consentData: true, photoConsent: p.photoConsent === true, consentPublic: p.consentPublic === true, consentMsg: p.consentMsg === true, parentConsent: minor ? true : null, lang: clean(p.lang, 2) || 'ru' };
  const stmts = [];
  let data, pending = cur && cur.pending ? JSON.parse(cur.pending) : null;
  if (cur && cur.verified) {
    // анкета уже подтверждена клубом: правки бойца ждут подтверждения, действует прежняя версия
    pending = { ...(pending || {}) };
    const nv = v => (v == null || v === '' ? null : v);
    for (const k of Object.keys(fields)) { if (JSON.stringify(nv(fields[k])) !== JSON.stringify(nv(prev[k]))) pending[k] = fields[k]; else delete pending[k] }
    if (!Object.keys(pending).length) pending = null;
    data = { ...prev, ...consents, club, updatedAt: now() };
  } else {
    data = { ...prev, ...fields, ...consents, club, updatedAt: now(), createdAt: prev.createdAt || now() };
  }
  let mid = cur?.mid || null, lead = cur?.lead || null;
  if (!mid && !lead) {
    // регистрация → заявка на одобрение; совпадение с бойцом CRM — подсказка админу
    const hit = await findMember(env, email, phone);
    lead = 'pit' + (await sha(email)).slice(0, 18);
    stmts.push(putDoc(env, 'leads', lead, {
      name: first + ' ' + last, phone, email, disc, kind, age: String(age), source: 'PIT · регистрация', status: 'new', by: 'PIT',
      note: (minor ? `U18 · родитель: ${parent.name}, ${parent.phone}. ` : '') + (fields.note || ''), ts: now(), pit: true, approved: false,
      match: hit ? { id: hit.id, name: hit.m.first && hit.m.last ? hit.m.first + ' ' + hit.m.last : hit.m.name } : null,
      reg: { first, last, dob, phone, email, parent },
    }, 'pit:' + email));
  } else if (lead && !(cur && cur.verified)) {
    const l = await getDoc(env, 'leads', lead);
    if (l && (l.status || 'new') === 'new') stmts.push(putDoc(env, 'leads', lead, { ...l, name: first + ' ' + last, phone, disc, kind, age: String(age), reg: { first, last, dob, phone, email, parent } }, 'pit:' + email));
  }
  stmts.push(env.DB.prepare(`INSERT INTO fighters(email,data,club,mid,lead,created,updated,pending) VALUES(?,?,?,?,?,?,?,?)
    ON CONFLICT(email) DO UPDATE SET data=excluded.data,club=excluded.club,mid=excluded.mid,lead=excluded.lead,updated=excluded.updated,pending=excluded.pending`)
    .bind(email, JSON.stringify(data), club, mid, lead, cur?.created || t, t, pending ? JSON.stringify(pending) : null));
  await env.DB.batch(stmts);
  return json({ ok: true, ...(await view(env, email)) });
}

/* ===== Проверка анкет клубом (владелец и администратор) ===== */
function inviteMail(to, name, clubName) {
  const html = `<!doctype html><html><body style="margin:0;background:#f4f1ea;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#15171b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:32px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:460px;background:#fff;border:1px solid #e3ded2;border-radius:14px;overflow:hidden">
<tr><td style="background:#111418;padding:24px 28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:14px;vertical-align:middle"><img src="https://app.pitrating.com/brand/mail-mark.png" width="34" height="42" alt="" style="display:block;border:0"></td>
<td style="vertical-align:middle"><div style="color:#f4f1ea;font-size:26px;line-height:26px;font-weight:800;letter-spacing:1px">MY PIT</div><div style="color:#e8c35a;font-size:11px;line-height:16px;font-weight:700;letter-spacing:5px;margin-top:3px">FIGHTER</div></td></tr></table></td></tr>
<tr><td style="padding:28px"><div style="font-size:17px;font-weight:700;margin:0 0 12px">${name ? name.replace(/[<>&"]/g, '') + ', в' : 'В'}аш клуб ${clubName} приглашает вас в My PIT</div>
<p style="font-size:14px;line-height:1.5;margin:0 0 18px">Ваша анкета бойца уже создана клубом. Войдите, проверьте данные, добавьте медали и соревнования — клуб подтвердит их, и рядом с вашим именем появится ✓ Verified.</p>
<a href="https://app.pitrating.com/my/" style="display:inline-block;background:#e8c35a;color:#141414;text-decoration:none;font-weight:800;padding:12px 22px;border-radius:10px">Открыть My PIT</a>
<p style="font-size:12px;color:#8b877d;margin:18px 0 0">Вход — по коду, который придёт на этот e-mail. Пароль не нужен. Если вы не ждали это письмо — просто проигнорируйте его.</p></td></tr>
<tr><td style="padding:14px 28px;border-top:1px solid #efeae0;font-size:11px;color:#8b877d">PIT RATING · Performance Index of Training · pitrating.com</td></tr></table></td></tr></table></body></html>`;
  return { to, from: { email: 'noreply@pitrating.com', name: 'PIT RATING' }, subject: `${clubName} приглашает вас в My PIT`, html, text: `${clubName} приглашает вас в My PIT: https://app.pitrating.com/my/ — вход по коду на этот e-mail.` };
}

export async function reviewRoutes(req, env, path, me) {
  await ensure(env);
  if (!(me.role === 'owner' || me.role === 'admin')) return json({ error: 'forbidden' }, 403);
  const t = Date.now(), club = env.CLUB || 'mowgli', by = me.email;

  if (path === '/api/review' && req.method === 'GET') {
    const fs = await env.DB.prepare('SELECT email,data,mid,lead,verified,pending,note,ver_at,invited,updated FROM fighters WHERE club=? ORDER BY updated DESC').bind(club).all();
    const its = await env.DB.prepare("SELECT i.* FROM fighter_items i JOIN fighters f ON f.email=i.email WHERE f.club=? ORDER BY i.created DESC").bind(club).all();
    const byE = {};
    for (const r of its.results || []) (byE[r.email] = byE[r.email] || []).push(itemOut(r));
    const list = (fs.results || []).map(f => {
      const d = JSON.parse(f.data), pend = f.pending ? JSON.parse(f.pending) : null, items = byE[f.email] || [];
      return {
        email: f.email, name: `${d.last || ''} ${d.first || ''}`.trim(), profile: d, pending: pend, verified: !!f.verified, mid: f.mid, lead: f.lead, invited: !!f.invited, note: f.note,
        photo: photoUrl((pend && pend.photo) || d.photo), items, pendingItems: items.filter(i => i.status === 'pending').length, updated: f.updated,
      };
    });
    list.forEach(x => { x.full = !x.verified && !!x.mid && !!x.profile.submittedAt });
    const todo = list.filter(x => (x.verified && x.pending) || x.pendingItems || x.full);
    return json({ todo, all: list, counts: { full: todo.filter(x => x.full).length, todo: todo.length, items: todo.reduce((a, x) => a + x.pendingItems, 0), verified: list.filter(x => x.verified).length } });
  }

  if (path === '/api/review' && req.method === 'POST') {
    const b = await req.json().catch(() => ({})), note = clean(b.note, 300) || null;
    if (b.item) {
      const it = await env.DB.prepare('SELECT i.id FROM fighter_items i JOIN fighters f ON f.email=i.email WHERE i.id=? AND f.club=?').bind(String(b.item), club).first();
      if (!it) return json({ error: 'not_found' }, 404);
      await env.DB.prepare('UPDATE fighter_items SET status=?,note=?,mod_by=?,mod_at=?,updated=? WHERE id=?').bind(b.act === 'ok' ? 'ok' : 'rejected', b.act === 'ok' ? null : note, by, t, t, it.id).run();
      return json({ ok: true });
    }
    const f = await env.DB.prepare('SELECT * FROM fighters WHERE email=? AND club=?').bind(String(b.email || ''), club).first();
    if (!f) return json({ error: 'not_found' }, 404);
    if (b.act === 'profile_no') {
      const dd = JSON.parse(f.data); delete dd.submittedAt;
      await env.DB.prepare('UPDATE fighters SET data=?,pending=NULL,note=?,updated=? WHERE email=?').bind(JSON.stringify(dd), note || 'Изменения не подтверждены клубом', t, f.email).run();
      return json({ ok: true });
    }
    if (b.act === 'profile_ok' || b.act === 'all_ok') {
      const d = { ...JSON.parse(f.data), ...(f.pending ? JSON.parse(f.pending) : {}) };
      const st = [env.DB.prepare('UPDATE fighters SET data=?,pending=NULL,verified=1,ver_by=?,ver_at=?,note=NULL,updated=? WHERE email=?').bind(JSON.stringify(d), by, t, t, f.email)];
      if (b.act === 'all_ok') st.push(env.DB.prepare("UPDATE fighter_items SET status='ok',note=NULL,mod_by=?,mod_at=?,updated=? WHERE email=? AND status='pending'").bind(by, t, t, f.email));
      // подтверждённые данные переносим в карточку бойца CRM
      if (f.mid) {
        const m = await getDoc(env, 'members', f.mid);
        if (m) {
          const upd = { ...m, last: d.last, first: d.first, name: `${d.first} ${d.last}`.trim(), dob: d.dob || m.dob, phone: d.phone || m.phone, email: m.email || f.email };
          if (d.parent && d.parent.name) upd.parent = { ...(m.parent || {}), name: d.parent.name, phone: d.parent.phone };
          if (d.consentPublic != null) upd.consentPublic = d.consentPublic ? 'yes' : 'no';
          st.push(putDoc(env, 'members', f.mid, upd, by));
        }
      }
      await env.DB.batch(st);
      return json({ ok: true });
    }
    return json({ error: 'bad_action' }, 400);
  }

  // пригласить бойцов клуба в My PIT: анкета создаётся из карточки CRM (данные клуба уже подтверждены)
  if (path === '/api/review/invite' && req.method === 'POST') {
    const b = await req.json().catch(() => ({}));
    const r = await env.DB.prepare("SELECT id,data FROM docs WHERE col='members' AND deleted=0").all();
    const ms = (r.results || []).map(x => { let m = {}; try { m = JSON.parse(x.data) } catch (e) { } return { id: x.id, m } })
      .filter(({ id, m }) => (b.all || id === b.mid) && m.kind !== 'staff' && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(m.email || '').trim()));
    let sent = 0, skipped = 0;
    for (const { id, m } of ms) {
      const email = String(m.email).trim().toLowerCase();
      const ex = await env.DB.prepare('SELECT email,invited FROM fighters WHERE email=?').bind(email).first();
      if (ex && (ex.invited || b.all)) { skipped++; continue }
      if (!ex) {
        const parts = String(m.name || '').trim().split(/\s+/), last = m.last || (parts.length > 1 ? parts[parts.length - 1] : '') || '', first = m.first || (parts.length > 1 ? parts.slice(0, -1).join(' ') : parts[0]) || '';
        const d = { last, first, dob: m.dob || '', phone: m.phone || '', disc: m.disc || 'MMA', kind: m.kind === 'ind' ? 'ind' : 'group', club, consentData: false, invitedBy: by, createdAt: now() };
        if (m.parent && m.parent.name) d.parent = { name: m.parent.name, phone: m.parent.phone || '' };
        await env.DB.prepare('INSERT INTO fighters(email,data,club,mid,created,updated,verified,ver_by,ver_at,invited) VALUES(?,?,?,?,?,?,1,?,?,1)').bind(email, JSON.stringify(d), club, id, t, t, by, t).run();
      } else await env.DB.prepare('UPDATE fighters SET invited=1,mid=COALESCE(mid,?) WHERE email=?').bind(id, email).run();
      try { await env.EMAIL.send(inviteMail(email, m.first || String(m.name || '').split(/\s+/).slice(-1)[0], CLUBS[club]?.name || 'Клуб')); sent++ } catch (e) { skipped++ }
    }
    return json({ ok: true, sent, skipped, noEmail: b.all ? (r.results || []).length - ms.length : undefined });
  }
  return json({ error: 'not_found' }, 404);
}
