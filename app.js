/* 충전은 어디서 멈추는가 — 대시보드 스크립트 (vanilla JS, 외부 의존성 없음) */
(function () {
  'use strict';
  var D = window.DASH_DATA;
  if (!D) { document.body.insertAdjacentHTML('afterbegin', '<p style="padding:20px">데이터 파일(data.js)을 불러오지 못했습니다.</p>'); return; }

  /* ── 유틸 ─────────────────────────────────────────── */
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); };
  function num(n, d) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    return Number(n).toLocaleString('ko-KR', { minimumFractionDigits: d || 0, maximumFractionDigits: d === undefined ? 0 : d });
  }
  function pct(n, d) { return num(n, d === undefined ? 1 : d) + '%'; }
  var SVGNS = 'http://www.w3.org/2000/svg';
  function svg(tag, attrs, parent) {
    var e = document.createElementNS(SVGNS, tag);
    for (var k in attrs) if (attrs[k] !== undefined && attrs[k] !== null) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  }
  function txt(parent, x, y, s, attrs) {
    var t = svg('text', Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = s; return t;
  }
  /* ── 툴팁 ── */
  var tip = $('#tip');
  function showTip(html, ev) {
    tip.innerHTML = html; tip.classList.add('is-on');
    var x = ev.clientX, y = ev.clientY;
    tip.style.left = Math.min(Math.max(x, 90), window.innerWidth - 90) + 'px';
    tip.style.top = y + 'px';
  }
  function hideTip() { tip.classList.remove('is-on'); }
  function bindTip(node, htmlFn) {
    node.addEventListener('mousemove', function (ev) { showTip(htmlFn(), ev); });
    node.addEventListener('mouseleave', hideTip);
    node.addEventListener('touchstart', function (ev) {
      var t = ev.touches[0]; showTip(htmlFn(), { clientX: t.clientX, clientY: t.clientY });
    }, { passive: true });
  }

  /* ── 헤더 메타 ───────────────────────────────────── */
  $('#heroMeta').textContent =
    '분석 기간 ' + D.meta.period + ' (' + num(D.meta.days) + '일 기록) · 원본 ' + num(D.meta.rows) +
    '행 · 충전기 ' + num(D.kpi.chargers) + '기 · 충전소 ' + num(D.kpi.stations) + '개소 · 생성 ' + D.meta.generated;

  /* ── KPI 카드 ───────────────────────────────────── */
  var K = D.kpi;
  var kpis = [
    { cls: 'kpi--accent', label: '누적 충전량 (18개월)', value: num(K.kwh), unit: 'kWh',
      hint: '기록된 사용 ' + num(K.cnt) + '회' },
    { label: '공공 충전기', value: num(K.chargers), unit: '기',
      hint: '급속 ' + num(K.fast) + ' · 완속 ' + num(K.slow) + ' / 충전소 ' + num(K.stations) + '개소' },
    { cls: 'kpi--warn', label: '상위 20% 충전소 집중도', value: num(K.top20, 1), unit: '%',
      hint: '하위 50%는 ' + num(K.bottom50, 1) + '% · 지니계수 ' + K.gini },
    { cls: 'kpi--alert', label: '저이용 충전기', value: num(K.low), unit: '기',
      hint: '500kWh 미만 ' + num(K.lowShare, 1) + '% · 그중 ' + num(D.chargers.filter(function (c) { return c.kwh < 500 && c.state === '중단의심'; }).length) + '기는 최근 3개월 무기록' },
    { label: '급속 1기 가동률', value: num(K.util.fast, 1), unit: '%',
      hint: '50kW 가정 · 완속 ' + num(K.util.slow, 1) + '%' },
    { label: '도보 500m 커버 면적', value: num(K.coverage500, 1), unit: '%',
      hint: '행정동 ' + num(K.dongCount) + '곳 중 ' + num(K.noChargerDong) + '곳은 충전소 0곳' }
  ];
  $('#kpis').innerHTML = kpis.map(function (k) {
    return '<div class="kpi ' + (k.cls || '') + '"><div class="kpi__label">' + k.label + '</div>' +
      '<div class="kpi__value">' + k.value + '<small>' + k.unit + '</small></div>' +
      '<div class="kpi__hint">' + k.hint + '</div></div>';
  }).join('');

  /* ── 1-1. 로렌츠 곡선 ─────────────────────────────── */
  (function () {
    var W = 720, H = 420, L = 62, R = 18, T = 18, B = 44;
    var w = W - L - R, h = H - T - B;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img' });
    var pts = D.lorenz.points;
    var X = function (p) { return L + p / 100 * w; };
    var Y = function (p) { return T + h - p / 100 * h; };
    // grid
    for (var g = 0; g <= 100; g += 20) {
      svg('line', { x1: X(g), y1: Y(0), x2: X(g), y2: Y(100), stroke: '#eef3f0' }, s);
      svg('line', { x1: X(0), y1: Y(g), x2: X(100), y2: Y(g), stroke: '#eef3f0' }, s);
      txt(s, X(g), Y(0) + 16, g + '%', { 'text-anchor': 'middle' });
      txt(s, X(0) - 8, Y(g) + 3.5, g + '%', { 'text-anchor': 'end' });
    }
    // 균등선
    svg('line', { x1: X(0), y1: Y(0), x2: X(100), y2: Y(100), stroke: '#9fb4aa', 'stroke-dasharray': '5 5', 'stroke-width': 1.4 }, s);
    txt(s, X(66), Y(74), '완전 균등선', { 'text-anchor': 'middle', style: 'fill:#8fa79b;font-size:10.5px' });
    // 곡선 + 면적
    var d = pts.map(function (p, i) { return (i ? 'L' : 'M') + X(p[0]) + ' ' + Y(p[1]); }).join(' ');
    svg('path', { d: d + ' L' + X(100) + ' ' + Y(0) + ' L' + X(0) + ' ' + Y(0) + ' Z', fill: 'rgba(18,133,95,.13)' }, s);
    svg('path', { d: d, fill: 'none', stroke: '#0b5c42', 'stroke-width': 2.6, 'stroke-linejoin': 'round' }, s);
    // 50% 지점
    var m50 = D.lorenz.marks[0];
    svg('line', { x1: X(50), y1: Y(0), x2: X(50), y2: Y(m50.share), stroke: '#c9761b', 'stroke-dasharray': '4 4', 'stroke-width': 1.4 }, s);
    svg('circle', { cx: X(50), cy: Y(m50.share), r: 4.5, fill: '#c9761b', stroke: '#fff', 'stroke-width': 1.5 }, s);
    txt(s, X(50) + 8, Y(m50.share) - 9, '하위 50% → ' + m50.share + '%', { style: 'fill:#8a5410;font-size:11.5px;font-weight:700' });
    var m80 = D.lorenz.marks[1];
    svg('circle', { cx: X(80), cy: Y(m80.share), r: 3.6, fill: '#12855f', stroke: '#fff', 'stroke-width': 1.4 }, s);
    txt(s, X(80) - 6, Y(m80.share) + 18, '하위 80% ' + m80.share + '%', { 'text-anchor': 'end', style: 'fill:#0b5c42;font-size:11px;font-weight:600' });
    txt(s, L + w / 2, H - 6, '충전소 누적 비율 (충전량 적은 순)', { 'text-anchor': 'middle', class: 'lbl' });
    var yl = txt(s, 14, T + h / 2, '충전량 누적 비율', { 'text-anchor': 'middle', class: 'lbl' });
    yl.setAttribute('transform', 'rotate(-90 14 ' + (T + h / 2) + ')');
    // hover
    var hi = svg('line', { y1: Y(0), y2: Y(100), stroke: '#0b5c42', 'stroke-width': 1, opacity: 0, 'stroke-dasharray': '2 3' }, s);
    var hd = svg('circle', { r: 5, fill: '#0b5c42', stroke: '#fff', 'stroke-width': 1.6, opacity: 0 }, s);
    var hit = svg('rect', { x: L, y: T, width: w, height: h, class: 'hit' }, s);
    hit.addEventListener('mousemove', function (ev) {
      var box = s.getBoundingClientRect();
      var px = (ev.clientX - box.left) / box.width * W;
      var q = Math.min(100, Math.max(0, (px - L) / w * 100));
      var best = pts[0], bd = 1e9;
      pts.forEach(function (p) { var dd = Math.abs(p[0] - q); if (dd < bd) { bd = dd; best = p; } });
      hi.setAttribute('x1', X(best[0])); hi.setAttribute('x2', X(best[0])); hi.setAttribute('opacity', .5);
      hd.setAttribute('cx', X(best[0])); hd.setAttribute('cy', Y(best[1])); hd.setAttribute('opacity', 1);
      showTip('<i>충전소 하위 ' + best[0] + '%</i><br><b>' + best[1] + '%</b>의 충전량', ev);
    });
    hit.addEventListener('mouseleave', function () { hi.setAttribute('opacity', 0); hd.setAttribute('opacity', 0); hideTip(); });
    $('#lorenz').appendChild(s);
    $('#lorenzStats').innerHTML = [
      ['지니계수', D.lorenz.gini],
      ['상위 20% 점유', K.top20 + '%'],
      ['하위 50% 점유', K.bottom50 + '%'],
      ['충전소 1곳 평균', num(K.kwh / K.stations) + 'kWh']
    ].map(function (r) { return '<div class="stat"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>'; }).join('');
  })();

  /* ── 1-2. 충전기 분포 히스토그램 ──────────────────── */
  (function () {
    var bins = D.chargerDist, W = 720, H = 320, L = 46, R = 14, T = 16, B = 40;
    var w = W - L - R, h = H - T - B;
    var max = Math.max.apply(null, bins.map(function (b) { return b.n; }));
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H });
    for (var g = 0; g <= max; g += 50) {
      svg('line', { x1: L, y1: T + h - g / max * h, x2: L + w, y2: T + h - g / max * h, stroke: '#eef3f0' }, s);
      txt(s, L - 8, T + h - g / max * h + 3.5, g, { 'text-anchor': 'end' });
    }
    var bw = w / bins.length;
    bins.forEach(function (b, i) {
      var hh = b.n / max * h;
      var low = i <= 1;
      var bar = svg('rect', {
        x: L + i * bw + bw * .16, y: T + h - hh, width: bw * .68, height: Math.max(hh, 1),
        rx: 3, fill: low ? '#f0b45c' : '#0b5c42', opacity: low ? .95 : .85
      }, s);
      if (b.n) txt(s, L + i * bw + bw / 2, T + h - hh - 6, b.n, { 'text-anchor': 'middle', style: 'font-weight:700;fill:' + (low ? '#8a5410' : '#0b5c42') });
      txt(s, L + i * bw + bw / 2, T + h + 17, b.label, { 'text-anchor': 'middle' });
      bindTip(bar, function () { return '<b>' + b.label + ' kWh</b> 구간<br>' + b.n + '기 (' + (b.n / K.chargers * 100).toFixed(1) + '%)'; });
    });
    txt(s, L + w / 2, H - 4, '18개월 누적 충전량 (kWh)', { 'text-anchor': 'middle', class: 'lbl' });
    $('#hist').appendChild(s);
    $('#lowCnt').textContent = num(K.low) + '기';
    var maxC = Math.max.apply(null, D.chargers.map(function (c) { return c.kwh; }));
    var el = $('#maxCh'); if (el) el.textContent = num(maxC) + 'kWh';
  })();

  /* ── 1-3. 상·하위 충전소 ─────────────────────────── */
  (function () {
    var st = D.stations;
    var top = st.slice(0, 10), low = st.slice(-10).reverse();
    function block(title, arr, cls) {
      var max = Math.max.apply(null, arr.map(function (x) { return x.kwh; }));
      return '<div><h4>' + title + '</h4><div class="rank ' + (cls || '') + '">' + arr.map(function (x, i) {
        return '<div class="rank__row"><i>' + (i + 1) + '</i>' +
          '<span class="nm" title="' + x.name.replace(/"/g, '') + '">' + x.name.replace('(RS)대구시_', '') + '</span>' +
          '<span class="vl">' + num(x.kwh) + '<small>kWh · ' + x.chargers + '기</small></span>' +
          '<span class="rank__bar"><i style="width:' + (x.kwh / max * 100) + '%"></i></span></div>';
      }).join('') + '</div></div>';
    }
    $('#topBottom').innerHTML = block('누적 충전량 상위 10곳', top) + block('하위 10곳', low, 'rank--low');
  })();

  /* ── 2-1. 급속·완속 표 ───────────────────────────── */
  (function () {
    var f = D.typeStats.fast, sl = D.typeStats.slow;
    var rows = [
      ['충전기 수', num(f.n) + '기', num(sl.n) + '기'],
      ['누적 충전량', num(f.kwh) + 'kWh', num(sl.kwh) + 'kWh'],
      ['충전량 비중', K.fastShare + '%', K.slowShare + '%'],
      ['1기당 평균', num(f.avg) + 'kWh', num(sl.avg) + 'kWh'],
      ['1기당 중앙값', num(f.med) + 'kWh', num(sl.med) + 'kWh'],
      ['사용 횟수', num(f.cnt) + '회', num(sl.cnt) + '회'],
      ['1일 평균', num(K.util.fastDay, 1) + 'kWh', num(K.util.slowDay, 1) + 'kWh']
    ];
    $('#typeTable').innerHTML = '<div class="tablewrap" style="max-height:none;border:0"><table>' +
      '<thead><tr><th style="cursor:default"></th><th style="cursor:default">급속</th><th style="cursor:default">완속</th></tr></thead><tbody>' +
      rows.map(function (r) { return '<tr><td style="color:var(--muted)">' + r[0] + '</td><td><b>' + r[1] + '</b></td><td><b>' + r[2] + '</b></td></tr>'; }).join('') +
      '</tbody></table></div>';
  })();

  /* ── 2-2. 가동률 ─────────────────────────────────── */
  (function () {
    var W = 460, H = 150, L = 74, R = 56, T = 18, B = 26;
    var w = W - L - R, h = 44, gap = 18;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H });
    var items = [
      { label: '급속 (' + num(K.fast) + '기)', v: K.util.fast, c: '#0b5c42', sub: num(K.util.fastDay, 1) + ' kWh/일' },
      { label: '완속 (' + num(K.slow) + '기)', v: K.util.slow, c: '#7cc4a4', sub: num(K.util.slowDay, 1) + ' kWh/일' }
    ];
    var scaleMax = 12;
    items.forEach(function (it, i) {
      var y = T + i * (h + gap);
      txt(s, L - 10, y + h / 2 + 4, it.label, { 'text-anchor': 'end', class: 'lbl' });
      svg('rect', { x: L, y: y, width: w, height: h, rx: 6, fill: '#f0f5f2' }, s);
      var bw = Math.max(2, Math.min(1, it.v / scaleMax) * w);
      svg('rect', { x: L, y: y, width: bw, height: h, rx: 6, fill: it.c }, s);
      txt(s, L + bw + 10, y + h / 2 + 5, it.v + '%', { style: 'font-weight:800;font-size:15px;fill:' + it.c });
      txt(s, L + 10, y + h / 2 + 4, it.sub, { style: 'fill:#fff;font-size:11.5px;font-weight:600' });
    });
    txt(s, L, H - 6, '24시간 × 설비용량 대비 실제 충전량 비율', { class: 'lbl' });
    $('#utilChart').appendChild(s);
  })();

  /* ── 2-3. 월별 추이 ──────────────────────────────── */
  var seriesChart = (function () {
    var W = 980, H = 360, L = 62, R = 22, T = 22, B = 52;
    var w = W - L - R, h = H - T - B;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H });
    $('#series').appendChild(s);
    var key = 'all';
    var names = { all: '전체', fast: '급속', slow: '완속' };
    var color = { all: '#0b5c42', fast: '#0b5c42', slow: '#7cc4a4' };

    function draw(k) {
      key = k; while (s.firstChild) s.removeChild(s.firstChild);
      var data = D.monthly;
      var vals = data.map(function (m) { return k === 'fast' ? m.fastAvg : k === 'slow' ? m.slowAvg : m.avg; });
      var max = Math.ceil(Math.max.apply(null, vals) / 5000) * 5000;
      var bw = w / data.length;
      for (var g = 0; g <= max; g += max / 4) {
        var y = T + h - g / max * h;
        svg('line', { x1: L, y1: y, x2: L + w, y2: y, stroke: '#eef3f0' }, s);
        txt(s, L - 8, y + 3.5, num(g), { 'text-anchor': 'end' });
      }
      // 평균선
      var mean = vals.reduce(function (a, b) { return a + b; }, 0) / vals.length;
      svg('line', { x1: L, y1: T + h - mean / max * h, x2: L + w, y2: T + h - mean / max * h,
        stroke: '#c9761b', 'stroke-dasharray': '5 4', 'stroke-width': 1.2 }, s);
      txt(s, L + w - 4, T + h - mean / max * h - 6, '평균 ' + num(mean) + 'kWh', { 'text-anchor': 'end', style: 'fill:#8a5410;font-size:10.5px;font-weight:700' });
      data.forEach(function (m, i) {
        var v = vals[i], hh = v / max * h;
        var x = L + i * bw + bw * .18, bwid = bw * .64;
        var bar = svg('rect', { x: x, y: T + h - hh, width: bwid, height: Math.max(hh, 1), rx: 2.5, fill: color[key], opacity: .82 }, s);
        bindTip(bar, function () {
          return '<b>' + m.ym + '</b><br>' + names[key] + ' 일평균 <b>' + num(v) + 'kWh</b><br>' +
            '월 합계 ' + num(m.kwh) + 'kWh · ' + m.days + '일 기록';
        });
        if (i % 3 === 0 || i === data.length - 1) {
          txt(s, x + bwid / 2, T + h + 17, m.ym.slice(2).replace('-', '.'), { 'text-anchor': 'middle' });
        }
        if (i === 0) txt(s, x + bwid / 2, T + h - hh - 7, '일부', { 'text-anchor': 'middle', style: 'fill:#9aaba3;font-size:9.5px' });
      });
      txt(s, L + w / 2, H - 12, '월별 일평균 충전량 (kWh/일)', { 'text-anchor': 'middle', class: 'lbl' });
      txt(s, 14, T + h / 2, 'kWh/일', { 'text-anchor': 'middle', class: 'lbl', transform: 'rotate(-90 14 ' + (T + h / 2) + ')' });
    }
    draw('all');
    $$('#seriesToggle .seg__btn').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#seriesToggle .seg__btn').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active'); draw(b.dataset.k);
      });
    });
    return { draw: draw };
  })();

  /* ── 2-4. 요일 ───────────────────────────────────── */
  (function () {
    var d = D.weekday, W = 460, H = 230, L = 52, R = 12, T = 16, B = 34;
    var w = W - L - R, h = H - T - B;
    var max = Math.ceil(Math.max.apply(null, d.map(function (x) { return x.kwh; })) / 2000) * 2000;
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H });
    for (var g = 0; g <= max; g += max / 3) {
      var y = T + h - g / max * h;
      svg('line', { x1: L, y1: y, x2: L + w, y2: y, stroke: '#eef3f0' }, s);
      txt(s, L - 8, y + 3.5, num(g), { 'text-anchor': 'end' });
    }
    var bw = w / d.length;
    d.forEach(function (x, i) {
      var hh = x.kwh / max * h;
      var wk = i >= 5;
      var bar = svg('rect', { x: L + i * bw + bw * .2, y: T + h - hh, width: bw * .6, height: hh, rx: 3,
        fill: wk ? '#f0b45c' : '#0b5c42', opacity: .9 }, s);
      txt(s, L + i * bw + bw / 2, T + h - hh - 6, num(x.kwh / 1000, 0) + 'k', { 'text-anchor': 'middle', style: 'font-size:10px;font-weight:700;fill:' + (wk ? '#8a5410' : '#0b5c42') });
      txt(s, L + i * bw + bw / 2, T + h + 17, x.d, { 'text-anchor': 'middle', class: 'lbl' });
      bindTip(bar, function () { return '<b>' + x.d + '요일</b> 일평균<br>' + pct(x.kwh / 1000, 1) + ' MWh (' + num(x.kwh) + 'kWh)'; });
    });
    $('#weekday').appendChild(s);
    var wk = [0, 1, 2, 3, 4].map(function (i) { return d[i].kwh; });
    var we = [5, 6].map(function (i) { return d[i].kwh; });
    var a = function (arr) { return arr.reduce(function (x, y) { return x + y; }, 0) / arr.length; };
    var gapR = (1 - a(we) / a(wk)) * 100;
    var noteEl = $('#weekday').parentNode.querySelector('.note');
    if (noteEl) noteEl.innerHTML = '금요일이 가장 높고 일요일이 가장 낮습니다. 주말 일평균은 평일보다 <b>' +
      num(gapR, 1) + '%</b> 적어, 공공 충전 수요가 <b>통근·업무 이동</b>에 묶여 있음을 시사합니다.';
  })();

  /* ── 2-5. 입지 유형 ──────────────────────────────── */
  (function () {
    var cats = D.stationCat.slice().sort(function (a, b) { return b.median - a.median; }).slice(0, 8), W = 460, H = 300, L = 96, R = 66, T = 12, B = 22;
    var w = W - L - R, h = H - T - B;
    var max = Math.max.apply(null, cats.map(function (c) { return c.median; }));
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H });
    var bh = h / cats.length;
    cats.forEach(function (c, i) {
      var y = T + i * bh + bh * .18, hh = bh * .64;
      var bw = c.median / max * w;
      txt(s, L - 8, y + hh / 2 + 4, c.cat, { 'text-anchor': 'end', class: 'lbl' });
      svg('rect', { x: L, y: y, width: w, height: hh, rx: 4, fill: '#f0f5f2' }, s);
      var bar = svg('rect', { x: L, y: y, width: Math.max(bw, 2), height: hh, rx: 4, fill: '#0b5c42', opacity: .85 }, s);
      txt(s, L + w + 6, y + hh / 2 + 4, num(c.median), { style: 'font-weight:700;fill:#0b5c42' });
      bindTip(bar, function () {
        return '<b>' + c.cat + '</b><br>' + c.n + '개소 · 충전량 비중 ' + c.share + '%<br>1개소당 중앙값 <b>' + num(c.median) + 'kWh</b>';
      });
    });
    $('#catChart').appendChild(s);
  })();

  /* ── 3-1. 구·군 표 ───────────────────────────────── */
  (function () {
    var rows = D.gu.map(function (g) {
      return {
        gu: g.gu, ev: g.ev, ch: g.chargers, st: g.stations,
        per: g.evPerCharger, cov: g.coverage500, gap: g.gapIndex, kwh: g.kwh,
        unc: g.uncoveredEv, low: g.lowShare
      };
    });
    var cols = [
      { k: 'gu', label: '구·군', align: 'left', cell: function (r) { return '<b>' + r.gu + '</b>'; } },
      { k: 'ev', label: '등록 EV', cell: function (r) { return num(r.ev); } },
      { k: 'gap', label: '공백지수', cell: function (r) {
          return r.gap === null ? '<span class="pill">자료 없음</span>' :
            '<span style="font-weight:700;color:' + (r.gap > 110 ? '#8a5410' : 'var(--ink)') + '">' + Math.round(r.gap) + '</span>';
        } },
      { k: 'ch', label: '충전기', cell: function (r) { return num(r.ch); } },
      { k: 'per', label: 'EV/충전기', cls: 't-opt', cell: function (r) { return r.per === null ? '–' : num(r.per, 1); } },
      { k: 'cov', label: '커버리지', cls: 't-opt', cell: function (r) { return pct(r.cov * 100, 1); } }
    ];
    var sortK = 'gap', asc = false;
    function render() {
      rows.sort(function (a, b) {
        var x = a[sortK], y = b[sortK];
        if (x === null) return 1; if (y === null) return -1;
        if (typeof x === 'string') return asc ? x.localeCompare(y) : y.localeCompare(x);
        return asc ? x - y : y - x;
      });
      var maxGap = Math.max.apply(null, rows.filter(function (r) { return r.gap; }).map(function (r) { return r.gap; }));
      $('#guTable').innerHTML = '<table><thead><tr>' + cols.map(function (c) {
        return '<th data-k="' + c.k + '" style="text-align:' + (c.align || 'right') + '" class="' + (c.cls || '') + '">' + c.label +
          (sortK === c.k ? (asc ? ' ▲' : ' ▼') : '') + '</th>';
      }).join('') + '</tr></thead><tbody>' + rows.map(function (r) {
        return '<tr>' + cols.map(function (c) {
          return '<td style="text-align:' + (c.align || 'right') + '" class="' + (c.cls || '') + '">' + c.cell(r) + '</td>';
        }).join('') + '</tr>';
      }).join('') + '</tbody></table>';
      $$('#guTable th').forEach(function (th) {
        th.addEventListener('click', function () {
          var k = th.dataset.k;
          if (sortK === k) asc = !asc; else { sortK = k; asc = false; }
          render();
        });
      });
      void maxGap;
    }
    render();
    $('#guTable').insertAdjacentHTML('beforeend',
      '<p class="note" style="border-top:0;padding-top:6px;margin-top:0">공백지수 = (구·군 EV 점유율) ÷ (충전기 점유율) × 100. ' +
      '100보다 크면 등록대수에 비해 충전기가 적습니다. 대구 시계 밖 2개소(' + num(K.outside.chargers) + '기, ' + num(K.outside.kwh) + 'kWh)는 구·군 집계에서 제외했습니다.</p>');
  })();

  /* ── 3-2. 지도 ───────────────────────────────────── */
  (function () {
    var feats = D.geo.features, W = 720;
    var minLon = 1e9, maxLon = -1e9, minLat = 1e9, maxLat = -1e9;
    feats.forEach(function (f) {
      var polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      polys.forEach(function (p) { p.forEach(function (r) { r.forEach(function (pt) {
        if (pt[0] < minLon) minLon = pt[0]; if (pt[0] > maxLon) maxLon = pt[0];
        if (pt[1] < minLat) minLat = pt[1]; if (pt[1] > maxLat) maxLat = pt[1];
      }); }); });
    });
    var kx = Math.cos(35.87 * Math.PI / 180);
    var dx = (maxLon - minLon) * kx, dy = (maxLat - minLat);
    var H = Math.round(W * dy / dx), PAD = 10;
    var sx = (W - PAD * 2) / dx, sy = (H - PAD * 2) / dy;
    var sc = Math.min(sx, sy);
    var offX = PAD + ((W - PAD * 2) - dx * sc) / 2, offY = PAD + ((H - PAD * 2) - dy * sc) / 2;
    function px(lon) { return offX + (lon - minLon) * kx * sc; }
    function py(lat) { return offY + (maxLat - lat) * sc; }

    var dongByKey = {}; D.dong.forEach(function (d) { dongByKey[d.key] = d; });
    var s = svg('svg', { viewBox: '0 0 ' + W + ' ' + H });
    $('#map').appendChild(s);
    var gD = svg('g', {}, s), gS = svg('g', {}, s);

    var metrics = {
      ev: { label: 'EV 등록대수', bins: [200, 400, 700, 1000], unit: '대',
            colors: ['#eef4f0', '#d7eadf', '#a9d6c3', '#5fb894', '#1d7d5b'],
            get: function (d) { return d.ev; } },
      cov: { label: '도보 500m 커버리지', bins: [.1, .25, .45, .7], unit: '%', reverse: true,
             colors: ['#b3271e', '#e2803c', '#f0c987', '#a9d6c3', '#1d7d5b'],
             get: function (d) { return d.coverage500; } },
      unc: { label: '미충전 EV', bins: [100, 250, 450, 700], unit: '대',
             colors: ['#eef4f0', '#f7e6d6', '#f0c987', '#e2803c', '#b3271e'],
             get: function (d) { return d.uncoveredEv; } }
    };
    var cur = 'ev';
    function colorOf(m, v) {
      if (v === null || v === undefined) return '#f2f4f3';
      var i = 0; while (i < m.bins.length && v >= m.bins[i]) i++;
      return m.colors[i];
    }
    function pathOf(geom) {
      var polys = geom.type === 'Polygon' ? [geom.coordinates] : geom.coordinates;
      return polys.map(function (p) {
        return p.map(function (r) {
          return r.map(function (pt, i) { return (i ? 'L' : 'M') + px(pt[0]).toFixed(1) + ' ' + py(pt[1]).toFixed(1); }).join('') + 'Z';
        }).join('');
      }).join('');
    }
    function drawMap() {
      var m = metrics[cur];
      while (gD.firstChild) gD.removeChild(gD.firstChild);
      feats.forEach(function (f) {
        var key = f.properties.key, d = dongByKey[key];
        var p = svg('path', { d: pathOf(f.geometry), class: 'dong', fill: colorOf(m, d ? m.get(d) : null) }, gD);
        bindTip(p, function () {
          if (!d) return '<b>' + f.properties.gu + ' ' + f.properties.dong + '</b><br>등록대수 자료 없음';
          return '<b>' + d.label + '</b><br>등록 EV <b>' + num(d.ev) + '대</b> · 충전기 ' + num(d.chargers) + '기 (' + num(d.stations) + '개소)<br>' +
            '도보 500m 커버리지 ' + pct(d.coverage500 * 100, 1) + ' · 미충전 EV ' + num(d.uncoveredEv) + '대<br>' +
            '누적 충전량 ' + num(d.kwh) + 'kWh';
        });
      });
      // 충전소
      var stMax = Math.max.apply(null, D.stations.map(function (x) { return x.kwh; }));
      var sorted = D.stations.slice().sort(function (a, b) { return a.kwh - b.kwh; });
      var q = {}, n = sorted.length;
      sorted.forEach(function (x, i) { q[x.id] = i / n; });
      D.stations.forEach(function (x) {
        var r = 2.4 + 3.4 * Math.sqrt(x.kwh / stMax);
        var col = x.kwh === 0 ? '#95a49d' : q[x.id] >= .8 ? '#0b5c42' : q[x.id] >= .5 ? '#12855f' : '#c9761b';
        var c = svg('circle', { cx: px(x.lon).toFixed(1), cy: py(x.lat).toFixed(1), r: r.toFixed(2),
          class: 'station', fill: col, opacity: .92 }, gS);
        bindTip(c, function () {
          return '<b>' + x.name.replace('(RS)대구시_', '') + '</b><br>' + (x.gu || '시계 외') + ' ' + (x.dong || '') +
            '<br>충전기 ' + x.chargers + '기 (급속 ' + x.fast + '·완속 ' + x.slow + ')<br>누적 <b>' + num(x.kwh) + 'kWh</b>' +
            (x.low ? ' · 저이용 ' + x.low + '기' : '');
        });
      });
      // legend
      $('#mapLegend').innerHTML = '<span style="color:var(--muted);font-size:11px">면 = ' + m.label + '</span>' +
        m.colors.map(function (c, i) {
          var lab = i === 0 ? (m.reverse ? '낮음' : '~' + m.bins[0]) :
            (i === m.colors.length - 1 ? (m.reverse ? '높음' : m.bins[m.bins.length - 1] + '+') : num(m.bins[i - 1]) + '~' + num(m.bins[i]));
          if (m.reverse) lab = i === 0 ? '낮음' : i === m.colors.length - 1 ? '높음' : '';
          return '<span class="legend__item"><i class="legend__sw" style="background:' + c + '"></i>' + lab + '</span>';
        }).join('') +
        '<span class="legend__item" style="margin-left:6px"><i class="legend__cir" style="background:#c9761b"></i>충전소(저이용)</span>' +
        '<span class="legend__item"><i class="legend__cir" style="background:#12855f"></i>충전소</span>';
    }
    drawMap();
    $$('#mapToggle .seg__btn').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#mapToggle .seg__btn').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active'); cur = b.dataset.k; drawMap();
      });
    });
  })();

  /* ── 3-3. 우선순위 표 ────────────────────────────── */
  (function () {
    var rows = D.priority.slice(0, 12);
    $('#prioTable').innerHTML = '<table><thead><tr><th>행정동</th><th>등록 EV</th><th>충전기</th>' +
      '<th>커버리지</th><th>미충전 EV</th><th class="t-opt">EV/충전기</th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr><td><b>' + r.label + '</b></td><td>' + num(r.ev) + '</td><td>' + num(r.chargers) + '</td>' +
          '<td>' + pct(r.coverage500 * 100, 1) + '</td><td><b>' + num(r.uncoveredEv) + '</b></td>' +
          '<td class="t-opt">' + (r.evPerCharger === null ? '–' : num(r.evPerCharger, 1)) + '</td></tr>';
      }).join('') + '</tbody></table>';
    var sum = rows.reduce(function (a, r) { return a + r.uncoveredEv; }, 0);
    var el = $('#prioSum'); if (el) el.textContent = num(sum) + '대';
    var t = $('#topGapName'); if (t && D.priority[0]) t.textContent = D.priority[0].label;
  })();

  /* ── 4-1. 시나리오 ───────────────────────────────── */
  (function () {
    var sel = $('#simGu'), rng = $('#simN'), out = $('#simNOut');
    var targets = D.scenario.targets;
    sel.innerHTML = targets.map(function (t) { return '<option value="' + t.gu + '">' + t.gu + '</option>'; }).join('');
    var low = D.chargers.filter(function (c) { return c.kwh < 500; }).sort(function (a, b) { return a.kwh - b.kwh; });
    var byGu = {}; targets.forEach(function (t) { byGu[t.gu] = t; });
    var mode = 'city';
    var cityMed = { '급속': D.typeStats.fast.med, '완속': D.typeStats.slow.med };
    function calc() {
      var n = +rng.value; out.textContent = n + '기';
      var t = byGu[sel.value];
      var moved = low.slice(0, n), gain = 0;
      moved.forEach(function (c) {
        var target = mode === 'city' ? cityMed[c.type] : (c.type === '급속' ? t.fastMed : t.slowMed);
        gain += Math.max(0, target - c.kwh);
      });
      var cur = moved.reduce(function (a, c) { return a + c.kwh; }, 0);
      var per = n ? (cur + gain) / n : 0;
      var co2 = gain / 1000 * D.co2.ef;
      $('#simOut').innerHTML = [
        ['예상 추가 충전량', num(gain), 'kWh'],
        ['탄소 환산', num(co2), 'tCO2eq'],
        ['이동 후 1기당 평균', num(per), 'kWh']
      ].map(function (r) { return '<div><span>' + r[0] + '</span><b>' + r[1] + '<small>' + r[2] + '</small></b></div>'; }).join('');
      // 3D 디지털 트윈 연동 : 옮겨질 충전소·도착 구·군·증분을 그대로 전달
      var counts = {};
      moved.forEach(function (c) { counts[c.sid] = (counts[c.sid] || 0) + 1; });
      var state = { n: n, gu: sel.value, mode: mode, gainKwh: gain, per: per, moved: counts };
      window.EV_SIM_STATE = state;
      if (window.EVTwin && typeof window.EVTwin.setSim === 'function') window.EVTwin.setSim(state);
      try { window.dispatchEvent(new CustomEvent('evsim', { detail: state })); } catch (e) {}
    }
    rng.addEventListener('input', calc); sel.addEventListener('change', calc);
    $$('#simMode .seg__btn').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#simMode .seg__btn').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active'); mode = b.dataset.k; calc();
      });
    });
    var best = targets.slice().sort(function (a, b) { return b.uncoveredEv - a.uncoveredEv; })[0];
    sel.value = best ? best.gu : targets[0].gu;
    calc();
  })();

  /* ── 4-2. 탄소·주행 ─────────────────────────────── */
  (function () {
    var c = D.co2;
    var items = [
      ['전력 간접배출', num(c.t), 'tCO2eq', '2023년 계수 ' + c.ef],
      ['휘발유차 대체 시 배출', num(c.gasT), 'tCO2', '12km/L · 2.31kg/L 가정'],
      ['순감축(추정)', num(c.netT), 'tCO2eq', '대체 배출 − 전력 배출'],
      ['주행 환산', num(c.km), '만 km', '1kWh당 5.5km 가정']
    ];
    $('#co2').innerHTML = '<div class="statrow statrow--4">' + items.map(function (i) {
      return '<div class="stat" style="padding:12px"><span>' + i[0] + '</span><b style="font-size:19px">' + i[1] +
        '</b><div style="font-size:10.5px;color:var(--muted);margin-top:2px">' + i[2] + ' · ' + i[3] + '</div></div>';
    }).join('') + '</div>';
  })();

  /* ── 4-3. 충전기 진단표 ─────────────────────────── */
  (function () {
    var all = D.chargers.slice();
    var filter = 'all', sortK = 'kwh', asc = true;
    var pillCls = { '저이용': 'pill--low', '중단의심': 'pill--stop', '미사용': 'pill--zero', '이용중': 'pill--on' };
    var labels = { all: '전체', '저이용': '저이용', '중단의심': '중단 의심', '미사용': '미사용' };
    var counts = { all: all.length };
    all.forEach(function (c) { counts[c.state] = (counts[c.state] || 0) + 1; });
    $$('#chFilter .seg__btn').forEach(function (b) {
      var k = b.dataset.k;
      b.textContent = labels[k] + ' ' + num(counts[k] || 0) + '기';
    });
    var lowStop = all.filter(function (c) { return c.kwh < 500 && c.state === '중단의심'; }).length;
    var lowZero = all.filter(function (c) { return c.kwh < 500 && c.state === '미사용'; }).length;
    $('#chNote').innerHTML = '<b>저이용</b> = 18개월 누적 500kWh 미만이면서 최근에도 가동 기록이 있는 충전기(' +
      num(counts['저이용']) + '기). 500kWh 미만 전체는 <b>' + num(K.low) + '기</b>이며, 그중 ' + num(lowStop) +
      '기는 2026년 1월 이후 기록이 없어 <b>중단 의심</b>, ' + num(lowZero) + '기는 충전량 0인 <b>미사용</b>으로 나뉩니다. ' +
      '중단 의심 전체는 ' + num(counts['중단의심']) + '기(누적 200kWh 이상이면서 3개월 무기록)입니다. 세 분류는 서로 겹치지 않습니다.';
    function render() {
      var rows = all.filter(function (c) { return filter === 'all' || c.state === filter; });
      rows.sort(function (a, b) {
        var x = a[sortK], y = b[sortK];
        if (typeof x === 'string') return asc ? x.localeCompare(y) : y.localeCompare(x);
        return asc ? x - y : y - x;
      });
      rows = rows.slice(0, 200);
      $('#chTable').innerHTML = '<table><thead><tr>' +
        '<th data-k="name">충전소</th><th data-k="gu">구·군</th><th data-k="type">타입</th>' +
        '<th data-k="kwh">누적 kWh</th><th data-k="days">사용일</th><th data-k="last">마지막 기록</th><th data-k="state">상태</th>' +
        '</tr></thead><tbody>' + rows.map(function (c) {
          return '<tr><td class="nm">' + c.name.replace('(RS)대구시_', '') + ' <span style="color:var(--muted);font-size:11px">' + c.sid + ' #' + c.no + '</span></td>' +
            '<td>' + (c.gu || '시계 외') + '</td><td>' + c.type + '</td><td><b>' + num(c.kwh) + '</b></td>' +
            '<td>' + num(c.days) + '</td><td>' + (c.last || '–') + '</td>' +
            '<td><span class="pill ' + (pillCls[c.state] || '') + '">' + c.state + '</span></td></tr>';
        }).join('') + '</tbody></table>' +
        (rows.length >= 200 ? '<p class="note" style="margin:0;padding:8px 10px;border-top:1px solid var(--line)">상위 200기만 표시합니다. 정렬 기준을 바꾸면 다른 충전기를 볼 수 있습니다.</p>' : '');
      $$('#chTable th').forEach(function (th) {
        th.addEventListener('click', function () {
          var k = th.dataset.k;
          if (sortK === k) asc = !asc; else { sortK = k; asc = k === 'kwh' || k === 'name'; }
          render();
        });
      });
    }
    render();
    $$('#chFilter .seg__btn').forEach(function (b) {
      b.addEventListener('click', function () {
        $$('#chFilter .seg__btn').forEach(function (x) { x.classList.remove('is-active'); });
        b.classList.add('is-active'); filter = b.dataset.k; render();
      });
    });
  })();

  /* ── 5. 방법론 목록 ─────────────────────────────── */
  (function () {
    $('#rules').innerHTML = [
      '<li><b>집계 단위</b> : 충전소아이디·충전기아이디를 키로 사용했습니다. 충전소명칭은 시점에 따라 값이 바뀌는 행이 있어 최빈값을 대표값으로 썼습니다.</li>',
      '<li><b>누적 충전량</b> : 일자별 충전량(kWh)을 2024-10-18~2026-03-31 전 기간 합산했습니다. 2024년 10월(14일)과 2026년 3월은 일부 기간입니다.</li>',
      '<li><b>로렌츠·지니</b> : 충전소 219곳의 누적 충전량을 오름차순 정렬해 누적 비율 곡선을 만들고, 지니계수는 2Σ(i·xᵢ)/(n·Σx) − (n+1)/n으로 계산했습니다.</li>',
      '<li><b>저이용</b> : 18개월 누적 500kWh 미만(하루 평균 0.9kWh 미만)을 기준으로 했습니다. <b>중단 의심</b>은 누적 200kWh 이상이면서 2026-01-01 이후 기록이 없는 충전기입니다.</li>',
      '<li><b>공간 결합</b> : 충전소 좌표(위·경도)를 행정동 경계에 점-다각형 판정으로 배정했습니다(219개소 중 217개소 배정, 2개소는 대구 시계 밖).</li>',
      '<li><b>도보 500m 커버리지</b> : 행정동 내부를 120m 격자로 나눠 각 격자점에서 가장 가까운 충전소까지의 직선거리를 계산하고, 500m 이내 격자의 면적 비율로 산출했습니다.</li>',
      '<li><b>공백지수</b> : (구·군 EV 등록 점유율 ÷ 충전기 점유율) × 100. 100이면 등록대수와 충전기가 같은 비율로 배분된 상태입니다.</li>',
      '<li><b>가동률</b> : 누적 충전량 ÷ (분석일수 × 24시간 × 설비용량). 급속 50kW·완속 7kW를 가정했습니다.</li>',
      '<li><b>3D 트윈</b> : 충전소 좌표를 행정동 경계와 같은 등장방형 투영으로 3차원에 배치했습니다. 기둥 높이는 선택한 지표(누적 충전량·충전기 수)를 로그 스케일로, 이용률은 충전소 누적 충전량 ÷ (530일 × 24시간 × 충전소 설비용량)으로 계산했습니다. 재배치 시뮬레이터의 이동 대상은 누적 500kWh 미만 충전기를 충전량 오름차순으로 정렬해 정한 것입니다.</li>'
    ].join('');
    $('#sources').innerHTML = [
      '<li><b>대구광역시_전기자동차 충전기 이용 현황</b> · 대구광역시 · 반기 갱신(2026-03-31 기준) · 128,263행<br>' +
        '<a href="https://data.daegu.go.kr/open/data/dataView.do?dataSetId=15067156&dataSetDetailId=15067156dd74674c8f2f&provdMethod=FILE" target="_blank" rel="noopener">data.daegu.go.kr 데이터 상세</a><br>' +
        '<span style="font-size:11.5px;color:var(--muted)">공공데이터포털 개방 데이터 · 출처표시 조건 이용</span></li>',
      '<li><b>대구광역시_행정동별 전기차 등록대수</b> · 대구광역시 · 연간(2025-10-31 기준) · 150개 행정동<br>' +
        '<a href="https://data.daegu.go.kr/open/data/dataView.do?dataSetId=15072325&dataSetDetailId=150723251d4bf23fe59b7&provdMethod=FILE" target="_blank" rel="noopener">data.daegu.go.kr 데이터 상세</a><br>' +
        '<span style="font-size:11.5px;color:var(--muted)">공공데이터포털 개방 데이터 · 출처표시 조건 이용</span></li>',
      '<li><b>행정동 경계</b> · 통계청 SGIS 공개 행정동 경계(공공누리 제1유형) 기반 가공본 · CC BY 4.0<br>' +
        '<a href="https://github.com/vuski/admdongkor" target="_blank" rel="noopener">github.com/vuski/admdongkor</a><br>' +
        '<span style="font-size:11.5px;color:var(--muted)">지도 표시와 공간 결합에만 사용(분석 수치는 위 두 데이터셋에서 산출)</span></li>'
    ].join('');
    var dq = D.dataQuality;
    $('#quality').innerHTML = [
      '<li>동일 충전소 아이디에 <b>' + num(dq.multiName) + '개소</b>의 명칭이 서로 다르게 기록되어 있습니다(전체 219개소의 절반). 아이디 기준으로 집계하고 명칭은 최빈값을 표시했습니다.</li>',
      '<li><b>' + num(dq.multiType) + '기</b>는 급속·완속 표기가 시점에 따라 달라져, 최빈값으로 타입을 확정했습니다.</li>',
      '<li>충전량 0인 행이 593건, 18개월 누적 0kWh 충전기가 ' + num(dq.zeroKwh) + '기 있습니다. 사용 기록이 없는 날은 행 자체가 없어(<b>일평균 ' + dq.rowsPerDayMin + '~' + dq.rowsPerDayMax + '행</b>) 0으로 해석했습니다.</li>',
      '<li>전체 합계는 8,530,866.6kWh로, 공개된 요약값과 일치합니다. 충전소 수는 아이디 기준 <b>' + num(K.stations) + '개소</b>입니다(명칭 기준 218개).</li>'
    ].join('');
  })();

})();
