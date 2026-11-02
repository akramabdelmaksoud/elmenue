// TableTab house effects: flow-field background, cursor glow, card spotlight + tilt, magnetic buttons, reveal on scroll.
// Pages call TTfx.watch() after they draw new .rv / .glass elements.
(function () {
  var fine = matchMedia('(hover:hover) and (pointer:fine)').matches, calm = matchMedia('(prefers-reduced-motion:reduce)').matches;
  function mk(tag, id, cls) { var e = document.createElement(tag); if (id) e.id = id; if (cls) e.className = cls; document.body.insertBefore(e, document.body.firstChild); return e; }
  var c = document.getElementById('fx') || mk('canvas', 'fx'); if (!document.querySelector('.grain')) mk('div', '', 'grain'); var cur = document.getElementById('cur') || mk('div', 'cur');
  var seen = {}, io = 'IntersectionObserver' in window ? new IntersectionObserver(function (es) { es.forEach(function (e) { if (!e.isIntersecting) return; e.target.classList.add('in'); io.unobserve(e.target); }); }, { threshold: .1, rootMargin: '0px 0px -5% 0px' }) : null;
  function watch() { document.querySelectorAll('.rv:not(.in)').forEach(function (el) { io ? io.observe(el) : el.classList.add('in'); }); }
  if (fine && !calm) {
    var cx = innerWidth / 2, cy = innerHeight / 2, tx = cx, ty = cy;
    addEventListener('pointermove', function (e) {
      tx = e.clientX; ty = e.clientY; cur.style.opacity = 1;
      var el = e.target.closest && e.target.closest('.glass');
      if (el) {
        var r = el.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; el.style.setProperty('--mx', x + 'px'); el.style.setProperty('--my', y + 'px');
        if (el.dataset.tilt !== 'off') el.style.transform = 'perspective(900px) rotateX(' + ((y / r.height - .5) * -7).toFixed(2) + 'deg) rotateY(' + ((x / r.width - .5) * 7).toFixed(2) + 'deg) translateY(-5px)';
      }
      var mg = e.target.closest && e.target.closest('.mag');
      document.querySelectorAll('.mag.pull').forEach(function (b) { if (b !== mg) { b.classList.remove('pull'); b.style.transform = ''; } });
      if (mg) { var q = mg.getBoundingClientRect(); mg.classList.add('pull'); mg.style.transform = 'translate(' + ((e.clientX - q.left - q.width / 2) * .2).toFixed(1) + 'px,' + ((e.clientY - q.top - q.height / 2) * .3).toFixed(1) + 'px)'; }
    }, { passive: true });
    document.addEventListener('pointerout', function (e) { var el = e.target.closest && e.target.closest('.glass'); if (el && !el.contains(e.relatedTarget)) el.style.transform = ''; });
    (function glow() { cx += (tx - cx) * .12; cy += (ty - cy) * .12; cur.style.transform = 'translate(' + cx.toFixed(0) + 'px,' + cy.toFixed(0) + 'px)'; requestAnimationFrame(glow); })();
  }
  var g = c.getContext('2d'), W, H, D, P = [], t = 0, mx = -9999, my = -9999, hues = [14, 338, 268, 176];
  function seed(p) { p.x = Math.random() * W; p.y = Math.random() * H; p.l = 120 + Math.random() * 240; p.h = hues[(Math.random() * 4) | 0]; p.s = .5 + Math.random() * .9; return p; }
  function size() { D = Math.min(devicePixelRatio || 1, 1.5); W = c.width = Math.floor(innerWidth * D); H = c.height = Math.floor(innerHeight * D); var n = Math.min(240, Math.floor(innerWidth / 6)); P = []; for (var i = 0; i < n; i++) P.push(seed({})); g.clearRect(0, 0, W, H); }
  size(); addEventListener('resize', size); addEventListener('pointermove', function (e) { mx = e.clientX * D; my = e.clientY * D; }, { passive: true }); c.style.opacity = .6;
  function field(x, y) { return Math.sin(x * .0016 / D + t * .00035) * Math.cos(y * .0021 / D - t * .00028) * 6.28 + Math.sin((x + y) * .0006 / D + t * .0002) * 2.2; }
  function frame() {
    if (document.hidden) return requestAnimationFrame(frame);
    t += 16; g.globalCompositeOperation = 'destination-out'; g.fillStyle = 'rgba(0,0,0,.045)'; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'lighter'; g.lineWidth = 1.1 * D;
    for (var i = 0; i < P.length; i++) {
      var p = P[i], a = field(p.x, p.y), dx = p.x - mx, dy = p.y - my, d2 = dx * dx + dy * dy, ox = p.x, oy = p.y;
      if (d2 < 90000 * D * D) a += (1 - Math.sqrt(d2) / (300 * D)) * 2.4;
      p.x += Math.cos(a) * p.s * 1.15 * D; p.y += Math.sin(a) * p.s * 1.15 * D; p.l--;
      g.strokeStyle = 'hsla(' + p.h + ',95%,62%,.34)'; g.beginPath(); g.moveTo(ox, oy); g.lineTo(p.x, p.y); g.stroke();
      if (p.l < 0 || p.x < 0 || p.y < 0 || p.x > W || p.y > H) seed(p);
    }
    requestAnimationFrame(frame);
  }
  if (!calm) requestAnimationFrame(frame);
  window.TTfx = { watch: watch }; watch();
})();
