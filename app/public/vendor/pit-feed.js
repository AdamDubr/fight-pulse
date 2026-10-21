/* PIT · лента My PIT World. Общий модуль для /world/ (клуб, модерация) и /my/ (боец).
   PITFeed.mount(el, {lang:'ru'|'en'|'tr', compact:false}) */
(function () {
  'use strict';
  const T = {
    ru: { ph: 'Поделитесь тренировкой, результатом, мыслью…', photo: 'Фото', pub: 'Опубликовать', feed: 'Лента', pending: 'На проверке', hidden: 'Скрытые', more: 'Показать ещё', empty: 'Пока пусто. Будьте первым!', emptyMod: 'Здесь пусто.', club: 'Клуб', fighter: 'Боец', like: 'Нравится', del: 'Удалить', sure: 'Точно?', hide: 'Скрыть', show: 'Вернуть', approve: 'Одобрить', onCheck: 'На проверке у клуба', isHidden: 'Скрыт модератором', why_profile: 'Заполните анкету, чтобы писать в ленту.', why_approval: 'Писать в ленту можно после подтверждения клуба. Читать — уже сейчас.', sentCheck: 'Пост отправлен на проверку клубу', posted: 'Опубликовано', err: 'Не получилось. Попробуйте ещё раз', rate: 'Слишком часто. Попробуйте через час', big: 'Фото больше 8 МБ', now: 'только что', min: 'мин', h: 'ч', rules: 'Без рекламы, ссылок и оскорблений. Посты с контактами и ссылками проверяет клуб.' },
    en: { ph: 'Share a session, a result, a thought…', photo: 'Photo', pub: 'Post', feed: 'Feed', pending: 'Pending', hidden: 'Hidden', more: 'Show more', empty: 'Nothing yet. Be the first!', emptyMod: 'Nothing here.', club: 'Club', fighter: 'Fighter', like: 'Like', del: 'Delete', sure: 'Sure?', hide: 'Hide', show: 'Restore', approve: 'Approve', onCheck: 'Under club review', isHidden: 'Hidden by moderator', why_profile: 'Complete your profile to post.', why_approval: 'You can post once the club approves you. Reading is open now.', sentCheck: 'Sent to the club for review', posted: 'Posted', err: 'Something went wrong. Try again', rate: 'Too many posts. Try again in an hour', big: 'Photo is larger than 8 MB', now: 'just now', min: 'min', h: 'h', rules: 'No ads, links or insults. Posts with contacts or links are reviewed by the club.' },
    tr: { ph: 'Antrenmanını, sonucunu, düşünceni paylaş…', photo: 'Fotoğraf', pub: 'Paylaş', feed: 'Akış', pending: 'İncelemede', hidden: 'Gizli', more: 'Daha fazla', empty: 'Henüz boş. İlk sen ol!', emptyMod: 'Burada bir şey yok.', club: 'Kulüp', fighter: 'Sporcu', like: 'Beğen', del: 'Sil', sure: 'Emin misin?', hide: 'Gizle', show: 'Geri al', approve: 'Onayla', onCheck: 'Kulüp incelemesinde', isHidden: 'Moderatör gizledi', why_profile: 'Paylaşmak için profilini doldur.', why_approval: 'Kulüp onayından sonra paylaşabilirsin. Okumak şimdi açık.', sentCheck: 'Kulübe incelemeye gönderildi', posted: 'Paylaşıldı', err: 'Olmadı. Tekrar dene', rate: 'Çok sık. Bir saat sonra dene', big: 'Fotoğraf 8 MB’tan büyük', now: 'şimdi', min: 'dk', h: 'sa', rules: 'Reklam, bağlantı ve hakaret yok. İletişim veya bağlantı içeren gönderileri kulüp inceler.' },
  };
  const CSS = `.pf{display:flex;flex-direction:column;gap:.8rem}
.pf-c{background:var(--panel);border:1px solid var(--line);border-radius:1rem;padding:.9rem}
.pf-c textarea{width:100%;min-height:4.2rem;resize:vertical;font:inherit;font-size:16px;background:var(--panel-2);border:1px solid var(--line-2);border-radius:.6rem;padding:.6rem .7rem;color:var(--fg)}
.pf-row{display:flex;gap:.5rem;align-items:center;flex-wrap:wrap;margin-top:.55rem}.pf-row .sp{flex:1}
.pf-b{display:inline-flex;align-items:center;gap:.35rem;border:1px solid var(--line-2);background:var(--panel);color:inherit;border-radius:.55rem;padding:.5rem .8rem;font-family:inherit;font-weight:700;font-size:.82rem;cursor:pointer}
.pf-b.g{background:linear-gradient(180deg,#f3dc95,#e8c35a);border-color:#e8c35a;color:#16130a}.pf-b.sm{padding:.3rem .55rem;font-size:.74rem}.pf-b.d{color:#ff5a6e;border-color:rgba(255,90,110,.5);background:none}
.pf-b:disabled{opacity:.55;cursor:default}
.pf-prev{position:relative;margin-top:.55rem;display:inline-block}.pf-prev img{max-height:9rem;border-radius:.6rem;display:block}.pf-prev button{position:absolute;top:.3rem;right:.3rem}
.pf-tabs{display:flex;gap:.35rem;flex-wrap:wrap}.pf-tabs button{border:1px solid var(--line-2);background:var(--panel);color:var(--muted);border-radius:2rem;padding:.35rem .8rem;font-family:inherit;font-weight:700;font-size:.78rem;cursor:pointer}.pf-tabs button[aria-pressed=true]{color:#16130a;background:#e8c35a;border-color:#e8c35a}
.pf-p{background:var(--panel);border:1px solid var(--line);border-radius:1rem;padding:.85rem .95rem;min-width:0}
.pf-p.pf-club{border-color:rgba(232,195,90,.55)}.pf-p.off{opacity:.72;border-style:dashed}
.pf-h{display:flex;gap:.6rem;align-items:center}.pf-a{width:2.3rem;height:2.3rem;border-radius:50%;display:grid;place-items:center;flex:none;font-weight:800;background:linear-gradient(160deg,#2a2416,#14120c);color:#e8c35a;border:1px solid rgba(232,195,90,.45)}
.pf-n{min-width:0;flex:1}.pf-n b{display:block;font-size:.92rem}.pf-n small{color:var(--muted);font-size:.74rem}
.pf-k{font-size:.66rem;font-weight:800;letter-spacing:.06em;border:1px solid currentColor;border-radius:2rem;padding:.08rem .45rem;color:var(--muted)}.pf-p.pf-club .pf-k{color:#e8c35a}
.pf-t{margin:.6rem 0 0;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.5}
.pf-i{margin-top:.6rem;width:100%;max-height:30rem;object-fit:cover;border-radius:.7rem;display:block;background:var(--panel-2)}
.pf-f{display:flex;gap:.45rem;align-items:center;flex-wrap:wrap;margin-top:.6rem}.pf-f .sp{flex:1}
.pf-l{border:0;background:none;color:var(--muted);font-family:inherit;font-weight:700;font-size:.86rem;cursor:pointer;padding:.25rem .3rem;border-radius:.4rem}.pf-l.on{color:#ff5a6e}
.pf-s{font-size:.72rem;font-weight:700;color:#ffc93c;border:1px solid rgba(255,201,60,.5);border-radius:2rem;padding:.12rem .5rem}
.pf-note{color:var(--muted);font-size:.8rem;margin:0}.pf-msg{font-size:.84rem;font-weight:600;min-height:1.1rem}.pf-msg.bad{color:#ff5a6e}.pf-msg.ok{color:#3ddc84}
.pf-e{color:var(--muted);text-align:center;padding:1.4rem .5rem;font-size:.9rem}`;
  const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  async function api(u, o) { const r = await fetch(u, { cache: 'no-store', credentials: 'same-origin', ...o }); const j = await r.json().catch(() => ({})); if (!r.ok) throw Object.assign(new Error(j.error || 'err'), { code: j.error, status: r.status }); return j }
  function shrink(file) {
    return new Promise((res, rej) => {
      const img = new Image(), u = URL.createObjectURL(file);
      img.onload = () => { const k = Math.min(1, 1600 / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(u); c.toBlob(b => b ? res(b) : rej(new Error('img')), 'image/jpeg', .85) };
      img.onerror = () => { URL.revokeObjectURL(u); file.size <= 8 * 1024 * 1024 && /^image\/(jpeg|png|webp|gif)$/.test(file.type) ? res(file) : rej(new Error('img')) };
      img.src = u;
    });
  }

  function mount(el, opt) {
    opt = opt || {};
    if (!document.getElementById('pf-css')) { const s = document.createElement('style'); s.id = 'pf-css'; s.textContent = CSS; document.head.appendChild(s) }
    const L = T[opt.lang] ? opt.lang : 'ru', t = k => T[L][k];
    let tab = 'feed', D = null, posts = [], img = null, imgUrl = null, timer = null, alive = true;
    const ago = ms => { const s = (Date.now() - ms) / 1000; if (s < 60) return t('now'); if (s < 3600) return Math.floor(s / 60) + ' ' + t('min'); if (s < 86400) return Math.floor(s / 3600) + ' ' + t('h'); return new Date(ms).toLocaleDateString({ ru: 'ru-RU', en: 'en-GB', tr: 'tr-TR' }[L], { day: 'numeric', month: 'short' }) };
    function card(p) {
      const off = p.status !== 'live', ini = (p.name || '?').trim()[0] || '?';
      const st = p.status === 'pending' ? `<span class="pf-s">${t('onCheck')}${p.flag && D.mod ? ' · ' + esc(p.flag) : ''}</span>` : p.status === 'hidden' ? `<span class="pf-s">${t('isHidden')}</span>` : '';
      const acts = D.mod ? (p.status === 'pending' ? `<button class="pf-b sm g" data-m="approve">${t('approve')}</button><button class="pf-b sm" data-m="hide">${t('hide')}</button>` : p.status === 'hidden' ? `<button class="pf-b sm" data-m="show">${t('show')}</button>` : `<button class="pf-b sm" data-m="hide">${t('hide')}</button>`) + `<button class="pf-b sm d" data-m="delete">${t('del')}</button>` : p.mine ? `<button class="pf-b sm d" data-m="delete">${t('del')}</button>` : '';
      return `<article class="pf-p ${p.kind === 'club' ? 'pf-club' : ''} ${off ? 'off' : ''}" data-id="${esc(p.id)}"><div class="pf-h"><div class="pf-a" aria-hidden="true">${esc(ini.toUpperCase())}</div><div class="pf-n"><b>${esc(p.name)}</b><small>${ago(p.created)}${D.mod && p.author ? ' · ' + esc(p.author) : ''}</small></div><span class="pf-k">${p.kind === 'club' ? t('club') : t('fighter')}</span></div>
        ${p.text ? `<p class="pf-t">${esc(p.text)}</p>` : ''}${p.img ? `<img class="pf-i" src="${esc(p.img)}" alt="" loading="lazy">` : ''}
        <div class="pf-f"><button class="pf-l ${p.liked ? 'on' : ''}" data-like aria-pressed="${p.liked}" aria-label="${t('like')}">${p.liked ? '♥' : '♡'} ${p.likes || ''}</button>${st}<span class="sp"></span>${acts}</div></article>`;
    }
    function composer() {
      if (tab !== 'feed') return '';
      if (!D.canPost) return D.why ? `<div class="pf-c"><p class="pf-note">${t('why_' + D.why)}</p></div>` : '';
      return `<div class="pf-c"><textarea maxlength="1500" placeholder="${esc(t('ph'))}" id="pf-tx"></textarea>${imgUrl ? `<div class="pf-prev"><img src="${imgUrl}" alt=""><button class="pf-b sm" type="button" id="pf-rm">✕</button></div>` : ''}
        <div class="pf-row"><label class="pf-b" style="cursor:pointer">📷 ${t('photo')}<input type="file" accept="image/*" id="pf-f" hidden></label><span class="sp"></span><button class="pf-b g" type="button" id="pf-go">${t('pub')}</button></div>
        <div class="pf-msg" id="pf-m" role="status"></div>${D.mod ? '' : `<p class="pf-note">${t('rules')}</p>`}</div>`;
    }
    function render() {
      const keep = el.querySelector('#pf-tx')?.value || '';
      const c = D.counts || {};
      el.innerHTML = `<div class="pf">${D.mod ? `<div class="pf-tabs" role="group">${[['feed', t('feed')], ['pending', t('pending') + (c.pending ? ' · ' + c.pending : '')], ['hidden', t('hidden') + (c.hidden ? ' · ' + c.hidden : '')]].map(([k, n]) => `<button type="button" data-tab="${k}" aria-pressed="${tab === k}">${esc(n)}</button>`).join('')}</div>` : ''}
        ${composer()}<div class="pf" id="pf-list">${posts.map(card).join('') || `<div class="pf-e">${tab === 'feed' ? t('empty') : t('emptyMod')}</div>`}</div>
        ${posts.length >= 40 ? `<button class="pf-b" type="button" id="pf-more" style="align-self:center">${t('more')}</button>` : ''}</div>`;
      const tx = el.querySelector('#pf-tx'); if (tx) tx.value = keep;
      bind();
    }
    async function load(more) {
      const before = more && posts.length ? posts[posts.length - 1].created : '';
      const j = await api('/api/world?status=' + tab + (before ? '&before=' + before : ''));
      D = j; posts = more ? posts.concat(j.posts) : j.posts; render();
    }
    function bind() {
      el.querySelectorAll('[data-tab]').forEach(b => b.onclick = () => { tab = b.dataset.tab; load().catch(() => { }) });
      const f = el.querySelector('#pf-f'); if (f) f.onchange = async () => { const file = f.files[0]; if (!file) return; const m = el.querySelector('#pf-m'); try { img = await shrink(file); if (img.size > 8 * 1024 * 1024) throw 0; imgUrl && URL.revokeObjectURL(imgUrl); imgUrl = URL.createObjectURL(img); render() } catch (e) { img = null; m.textContent = t('big'); m.className = 'pf-msg bad' } };
      const rm = el.querySelector('#pf-rm'); if (rm) rm.onclick = () => { img = null; imgUrl && URL.revokeObjectURL(imgUrl); imgUrl = null; render() };
      const go = el.querySelector('#pf-go'); if (go) go.onclick = async () => {
        const tx = el.querySelector('#pf-tx'), m = el.querySelector('#pf-m'), text = tx.value.trim(); if (!text && !img) return;
        go.disabled = true; m.textContent = ''; m.className = 'pf-msg';
        try {
          let id = null; if (img) { const u = await api('/api/world/upload', { method: 'POST', headers: { 'content-type': img.type || 'image/jpeg' }, body: img }); id = u.id }
          const r = await api('/api/world', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text, img: id }) });
          tx.value = ''; img = null; imgUrl && URL.revokeObjectURL(imgUrl); imgUrl = null; await load();
          const m2 = el.querySelector('#pf-m'); if (m2) { m2.textContent = r.status === 'pending' ? t('sentCheck') : t('posted'); m2.className = 'pf-msg ok' }
        } catch (e) { m.textContent = e.code === 'rate' ? t('rate') : e.code === 'too_large' ? t('big') : t('err'); m.className = 'pf-msg bad'; go.disabled = false }
      };
      const mo = el.querySelector('#pf-more'); if (mo) mo.onclick = () => load(true).catch(() => { });
      el.querySelectorAll('.pf-p').forEach(a => {
        const id = a.dataset.id, p = posts.find(x => x.id === id);
        const lk = a.querySelector('[data-like]'); if (lk) lk.onclick = async () => { try { const r = await api('/api/world/like', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) }); p.liked = r.liked; p.likes = r.likes; lk.className = 'pf-l' + (r.liked ? ' on' : ''); lk.textContent = (r.liked ? '♥' : '♡') + ' ' + (r.likes || '') } catch (e) { } };
        a.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
          const act = b.dataset.m; if (act === 'delete' && !b.dataset.sure) { b.dataset.sure = 1; b.textContent = t('sure'); return }
          b.disabled = true; try { await api('/api/world/mod', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, action: act }) }); await load() } catch (e) { b.disabled = false }
        });
      });
    }
    load().catch(() => { el.innerHTML = `<div class="pf-e">${t('err')}</div>` });
    timer = setInterval(() => { if (!alive || document.hidden || tab !== 'feed' || el.querySelector('#pf-tx')?.value || img) return; api('/api/world?status=feed').then(j => { if (JSON.stringify(j.posts.map(p => p.id + p.likes + p.status)) !== JSON.stringify(posts.slice(0, 40).map(p => p.id + p.likes + p.status))) { D = j; posts = j.posts; render() } }).catch(() => { }) }, 20000);
    return { destroy() { alive = false; clearInterval(timer); el.innerHTML = '' }, reload: () => load() };
  }
  window.PITFeed = { mount };
})();
