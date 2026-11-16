/* 하루칸 캐릭터 '칸이' — 코드로 빚은 3D + 기분별 움직임 (시안)
   createKan(canvas, { mood, clear, manual }) → { setMood, tap, step, render, dispose }
   기분: 'great' 아주 좋음 · 'good' 좋음 · 'calm' 보통 · 'sad' 안 좋음
   원칙: 한 덩어리 몸은 늘고 줄어도 부피 유지(가로·세로 반비례), 새싹·팔은 몸을 한 박자 늦게 따라감(스프링),
   기분 바뀔 때는 두 동작을 0.7초 동안 섞어서 이어 줌. */
import * as THREE from './three.module.min.js';
import { RoundedBoxGeometry } from './RoundedBoxGeometry.js';
import { RoomEnvironment } from './RoomEnvironment.js';

const TAU = Math.PI * 2;
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);
const easeOut = (t) => 1 - Math.pow(1 - t, 3);
const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const seg = (u, a, b) => clamp((u - a) / (b - a), 0, 1);

/* ── 색 ── */
const C = {
  body: '#a58be4', limb: '#987cdb', face: '#fbeadb', leafA: '#cfe4ad', leafB: '#c3aef2', stem: '#c3d9a3',
  blanket: ['#bfe8d5', '#cbbdf4', '#f6c4db', '#c9e4f6'],
};

/* ── 얼굴 (그림) ── */
function makeFace() {
  const W = 512, H = 420;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  let key = '';
  const ink = '#4a3038';
  function eye(x, y, kind, open, lookX) {
    g.save(); g.translate(x + lookX * 6, y);
    if (kind === 'joy') {                 // ^ ^
      g.strokeStyle = ink; g.lineWidth = 15; g.lineCap = 'round';
      g.lineWidth = 19; g.beginPath(); g.arc(0, 18, 36, Math.PI * 1.12, Math.PI * 1.88); g.stroke();
    } else {
      const big = kind === 'sad' ? 1.12 : 1;
      const ry = 36 * big * Math.max(0.08, open), rx = 29 * big;
      if (open < 0.18) {                  // 감은 눈
        g.strokeStyle = ink; g.lineWidth = 16; g.lineCap = 'round';
        g.beginPath(); g.arc(0, -12, 30, Math.PI * 0.2, Math.PI * 0.8); g.stroke();
      } else {
        g.fillStyle = ink; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,255,255,.95)';
        g.beginPath(); g.ellipse(-9, -ry * 0.38, 10 * big, 11 * big * Math.min(1, open * 1.4), 0, 0, TAU); g.fill();
        g.beginPath(); g.ellipse(10, ry * 0.32, 5, 5 * Math.min(1, open * 1.4), 0, 0, TAU); g.fill();
        if (kind === 'sad') {             // 맺힌 눈물
          g.fillStyle = 'rgba(150,200,240,.85)';
          g.beginPath(); g.ellipse(0, ry + 3, rx * 0.95, 10, 0, 0, Math.PI); g.fill();
          g.fillStyle = 'rgba(255,255,255,.8)'; g.beginPath(); g.ellipse(-8, ry + 4, 4, 2.5, 0, 0, TAU); g.fill();
        }
      }
    }
    g.restore();
  }
  function draw(st) {
    const k = [st.eyes, st.mouth, st.open.toFixed(2), st.look.toFixed(2), st.blush.toFixed(2), st.tear.toFixed(2)].join('|');
    if (k === key) return; key = k;
    g.clearRect(0, 0, W, H);
    // 볼
    for (const s of [-1, 1]) {
      const x = W / 2 + s * 158, y = 258;
      const rg = g.createRadialGradient(x, y, 4, x, y, 52);
      rg.addColorStop(0, `rgba(244,150,160,${0.55 * st.blush})`); rg.addColorStop(1, 'rgba(244,150,160,0)');
      g.fillStyle = rg; g.beginPath(); g.ellipse(x, y, 58, 40, 0, 0, TAU); g.fill();
    }
    // 눈썹 (슬플 때만)
    if (st.eyes === 'sad') {
      g.strokeStyle = 'rgba(74,48,56,.75)'; g.lineWidth = 9; g.lineCap = 'round';
      for (const s of [-1, 1]) { g.beginPath(); g.moveTo(W / 2 + s * 64, 106); g.quadraticCurveTo(W / 2 + s * 94, 116, W / 2 + s * 124, 126); g.stroke(); }
    }
    eye(W / 2 - 92, 186, st.eyes, st.open, st.look);
    eye(W / 2 + 92, 186, st.eyes, st.open, st.look);
    // 입
    const mx = W / 2 + st.look * 4, my = 270;
    g.lineCap = 'round'; g.lineJoin = 'round';
    if (st.mouth === 'open' || st.mouth === 'grin') {
      const w = st.mouth === 'grin' ? 48 : 36, h = st.mouth === 'grin' ? 42 : 30;
      g.fillStyle = '#6e3440';
      g.beginPath(); g.moveTo(mx - w, my - 4); g.quadraticCurveTo(mx, my - 10, mx + w, my - 4);
      g.quadraticCurveTo(mx + w * 0.9, my + h, mx, my + h); g.quadraticCurveTo(mx - w * 0.9, my + h, mx - w, my - 4); g.fill();
      g.save(); g.clip();
      g.fillStyle = '#f08a96'; g.beginPath(); g.ellipse(mx, my + h + 4, w * 0.62, h * 0.55, 0, 0, TAU); g.fill();
      g.restore();
    } else if (st.mouth === 'smile') {
      g.strokeStyle = ink; g.lineWidth = 13;
      g.beginPath(); g.moveTo(mx - 28, my); g.quadraticCurveTo(mx, my + 26, mx + 28, my); g.stroke();
    } else if (st.mouth === 'frown') {
      g.strokeStyle = ink; g.lineWidth = 12;
      g.beginPath(); g.moveTo(mx - 22, my + 14); g.quadraticCurveTo(mx, my - 3, mx + 22, my + 14); g.stroke();
    } else if (st.mouth === 'o') {
      g.fillStyle = '#6e3440'; g.beginPath(); g.ellipse(mx, my + 8, 12, 14, 0, 0, TAU); g.fill();
    }
    tex.needsUpdate = true;
  }
  return { tex, draw };
}

