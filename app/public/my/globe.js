/* PIT · глобус клубов для My PIT.
   Canvas + d3-geo (orthographic), суша точечной сеткой (заранее рассчитана из Natural Earth 110m), анимированный перелёт к клубу, перетаскивание пальцем/мышью.
   PITGlobe.mount(el, {clubs:[{id,name,city,lat,lon}], focus:id, onPick(club)}) → {destroy, focus(id)} */
(function () {
  'use strict';
  const GOLD = '#e8c35a';
  let DOTS = null;

  async function loadDots() {
    if (DOTS) return DOTS;
    const a = await fetch('/vendor/land-dots.json').then(r => r.json()), out = [];
    for (let i = 0; i < a.length; i += 2) out.push([a[i] / 10, a[i + 1] / 10]);
    DOTS = out; return out;
  }
  const ease = t => t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

  function mount(el, opt) {
    const clubs = opt.clubs || [];
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const cv = document.createElement('canvas');
    cv.setAttribute('role', 'img'); cv.setAttribute('aria-label', opt.label || 'Карта клубов PIT');
    cv.style.cssText = 'width:100%;height:100%;display:block;touch-action:none;cursor:grab';
    el.appendChild(cv);
    const ctx = cv.getContext('2d');
    const proj = d3.geoOrthographic().clipAngle(90).precision(.4);
    const path = d3.geoPath(proj, ctx);
    const grat = d3.geoGraticule10();
    let W = 0, H = 0, R = 0, dpr = 1, rot = [100, -20, 0], zoom = .92, raf = 0, alive = true, t0 = performance.now(), anim = null, drag = null, idle = 0;
    let dots = null;

    function size() {
      const r = el.getBoundingClientRect(); dpr = Math.min(2, devicePixelRatio || 1);
      W = Math.max(200, r.width); H = Math.max(200, r.height);
      cv.width = W * dpr; cv.height = H * dpr; R = Math.min(W, H) / 2 / 1.2 - 6;
    }
    function fly(id, ms) {
      const c = clubs.find(x => x.id === id) || clubs[0]; if (!c) return;
      const from = rot.slice(), to = [-c.lon, -c.lat + 8, 0], z0 = zoom, z1 = 1.12;
      if (reduce) { rot = to; zoom = z1; return }
      // кратчайший путь по долготе
      let dl = to[0] - from[0]; dl = ((dl + 540) % 360) - 180; to[0] = from[0] + dl;
      anim = { from, to, z0, z1, s: performance.now(), d: ms || 2600 };
    }
    function frame(now) {
      if (!alive) return;
      const t = (now - t0) / 1000;
      if (anim) {
        const k = Math.min(1, (now - anim.s) / anim.d), e = ease(k);
        rot = [anim.from[0] + (anim.to[0] - anim.from[0]) * e, anim.from[1] + (anim.to[1] - anim.from[1]) * e, 0];
        zoom = anim.z0 + (anim.z1 - anim.z0) * ease(Math.max(0, (k - .45) / .55));
        if (k >= 1) { anim = null; idle = now }
      } else if (!drag && !reduce && now - idle > 4000) rot[0] += .025;
      draw(t);
      raf = requestAnimationFrame(frame);
    }
    function draw(t) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);
      const r = R * zoom, cx = W / 2, cy = H / 2;
      proj.scale(r).translate([cx, cy]).rotate(rot);
      // атмосфера
      const g = ctx.createRadialGradient(cx, cy, r * .92, cx, cy, r * 1.18);
      g.addColorStop(0, 'rgba(232,195,90,.20)'); g.addColorStop(1, 'rgba(232,195,90,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(cx, cy, r * 1.18, 0, 7); ctx.fill();
      // океан
      const o = ctx.createRadialGradient(cx - r * .35, cy - r * .4, r * .1, cx, cy, r);
      o.addColorStop(0, '#1d2230'); o.addColorStop(1, '#0b0d12');
      ctx.fillStyle = o; ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();
      // сетка
      ctx.beginPath(); path(grat); ctx.strokeStyle = 'rgba(255,255,255,.05)'; ctx.lineWidth = .7; ctx.stroke();
      // суша — точки
      if (dots) {
        const c = proj.rotate(), lam = -c[0] * Math.PI / 180, phi = -c[1] * Math.PI / 180, sp = Math.sin(phi), cp = Math.cos(phi);
        const ds = Math.max(1, r / 210);
        for (const p of dots) {
          const la = p[1] * Math.PI / 180, lo = p[0] * Math.PI / 180;
          const cosc = sp * Math.sin(la) + cp * Math.cos(la) * Math.cos(lo - lam);
          if (cosc <= 0) continue;
          const xy = proj(p); if (!xy) continue;
          ctx.fillStyle = `rgba(232,195,90,${(.18 + .55 * cosc).toFixed(3)})`;
          ctx.fillRect(xy[0] - ds / 2, xy[1] - ds / 2, ds, ds);
        }
      }
      // блик
      const h = ctx.createRadialGradient(cx - r * .45, cy - r * .5, 0, cx - r * .45, cy - r * .5, r * .9);
      h.addColorStop(0, 'rgba(255,255,255,.07)'); h.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = h; ctx.beginPath(); path({ type: 'Sphere' }); ctx.fill();
      ctx.beginPath(); path({ type: 'Sphere' }); ctx.strokeStyle = 'rgba(232,195,90,.35)'; ctx.lineWidth = 1; ctx.stroke();
      // клубы
      for (const c of clubs) {
        const vis = d3.geoDistance([c.lon, c.lat], [-rot[0], -rot[1]]) < Math.PI / 2 - .02; if (!vis) continue;
        const xy = proj([c.lon, c.lat]); if (!xy) continue; c._xy = xy;
        for (let i = 0; i < 3; i++) {
          const k = ((t * .6 + i / 3) % 1), rr = 6 + k * 34;
          ctx.beginPath(); ctx.arc(xy[0], xy[1], rr, 0, 7); ctx.strokeStyle = `rgba(232,195,90,${(1 - k) * .75})`; ctx.lineWidth = 1.6; ctx.stroke();
        }
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 6.5, 0, 7); ctx.fillStyle = GOLD; ctx.shadowColor = GOLD; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0;
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 2.6, 0, 7); ctx.fillStyle = '#16130a'; ctx.fill();
        if (zoom > 1.04) {
          const a = Math.min(1, (zoom - 1.04) / .06), lx = xy[0] + 16, ly = xy[1] - 30;
          ctx.globalAlpha = a; ctx.font = '800 15px Montserrat, system-ui, sans-serif';
          const w1 = ctx.measureText(c.name).width; ctx.font = '600 12px Montserrat, system-ui, sans-serif';
          const w = Math.max(w1, ctx.measureText(c.city).width) + 24;
          const bx = Math.min(lx, W - w - 8);
          ctx.fillStyle = 'rgba(13,15,18,.86)'; ctx.strokeStyle = 'rgba(232,195,90,.7)'; ctx.lineWidth = 1;
          roundRect(bx, ly - 22, w, 46, 10); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#f3f1ec'; ctx.font = '800 15px Montserrat, system-ui, sans-serif'; ctx.fillText(c.name, bx + 12, ly - 2);
          ctx.fillStyle = GOLD; ctx.font = '600 12px Montserrat, system-ui, sans-serif'; ctx.fillText(c.city, bx + 12, ly + 15);
          c._box = [bx, ly - 22, w, 46]; ctx.globalAlpha = 1;
        } else c._box = null;
      }
    }
    function roundRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath() }
    function hit(e) {
      const b = cv.getBoundingClientRect(), x = e.clientX - b.left, y = e.clientY - b.top;
      return clubs.find(c => (c._xy && Math.hypot(c._xy[0] - x, c._xy[1] - y) < 22) || (c._box && x >= c._box[0] && x <= c._box[0] + c._box[2] && y >= c._box[1] && y <= c._box[1] + c._box[3]));
    }
    cv.addEventListener('pointerdown', e => { anim = null; drag = { x: e.clientX, y: e.clientY, r: rot.slice(), moved: 0 }; cv.setPointerCapture(e.pointerId); cv.style.cursor = 'grabbing' });
    cv.addEventListener('pointermove', e => {
      if (!drag) { cv.style.cursor = hit(e) ? 'pointer' : 'grab'; return }
      const dx = e.clientX - drag.x, dy = e.clientY - drag.y; drag.moved = Math.max(drag.moved, Math.hypot(dx, dy));
      const k = 75 / (R * zoom); rot = [drag.r[0] + dx * k, Math.max(-75, Math.min(75, drag.r[1] - dy * k)), 0];
    });
    cv.addEventListener('pointerup', e => { const d = drag; drag = null; idle = performance.now(); cv.style.cursor = 'grab'; if (d && d.moved < 6) { const c = hit(e); if (c && opt.onPick) opt.onPick(c) } });
    const ro = new ResizeObserver(size); ro.observe(el); size();
    raf = requestAnimationFrame(frame);
    loadDots().then(d => { dots = d; fly(opt.focus || (clubs[0] && clubs[0].id), 2800) }).catch(() => fly(opt.focus || (clubs[0] && clubs[0].id), 1200));
    return { focus: id => fly(id, 1600), destroy() { alive = false; cancelAnimationFrame(raf); ro.disconnect(); cv.remove() } };
  }
  window.PITGlobe = { mount };
})();
