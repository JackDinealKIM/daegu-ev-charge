/* 대구 EV 스마트 차징 트윈 — Three.js 3D 디지털 트윈
   · data.js 의 219개 실제 충전소 좌표·충전량을 그대로 사용
   · 지표 전환(충전량·충전기 수·이용률), 카메라 프리셋, 호버/클릭 상세
   · 재배치 시뮬레이터 상태(window.EV_SIM_STATE / 'evsim' 이벤트)를 실시간 반영 */
(function () {
  'use strict';

  var D = window.DASH_DATA;
  var THREE = window.THREE;
  var host = document.getElementById('twin3d');
  if (!host) return;
  var fallback = document.getElementById('twinFallback');

  function showFallback() {
    if (fallback) fallback.hidden = false;
    host.style.display = 'none';
  }
  if (!D || !THREE || !D.stations || !D.geo) { showFallback(); return; }

  /* ── 0. 환경 ───────────────────────────────────── */
  var reduceMotion = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var webgl = null;
  try {
    var probe = document.createElement('canvas');
    webgl = probe.getContext('webgl2') || probe.getContext('webgl') || probe.getContext('experimental-webgl');
  } catch (e) { webgl = null; }
  if (!webgl) { showFallback(); return; }

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ antialias: (window.devicePixelRatio || 1) < 1.5, alpha: true, powerPreference: 'high-performance' });
  } catch (e2) { showFallback(); return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  if (THREE.ColorManagement) THREE.ColorManagement.legacyMode = false;
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.domElement.setAttribute('aria-hidden', 'true');
  host.appendChild(renderer.domElement);

  var scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x061a13, 230, 560);
  var camera = new THREE.PerspectiveCamera(36, 1, 1, 2000);

  /* ── 1. 좌표계 ─────────────────────────────────── */
  function ringsOf(f) {
    var g = f.geometry;
    var polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    var out = [];
    polys.forEach(function (p) { p.forEach(function (r) { out.push(r); }); });
    return out;
  }
  var minLon = Infinity, maxLon = -Infinity, minLat = Infinity, maxLat = -Infinity;
  D.geo.features.forEach(function (f) {
    ringsOf(f).forEach(function (r) {
      r.forEach(function (pt) {
        if (pt[0] < minLon) minLon = pt[0];
        if (pt[0] > maxLon) maxLon = pt[0];
        if (pt[1] < minLat) minLat = pt[1];
        if (pt[1] > maxLat) maxLat = pt[1];
      });
    });
  });
  var KX = Math.cos(35.87 * Math.PI / 180);
  var spanX = (maxLon - minLon) * KX;
  var spanZ = (maxLat - minLat);
  var SCALE = 136 / Math.max(spanX, spanZ);
  var midLon = (minLon + maxLon) / 2, midLat = (minLat + maxLat) / 2;
  var CITY_W = spanX * SCALE, CITY_D = spanZ * SCALE;
  function X(lon) { return (lon - midLon) * KX * SCALE; }
  function Z(lat) { return -(lat - midLat) * SCALE; }

  var dongByKey = {};
  D.dong.forEach(function (d) { dongByKey[d.key] = d; });

  /* 행정동 중심점 · 구·군 수요 무게중심 */
  var dongCentroid = {};
  D.geo.features.forEach(function (f) {
    var sx = 0, sz = 0, n = 0;
    ringsOf(f)[0].forEach(function (pt) { sx += X(pt[0]); sz += Z(pt[1]); n++; });
    if (n) dongCentroid[f.properties.key] = { x: sx / n, z: sz / n };
  });
  var guCentroid = {};
  D.geo.features.forEach(function (f) {
    var key = f.properties.gu, c = dongCentroid[f.properties.key];
    if (!c) return;
    if (!guCentroid[key]) guCentroid[key] = { x: 0, z: 0, w: 0 };
    var d = dongByKey[f.properties.key];
    var w = d ? Math.max(1, d.uncoveredEv) : 1;
    guCentroid[key].x += c.x * w; guCentroid[key].z += c.z * w; guCentroid[key].w += w;
  });
  Object.keys(guCentroid).forEach(function (k) {
    var g = guCentroid[k];
    if (g.w) { g.x /= g.w; g.z /= g.w; }
  });

  /* ── 2. 지표 정의 ──────────────────────────────── */
  var DAYS = D.meta.days || 530;
  var maxKwh = 0, maxCh = 1, maxUtil = 0;
  D.stations.forEach(function (s) {
    s._x = X(s.lon); s._z = Z(s.lat);
    s._cap = s.fast * 50 + s.slow * 7;
    s._util = s.kwh / (DAYS * 24 * Math.max(1, s._cap)) * 100;
    if (s.kwh > maxKwh) maxKwh = s.kwh;
    if (s.chargers > maxCh) maxCh = s.chargers;
    if (s._util > maxUtil) maxUtil = s._util;
  });

  var M = {
    kwh: {
      name: '누적 충전량', groundName: '행정동 충전량',
      axis: ['0', Math.round(maxKwh).toLocaleString('ko-KR') + ' kWh'],
      grad: 'linear-gradient(90deg,#1f8f70,#3ec9a0,#a9ffe1)',
      height: function (s) { return 1.2 + 30 * Math.pow(s.kwh / maxKwh, 0.85); },
      tone: function (s) { return Math.pow(s.kwh / maxKwh, 0.4); },
      ground: function (d) { return Math.pow(Math.max(0, d.kwh) / 408340, 0.5); }
    },
    chargers: {
      name: '충전기 수', groundName: '행정동 충전기 수',
      axis: ['1기', maxCh + '기'],
      grad: 'linear-gradient(90deg,#1f8f70,#3ec9a0,#a9ffe1)',
      height: function (s) { return 1.2 + 26 * Math.pow(s.chargers / maxCh, 0.9); },
      tone: function (s) { return Math.pow((s.chargers - 1) / Math.max(1, maxCh - 1), 0.6); },
      ground: function (d) { return Math.pow(d.chargers / 35, 0.6); }
    },
    util: {
      name: '이용률', groundName: '도보 500m 커버리지',
      axis: ['0%', maxUtil.toFixed(1) + '%'],
      grad: 'linear-gradient(90deg,#1f8f70,#3ec9a0,#a9ffe1)',
      height: function (s) { return 1.2 + 26 * Math.pow(s._util / Math.max(0.001, maxUtil), 0.7); },
      tone: function (s) { return Math.pow(s._util / Math.max(0.001, maxUtil), 0.4); },
      ground: function (d) { return Math.max(0, Math.min(1, d.coverage500)); }
    }
  };
  var metric = 'kwh';

  var COL_LOW = new THREE.Color('#1f8f70');
  var COL_MID = new THREE.Color('#3ec9a0');
  var COL_HIGH = new THREE.Color('#a9ffe1');
  function ramp(t) {
    t = Math.max(0, Math.min(1, t));
    if (t < 0.5) return COL_LOW.clone().lerp(COL_MID, t / 0.5);
    return COL_MID.clone().lerp(COL_HIGH, (t - 0.5) / 0.5);
  }
  var GR_LOW = new THREE.Color('#061a13'), GR_HIGH = new THREE.Color('#16563f');

  /* ── 3. 조명 ──────────────────────────────────── */
  scene.add(new THREE.HemisphereLight(0x9be8cd, 0x03100b, 0.45));
  var key = new THREE.DirectionalLight(0xffffff, 0.8);
  key.position.set(CITY_W * 0.45, 210, CITY_D * 0.42);
  scene.add(key);
  var fill = new THREE.DirectionalLight(0x4ff0bc, 0.3);
  fill.position.set(-140, 70, -120);
  scene.add(fill);

  /* ── 4. 지형 — 행정동 블록 (지표에 따라 높이가 변하는 3D 코로플레스) ── */
  var dongMeshes = {};
  (function buildGround() {
    D.geo.features.forEach(function (f) {
      var rings = ringsOf(f);
      if (!rings.length) return;
      var shape = new THREE.Shape();
      var outer = rings[0].map(function (pt) { return new THREE.Vector2(X(pt[0]), -Z(pt[1])); });
      shape.moveTo(outer[0].x, outer[0].y);
      for (var i = 1; i < outer.length; i++) shape.lineTo(outer[i].x, outer[i].y);
      for (var h = 1; h < rings.length; h++) {
        var pts = rings[h].map(function (pt) { return new THREE.Vector2(X(pt[0]), -Z(pt[1])); });
        var hole = new THREE.Path();
        hole.moveTo(pts[0].x, pts[0].y);
        for (var j = 1; j < pts.length; j++) hole.lineTo(pts[j].x, pts[j].y);
        shape.holes.push(hole);
      }
      var geo;
      try {
        geo = new THREE.ExtrudeGeometry(shape, { depth: 1, bevelEnabled: false, curveSegments: 1 });
      } catch (err) { return; }
      geo.rotateX(-Math.PI / 2);
      var mat = new THREE.MeshStandardMaterial({
        color: 0x123a2c, roughness: 0.95, metalness: 0.04,
        emissive: new THREE.Color('#03120c'), emissiveIntensity: 0.2
      });
      var mesh = new THREE.Mesh(geo, mat);
      mesh.position.y = -0.4;
      mesh.scale.y = 1;
      var lpts = rings[0].map(function (pt) { return new THREE.Vector3(X(pt[0]), 0, Z(pt[1])); });
      var line = new THREE.LineLoop(
        new THREE.BufferGeometry().setFromPoints(lpts),
        new THREE.LineBasicMaterial({ color: 0x59a98a, transparent: true, opacity: 0.34, depthWrite: false })
      );
      line.position.y = 1;
      mesh.add(line);
      scene.add(mesh);
      dongMeshes[f.properties.key] = { mesh: mesh, mat: mat, line: line, h: 1 };
    });
  })();

  function dongTop(key) {
    var o = dongMeshes[key];
    return o ? Math.max(0, o.mesh.position.y + o.mesh.scale.y) : 0;
  }

  /* 지면 그리드 */
  (function buildGrid() {
    var grid = new THREE.GridHelper(Math.max(CITY_W, CITY_D) * 2.1, 56, 0x1a5c46, 0x0f3a2c);
    grid.position.y = -1.9;
    grid.material.transparent = true;
    grid.material.opacity = 0.42;
    grid.material.depthWrite = false;
    scene.add(grid);
    var disc = new THREE.Mesh(
      new THREE.CircleGeometry(Math.max(CITY_W, CITY_D) * 1.5, 64),
      new THREE.MeshBasicMaterial({ color: 0x06271d, transparent: true, opacity: 0.55, depthWrite: false })
    );
    disc.geometry.rotateX(-Math.PI / 2);
    disc.position.y = -2.1;
    scene.add(disc);
  })();

  /* ── 5. 구·군 링 마커 + 라벨 ───────────────────── */
  var guMarkers = {};
  var districtLabels = [];
  (function buildDistrict() {
    Object.keys(guCentroid).forEach(function (name) {
      var c = guCentroid[name];
      var ring = new THREE.Mesh(
        new THREE.RingGeometry(2.4, 2.66, 44),
        new THREE.MeshBasicMaterial({ color: 0x8fd3b6, transparent: true, opacity: 0.34, side: THREE.DoubleSide, depthWrite: false })
      );
      ring.geometry.rotateX(-Math.PI / 2);
      ring.position.set(c.x, 0.09, c.z);
      scene.add(ring);
      guMarkers[name] = ring;

      var label = makeLabel(name, { color: '#cdeee0', font: '700 46px', pad: 14, scale: 5.2, opacity: 0.42, depthTest: false });
      label.userData.gu = name;
      label.position.set(c.x, 3, c.z);
      districtLabels.push(label);
      scene.add(label);
    });
  })();

  function makeLabel(text, opt) {
    opt = opt || {};
    var dpr = 2;
    var c = document.createElement('canvas');
    var ctx = c.getContext('2d');
    var font = (opt.font || '700 44px') + ' "Pretendard","Apple SD Gothic Neo","Noto Sans KR",system-ui,sans-serif';
    ctx.font = font;
    var w = Math.ceil(ctx.measureText(text).width) + (opt.pad || 16) * 2;
    var h = 76;
    c.width = w * dpr; c.height = h * dpr;
    ctx = c.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.font = font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (opt.bg) {
      ctx.fillStyle = opt.bg;
      roundRect(ctx, 1, 1, w - 2, h - 2, 16);
      ctx.fill();
    }
    ctx.fillStyle = opt.color || '#eaf6f0';
    ctx.fillText(text, w / 2, h / 2 + 1);
    var tex = new THREE.CanvasTexture(c);
    tex.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy ? renderer.capabilities.getMaxAnisotropy() : 4);
    var mat = new THREE.SpriteMaterial({
      map: tex, transparent: true, depthWrite: false,
      depthTest: opt.depthTest !== false,
      opacity: opt.opacity == null ? 1 : opt.opacity
    });
    var sp = new THREE.Sprite(mat);
    var s = opt.scale || 4.4;
    sp.scale.set(s * (w / h), s, 1);
    sp.userData.dispose = function () { tex.dispose(); mat.dispose(); };
    return sp;
  }
  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  /* ── 6. 충전소 기둥 ────────────────────────────── */
  var towerGroup = new THREE.Group();
  scene.add(towerGroup);
  var colGeo = new THREE.CylinderGeometry(0.72, 1, 1, 12, 1, false);
  colGeo.translate(0, 0.5, 0);
  var glowGeo = new THREE.CircleGeometry(1, 12);
  glowGeo.rotateX(-Math.PI / 2);

  var towers = [];
  D.stations.forEach(function (s, i) {
    var r = 0.3 + 0.13 * Math.sqrt(s.chargers);
    var mat = new THREE.MeshStandardMaterial({
      color: 0x0a1f18, emissive: new THREE.Color(0x2ee6a8), emissiveIntensity: 0.55,
      roughness: 0.34, metalness: 0.24, transparent: true, opacity: 0.97
    });
    var mesh = new THREE.Mesh(colGeo, mat);
    mesh.position.set(s._x, 0, s._z);
    mesh.scale.set(r, 2, r);
    mesh.userData.i = i;
    towerGroup.add(mesh);

    var gMat = new THREE.MeshBasicMaterial({
      color: 0x2ee6a8, transparent: true, opacity: 0.26,
      blending: THREE.AdditiveBlending, depthWrite: false
    });
    var glow = new THREE.Mesh(glowGeo, gMat);
    glow.position.set(s._x, 0.11, s._z);
    glow.scale.set(r * 3.4, 1, r * 3.4);
    towerGroup.add(glow);

    towers.push({ s: s, mesh: mesh, mat: mat, glow: glow, gMat: gMat, r: r, h: 2, color: new THREE.Color(0x2ee6a8), glowI: 0.55 });
  });

  /* 기둥 상단 발광 (한 번의 draw call) */
  function glowTexture() {
    var c = document.createElement('canvas');
    c.width = c.height = 64;
    var g = c.getContext('2d');
    var grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grd.addColorStop(0, 'rgba(255,255,255,1)');
    grd.addColorStop(0.28, 'rgba(255,255,255,.55)');
    grd.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grd;
    g.fillRect(0, 0, 64, 64);
    var t = new THREE.CanvasTexture(c);
    return t;
  }
  var headGlow = (function () {
    var n = towers.length;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    geo.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
    var mat = new THREE.PointsMaterial({
      map: glowTexture(), size: 5.2, sizeAttenuation: true, transparent: true,
      blending: THREE.AdditiveBlending, depthWrite: false, vertexColors: true, opacity: 0.62
    });
    var pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    scene.add(pts);
    return pts;
  })();

  function retarget() {
    var m = M[metric];
    towers.forEach(function (t) {
      var moved = simCount(t.s.id);
      var baseH = m.height(t.s);
      var ratio = moved ? moved / t.s.chargers : 0;
      t.h = baseH * (1 - 0.6 * Math.min(1, ratio));
      t.color.copy(ramp(m.tone(t.s)));
      if (moved) {
        t.color.lerp(new THREE.Color('#f6a93c'), 0.82);
        t.glowI = 1.0;
      } else {
        t.glowI = 0.55;
      }
      t.moved = !!moved;
      t.gMat.color.copy(moved ? new THREE.Color('#f0b45c') : t.color);
      t.gMat.opacity = moved ? 0.34 : 0.26;
    });
    paintGround();
  }

  var guMaxTop = {};
  function paintGround() {
    var m = M[metric];
    var tmp = new THREE.Color();
    guMaxTop = {};
    Object.keys(dongMeshes).forEach(function (k) {
      var o = dongMeshes[k];
      var d = dongByKey[k];
      var v = d ? Math.pow(Math.max(0, Math.min(1, m.ground(d))), 1.25) : 0;
      tmp.copy(GR_LOW).lerp(GR_HIGH, v);
      o.mat.color.copy(tmp);
      o.h = 0.6 + 9.4 * v;
      if (d) guMaxTop[d.gu] = Math.max(guMaxTop[d.gu] || 0, o.h);
    });
    districtLabels.forEach(function (lb) {
      var gp = lb.userData.gu;
      lb.position.y = Math.max(3, (guMaxTop[gp] || 0) - 0.4 + 2.4);
    });
  }

  /* ── 7. 카메라 컨트롤 ──────────────────────────── */
  var R = Math.max(CITY_W, CITY_D) / 2;
  var FOV = 36;
  var MIN_D = 22;
  var MAX_D = 560;
  function fitDist(k, phi) {
    var vFov = FOV * Math.PI / 180;
    var hFov = 2 * Math.atan(Math.tan(vFov / 2) * Math.max(0.25, camera.aspect || 1.4));
    var p = phi || (goal && goal.ph) || 0.9;
    var elev = Math.PI / 2 - p;
    var projD = CITY_D * Math.sin(elev) + 14 * Math.cos(elev);
    var dV = (projD / 2) / Math.tan(vFov / 2);
    var dH = (CITY_W / 2) / Math.tan(hFov / 2);
    return Math.max(dV, dH) * (k || 1.14);
  }

  var cam = { th: 0.4, ph: 0.82, d: fitDist(1.14, 0.82), tx: 0, ty: 6, tz: -4 };
  var goal = { th: 0.4, ph: 0.82, d: fitDist(1.14, 0.82), tx: 0, ty: 6, tz: -4 };

  function topStationCentroid() {
    var top = D.stations.slice().sort(function (a, b) { return b.kwh - a.kwh; }).slice(0, 40);
    var x = 0, z = 0, hh = 0;
    top.forEach(function (s) { x += s._x; z += s._z; hh += M[metric].height(s); });
    return { x: x / top.length, z: z / top.length, y: hh / top.length * 0.55 };
  }
  function priorityCentroid() {
    var x = 0, z = 0, w = 0;
    D.priority.slice(0, 3).forEach(function (p) {
      var c = dongCentroid[p.key];
      if (!c) return;
      var wt = Math.max(1, p.uncoveredEv);
      x += c.x * wt; z += c.z * wt; w += wt;
    });
    if (!w) return { x: 0, z: 0, y: 0 };
    return { x: x / w, z: z / w, y: 2 };
  }

  function applyPreset(k, instant) {
    var c;
    if (k === 'core') {
      c = topStationCentroid();
      goal.th = 0.85; goal.ph = 0.86; goal.d = 104; goal.tx = c.x; goal.tz = c.z; goal.ty = Math.max(6, c.y);
    } else if (k === 'edge') {
      c = priorityCentroid();
      goal.th = 0.35; goal.ph = 0.95; goal.d = 96; goal.tx = c.x; goal.tz = c.z; goal.ty = Math.max(3, c.y);
    } else {
      goal.th = 0.4; goal.ph = 0.82; goal.d = fitDist(); goal.tx = 0; goal.tz = -4; goal.ty = 6;
    }
    if (instant) {
      cam.th = goal.th; cam.ph = goal.ph; cam.d = goal.d;
      cam.tx = goal.tx; cam.ty = goal.ty; cam.tz = goal.tz;
    }
    syncCamButtons(k);
  }
  function syncCamButtons(k) {
    Array.prototype.forEach.call(document.querySelectorAll('#twinCam .seg__btn'), function (b) {
      b.classList.toggle('is-active', b.dataset.k === k);
      b.setAttribute('aria-pressed', b.dataset.k === k ? 'true' : 'false');
    });
  }

  var drag = { active: new Map(), moved: 0, lastX: 0, lastY: 0, pinch: 0, downX: 0, downY: 0 };
  var el = renderer.domElement;
  var idleSince = 0;

  el.addEventListener('pointerdown', function (ev) {
    el.setPointerCapture(ev.pointerId);
    updateRect();
    drag.active.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    drag.moved = 0;
    drag.lastX = ev.clientX; drag.lastY = ev.clientY;
    drag.downX = ev.clientX; drag.downY = ev.clientY;
    if (drag.active.size === 2) drag.pinch = pinchDistance();
    idleSince = performance.now();
    hideTip();
  });

  el.addEventListener('pointermove', function (ev) {
    if (drag.active.has(ev.pointerId)) {
      var prev = drag.active.get(ev.pointerId);
      drag.active.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      var dx = ev.clientX - prev.x, dy = ev.clientY - prev.y;
      drag.moved += Math.abs(dx) + Math.abs(dy);
      if (drag.active.size === 1) {
        goal.th -= dx * 0.0064;
        goal.ph = Math.max(0.13, Math.min(1.38, goal.ph - dy * 0.0052));
      } else if (drag.active.size === 2) {
        var d = pinchDistance();
        if (drag.pinch > 0) goal.d = Math.max(MIN_D, Math.min(MAX_D, goal.d * (drag.pinch / Math.max(1, d))));
        drag.pinch = d;
      }
      idleSince = performance.now();
      return;
    }
    if (ev.pointerType === 'touch') return;
    if (!rect.width) updateRect();
    pointer.x = (ev.clientX - rect.left) / rect.width * 2 - 1;
    pointer.y = -(ev.clientY - rect.top) / rect.height * 2 + 1;
    pointer.clientX = ev.clientX; pointer.clientY = ev.clientY;
    hoverDirty = true;
    idleSince = performance.now();
  });

  function endPointer(ev) {
    if (!drag.active.has(ev.pointerId)) return;
    drag.active.delete(ev.pointerId);
    if (drag.active.size < 2) drag.pinch = 0;
    if (drag.active.size === 0 && drag.moved < 8) {
      pick(ev.clientX, ev.clientY, true);
    }
  }
  el.addEventListener('pointerup', endPointer);
  el.addEventListener('pointercancel', endPointer);
  el.addEventListener('pointerleave', function () {
    hideTip(); hoverDirty = false;
    if (hoverIdx >= 0) { towers[hoverIdx].mat.emissiveIntensity = towers[hoverIdx].glowI; hoverIdx = -1; }
  });

  el.addEventListener('wheel', function (ev) {
    ev.preventDefault();
    goal.d = Math.max(MIN_D, Math.min(MAX_D, goal.d * (1 + (ev.deltaY > 0 ? 1 : -1) * 0.09)));
    idleSince = performance.now();
  }, { passive: false });

  var rect = { left: 0, top: 0, width: 1, height: 1 };
  function updateRect() {
    var box = el.getBoundingClientRect();
    rect.left = box.left; rect.top = box.top; rect.width = box.width || 1; rect.height = box.height || 1;
  }
  window.addEventListener('scroll', updateRect, { passive: true });
  function pinchDistance() {
    var pts = Array.from(drag.active.values());
    if (pts.length < 2) return 0;
    var dx = pts[0].x - pts[1].x, dy = pts[0].y - pts[1].y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  /* ── 8. 호버 · 선택 ────────────────────────────── */
  var raycaster = new THREE.Raycaster();
  var pointer = new THREE.Vector2(-2, -2);
  pointer.clientX = 0; pointer.clientY = 0;
  var hoverDirty = false, hoverIdx = -1, selected = -1;
  var towerMeshes = towers.map(function (t) { return t.mesh; });

  var tipEl = document.getElementById('tip');
  function showTip(html, x, y) {
    if (!tipEl) return;
    tipEl.innerHTML = html;
    tipEl.classList.add('is-on');
    var w = window.innerWidth;
    tipEl.style.left = Math.min(Math.max(x, 96), w - 96) + 'px';
    tipEl.style.top = Math.max(y - 6, 60) + 'px';
  }
  function hideTip() { if (tipEl) tipEl.classList.remove('is-on'); }

  function num(n, d) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    return Number(n).toLocaleString('ko-KR', { minimumFractionDigits: d || 0, maximumFractionDigits: d === undefined ? 0 : d });
  }
  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }
  function stationTitle(s) { return s.name.replace('(RS)대구시_', ''); }
  function tipHtml(s) {
    return '<b>' + esc(stationTitle(s)) + '</b><br>' + esc(s.gu) + ' ' + esc(s.dong || '') +
      '<br>누적 <b>' + num(s.kwh) + 'kWh</b> · 충전기 ' + s.chargers + '기' +
      '<br>이용률 ' + s._util.toFixed(1) + '%' + (s.kwh < 500 ? ' · 저이용' : '');
  }

  function pick(cx, cy, select) {
    updateRect();
    raycaster.setFromCamera(new THREE.Vector2(
      (cx - rect.left) / rect.width * 2 - 1,
      -((cy - rect.top) / rect.height * 2 - 1)
    ), camera);
    var hits = raycaster.intersectObjects(towerMeshes, false);
    if (!hits.length) {
      if (select) {
        selected = -1; showDetail(-1); updateSelectionMarker(); hideTip();
        var b1 = document.getElementById('twinSim');
        if (b1) b1.hidden = !sim;
      }
      return;
    }
    var idx = hits[0].object.userData.i;
    if (select) { selectStation(idx); }
    else { hoverIdx = idx; }
  }

  function selectStation(i) {
    selected = i;
    showDetail(i);
    updateSelectionMarker();
    var b0 = document.getElementById('twinSim');
    if (b0) b0.hidden = true;
    var t = towers[i];
    goal.tx = t.s._x; goal.tz = t.s._z;
    goal.ty = Math.max(3, t.h * 0.55);
    goal.d = Math.max(MIN_D, Math.min(goal.d, 78));
    hideTip();
  }

  var detail = document.getElementById('twinDetail');
  var detailBody = document.getElementById('twinDetailBody');
  function showDetail(i) {
    if (!detail || !detailBody) return;
    if (i < 0) { detail.hidden = true; return; }
    var s = towers[i].s;
    var moved = simCount(s.id);
    var rows = [
      ['위치', s.gu + ' ' + (s.dong || '')],
      ['충전기', s.chargers + '기 · 급속 ' + s.fast + ' / 완속 ' + s.slow],
      ['누적 충전량', num(s.kwh) + ' kWh'],
      ['사용 기록', num(s.cnt) + '회'],
      ['이용률', s._util.toFixed(1) + '%']
    ];
    if (s.kwh < 500) rows.push(['진단', '저이용 (500kWh 미만)']);
    if (moved) rows.push(['재배치', moved + '기 이동 대상']);
    detailBody.innerHTML = '<h4>' + esc(stationTitle(s)) + '</h4><dl>' +
      rows.map(function (r) { return '<dt>' + r[0] + '</dt><dd>' + esc(r[1]) + '</dd>'; }).join('') + '</dl>';
    detail.hidden = false;
  }
  var detailClose = document.getElementById('twinDetailClose');
  if (detailClose) detailClose.addEventListener('click', function () {
    selected = -1; showDetail(-1); updateSelectionMarker();
  });

  /* 선택 표시: 기둥 위 링 + 이름 라벨 */
  var selMark = null;
  function clearSelectionMarker() {
    if (selMark) {
      if (selMark.label) { scene.remove(selMark.label); selMark.label.material.map.dispose(); selMark.label.material.dispose(); }
      if (selMark.ring) { scene.remove(selMark.ring); selMark.ring.geometry.dispose(); selMark.ring.material.dispose(); }
      selMark = null;
    }
  }
  function updateSelectionMarker() {
    clearSelectionMarker();
    if (selected < 0) return;
    var t = towers[selected];
    var ring = new THREE.Mesh(
      new THREE.RingGeometry(1, 1.22, 44),
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9, side: THREE.DoubleSide, depthWrite: false })
    );
    ring.geometry.rotateX(-Math.PI / 2);
    scene.add(ring);
    var label = makeLabel(stationTitle(t.s), { color: '#06231a', bg: 'rgba(255,255,255,.94)', font: '800 38px', pad: 16, scale: 3.0, depthTest: false });
    label.renderOrder = 12;
    ring.renderOrder = 8;
    scene.add(label);
    selMark = { i: selected, ring: ring, label: label };
  }

  /* ── 9. 재배치 시뮬레이터 연동 ──────────────────── */
  var sim = null;
  var simMoved = {};
  var simGroup = new THREE.Group();
  scene.add(simGroup);
  var simCurves = [];
  var simDots = null;
  var simRing = null, simLabel = null, simLabelKey = '';

  function simCount(id) { return simMoved[id] || 0; }

  function clearGroup(g) {
    while (g.children.length) {
      var c = g.children.pop();
      if (c.isSprite) {
        if (c.material) {
          if (c.material.map) c.material.map.dispose();
          c.material.dispose();
        }
      } else {
        if (c.geometry) c.geometry.dispose();
        if (c.material) c.material.dispose();
      }
      g.remove(c);
    }
  }

  function setSim(state) {
    sim = state && state.n > 0 ? state : null;
    simMoved = {};
    if (sim && sim.moved) {
      Object.keys(sim.moved).forEach(function (id) { simMoved[id] = sim.moved[id]; });
    }
    buildSimVisuals();
    retarget();
    if (selected >= 0) showDetail(selected);
    var badge = document.getElementById('twinSim');
    var stEl = document.getElementById('twinSimStations');
    var rtEl = document.getElementById('twinSimRatio');
    var stationCount = Object.keys(simMoved).length;
    if (stEl) stEl.textContent = stationCount ? num(stationCount) : '–';
    if (rtEl) rtEl.textContent = sim && sim.n ? num(Math.round(sim.gainKwh / sim.n)) : '–';
    var listEl = document.getElementById('twinSimList');
    if (listEl) {
      if (sim && stationCount) {
        var pick3 = towers.filter(function (t) { return simMoved[t.s.id]; })
          .sort(function (a, b) { return b.s.chargers - a.s.chargers || a.s.kwh - b.s.kwh; })
          .slice(0, 3);
        listEl.innerHTML = '<span class="twin-panel__list-h">이동 대상 상위 3곳</span>' +
          pick3.map(function (t) {
            return '<div class="twin-panel__row"><i></i><span>' + esc(stationTitle(t.s)) + '</span>' +
              '<b>' + simMoved[t.s.id] + '기 · 누적 ' + num(t.s.kwh) + 'kWh</b></div>';
          }).join('');
      } else {
        listEl.innerHTML = '';
      }
    }
    if (badge) {
      if (sim) {
        badge.hidden = false;
        badge.innerHTML = '재배치 <b>' + num(sim.n) + '기</b> → <b>' + esc(sim.gu) + '</b> · 예상 <b>+' +
          num(Math.round(sim.gainKwh)) + 'kWh</b>';
      } else {
        badge.hidden = true;
      }
    }
    syncCamButtons(currentPreset);
  }

  function buildSimVisuals() {
    clearGroup(simGroup);
    simCurves = [];
    simDots = null; simRing = null; simLabel = null;
    if (!sim) return;

    var dest = guCentroid[sim.gu] || { x: 0, z: 0 };
    var destY = 0.6;
    D.dong.forEach(function (d) {
      if (d.gu !== sim.gu || !dongMeshes[d.key]) return;
      destY = Math.max(destY, dongTop(d.key) + 0.5);
    });

    /* 도착 신호 */
    simRing = new THREE.Mesh(
      new THREE.RingGeometry(3.2, 3.6, 56),
      new THREE.MeshBasicMaterial({
        color: 0x2ee6a8, transparent: true, opacity: 0.75,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
      })
    );
    simRing.geometry.rotateX(-Math.PI / 2);
    simRing.position.set(dest.x, destY, dest.z);
    simGroup.add(simRing);

    var inner = new THREE.Mesh(
      new THREE.RingGeometry(1.1, 1.5, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffffff, transparent: true, opacity: 0.7,
        side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
      })
    );
    inner.geometry.rotateX(-Math.PI / 2);
    inner.position.set(dest.x, destY + 0.02, dest.z);
    simGroup.add(inner);
    simRing.userData.inner = inner;

    /* 이동 경로 */
    var idxs = [];
    for (var i = 0; i < towers.length; i++) { if (simMoved[towers[i].s.id]) idxs.push(i); }
    var step = Math.max(1, Math.floor(idxs.length / 14));
    var picked = [];
    for (var j = 0; j < idxs.length; j += step) picked.push(idxs[j]);
    if (picked.length > 14) picked = picked.slice(0, 14);

    picked.forEach(function (idx) {
      var t = towers[idx];
      var a = new THREE.Vector3(t.s._x, dongTop(t.s.gu + t.s.dong) + Math.max(1.2, t.h * 0.95), t.s._z);
      var b = new THREE.Vector3(dest.x, destY + 0.4, dest.z);
      var mid = new THREE.Vector3((a.x + b.x) / 2, Math.max(a.y, 12) + 9, (a.z + b.z) / 2);
      var curve = new THREE.QuadraticBezierCurve3(a, mid, b);
      var pts = curve.getPoints(30);
      var geo = new THREE.BufferGeometry().setFromPoints(pts);
      simGroup.add(new THREE.Line(geo, new THREE.LineBasicMaterial({
        color: 0xf0b45c, transparent: true, opacity: 0.3,
        depthWrite: false, blending: THREE.AdditiveBlending
      })));
      simCurves.push(curve);
    });

    if (simCurves.length) {
      var dotGeo = new THREE.BufferGeometry();
      var arr = new Float32Array(simCurves.length * 3);
      dotGeo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
      var dotMat = new THREE.PointsMaterial({
        color: 0xffe7bd, size: 1.5, transparent: true, opacity: 0.95,
        depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true
      });
      simDots = new THREE.Points(dotGeo, dotMat);
      simDots.userData.t = simCurves.map(function (_, k) { return (k * 0.37) % 1; });
      simGroup.add(simDots);
    }

    /* 도착지 라벨 */
    var keyTxt = sim.gu + '|' + num(Math.round(sim.gainKwh)) + '|' + sim.n;
    simLabel = makeLabel(sim.gu + ' 도착', {
      color: '#08261b', bg: 'rgba(240,180,92,.92)', font: '800 42px', pad: 18, scale: 3.2, depthTest: false
    });
    simLabel.renderOrder = 11;
    simLabel.position.set(dest.x, destY + 27, dest.z);
    simLabel.userData.key = keyTxt;
    simGroup.add(simLabel);
    simLabelKey = keyTxt;

    /* 이동 대상 기둥 표시 */
    picked.forEach(function (idx) {
      var t = towers[idx];
      var halo = new THREE.Mesh(
        new THREE.RingGeometry(t.r * 1.9, t.r * 2.5, 28),
        new THREE.MeshBasicMaterial({
          color: 0xf0b45c, transparent: true, opacity: 0.6,
          side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending
        })
      );
      halo.geometry.rotateX(-Math.PI / 2);
      halo.position.set(t.s._x, dongTop(t.s.gu + t.s.dong) + 0.14, t.s._z);
      simGroup.add(halo);
    });
  }

  /* ── 10. UI ───────────────────────────────────── */
  function setMetric(k, silent) {
    if (!M[k]) return;
    metric = k;
    Array.prototype.forEach.call(document.querySelectorAll('#twinMetric .seg__btn'), function (b) {
      var on = b.dataset.k === k;
      b.classList.toggle('is-active', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
    });
    var nameEl = document.getElementById('twinMetricName');
    if (nameEl) nameEl.textContent = M[k].name;
    var gEl = document.getElementById('twinGroundName');
    if (gEl) gEl.textContent = M[k].groundName;
    renderLegend();
    retarget();
    if (!silent && selected >= 0) showDetail(selected);
  }

  function renderLegend() {
    var box = document.getElementById('twinLegend');
    if (!box) return;
    var m = M[metric];
    box.innerHTML = '<b>기둥 = ' + m.name + '</b>' +
      '<span class="twin__scale"><em style="background:' + m.grad + '"></em></span>' +
      '<span style="display:flex;justify-content:space-between;font-size:10px;color:#9fbfb2">' +
      '<span>' + m.axis[0] + '</span><span>' + m.axis[1] + '</span></span>' +
      '<span style="font-size:10.5px;color:#9fbfb2"><i class="dot" style="background:#f0b45c"></i>주황 = 재배치 대상 기둥</span>';
  }

  var currentPreset = 'all';
  Array.prototype.forEach.call(document.querySelectorAll('#twinMetric .seg__btn'), function (b) {
    b.addEventListener('click', function () { setMetric(b.dataset.k); });
  });
  Array.prototype.forEach.call(document.querySelectorAll('#twinCam .seg__btn'), function (b) {
    b.addEventListener('click', function () { currentPreset = b.dataset.k; applyPreset(b.dataset.k); });
  });

  /* ── 11. 렌더 루프 ─────────────────────────────── */
  function resize() {
    var w = host.clientWidth || 0, h = host.clientHeight || 0;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    updateRect();
    if (currentPreset === 'all') { goal.d = fitDist(); }
  }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(host);

  var clock = 0, lastT = 0, running = false, rafId = 0;

  function animate(dt) {
    clock += dt;
    var k = 1 - Math.exp(-dt * 8.5);
    if (!drag.active.size && !reduceMotion) {
      var idle = performance.now() - idleSince;
      if (idle > 6500) goal.th += dt * 0.055;
    }
    cam.th += (goal.th - cam.th) * k;
    cam.ph += (goal.ph - cam.ph) * k;
    cam.d += (goal.d - cam.d) * k;
    cam.tx += (goal.tx - cam.tx) * k;
    cam.ty += (goal.ty - cam.ty) * k;
    cam.tz += (goal.tz - cam.tz) * k;

    var sp = Math.sin(cam.ph), cp = Math.cos(cam.ph);
    camera.position.set(
      cam.tx + cam.d * sp * Math.sin(cam.th),
      cam.ty + cam.d * cp,
      cam.tz + cam.d * sp * Math.cos(cam.th)
    );
    camera.lookAt(cam.tx, cam.ty, cam.tz);

    /* 기둥 높이·색 보간 */
    var kk = 1 - Math.exp(-dt * 7);
    Object.keys(dongMeshes).forEach(function (k2) {
      var o = dongMeshes[k2];
      o.mesh.scale.y += (o.h - o.mesh.scale.y) * kk;
    });
    for (var i = 0; i < towers.length; i++) {
      var t = towers[i];
      var base = dongTop(t.s.gu + t.s.dong);
      t.mesh.position.y = base;
      t.glow.position.y = base + 0.12;
      var ch = t.mesh.scale.y + (t.h - t.mesh.scale.y) * kk;
      t.mesh.scale.y = ch;
      t.mat.emissive.lerp(t.color, kk);
      var targetOp = t.moved ? 0.88 : 0.97;
      if (i === hoverIdx || i === selected) targetOp = 1;
      t.mat.opacity += (targetOp - t.mat.opacity) * kk;
      var targetI = (i === hoverIdx || i === selected) ? 1.7 : t.glowI;
      t.mat.emissiveIntensity += (targetI - t.mat.emissiveIntensity) * kk;
      t.gMat.color.lerp(t.color, kk);
      if (i === selected) {
        var pulse = reduceMotion ? 1 : 1 + 0.06 * Math.sin(clock * 4);
        t.mesh.scale.x = t.r * pulse;
        t.mesh.scale.z = t.r * pulse;
      } else if (t.mesh.scale.x !== t.r) {
        t.mesh.scale.x += (t.r - t.mesh.scale.x) * kk;
        t.mesh.scale.z += (t.r - t.mesh.scale.z) * kk;
      }
    }

    if (selMark) {
      var st = towers[selMark.i];
      var top = st.mesh.position.y + st.mesh.scale.y;
      var pulse2 = reduceMotion ? 1 : 1 + 0.08 * Math.sin(clock * 3.2);
      selMark.ring.position.set(st.s._x, top + 0.25, st.s._z);
      selMark.ring.scale.set(st.r * 3.2 * pulse2, 1, st.r * 3.2 * pulse2);
      selMark.label.position.set(st.s._x, top + 3.6, st.s._z);
    }

    /* 기둥 상단 발광 갱신 */
    (function () {
      var pos = headGlow.geometry.getAttribute('position');
      var col = headGlow.geometry.getAttribute('color');
      for (var g2 = 0; g2 < towers.length; g2++) {
        var tg = towers[g2];
        pos.setXYZ(g2, tg.s._x, tg.mesh.position.y + tg.mesh.scale.y, tg.s._z);
        col.setXYZ(g2, tg.mat.emissive.r, tg.mat.emissive.g, tg.mat.emissive.b);
      }
      pos.needsUpdate = true; col.needsUpdate = true;
    })();

    /* 호버 판정 */
    if (hoverDirty) {
      hoverDirty = false;
      if (drag.active.size === 0) {
        raycaster.setFromCamera(pointer, camera);
        var hits = raycaster.intersectObjects(towerMeshes, false);
        var next = hits.length ? hits[0].object.userData.i : -1;
        if (next !== hoverIdx) {
          hoverIdx = next;
          if (next >= 0) {
            var s = towers[next].s;
            showTip(tipHtml(s), pointer.clientX, pointer.clientY);
          } else hideTip();
        } else if (next >= 0) {
          showTip(tipHtml(towers[next].s), pointer.clientX, pointer.clientY);
        }
      }
    }

    /* 시뮬레이션 연출 */
    if (simRing) {
      var p = reduceMotion ? 1 : 1 + 0.18 * Math.sin(clock * 2.4);
      simRing.scale.set(p, 1, p);
      if (simRing.userData.inner) simRing.userData.inner.scale.set(p * 1.06, 1, p * 1.06);
      if (simLabel) simLabel.userData.y0 = simLabel.userData.y0 == null ? simLabel.position.y : simLabel.userData.y0;
      if (simLabel) simLabel.position.y = simLabel.userData.y0 + Math.sin(clock * 1.6) * 0.5;
    }
    if (simDots && simDots.userData.t) {
      var pos = simDots.geometry.getAttribute('position');
      for (var d = 0; d < simCurves.length; d++) {
        var tt = (simDots.userData.t[d] + dt * 0.18) % 1;
        simDots.userData.t[d] = tt;
        var v = simCurves[d].getPoint(tt);
        pos.setXYZ(d, v.x, v.y, v.z);
      }
      pos.needsUpdate = true;
    }
    guMarkersIsh(dt);
  }

  var markerPhase = 0;
  function guMarkersIsh(dt) {
    if (reduceMotion) return;
    markerPhase += dt;
    var o = 0.24 + 0.12 * (0.5 + 0.5 * Math.sin(markerPhase * 1.3));
    Object.keys(guMarkers).forEach(function (k2) { guMarkers[k2].material.opacity = o; });
  }

  function loop(t) {
    rafId = 0;
    if (!running) return;
    var dt = Math.min(0.05, (t - (lastT || t)) / 1000);
    lastT = t;
    animate(dt);
    renderer.render(scene, camera);
    if (running && !document.hidden) rafId = requestAnimationFrame(loop);
  }
  function start() {
    if (running) return;
    running = true;
    lastT = 0;
    if (!rafId) rafId = requestAnimationFrame(loop);
  }
  function stop() {
    running = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
  }
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stop(); else if (inView) start();
  });

  var inView = true;
  if ('IntersectionObserver' in window) {
    inView = false;
    new IntersectionObserver(function (entries) {
      inView = entries[0].isIntersecting;
      if (inView) { resize(); start(); } else stop();
    }, { rootMargin: '260px' }).observe(host);
  }

  renderer.domElement.addEventListener('webglcontextlost', function (ev) {
    ev.preventDefault();
    stop();
    showFallback();
  });

  /* ── 12. 초기화 ───────────────────────────────── */
  resize();
  setMetric('kwh', true);
  applyPreset('all', true);
  setSim(window.EV_SIM_STATE || null);
  window.addEventListener('evsim', function (ev) { setSim(ev.detail); });
  start();

  /* 확인·자동화용 핸들 */
  window.EVTwin = {
    setSim: setSim,
    setMetric: setMetric,
    preset: function (k) { currentPreset = k; applyPreset(k); },
    state: function () {
      return {
        metric: metric,
        preset: currentPreset,
        towers: towers.length,
        simN: sim ? sim.n : 0,
        simGu: sim ? sim.gu : null,
        simGain: sim ? Math.round(sim.gainKwh) : 0,
        simStations: Object.keys(simMoved).length,
        curves: simCurves.length,
        selected: selected,
        camera: { th: +cam.th.toFixed(3), ph: +cam.ph.toFixed(3), d: +cam.d.toFixed(1) },
        calls: renderer.info.render.calls,
        tris: renderer.info.render.triangles
      };
    }
  };
})();
