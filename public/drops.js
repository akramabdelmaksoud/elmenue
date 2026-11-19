/* Optional "drinks dropping" motion for the guest app. Runs only for cafés with settings.drops = true (e.g. the Saraya showroom). */
(function () {
  var REDUCE = matchMedia('(prefers-reduced-motion:reduce)').matches, live = 0, tm = 0;
  var SET = ['☕', '🍹', '🥤', '🍵', '🍮', '🧋', '🍓', '🥭'];
  function on() { return typeof App !== 'undefined' && App.config && App.config.settings && App.config.settings.drops && !REDUCE; }
  function drop(x) {
    if (live >= 8) return; live++;
    var f = document.createElement('div'), H = innerHeight, r = (Math.random() * 40 - 20);
    f.textContent = SET[Math.random() * SET.length | 0];
    f.style.cssText = 'position:fixed;z-index:5;left:' + x + 'px;top:0;font-size:' + (28 + Math.random() * 18) + 'px;pointer-events:none;will-change:transform';
    document.body.appendChild(f);
    var g = H - 96, a = f.animate([
      { transform: 'translateY(-60px) rotate(' + r + 'deg)', opacity: 0 }, { transform: 'translateY(' + g * .1 + 'px) rotate(' + r + 'deg)', opacity: 1, offset: .08 },
      { transform: 'translateY(' + g + 'px) rotate(0)', offset: .6, easing: 'ease-out' }, { transform: 'translateY(' + (g - 46) + 'px)', offset: .75, easing: 'ease-in' },
      { transform: 'translateY(' + g + 'px)', offset: .88, easing: 'ease-out' }, { transform: 'translateY(' + g + 'px)', opacity: 1, offset: .93 }, { transform: 'translateY(' + g + 'px) scale(.6)', opacity: 0 }
    ], { duration: 2400, easing: 'cubic-bezier(.5,0,1,.6)' });
    a.onfinish = function () { f.remove(); live--; };
  }
  function rain(n) { for (var i = 0; i < n; i++) setTimeout(function () { drop(20 + Math.random() * (innerWidth - 60)); }, i * 220); }
  function loop() { clearTimeout(tm); if (on() && !document.hidden && document.querySelector('.hero')) drop(20 + Math.random() * (innerWidth - 60)); tm = setTimeout(loop, 3200); }
  document.addEventListener('click', function (e) { if (on() && e.target.closest('.mugw')) rain(7); });
  document.addEventListener('click', function (e) { if (on() && e.target.closest('.addb,.addb2,.cream,.send')) rain(3); }, true);
  var t0 = setInterval(function () { if (on()) { clearInterval(t0); setTimeout(function () { rain(6); loop(); }, 600); } }, 500);
  setTimeout(function () { clearInterval(t0); }, 20000);
})();