/* ── 담요 ── */
function makeBlanket() {
  // 몸(둥근 상자)보다 조금 큰 둥근 상자 → 앞 얼굴 자리를 둥글게 트고, 아래로 갈수록 퍼지게, 주름
  const src = new RoundedBoxGeometry(1.56, 1.26, 1.18, 12, 0.46).toNonIndexed();
  const P = src.attributes.position, N = src.attributes.normal;
  const keep = [];
  const v = new THREE.Vector3();
  for (let t = 0; t < P.count; t += 3) {
    let cx = 0, cy = 0, cz = 0, ny = 0, nz = 0;
    for (let k = 0; k < 3; k++) { cx += P.getX(t + k) / 3; cy += P.getY(t + k) / 3; cz += P.getZ(t + k) / 3; ny += N.getY(t + k) / 3; nz += N.getZ(t + k) / 3; }
    if (ny < -0.6) continue;                                                     // 바닥 면
    keep.push(t);
  }
  const pos = [], col = [], msk = [];
  const openAt = (x, y, z) => {             // >0 남김, <0 트임 (앞쪽 얼굴 자리 + 발 자리)
    if (z < 0.05) return 1;
    const ox = x / 0.5, oy = (y + 0.1) / 0.52;
    const face = Math.pow(Math.pow(Math.abs(ox), 3.4) + Math.pow(Math.abs(Math.min(oy, 0)), 3.4) + (oy > 0 ? Math.pow(oy, 3.4) : 0), 1 / 3.4) - 1;
    const foot = y < -0.3 ? Math.abs(x) / 0.62 - 1 : 1;
    return Math.min(face, foot) + (z < 0.3 ? (0.3 - z) * 3 : 0);
  };
  const cols = C.blanket.map((c) => new THREE.Color(c));
  for (const t of keep) for (let k = 0; k < 3; k++) {
    let x = P.getX(t + k), y = P.getY(t + k), z = P.getZ(t + k);
    const d = clamp((0.25 - y) / 0.9, 0, 1), fl = d * d;
    const ang = Math.atan2(x, z);
    const fold = 0.035 * Math.sin(ang * 7 + y * 2.5) * d + 0.015 * Math.sin(ang * 13 + 1.3) * d;
    const r = 1 + 0.22 * fl + fold;
    x *= r; z *= r * (1 + 0.08 * fl);
    if (y < -0.5) y -= 0.03 * Math.sin(ang * 9) * d;                             // 밑단 물결
    msk.push(openAt(P.getX(t + k), P.getY(t + k), P.getZ(t + k)));
    pos.push(x, y, z);
    const s2 = (ang / Math.PI + 1) / 2;                                          // 0~1 둘레
    const cc = cols[0].clone().lerp(cols[1], smooth(clamp(s2 * 2, 0, 1))).lerp(cols[2], smooth(clamp(s2 * 2 - 1, 0, 1)));
    cc.lerp(cols[3], 0.22 * d);
    col.push(cc.r, cc.g, cc.b);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  geo.setAttribute('aMask', new THREE.Float32BufferAttribute(msk, 1));
  geo.computeVertexNormals();
  const cut = (m) => { m.onBeforeCompile = (sh) => { sh.vertexShader = 'attribute float aMask;\nvarying float vMask;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\nvMask = aMask;'); sh.fragmentShader = 'varying float vMask;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (vMask < 0.0) discard;'); }; return m; };
  const out = new THREE.Mesh(geo, cut(new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.88, sheen: 1, sheenRoughness: 0.45, sheenColor: new THREE.Color('#ffffff'), side: THREE.FrontSide })));
  const inn = new THREE.Mesh(geo, cut(new THREE.MeshPhysicalMaterial({ color: '#e6dcf3', roughness: 0.95, side: THREE.BackSide })));
  const g = new THREE.Group(); g.add(out, inn); g.position.y = TORSO_C + 0.05;
  return g;
}

