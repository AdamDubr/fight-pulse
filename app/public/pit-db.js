/* PIT RATING — клиент базы app.pitrating.com.
   Повторяет интерфейс, которым пользуется PIT CRM (collection/doc/onSnapshot/set/update/delete),
   поверх API /api/sync и /api/write. Синхронизация — опрос раз в 3 секунды и сразу после записи. */
(function () {
  'use strict';
  const store = {};            // col -> Map(id -> data)
  const colSubs = {};          // col -> [cb]
  const docSubs = {};          // 'col/id' -> [cb]
  const errSubs = [];
  let since = 0, timer = null, busy = false, ME = null, started = false;

  const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));
  const col = c => store[c] || (store[c] = new Map());
  const genId = () => (Date.now().toString(36) + Math.random().toString(36).slice(2, 10));

  function emitCol(c) {
    const docs = [...col(c).entries()].map(([id, d]) => ({ id, data: () => clone(d), exists: true }));
    (colSubs[c] || []).forEach(cb => { try { cb({ docs, size: docs.length, empty: !docs.length }) } catch (e) { console.error(e) } });
  }
  function emitDoc(c, id) {
    const d = col(c).get(id);
    (docSubs[c + '/' + id] || []).forEach(cb => { try { cb({ id, exists: d !== undefined, data: () => clone(d) }) } catch (e) { console.error(e) } });
  }

  async function api(path, opts) {
    const r = await fetch(path, { credentials: 'same-origin', cache: 'no-store', ...opts });
    if (r.status === 401) { location.reload(); throw Object.assign(new Error('unauthorized'), { code: 'unauthorized' }) }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.error === 'forbidden' ? 'нет прав: касса и отчёты — только администратор' : (j.error || ('HTTP ' + r.status))), { code: j.error, status: r.status });
    return j;
  }

  async function sync() {
    if (busy) return; busy = true;
    try {
      let more = true;
      while (more) {
        const j = await api('/api/sync?since=' + since);
        const touchedC = new Set(), touchedD = new Set();
        for (const x of j.docs) {
          if (x.d === null) col(x.c).delete(x.i); else col(x.c).set(x.i, x.d);
          touchedC.add(x.c); touchedD.add(x.c + '/' + x.i);
        }
        since = j.since; more = j.more;
        if (!started) { Object.keys(colSubs).forEach(emitCol); Object.keys(docSubs).forEach(k => { const i = k.indexOf('/'); emitDoc(k.slice(0, i), k.slice(i + 1)) }) }
        else { touchedC.forEach(emitCol); touchedD.forEach(k => { const i = k.indexOf('/'); emitDoc(k.slice(0, i), k.slice(i + 1)) }) }
        started = true;
      }
    } catch (e) { errSubs.forEach(f => f(e)) }
    finally { busy = false }
  }
  function loop() { clearTimeout(timer); timer = setTimeout(async () => { if (!document.hidden) await sync(); loop() }, 3000) }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) sync() });

  async function write(op, c, id, data) {
    // сразу показываем у себя, потом сервер
    const prev = col(c).has(id) ? clone(col(c).get(id)) : undefined;
    if (op === 'delete') col(c).delete(id);
    else if (op === 'update') col(c).set(id, { ...(prev || {}), ...clone(data) });
    else col(c).set(id, clone(data));
    emitCol(c); emitDoc(c, id);
    try { await api('/api/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op, col: c, id, data }) }) }
    catch (e) {
      if (prev === undefined) col(c).delete(id); else col(c).set(id, prev);
      emitCol(c); emitDoc(c, id); throw e;
    }
    sync();
  }

  function docRef(c, id) {
    return {
      id,
      set: d => write('set', c, id, d),
      update: d => write('update', c, id, d),
      delete: () => write('delete', c, id),
      get: async () => { if (!started) await sync(); const d = col(c).get(id); return { id, exists: d !== undefined, data: () => clone(d) } },
      onSnapshot(cb, err) { (docSubs[c + '/' + id] = docSubs[c + '/' + id] || []).push(cb); if (err) errSubs.push(err); if (started) emitDoc(c, id) }
    };
  }
  const db = {
    collection: c => ({
      doc: id => docRef(c, id || genId()),
      onSnapshot(cb, err) { (colSubs[c] = colSubs[c] || []).push(cb); if (err) errSubs.push(err); if (started) emitCol(c) }
    }),
    doc: path => { const i = path.indexOf('/'); return docRef(path.slice(0, i), path.slice(i + 1)) }
  };

  const assets = {
    async upload(file, opts) {
      const type = (opts && opts.type) || file.type || 'application/octet-stream';
      const r = await fetch('/api/upload', { method: 'POST', headers: { 'content-type': type }, body: file });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(j.error || 'upload'), { code: j.error === 'too_large' ? 'too_large' : j.error === 'unsupported_type' ? 'unsupported_type' : 'upload' });
      return { id: j.id };
    }
  };
  const user = {
    id: async () => ME && ME.email,
    can: async perm => perm === 'data.write' ? !!(ME && ME.role) : true,
    profiles: async ids => api('/api/names', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ids }) })
  };
  const downloads = {
    async save({ filename, data }) {
      const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([data], { type: 'text/csv;charset=utf-8' }));
      a.download = filename; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 1000);
    }
  };

  const ready = (async () => { ME = await api('/api/me'); window.PIT_ME = ME; document.documentElement.dataset.role = ME.role || ''; await sync(); loop(); return ME })();
  async function push(c, id, field, value, base, max) {
    await api('/api/write', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ op: 'push', col: c, id, field, value, base, max }) });
    sync();
  }
  window.PIT = { ready, sync, push };
  window.claude = {
    use: async k => { await ready; return ({ db, assets, user, downloads })[k] || null }
  };
})();
