/* cursor de teclado depois do boot. esconde o ponteiro nativo e move este svg */
(function () {
  var kb = document.getElementById('kb');
  var keys = [];
  var kbx = -999;
  var kby = -999;
  var kvx = 0;
  var tx = -999;
  var ty = -999;
  var seen = false;
  var rows = [10, 9];
  var kw = 5.2;
  var gap = 1.6;
  var h = '<svg viewBox="0 0 76 34" xmlns="http://www.w3.org/2000/svg">';
  h += '<rect x="1" y="1" width="74" height="32" rx="5" fill="rgba(6,18,52,.94)" stroke="#CFE9FF" stroke-width="2"/>';

  var r, c;
  for (r = 0; r < 2; r++) {
    var rw = rows[r] * (kw + gap) - gap;
    for (c = 0; c < rows[r]; c++) {
      var x = (38 - rw / 2 + c * (kw + gap)).toFixed(1);
      var y = 5 + r * 8.5;
      h += '<rect class="k" x="' + x + '" y="' + y + '" width="' + kw + '" height="6" fill="rgba(77,163,255,.75)"/>';
    }
  }

  h += '<rect class="k" x="20" y="23" width="36" height="6" fill="rgba(77,163,255,.75)"/>';
  h += '<rect class="k" x="7" y="23" width="11" height="6" fill="rgba(77,163,255,.75)"/>';
  h += '<rect class="k" x="58" y="23" width="11" height="6" fill="rgba(77,163,255,.75)"/>';
  h += '</svg>';
  kb.innerHTML = h;
  keys = [].slice.call(kb.querySelectorAll('.k'));

  // all=true acende tudo no clique; senão só umas teclas aleatórias
  function flicker(all) {
    keys.forEach(function (k) {
      var on = all || Math.random() < 0.2;
      k.setAttribute('fill', on ? '#FFFFFF' : 'rgba(77,163,255,.75)');
    });
  }

  // pisca umas teclas a cada 130ms, fora do clique
  setInterval(function () {
    flicker(false);
  }, 130);

  // clique encolhe o teclado e acende todas as teclas por um instante
  window.addEventListener('pointerdown', function () {
    kb.classList.add('down');
    flicker(true);
    setTimeout(function () {
      kb.classList.remove('down');
    }, 160);
  });

  // em cima de link ou botão o teclado cresce. a classe .link está no css
  document.addEventListener('mouseover', function (e) {
    var onLink = !!(e.target.closest && e.target.closest('a,button'));
    kb.classList.toggle('link', onLink);
  });

  // guarda o alvo. na primeira vez posiciona sem animar, senão ele atravessa a tela
  window.addEventListener('pointermove', function (e) {
    tx = e.clientX;
    ty = e.clientY;
    if (kbx === -999) {
      kbx = tx;
      kby = ty;
    }
    if (!seen) {
      seen = true;
      kb.classList.add('seen');
    }
  }, { passive: true });

  // 0.35 é o atraso. sem isso o teclado cola no ponteiro e o tilt some
  (function loop() {
    var nx = kbx + (tx - kbx) * 0.35;
    kvx = nx - kbx;
    kbx = nx;
    kby += (ty - kby) * 0.35;
    var tilt = Math.max(-0.35, Math.min(0.35, kvx * 0.012));
    kb.style.transform = 'translate(' + (kbx - 38).toFixed(1) + 'px,' + (kby - 17).toFixed(1) + 'px) rotate(' + tilt.toFixed(3) + 'rad)';
    requestAnimationFrame(loop);
  })();
})();