/* ── 그림자 ── */
function makeShadow() {
  const cv = document.createElement('canvas'); cv.width = cv.height = 128;
  const g = cv.getContext('2d'); const rg = g.createRadialGradient(64, 64, 2, 64, 64, 62);
  rg.addColorStop(0, 'rgba(70,45,90,.42)'); rg.addColorStop(0.55, 'rgba(70,45,90,.16)'); rg.addColorStop(1, 'rgba(70,45,90,0)');
  g.fillStyle = rg; g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(cv);
  const m = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.3), new THREE.MeshBasicMaterial({ map: t, transparent: true, depthWrite: false }));
  m.rotation.x = -Math.PI / 2; m.position.y = 0.002; return m;
}

/* ── 스프링 (뒤따라오는 움직임) ── */
class Spring { constructor(k = 120, c = 12) { this.k = k; this.c = c; this.x = 0; this.v = 0; } step(target, dt) { const a = -this.k * (this.x - target) - this.c * this.v; this.v += a * dt; this.x += this.v * dt; return this.x; } kick(v) { this.v += v; } }

/* ── 기분별 자세 (u = 그 기분이 시작된 뒤 초) ── */
const LEG = 0.2, TORSO_H = 1.12, TORSO_C = LEG + TORSO_H / 2;
function blinkAt(u, period, offs) {           // 0 열림 ~ 1 감김
  const p = ((u + offs) % period + period) % period;
  if (p > 0.16) return 0;
  return Math.sin((p / 0.16) * Math.PI);
}
const MOODS = {
  great(u) {                                   // 1.6초 주기 폴짝 + 두 번째마다 한 바퀴
    const T = 1.6, n = Math.floor(u / T), p = u - n * T;
    const P = base();
    const pre = seg(p, 0, 0.2), air = seg(p, 0.2, 0.68), land = seg(p, 0.68, 1.0);
    if (p < 0.2) { P.sq = 1 - 0.15 * easeOut(pre); P.arm = lerp(0.5, 0.25, pre); P.armX = 0.25 * pre; }
    else if (p < 0.68) {
      P.y = 0.46 * 4 * air * (1 - air);
      P.sq = air < 0.5 ? lerp(1.14, 1.0, easeOut(air * 2)) : lerp(1.0, 1.05, (air - 0.5) * 2);
      P.arm = lerp(0.6, 2.55, easeOut(seg(air, 0, 0.35))) + 0.12 * Math.sin(air * TAU * 2);
      P.leg = -0.35 * Math.sin(air * Math.PI);
      if (n % 2 === 1) P.spin = TAU * easeInOut(air);
    } else if (p < 1.0) {
      const k = land; P.sq = 1 - 0.17 * Math.exp(-5 * k) * Math.cos(k * 9); P.arm = lerp(2.55, 1.9, easeOut(k));
    } else {
      const k = seg(p, 1.0, T); P.arm = lerp(1.9, 0.5, easeInOut(k)) + 0.18 * Math.sin(k * TAU * 2);
      P.y = 0.025 * Math.abs(Math.sin(k * TAU)); P.tilt = 0.07 * Math.sin(k * TAU);
    }
    P.face = { eyes: 'joy', mouth: 'grin', open: 1, look: 0, blush: 1, tear: 0 };
    return P;
  },
  good(u) {                                    // 손 흔들기 + 몸 살랑
    const P = base();
    const w = Math.sin(u * TAU * (10 / 4.8));
    P.armR = 2.35 + 0.32 * w; P.armRX = -0.15;
    P.arm = 0.42 + 0.05 * Math.sin(u * TAU / 2.4);
    P.tilt = -0.07 + 0.045 * Math.sin(u * TAU / 2.4);
    P.y = 0.02 * Math.pow(Math.abs(Math.sin(u * TAU / 1.2)), 1.5);
    P.sq = 1 + 0.025 * Math.sin(u * TAU / 1.2 + 1.2);
    P.yaw = 0.08 * Math.sin(u * TAU / 4.8);
    P.face = { eyes: 'dot', mouth: 'open', open: 1 - blinkAt(u, 2.4, 0.9), look: 0.3 * Math.sin(u * TAU / 4.8), blush: 1, tear: 0 };
    return P;
  },
  calm(u) {                                    // 숨쉬기, 가끔 두리번
    const P = base();
    const br = Math.sin(u * TAU / 2.4);
    P.sq = 1 + 0.022 * br; P.tilt = 0.03 * Math.sin(u * TAU / 4.8);
    P.arm = 0.4 + 0.04 * Math.sin(u * TAU / 2.4 - 0.6);
    const look = seg(u % 4.8, 1.6, 2.2) - seg(u % 4.8, 3.4, 4.0);
    P.yaw = 0.28 * easeInOut(clamp(look, 0, 1)); P.lookX = easeInOut(clamp(look, 0, 1));
    P.face = { eyes: 'dot', mouth: 'smile', open: 1 - Math.max(blinkAt(u, 4.8, 0.3), blinkAt(u, 4.8, 2.55)), look: P.lookX, blush: 0.85, tear: 0 };
    return P;
  },
  sad(u) {                                     // 담요 덮고 앉아 천천히 숨, 4.8초마다 한숨
    const P = base();
    P.sit = 1; P.blanket = 1;
    const sigh = Math.sin(Math.PI * seg(u % 4.8, 2.6, 4.2));
    P.sq = 1 + 0.014 * Math.sin(u * TAU / 2.4) - 0.04 * sigh;
    P.tiltX = 0.1 + 0.08 * sigh; P.tilt = 0.025 * Math.sin(u * TAU / 4.8);
    P.face = { eyes: 'sad', mouth: 'frown', open: 0.92 - 0.25 * sigh - 0.75 * blinkAt(u, 4.8, 1.2), look: 0, blush: 0.9, tear: 1 };
    return P;
  },
};
function base() { return { y: 0, sq: 1, tilt: 0, tiltX: 0, yaw: 0, spin: 0, arm: 0.42, armX: 0, armR: null, armRX: 0, leg: 0, sit: 0, blanket: 0, lookX: 0, face: null }; }
function mix(A, B, t) {
  const o = {};
  for (const k of Object.keys(A)) {
    if (k === 'face') continue;
    const a = A[k] ?? (k === 'armR' ? A.arm : 0), b = B[k] ?? (k === 'armR' ? B.arm : 0);
    o[k] = lerp(a, b, t);
  }
  o.face = t < 0.5 ? A.face : B.face;
  return o;
}

