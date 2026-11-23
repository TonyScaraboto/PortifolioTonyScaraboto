/* placa: trilhas, cpu e a chuva do boot. o cursor de depois fica em cursor.js */
(function () {
  var cv = document.getElementById('c');
  var ctx = cv.getContext('2d');
  // segundo canvas, fora da tela: desenho as trilhas acesas e recorto com um círculo
  var off = document.createElement('canvas');
  var octx = off.getContext('2d');
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var W = 0;
  var H = 0;
  var dpr = 1;
  var cx = 0;
  var cy = 0;
  var S = 260;
  var PIN = 18;
  var R = 160;
  var traces = [];
  var pulses = [];
  var phase = 'idle'; // idle -> boot -> done
  var bootT = 0;
  var afterT = 0;
  var time = 0;
  var energy = 0;
  var revealed = false;
  var pointer = { x: 0, y: 0, seen: false };
  var lastMove = 0;
  // teclado desenhado no canvas durante a intro. depois o #kb assume
  var key = { x: 0, y: 0, vx: 0, vy: 0, a: 1 };

  // mulberry32. mesma seed = mesmas trilhas a cada resize
  function rng(seed) {
    return function () {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // prende v entre a e b. uso na energia, no tilt e no tamanho do chip
  function clamp(v, a, b) {
    return Math.max(a, Math.min(b, v));
  }

  // t=0 devolve a, t=1 devolve b. serve pra cor do pino e do núcleo
  function mix(a, b, t) {
    return a + (b - a) * t;
  }

  // cum guarda o comprimento acumulado pra eu cortar a linha no meio (faísca, glow)
  function addTrace(pts, delay, pad) {
    var cum = [0];
    var i;
    for (i = 1; i < pts.length; i++) {
      var dx = pts[i].x - pts[i - 1].x;
      var dy = pts[i].y - pts[i - 1].y;
      cum.push(cum[i - 1] + Math.hypot(dx, dy));
    }
    traces.push({
      pts: pts,
      cum: cum,
      total: cum[cum.length - 1],
      delay: delay,
      pad: pad
    });
  }

  // quanto falta até a borda da janela, na direção d, mais uma sobra pra linha sair da tela
  function toEdge(p, d) {
    var v;
    if (d.x > 0) v = W - p.x;
    else if (d.x < 0) v = p.x;
    else if (d.y > 0) v = H - p.y;
    else v = p.y;
    return Math.max(0, v) + 30;
  }

  // 4 lados do chip, 10 pinos cada
  function buildPins(rnd) {
    var half = S / 2;
    var n = 10;
    var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    var s, i;

    for (s = 0; s < 4; s++) {
      var d = { x: dirs[s][0], y: dirs[s][1] };
      var p = { x: -d.y, y: d.x };
      var groupA = [];
      var groupB = [];

      for (i = 0; i < 6; i++) {
        groupA.push(S * 0.18 + rnd() * S * 0.45);
        groupB.push(rnd());
      }

      for (i = 0; i < n; i++) {
        var t = ((i + 0.5) / n) * 2 - 1;
        var lat = t * (half - S * 0.13);
        var g = Math.floor(i / 2) % groupA.length;
        var cur = {
          x: cx + d.x * (half + PIN) + p.x * lat,
          y: cy + d.y * (half + PIN) + p.y * lat
        };
        var pts = [cur];
        var a = groupA[g];

        cur = { x: cur.x + d.x * a, y: cur.y + d.y * a };
        pts.push(cur);

        var fan = t * S * 0.75;
        cur = {
          x: cur.x + d.x * Math.abs(fan) + p.x * fan,
          y: cur.y + d.y * Math.abs(fan) + p.y * fan
        };
        pts.push(cur);

        var hasPad = false;
        if (groupB[g] > 0.55) {
          var b = 50 + groupB[g] * 90;
          cur = { x: cur.x + d.x * b, y: cur.y + d.y * b };
          pts.push(cur);
          var f2 = (t >= 0 ? 1 : -1) * (20 + groupB[g] * 40);
          cur = {
            x: cur.x + d.x * Math.abs(f2) + p.x * f2,
            y: cur.y + d.y * Math.abs(f2) + p.y * f2
          };
          pts.push(cur);
        }

        var L = toEdge(cur, d);
        if (rnd() < 0.3) {
          L = Math.max(40, L * (0.3 + rnd() * 0.35) - 30);
          hasPad = true;
        }
        pts.push({ x: cur.x + d.x * L, y: cur.y + d.y * L });
        addTrace(pts, 0.05 + rnd() * 0.3, hasPad);
      }
    }
  }

  // trilhas de fundo: andam em 45° e desviam. se nascer em cima do chip, descarto
  function buildBackground(rnd) {
    var half = S / 2;
    var maxDist = Math.hypot(W, H) / 2;
    var dd = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    var made = 0;
    var guard = 0;

    while (made < 38 && guard < 400) {
      guard++;
      var sx = rnd() * W;
      var sy = rnd() * H;
      if (Math.abs(sx - cx) < half + 110 && Math.abs(sy - cy) < half + 110) continue;

      var di = Math.floor(rnd() * 4) * 2;
      var pts2 = [{ x: sx, y: sy }];
      var q = { x: sx, y: sy };
      var segs = 3 + Math.floor(rnd() * 3);
      var k;

      for (k = 0; k < segs; k++) {
        var len = 60 + rnd() * 140;
        var v = dd[di];
        var m = (v[0] && v[1]) ? 0.7071 : 1;
        q = { x: q.x + v[0] * len * m, y: q.y + v[1] * len * m };
        pts2.push(q);
        di = (di + (rnd() < 0.5 ? 1 : 7)) % 8;
      }

      var dist = Math.hypot(sx - cx, sy - cy);
      addTrace(pts2, 0.5 + dist / maxDist * 1.1, true);
      made++;
    }
  }

  // zera as trilhas e monta de novo. a seed 2027 deixa o desenho igual a cada resize
  function build() {
    var rnd = rng(2027);
    traces = [];
    pulses = [];
    buildPins(rnd);
    buildBackground(rnd);
  }

  // dpr limitado a 2 pra tela retina não dobrar o custo do canvas
  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    cv.width = W * dpr;
    cv.height = H * dpr;
    off.width = W * dpr;
    off.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    cx = W / 2;
    cy = H / 2;
    S = clamp(Math.min(W, H) * 0.34, 170, 300);
    PIN = S * 0.07;
    R = clamp(Math.min(W, H) * 0.22, 120, 220);
    if (!key.x) {
      key.x = cx + S;
      key.y = cy;
    }
    build();
    buildRain();
  }

  // desenha só o trecho da trilha entre as distâncias a e b
  function strokeRange(c, a, b, g) {
    var pts = c.pts;
    var cum = c.cum;
    var i;
    if (b <= a) return;
    g.beginPath();
    var started = false;
    for (i = 1; i < pts.length; i++) {
      if (cum[i] < a) continue;
      if (cum[i - 1] > b) break;
      var x0 = pts[i - 1].x;
      var y0 = pts[i - 1].y;
      var x1 = pts[i].x;
      var y1 = pts[i].y;
      var sl = cum[i] - cum[i - 1];
      var f0 = Math.max(0, (a - cum[i - 1]) / sl);
      var f1 = Math.min(1, (b - cum[i - 1]) / sl);
      if (!started) {
        g.moveTo(mix(x0, x1, f0), mix(y0, y1, f0));
        started = true;
      }
      g.lineTo(mix(x0, x1, f1), mix(y0, y1, f1));
    }
    g.stroke();
  }

  // ponto a uma distância d ao longo da trilha. ficou sem uso, deixo aqui
  function pointAt(c, d) {
    var i;
    var cum = c.cum;
    for (i = 1; i < cum.length; i++) {
      if (cum[i] >= d) {
        var f = (d - cum[i - 1]) / (cum[i] - cum[i - 1]);
        return {
          x: mix(c.pts[i - 1].x, c.pts[i].x, f),
          y: mix(c.pts[i - 1].y, c.pts[i].y, f)
        };
      }
    }
    return c.pts[c.pts.length - 1];
  }

  // ilha redonda no fim da trilha
  function pad(g, p, r) {
    g.beginPath();
    g.arc(p.x, p.y, r, 0, 6.2832);
    g.stroke();
  }

  // glow é um traço mais grosso por baixo
  function drawTraces(g, color, glow, lw, progressFn) {
    var i, c, p;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    for (i = 0; i < traces.length; i++) {
      c = traces[i];
      p = progressFn ? progressFn(c) : 1;
      if (p <= 0) continue;
      if (glow) {
        g.strokeStyle = glow;
        g.lineWidth = lw * 3.2;
        strokeRange(c, 0, c.total * p, g);
      }
      g.strokeStyle = color;
      g.lineWidth = lw;
      strokeRange(c, 0, c.total * p, g);
      if (c.pad && p >= 1) pad(g, c.pts[c.pts.length - 1], 4.5);
    }
  }

  // retângulo com canto arredondado. arcTo evita calcular os 4 arcos na mão
  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }

  // h é a metade do chip. n pinos por lado. e puxa o brilho quando o boot começa
  function drawPins(h, n, e) {
    var dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    var s, i, t;
    for (s = 0; s < 4; s++) {
      var d = dirs[s];
      var pv = [-d[1], d[0]];
      for (i = 0; i < n; i++) {
        t = ((i + 0.5) / n) * 2 - 1;
        var lat = t * (h - S * 0.13);
        var px = d[0] * (h + PIN / 2) + pv[0] * lat;
        var py = d[1] * (h + PIN / 2) + pv[1] * lat;
        // pino perto do teclado acende. no boot todos acendem juntos
        var dist = Math.hypot(cx + px - key.x, cy + py - key.y);
        var k = clamp(1 - dist / R, 0, 1);
        var lit = Math.max(k, phase === 'idle' ? 0 : e);
        var red = Math.round(mix(40, 140, lit));
        var green = Math.round(mix(90, 200, lit));
        ctx.fillStyle = 'rgba(' + red + ',' + green + ',255,' + (0.45 + lit * 0.55) + ')';
        var w = S * 0.03;
        var len = PIN;
        if (d[0] === 0) ctx.fillRect(px - w / 2, py - len / 2, w, len);
        else ctx.fillRect(px - len / 2, py - w / 2, len, w);
      }
    }
  }

  // e = 0..1 energia (cor e brilho). A = opacidade, cai no boot
  function drawCPU(e, A) {
    var h = S / 2;
    var n = 10;
    ctx.save();
    ctx.globalAlpha = A;
    ctx.translate(cx, cy);

    var gl = ctx.createRadialGradient(0, 0, S * 0.1, 0, 0, S * 1.0);
    gl.addColorStop(0, 'rgba(30,107,255,' + (0.05 + e * 0.55) + ')');
    gl.addColorStop(1, 'rgba(30,107,255,0)');
    ctx.fillStyle = gl;
    ctx.fillRect(-S * 1.1, -S * 1.1, S * 2.2, S * 2.2);

    drawPins(h, n, e);

    var sg = ctx.createLinearGradient(-h, -h, h, h);
    sg.addColorStop(0, '#0C2260');
    sg.addColorStop(1, '#071236');
    rr(ctx, -h, -h, S, S, S * 0.06);
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(77,163,255,' + (0.5 + e * 0.5) + ')';
    ctx.stroke();

    var ins = S * 0.1;
    rr(ctx, -h + ins, -h + ins, S - ins * 2, S - ins * 2, S * 0.04);
    ctx.fillStyle = 'rgba(14,44,120,0.9)';
    ctx.fill();
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(140,190,255,0.35)';
    ctx.stroke();

    ctx.fillStyle = 'rgba(207,233,255,0.8)';
    ctx.beginPath();
    ctx.moveTo(-h + S * 0.025, -h + S * 0.025);
    ctx.lineTo(-h + S * 0.1, -h + S * 0.025);
    ctx.lineTo(-h + S * 0.025, -h + S * 0.1);
    ctx.closePath();
    ctx.fill();

    var D = S * 0.46;
    var dh = D / 2;
    var dg = ctx.createLinearGradient(-dh, -dh, dh, dh);
    dg.addColorStop(0, 'rgb(' + Math.round(mix(14, 40, e)) + ',' + Math.round(mix(40, 110, e)) + ',' + Math.round(mix(110, 255, e)) + ')');
    dg.addColorStop(1, 'rgb(' + Math.round(mix(8, 20, e)) + ',' + Math.round(mix(24, 70, e)) + ',' + Math.round(mix(70, 200, e)) + ')');
    rr(ctx, -dh, -dh, D, D, S * 0.02);
    ctx.fillStyle = dg;
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(207,233,255,' + (0.4 + e * 0.6) + ')';
    ctx.stroke();

    var cells = 4;
    var cs = D / cells;
    var r, c2;
    for (r = 0; r < cells; r++) {
      for (c2 = 0; c2 < cells; c2++) {
        var f = 0.5 + 0.5 * Math.sin(time * 3 + r * 1.7 + c2 * 2.3);
        ctx.fillStyle = 'rgba(207,233,255,' + (e * (0.08 + 0.3 * f)) + ')';
        ctx.fillRect(-dh + c2 * cs + 3, -dh + r * cs + 3, cs - 6, cs - 6);
      }
    }

    ctx.fillStyle = 'rgba(230,240,255,' + (0.55 + e * 0.45) + ')';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = '700 ' + Math.round(S * 0.14) + 'px "Chakra Petch", sans-serif';
    ctx.fillText('TS', 0, 1);

    ctx.font = '500 ' + Math.max(9, Math.round(S * 0.04)) + 'px "JetBrains Mono", monospace';
    ctx.fillStyle = 'rgba(180,215,255,0.75)';
    ctx.textAlign = 'left';
    ctx.fillText('TONY SCARABOTO', -h + ins + 6, h - ins - 10);
    ctx.textAlign = 'right';
    ctx.fillText('FULL-STACK', h - ins - 6, -h + ins + 12);

    ctx.textAlign = 'center';
    ctx.fillStyle = e > 0.8 ? 'rgba(160,210,255,1)' : 'rgba(110,150,220,0.9)';
    ctx.font = '500 ' + Math.max(11, Math.round(S * 0.046)) + 'px "JetBrains Mono", monospace';
    var label = phase === 'idle' ? (e > 0.8 ? 'ENERGIZADO' : 'BLOQUEADO') : 'ONLINE';
    ctx.fillText('SOCKET LGA-2027 · ' + label, 0, h + PIN + S * 0.12);
    ctx.restore();
  }

  // teclado da intro, desenhado no canvas. tilt segue a velocidade horizontal
  function drawKeyboard(x, y, tilt, a) {
    var halo = ctx.createRadialGradient(x, y, 0, x, y, 70);
    halo.addColorStop(0, 'rgba(120,190,255,' + (0.45 * a) + ')');
    halo.addColorStop(1, 'rgba(120,190,255,0)');
    ctx.fillStyle = halo;
    ctx.fillRect(x - 70, y - 70, 140, 140);

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tilt);
    ctx.globalAlpha = a;
    var w = 76;
    var h = 34;
    rr(ctx, -w / 2, -h / 2, w, h, 5);
    ctx.fillStyle = 'rgba(6,18,52,0.92)';
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#CFE9FF';
    ctx.stroke();

    var rows = [10, 9];
    var r, c;
    var kw = 5.2;
    var gap = 1.6;
    var tick = Math.floor(time * 9);
    for (r = 0; r < rows.length; r++) {
      var rw = rows[r] * (kw + gap) - gap;
      for (c = 0; c < rows[r]; c++) {
        // hash barato pra escolher quais teclas piscam neste frame
        var hv = ((c * 73856093) ^ (r * 19349663) ^ (tick * 83492791)) >>> 0;
        var on = hv % 5 === 0;
        ctx.fillStyle = on ? '#FFFFFF' : 'rgba(77,163,255,0.75)';
        ctx.fillRect(-rw / 2 + c * (kw + gap), -h / 2 + 5 + r * 8.5, kw, 6);
      }
    }
    ctx.fillStyle = 'rgba(77,163,255,0.75)';
    ctx.fillRect(-18, h / 2 - 11, 36, 6);
    ctx.fillRect(-w / 2 + 6, h / 2 - 11, 11, 6);
    ctx.fillRect(w / 2 - 17, h / 2 - 11, 11, 6);
    ctx.restore();
  }

  // caracteres da chuva do boot. mistura código e katakana, estilo terminal
  var GLY = '01{}[]()<>/\\;:=+-*&|!?#$%TSJXABアイウエオカキクケコサシスセソ'.split('');
  var rain = [];
  var RFS = 16;

  // uma coluna por faixa da largura. delay e velocidade diferentes pra não cair tudo junto
  function buildRain() {
    var rnd = rng(77);
    var i;
    RFS = W < 600 ? 14 : 16;
    rain = [];
    for (i = 0; i < Math.ceil(W / RFS); i++) {
      rain.push({
        delay: rnd() * 1.1,
        speed: 520 + rnd() * 560,
        trail: 12 + Math.floor(rnd() * 20)
      });
    }
  }

  // t é o tempo do boot em segundos. fade vai a 0 no fim, pra chuva sumir antes do site
  function drawRain(t, fade) {
    var i, k, row, col, hv, ch, y, al;
    ctx.save();
    ctx.fillStyle = 'rgba(3,8,20,' + (0.82 * fade * Math.min(1, t * 1.2)) + ')';
    ctx.fillRect(0, 0, W, H);
    ctx.font = '500 ' + RFS + 'px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    var tick = Math.floor(t * 12);

    for (col = 0; col < rain.length; col++) {
      var rc = rain[col];
      var head = (t - rc.delay) * rc.speed;
      if (head < 0) continue;
      for (k = 0; k < rc.trail; k++) {
        y = head - k * RFS;
        if (y < -RFS || y > H + RFS) continue;
        row = Math.round(y / RFS);
        var tickBit = k === 0 ? tick : tick >> 2;
        hv = ((col * 73856093) ^ (row * 19349663) ^ (tickBit * 83492791)) >>> 0;
        ch = GLY[hv % GLY.length];
        al = Math.pow(1 - k / rc.trail, 1.4) * fade;
        ctx.fillStyle = k === 0
          ? 'rgba(230,244,255,' + fade + ')'
          : 'rgba(77,163,255,' + al + ')';
        ctx.fillText(ch, col * RFS + RFS / 2, y);
      }
    }

    // "ACESSO CONCEDIDO" troca glifo por letra, da esquerda pra direita
    if (t > 0.9) {
      var msg = 'ACESSO CONCEDIDO';
      var fs = clamp(W * 0.035, 20, 40);
      var out = '';
      for (i = 0; i < msg.length; i++) {
        if (msg[i] === ' ' || t > 1.3 + i * 0.07) out += msg[i];
        else out += GLY[((i * 31 + tick * 17) >>> 0) % 27];
      }
      ctx.font = '700 ' + fs + 'px "Chakra Petch", "JetBrains Mono", monospace';
      var tw = ctx.measureText(out).width + 48;
      ctx.fillStyle = 'rgba(3,8,20,' + (0.9 * fade) + ')';
      ctx.fillRect(cx - tw / 2, cy - fs, tw, fs * 2);
      ctx.strokeStyle = 'rgba(77,163,255,' + fade + ')';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(cx - tw / 2, cy - fs, tw, fs * 2);
      ctx.fillStyle = 'rgba(207,233,255,' + fade + ')';
      ctx.fillText(out, cx, cy + 1);
    }
    ctx.restore();
  }

  // segue o ponteiro com atraso. se o mouse parar, o teclado volta a orbitar sozinho
  function moveKey(now, dt) {
    var tx, ty;
    if (pointer.seen && (phase !== 'idle' || now - lastMove < 2600)) {
      tx = pointer.x;
      ty = pointer.y;
    } else if (!reduce) {
      tx = cx + Math.cos(time * 0.55) * W * 0.27;
      ty = cy + Math.sin(time * 0.8) * H * 0.2;
    } else {
      tx = cx + S * 0.9;
      ty = cy;
    }
    var k = Math.min(1, dt * 9);
    key.vx = (tx - key.x) * k;
    key.vy = (ty - key.y) * k;
    key.x += key.vx;
    key.y += key.vy;
  }

  // energy sobe perto do chip e alimenta cor e brilho. no boot e no done fica em 1
  function updateEnergy(dt) {
    var dKey = Math.hypot(key.x - cx, key.y - cy);
    var target = clamp(1 - (dKey - S * 0.2) / (S * 1.1), 0, 1);
    if (phase === 'boot') {
      bootT += dt;
      target = 1;
      if (bootT > 2.4 && !revealed) reveal();
      if (bootT > 3.2) {
        phase = 'done';
        afterT = 0;
      }
    }
    if (phase === 'done') {
      afterT += dt;
      target = 1;
    }
    energy += (target - energy) * Math.min(1, dt * 4);
  }

  // fundo radial. o centro fica azul, a borda cai no preto da página
  function drawBackground() {
    var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(W, H) * 0.7);
    bg.addColorStop(0, '#071C55');
    bg.addColorStop(0.55, '#041033');
    bg.addColorStop(1, '#030814');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, W, H);
  }

  // máscara radial no canvas offscreen: só o miolo perto do teclado fica aceso
  function drawLitTraces() {
    if (phase === 'boot') return;
    octx.globalCompositeOperation = 'source-over';
    octx.clearRect(0, 0, W, H);
    drawTraces(octx, 'rgba(110,185,255,1)', 'rgba(40,120,255,0.35)', 2.4, null);
    octx.globalCompositeOperation = 'destination-in';
    var mg = octx.createRadialGradient(key.x, key.y, 0, key.x, key.y, R);
    mg.addColorStop(0, 'rgba(0,0,0,1)');
    mg.addColorStop(0.6, 'rgba(0,0,0,0.6)');
    mg.addColorStop(1, 'rgba(0,0,0,0)');
    octx.fillStyle = mg;
    octx.fillRect(0, 0, W, H);
    octx.globalCompositeOperation = 'source-over';
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = phase === 'idle' ? 1 : 0.2;
    ctx.drawImage(off, 0, 0, W, H);
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
  }

  // solta uma faísca de vez em quando numa trilha longa e apaga quando ela chega no fim
  function drawPulses(dt) {
    if (phase !== 'boot' && pulses.length < 16 && Math.random() < (phase === 'done' ? 0.025 : 0.05)) {
      var tr = traces[Math.floor(Math.random() * traces.length)];
      if (tr.total > 150) pulses.push({ c: tr, pos: 0, v: 240 + Math.random() * 200 });
    }
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    var pi;
    for (pi = pulses.length - 1; pi >= 0; pi--) {
      var pl = pulses[pi];
      pl.pos += pl.v * dt;
      if (pl.pos - 80 > pl.c.total) {
        pulses.splice(pi, 1);
        continue;
      }
      ctx.strokeStyle = 'rgba(207,233,255,' + (phase === 'done' ? 0.4 : 0.95) + ')';
      ctx.lineWidth = 3;
      strokeRange(pl.c, Math.max(0, pl.pos - 80), Math.min(pl.c.total, pl.pos), ctx);
    }
  }

  // um frame. dt limitado pra uma aba em segundo plano não dar um salto
  function frame(now) {
    var dt = Math.min(0.05, (now - (frame.last || now)) / 1000);
    frame.last = now;
    time += dt;

    moveKey(now, dt);
    updateEnergy(dt);
    drawBackground();

    var baseA = phase === 'done' ? 0.1 : 0.26;
    ctx.globalAlpha = 1;
    drawTraces(ctx, 'rgba(30,107,255,' + baseA + ')', null, 2, null);
    drawLitTraces();
    drawPulses(dt);

    var cpuA = 1;
    if (phase === 'done') cpuA = 0;
    else if (phase === 'boot') cpuA = Math.max(0, 1 - (bootT - 0.6) / 1.4);

    var e = energy;
    if (phase === 'boot') e = Math.min(1, 0.6 + bootT) * (0.85 + 0.15 * Math.sin(time * 18));
    drawCPU(e, cpuA);

    if (phase === 'idle') {
      drawKeyboard(key.x, key.y, clamp(key.vx * 0.012, -0.35, 0.35), 1);
    }
    if (phase === 'boot') drawRain(bootT, 1 - clamp((bootT - 2.5) / 0.7, 0, 1));
    requestAnimationFrame(frame);
  }

  // libera o html do portfólio. chamado uma vez, no meio da chuva
  function reveal() {
    revealed = true;
    document.body.classList.add('ready');
  }

  // quem pediu menos movimento pula a chuva e abre o site na hora
  function start() {
    if (phase !== 'idle') return;
    document.body.classList.add('booting');
    if (reduce) {
      phase = 'done';
      bootT = 99;
      afterT = 99;
      reveal();
      return;
    }
    phase = 'boot';
    bootT = 0;
  }

  // atualiza o alvo do teclado desenhado no canvas. lastMove decide quando o piloto automático volta
  window.addEventListener('pointermove', function (e) {
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.seen = true;
    lastMove = performance.now();
  }, { passive: true });

  // qualquer clique na intro compila. depois do boot esse listener não faz mais nada
  window.addEventListener('pointerdown', function (e) {
    if (phase !== 'idle') return;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.seen = true;
    lastMove = performance.now();
    start();
  });

  window.addEventListener('resize', resize);

  resize();
  requestAnimationFrame(frame);
})();
