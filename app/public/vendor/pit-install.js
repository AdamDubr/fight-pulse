/* PIT RATING · установка приложения на телефон.
   Android/Chrome/Edge/Samsung — кнопка «Установить» (системное окно). iPhone/iPad Safari — подсказка «Поделиться → На экран Домой».
   Подключение: <script src="/vendor/pit-install.js" defer></script>; без подсказки: data-noprompt */
(function () {
  'use strict';
  if ('serviceWorker' in navigator) addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => { }));
  const me = document.currentScript;
  if (me && me.hasAttribute('data-noprompt')) return;
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  if (standalone) return;
  const ua = navigator.userAgent, ios = /iPhone|iPad|iPod/.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const iosSafari = ios && /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS|YaBrowser|Instagram|FBAN|FBAV|Line\//.test(ua);
  const inApp = /Instagram|FBAN|FBAV|Line\/|Telegram/.test(ua);
  const L = (() => { try { const s = localStorage.getItem('pit.lang'); if (s) return s } catch (e) { } return (document.documentElement.lang || navigator.language || 'ru').slice(0, 2) })();
  const T = {
    ru: { t: 'Установите PIT RATING', s: 'Приложение на экране телефона — открывается в одно касание, без браузера.', b: 'Установить', later: 'Не сейчас', ios1: 'Нажмите', ios2: '«Поделиться»', ios3: 'внизу экрана, затем', ios4: '«На экран Домой»', inapp: 'Откройте эту страницу в Safari или Chrome, чтобы установить приложение.' },
    en: { t: 'Install PIT RATING', s: 'The app on your home screen — opens in one tap, no browser.', b: 'Install', later: 'Not now', ios1: 'Tap', ios2: '“Share”', ios3: 'at the bottom, then', ios4: '“Add to Home Screen”', inapp: 'Open this page in Safari or Chrome to install the app.' },
    tr: { t: 'PIT RATING’i yükleyin', s: 'Uygulama ana ekranınızda — tek dokunuşla, tarayıcısız açılır.', b: 'Yükle', later: 'Şimdi değil', ios1: 'Alttaki', ios2: '“Paylaş”', ios3: 'simgesine, sonra', ios4: '“Ana Ekrana Ekle”', inapp: 'Uygulamayı yüklemek için bu sayfayı Safari veya Chrome’da açın.' },
  }[L] || null;
  const t = T || { t: 'Install PIT RATING', s: '', b: 'Install', later: 'Not now', ios1: 'Tap', ios2: '“Share”', ios3: 'then', ios4: '“Add to Home Screen”', inapp: 'Open in Safari or Chrome to install.' };
  const KEY = 'pit.install.later', snooze = () => { try { localStorage.setItem(KEY, String(Date.now())) } catch (e) { } };
  const snoozed = () => { try { return Date.now() - (+localStorage.getItem(KEY) || 0) < 5 * 864e5 } catch (e) { return false } };
  const mobile = /Android|iPhone|iPad|iPod|Mobile/.test(ua) || (navigator.maxTouchPoints > 1 && innerWidth < 1100);
  const SHARE = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg>';
  const ADD = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" style="vertical-align:-3px"><rect x="4" y="4" width="16" height="16" rx="4"/><path d="M12 8v8M8 12h8"/></svg>';
  function sheet(body, onOk) {
    if (document.getElementById('pitInst')) return;
    const d = document.createElement('div'); d.id = 'pitInst'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', t.t);
    d.style.cssText = 'position:fixed;left:50%;bottom:calc(env(safe-area-inset-bottom,0px) + 14px);transform:translateX(-50%);z-index:2147483000;width:min(26rem,calc(100vw - 24px));background:#121418;color:#f3f1ec;border:1px solid rgba(232,195,90,.55);border-radius:18px;box-shadow:0 18px 50px rgba(0,0,0,.45);padding:14px 14px 12px;font:15px/1.45 Montserrat,system-ui,-apple-system,sans-serif;animation:pitInUp .35s ease-out';
    d.innerHTML = `<style>@keyframes pitInUp{from{transform:translate(-50%,30px);opacity:0}}#pitInst button{font:inherit;font-weight:700;border-radius:10px;padding:.6rem 1rem;cursor:pointer}</style>
      <div style="display:flex;gap:12px;align-items:center"><img src="/brand/icon-192.png" alt="" width="52" height="52" style="border-radius:12px;flex:none"><div style="min-width:0"><b style="display:block;font-size:1rem">${t.t}</b><span style="color:#a3a19b;font-size:.84rem">${t.s}</span></div></div>
      <div style="margin-top:10px">${body}</div>
      <div style="display:flex;gap:8px;justify-content:flex-end;margin-top:10px"><button type="button" data-x style="background:none;border:1px solid #363b44;color:#f3f1ec">${t.later}</button>${onOk ? `<button type="button" data-ok style="border:1px solid #e8c35a;background:linear-gradient(180deg,#f3dc95,#e8c35a);color:#16130a">${t.b}</button>` : ''}</div>`;
    document.body.appendChild(d);
    d.querySelector('[data-x]').onclick = () => { snooze(); d.remove() };
    if (onOk) d.querySelector('[data-ok]').onclick = () => { d.remove(); onOk() };
  }
  let deferred = null;
  addEventListener('beforeinstallprompt', e => {
    e.preventDefault(); deferred = e;
    if (snoozed() || !mobile) return;
    setTimeout(() => sheet('', async () => { try { deferred.prompt(); const r = await deferred.userChoice; if (r.outcome !== 'accepted') snooze() } catch (x) { } deferred = null }), 1500);
  });
  addEventListener('appinstalled', () => { const d = document.getElementById('pitInst'); if (d) d.remove() });
  if (iosSafari && !snoozed()) setTimeout(() => sheet(`<div style="background:#1b1f25;border-radius:12px;padding:10px 12px;font-size:.9rem">${t.ios1} <b style="color:#e8c35a">${SHARE} ${t.ios2}</b> ${t.ios3} <b style="color:#e8c35a">${ADD} ${t.ios4}</b></div>`), 1800);
  else if (ios && inApp && !snoozed()) setTimeout(() => sheet(`<div style="font-size:.9rem;color:#a3a19b">${t.inapp}</div>`), 1800);
  // ручной вызов из меню: PITInstall.open()
  window.PITInstall = { open() { if (deferred) { deferred.prompt(); return } if (ios) { try { localStorage.removeItem(KEY) } catch (e) { } sheet(`<div style="background:#1b1f25;border-radius:12px;padding:10px 12px;font-size:.9rem">${t.ios1} <b style="color:#e8c35a">${SHARE} ${t.ios2}</b> ${t.ios3} <b style="color:#e8c35a">${ADD} ${t.ios4}</b></div>`) } else sheet(`<div style="font-size:.9rem;color:#a3a19b">${L === 'ru' ? 'Откройте меню браузера (⋮) и выберите «Установить приложение» или «Добавить на главный экран».' : 'Open the browser menu (⋮) and choose “Install app” or “Add to Home screen”.'}</div>`) } };
})();