export function createKan(canvas, opts = {}) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: opts.clear == null, preserveDrawingBuffer: !!opts.manual });
  renderer.setPixelRatio(opts.pixelRatio || Math.min(2, window.devicePixelRatio || 1));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.NeutralToneMapping; renderer.toneMappingExposure = 0.92;
  if (opts.clear != null) renderer.setClearColor(opts.clear, 1);
  const scene = new THREE.Scene();
  const pm = new THREE.PMREMGenerator(renderer);
  scene.environment = pm.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.38;
  const cam = new THREE.PerspectiveCamera(24, 1, 0.1, 50);
  cam.position.set(0, 1.3, 6.1); cam.lookAt(0, 0.9, 0);

  scene.add(new THREE.HemisphereLight('#fff4ee', '#a593d6', 0.95));
  const key = new THREE.DirectionalLight('#fff1e4', 2.7); key.position.set(2.6, 4.2, 4.5); scene.add(key);
  const fill = new THREE.DirectionalLight('#dfe6ff', 0.55); fill.position.set(-3.5, 1.2, 2.5); scene.add(fill);
  const rim = new THREE.DirectionalLight('#ffffff', 1.3); rim.position.set(-1.5, 3, -4); scene.add(rim);

  const clay = (c) => new THREE.MeshPhysicalMaterial({ color: c, roughness: 0.58, metalness: 0, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color('#ffffff'), clearcoat: 0.12, clearcoatRoughness: 0.6 });

  // 구조: root(위치·뛰기) > yawG(돌기) > sqG(찌그러짐, 발바닥 기준) > tiltG(기울기) > 몸·팔·새싹 / 다리는 sqG 아래
  const root = new THREE.Group(), yawG = new THREE.Group(), sqG = new THREE.Group(), tiltG = new THREE.Group();
  root.add(yawG); yawG.add(sqG); sqG.add(tiltG);
  scene.add(root);
  const shadow = makeShadow(); scene.add(shadow);

  const torso = new THREE.Mesh(new RoundedBoxGeometry(1.36, TORSO_H, 0.98, 8, 0.36), clay(C.body));
  torso.position.y = TORSO_C; tiltG.add(torso);
  const pm2 = clay(C.face); pm2.emissive = new THREE.Color('#f6dcc6'); pm2.emissiveIntensity = 0.1;
  const panel = new THREE.Mesh(new RoundedBoxGeometry(1.02, 0.84, 0.16, 6, 0.2), pm2);
  panel.position.set(0, TORSO_C + 0.02, 0.43); tiltG.add(panel);
  const face = makeFace();
  const facePlane = new THREE.Mesh(new THREE.PlaneGeometry(0.98, 0.8), new THREE.MeshStandardMaterial({ map: face.tex, transparent: true, roughness: 0.6, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
  facePlane.position.set(0, TORSO_C + 0.02, 0.513); tiltG.add(facePlane);

  // 팔
  const armGeo = new THREE.CapsuleGeometry(0.12, 0.26, 8, 16);
  const arms = [-1, 1].map((s) => {
    const piv = new THREE.Group(); piv.position.set(s * 0.64, TORSO_C - 0.02, 0.02);
    const m = new THREE.Mesh(armGeo, clay(C.limb)); m.position.y = -0.22; piv.add(m); tiltG.add(piv); return piv;
  });
  // 다리
  const legGeo = new THREE.CapsuleGeometry(0.135, 0.12, 8, 16);
  const legs = [-1, 1].map((s) => {
    const piv = new THREE.Group(); piv.position.set(s * 0.3, LEG + 0.06, 0);
    const m = new THREE.Mesh(legGeo, clay(C.limb)); m.position.y = -0.13; piv.add(m); sqG.add(piv); return piv;
  });
  // 새싹
  const sprout = new THREE.Group(); sprout.position.set(0, LEG + TORSO_H - 0.02, 0); tiltG.add(sprout);
  const stem = new THREE.Mesh(new THREE.CapsuleGeometry(0.035, 0.1, 4, 8), clay(C.stem)); stem.position.y = 0.07; sprout.add(stem);
  const leafGeo = new THREE.SphereGeometry(1, 24, 12);
  const leaves = [[-1, C.leafA], [1, C.leafB]].map(([s, c]) => {
    const p = new THREE.Group(); p.position.y = 0.13; p.rotation.z = -s * 0.95; sprout.add(p);
    const m = new THREE.Mesh(leafGeo, clay(c)); m.scale.set(0.075, 0.2, 0.035); m.position.y = 0.17; p.add(m); return p;
  });
  // 담요
  const blanket = makeBlanket(); blanket.visible = false; tiltG.add(blanket);

  // 상태
  let mood = opts.mood || 'calm', prev = null, u = 0, blendT = 1, tapT = 9, raf = 0, last = 0;
  const sproutS = new Spring(90, 7), sproutZ = new Spring(70, 6), armLagS = new Spring(140, 14), tapS = new Spring(260, 9);
  let lastY = 0, lastVy = 0, lastTilt = 0;

  function resize() {
    /* 숨어 있으면(크기 0) 건너뛴다 — 예전에는 이때 이미 배율이 곱해진 내부 크기를 다시 써서, 키보드가 열리고 닫힐 때마다
       그리는 판이 2배씩 커졌다(폰에서 42만 픽셀까지, 2026-11-14 사용자 '캐릭터 오류'). 만들 때만 지정한 크기를 쓴다 */
    let w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) { if (sized) return; w = opts.w || 104; h = opts.h || 116; }
    sized = true;
    renderer.setSize(w, h, false); cam.aspect = w / h; cam.updateProjectionMatrix();
  }
  let sized = false;
  resize();

  /* 걷기·들림 (2026-11-14 사용자: 화면 어디로든 끌어 옮기고, 아래에 두면 걸어 다니게) — 기분 자세 위에 섞는다 */
  let walkOn = false, walkDir = 1, walkW = 0, walkPh = 0, walkSpeed = 1, heldOn = false, heldW = 0, heldVx = 0, heldSw = 0, paused = false, yawDir = 0;
  const near = (a, b, k) => a + (b - a) * Math.min(1, k);
  function step(dt) {
    dt = Math.min(dt, 1 / 20);
    u += dt; tapT += dt; if (blendT < 1) blendT = Math.min(1, blendT + dt / 0.7);
    let P = MOODS[mood](u);
    if (prev && blendT < 1) P = mix(MOODS[prev.mood](prev.u + u), P, easeInOut(blendT));
    walkW = near(walkW, walkOn ? 1 : 0, dt * 5); heldW = near(heldW, heldOn ? 1 : 0, dt * 9);
    yawDir = near(yawDir, walkOn ? walkDir : 0, dt * 4);
    if (walkW > 0.001) {                         // 다리를 번갈아 내딛고, 팔은 반대로, 몸은 통통
      walkPh += dt * 9.5 * walkSpeed;
      const sw = Math.sin(walkPh), w = walkW;
      P.leg = lerp(P.leg, 0.6 * sw, w); P.y = lerp(P.y, 0.045 * Math.abs(sw), w);
      P.armX = lerp(P.armX, -0.5 * sw, w); P.armRX = lerp(P.armRX || 0, 0.5 * sw, w); P.arm = lerp(P.arm, 0.38, w); P.armR = lerp(P.armR ?? P.arm, 0.38, w);
      P.tilt = lerp(P.tilt, 0.06 * Math.sin(walkPh * 0.5) * walkDir, w); P.sit = lerp(P.sit, 0, w); P.blanket = lerp(P.blanket, 0, w); P.spin = lerp(P.spin, 0, w);
      P.sq = lerp(P.sq, 1 + 0.03 * Math.cos(walkPh * 2), w); P.tiltX = lerp(P.tiltX, 0.05, w);
    }
    P.yaw += yawDir * 0.55;                       // 가는 쪽을 비스듬히 바라본다 (얼굴이 보이게)
    if (heldW > 0.001) {                         // 손가락에 들림: 팔을 번쩍, 다리는 대롱대롱, 끄는 쪽 반대로 흔들림
      heldSw = near(heldSw, clamp(-heldVx * 0.0009, -0.45, 0.45), dt * 6);
      const w = heldW;
      P.arm = lerp(P.arm, 2.35, w); P.armR = lerp(P.armR ?? P.arm, 2.35, w); P.armX = lerp(P.armX, 0, w); P.armRX = lerp(P.armRX || 0, 0, w);
      P.leg = lerp(P.leg, 0.32 * Math.sin(u * 7), w); P.y = lerp(P.y, 0.18, w); P.sit = lerp(P.sit, 0, w); P.blanket = lerp(P.blanket, 0, w);
      P.tilt = lerp(P.tilt, heldSw + 0.08 * Math.sin(u * 3.2), w); P.spin = lerp(P.spin, 0, w); P.sq = lerp(P.sq, 1.06, w);
      if (w > 0.5) P.face = { eyes: 'dot', mouth: 'o', open: 1, look: 0, blush: 1, tear: 0 };
    }
    // 누르면: 말랑 눌림 + 웃음
    const tq = tapS.step(0, dt);
    const sq = P.sq * (1 + tq);
    root.position.y = P.y - P.sit * (LEG - 0.02);
    yawG.rotation.y = -0.16 + P.yaw + P.spin;
    sqG.scale.set(1 / Math.sqrt(sq), sq, 1 / Math.sqrt(sq));
    tiltG.rotation.z = P.tilt; tiltG.rotation.x = P.tiltX;
    // 팔 (안쪽으로 감싸기 = 앉을 때)
    const armR = P.armR ?? P.arm;
    const vy = (P.y - lastY) / Math.max(dt, 1e-3), ay = (vy - lastVy) / Math.max(dt, 1e-3); lastY = P.y; lastVy = vy;
    const lag = armLagS.step(clamp(-ay * 0.004, -0.25, 0.25), dt);
    for (const [i, sg] of [[0, -1], [1, 1]]) { arms[i].position.x = sg * lerp(0.64, 0.3, P.sit); arms[i].position.z = lerp(0.02, 0.42, P.sit); arms[i].position.y = TORSO_C - 0.02 - 0.36 * P.sit; }
    arms[0].rotation.z = -(P.arm + lag) * (1 - P.sit) + P.sit * 0.18; arms[0].rotation.x = P.armX * (1 - P.sit) + P.sit * -1.5;
    arms[1].rotation.z = (armR + lag) * (1 - P.sit) + P.sit * -0.18; arms[1].rotation.x = (P.armRX + P.armX) * (1 - P.sit) + P.sit * -1.5;
    // 다리 (앉으면 앞으로 뻗기)
    legs[0].rotation.x = -P.sit * 1.45 + P.leg; legs[1].rotation.x = -P.sit * 1.45 - P.leg * (walkW > 0.5 ? 1 : 0.7);
    // 새싹: 몸 움직임을 한 박자 늦게
    const tiltV = (P.tilt - lastTilt) / Math.max(dt, 1e-3); lastTilt = P.tilt;
    sprout.rotation.x = sproutS.step(clamp(ay * 0.0016, -0.5, 0.5) + 0.04 * Math.sin(u * 2.618), dt);
    sprout.rotation.z = sproutZ.step(-tiltV * 0.12 - P.tilt * 0.6 + 0.06 * Math.sin(u * 1.309), dt);
    leaves[0].rotation.z = 0.95 + 0.08 * Math.sin(u * 2.618) + sprout.rotation.x * 0.3;
    leaves[1].rotation.z = -0.95 - 0.08 * Math.sin(u * 2.618 + 1) - sprout.rotation.x * 0.3;
    // 담요: 위에서 살포시 내려앉기
    const bl = P.blanket;
    blanket.visible = bl > 0.01;
    blanket.position.y = TORSO_C + 0.05 + (1 - easeOut(bl)) * 0.7; blanket.scale.setScalar(lerp(0.85, 1, easeOut(bl)));
    blanket.traverse((o) => { if (o.material) { o.material.transparent = bl < 0.999; o.material.opacity = clamp(bl * 1.6, 0, 1); } });
    // 얼굴
    let f = P.face || MOODS.calm(u).face;
    if (tapT < 0.9) f = { eyes: 'joy', mouth: 'grin', open: 1, look: 0, blush: 1, tear: 0 };
    face.draw(f);
    // 그림자
    const hgt = Math.max(0, P.y);
    shadow.scale.setScalar(clamp(1 - hgt * 0.7, 0.5, 1) * (1 + P.sit * 0.25)); shadow.material.opacity = clamp(1 - hgt * 1.1, 0.35, 1);
  }
  function render() { renderer.render(scene, cam); }
  function loop(t) {
    if (!canvas.isConnected) { renderer.dispose(); return; }      // 홈을 떠나면 스스로 멈추고 정리
    raf = requestAnimationFrame(loop);
    if (document.hidden || paused) { last = 0; return; }       // 앱이 뒤로 가거나 홈을 떠나면 쉬기
    if (opts.fps && last && t - last < 1000 / opts.fps - 2) return;   // 초당 장면 수 제한 (배터리, 패치 75: 30장)
    const dt = last ? (t - last) / 1000 : 0; last = t; step(dt); render();
  }
  if (!opts.manual) raf = requestAnimationFrame(loop);
  step(0);

  return {
    setMood(m) { if (m === mood || !MOODS[m]) return; prev = { mood, u }; mood = m; u = 0; blendT = 0; },
    tap() { tapS.kick(-2.6); tapT = 0; sproutS.kick(6); },
    land() { tapS.kick(-3.2); sproutS.kick(9); },
    setWalk(on, dir = walkDir, speed = 1) { walkOn = !!on; if (dir) walkDir = dir > 0 ? 1 : -1; walkSpeed = speed; },
    setHeld(on, vx = 0) { heldOn = !!on; heldVx = vx; },
    setPaused(p) { paused = !!p; },
    step, render, resize,
    get mood() { return mood; },
    dispose() { cancelAnimationFrame(raf); renderer.dispose(); },
  };
}
