/* ===========================================================
   deskclock.js — 탁상시계 (2026-11-13 사용자: 가로로 눕혀 두는 예쁜 시계, 모두 플러스)
   · 장면 8 (하루칸 가로 배경 + 어울리는 숫자·배치·연출), 숫자 모양 8, 배치 3(가운데 / 날씨 카드 / 사진 액자)
   · 연출: 꽃잎·눈·비·불씨·하트·비눗방울·낙엽·별(별똥별) — 캔버스로 직접 그린다(그림 파일 없음)
   · 실제 날씨 따라가기: 지금 비·눈이 오면 어떤 장면이든 비·눈 연출
   · 사진 액자: 직접 고른 사진(앨범) 또는 일기에 넣은 사진, 30초마다 넘김
   · 밤(23~6시)에는 어둡게, 연출 멈춤, 창 밝기 낮춤
   네이티브 DeskClock 플러그인(1.8.8+): 가로 고정 · 화면 켜 두기 · 막대 숨기기. 없는 앱에서는 열지 않는다.
   =========================================================== */
import * as store from './store.js';
import * as plus from './plus.js';
import { isNative } from './native.js';
import { t } from './i18n.js';

function DC() { try { return window.Capacitor?.Plugins?.DeskClock || null; } catch { return null; } }
export function available() { return !isNative() || !!DC()?.enter; }
export function canUse() { return !isNative() || plus.isPlus() || plus.inTrial(); }

/* 홈 상단 '칸이 시계' 버튼 (2026-11-13 사용자: '시계 메뉴를 설정 말고 홈 찾기 버튼 옆에 이쁜 이미지로', B안 칸이 시계)
   누르면 바늘이 한 바퀴 돌고 탁상시계가 열린다(플러스가 아니면 플러스 안내). 처음에는 NEW 점, 한 번 열면 사라진다 */
const K_SEEN = 'hk.clockSeen';
export const ICON = `<svg viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="hkClkG" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#b9a0ef"/><stop offset="1" stop-color="#8e6fdc"/></linearGradient></defs>
<path d="M24 9 q-1 -4 -6 -5 q2 5 6 5z" fill="#cfe4ad"/><path d="M24 9 q1 -4 6 -5 q-2 5 -6 5z" fill="#c3aef2"/><rect x="23.2" y="7" width="1.6" height="4" fill="#c3d9a3"/>
<rect x="7" y="10" width="34" height="31" rx="10" fill="url(#hkClkG)"/><circle cx="24" cy="25.5" r="11.5" fill="#fbeadb"/>
<g class="hk-clk-hands"><line x1="24" y1="25.5" x2="19.4" y2="22.2" stroke="#5b3a8e" stroke-width="1.8" stroke-linecap="round"/><line x1="24" y1="25.5" x2="29.5" y2="20.5" stroke="#5b3a8e" stroke-width="1.25" stroke-linecap="round"/></g><circle cx="24" cy="25.5" r="1.15" fill="#5b3a8e"/>
<rect x="12" y="40" width="6" height="5" rx="2.5" fill="#8a6bd6"/><rect x="30" y="40" width="6" height="5" rx="2.5" fill="#8a6bd6"/></svg>`;
export function seen() { try { return localStorage.getItem(K_SEEN) === '1'; } catch { return true; } }
function markSeen() { try { localStorage.setItem(K_SEEN, '1'); } catch { /* */ } document.querySelectorAll('.hk-clockbtn .dot-badge').forEach((d) => d.remove()); }
/** 홈 상단 버튼 항목 (home.js 의 right 에 넣는다) */
export function homeButton() {
  if (!available()) return null;
  return {
    label: t('탁상시계'),
    build: (b) => { b.classList.add('hk-clockbtn'); b.innerHTML = ICON; if (!seen()) b.append(Object.assign(document.createElement('span'), { className: 'dot-badge' })); injectBtnCss(); },
    onClick: (ev) => {
      const b = ev.currentTarget; b.classList.remove('spin'); void b.offsetWidth; b.classList.add('spin');
      try { navigator.vibrate?.(8); } catch { /* */ }
      setTimeout(() => { markSeen(); show(); }, 420);
    },
  };
}
let btnCss = false;
function injectBtnCss() {
  if (btnCss) return; btnCss = true;
  const st = document.createElement('style');
  st.textContent = '.icon-btn.hk-clockbtn{position:relative;padding:0}.icon-btn.hk-clockbtn svg{width:30px;height:30px;stroke:none;stroke-width:0;filter:drop-shadow(0 2px 3px rgba(90,60,140,.25))}'
    + '.hk-clockbtn .hk-clk-hands{transform-origin:24px 25.5px}.hk-clockbtn.spin .hk-clk-hands{animation:hkClkSpin .45s ease-in-out}'
    + '.hk-clockbtn.spin svg{animation:hkClkHop .45s ease-out}.hk-clockbtn .dot-badge{top:5px;right:4px}'
    + '@keyframes hkClkSpin{to{transform:rotate(360deg)}}@keyframes hkClkHop{0%{transform:scale(1)}35%{transform:scale(.86,1.1)}70%{transform:scale(1.08,.94)}100%{transform:scale(1)}}'
    + '@media (prefers-reduced-motion:reduce){.hk-clockbtn.spin .hk-clk-hands,.hk-clockbtn.spin svg{animation:none}}';
  document.head.append(st);
}

/* ── 숫자 모양 ── */
const BM = { 0: ['01110', '10001', '10011', '10101', '11001', '10001', '01110'], 1: ['00100', '01100', '00100', '00100', '00100', '00100', '01110'], 2: ['01110', '10001', '00001', '00010', '00100', '01000', '11111'], 3: ['11110', '00001', '00001', '01110', '00001', '00001', '11110'], 4: ['00010', '00110', '01010', '10010', '11111', '00010', '00010'], 5: ['11111', '10000', '11110', '00001', '00001', '10001', '01110'], 6: ['00110', '01000', '10000', '11110', '10001', '10001', '01110'], 7: ['11111', '00001', '00010', '00100', '01000', '01000', '01000'], 8: ['01110', '10001', '10001', '01110', '10001', '10001', '01110'], 9: ['01110', '10001', '10001', '01111', '00001', '00010', '01100'] };
const flower = (x, y, r, c) => { let s = ''; for (let i = 0; i < 5; i++) { const a = i * 72 * Math.PI / 180 - Math.PI / 2; s += `<circle cx="${(x + Math.cos(a) * r * .55).toFixed(1)}" cy="${(y + Math.sin(a) * r * .55).toFixed(1)}" r="${(r * .48).toFixed(1)}" fill="${c}"/>`; } return s + `<circle cx="${x}" cy="${y}" r="${(r * .32).toFixed(1)}" fill="#ffd36b"/>`; };
const heart = (x, y, r, c) => `<path transform="translate(${x},${y}) scale(${r / 10})" d="M0 7 C-9 0 -8 -7 -3.5 -7 C-1.5 -7 0 -5.5 0 -4 C0 -5.5 1.5 -7 3.5 -7 C8 -7 9 0 0 7Z" fill="${c}"/>`;
function pixel(tm, cell, dot, cols) {
  let x = 0, s = '';
  for (const ch of tm) {
    if (ch === ':') { s += dot(x + cell / 2, cell * 2.5, cell * .5, cols[0]) + dot(x + cell / 2, cell * 4.5, cell * .5, cols[0]); x += cell * 2; continue; }
    BM[ch].forEach((row, ry) => [...row].forEach((v, rx) => { if (v === '1') s += dot(x + rx * cell + cell / 2, ry * cell + cell / 2, cell * .5, cols[(rx + ry) % cols.length]); }));
    x += cell * 6;
  }
  return `<svg width="${x}" height="${cell * 7}" viewBox="0 0 ${x} ${cell * 7}" style="overflow:visible;filter:drop-shadow(0 3px 4px rgba(0,0,0,.2))">${s}</svg>`;
}
export const FONTS = {
  pixheart: { name: '픽셀 하트', draw: (tm, sz) => pixel(tm, sz / 7.5, (x, y, r, c) => heart(x, y, r * 1.15, c), ['#f2447f', '#e23270', '#ff6f9e']) },
  pixflower: { name: '픽셀 꽃', draw: (tm, sz) => pixel(tm, sz / 7.5, (x, y, r, c) => flower(x, y, r * 1.08, c), ['#e8558f', '#9a6ce0', '#f57c4f', '#3fa57c']) },
  nixie: { name: '닉시관', draw: (tm, sz) => `<div style="display:flex;gap:${sz * .07}px;align-items:center">${[...tm].map((d) => d === ':' ? `<div style="font-family:'HK Nixie';font-size:${sz * .6}px;color:#ff9a3c;text-shadow:0 0 10px #ff7a1a,0 0 24px #ff5a00">:</div>` : `<div style="width:${sz * .62}px;height:${sz * 1.15}px;border-radius:${sz * .31}px ${sz * .31}px ${sz * .09}px ${sz * .09}px;background:linear-gradient(90deg,rgba(255,255,255,.1),rgba(255,255,255,.02) 40%,rgba(255,255,255,.12));background-color:rgba(20,10,5,.5);border:2px solid rgba(255,220,180,.22);display:flex;align-items:center;justify-content:center;font-family:'HK Nixie';font-size:${sz * .88}px;color:#ffb35c;text-shadow:0 0 10px #ff7a1a,0 0 26px #ff5a00,0 0 50px rgba(255,90,0,.6)">${d}</div>`).join('')}</div>` },
  neon: { name: '네온사인', draw: (tm, sz) => `<div style="font-family:'HK Neon';font-size:${sz}px;line-height:1;color:#ffe9f6;text-shadow:0 0 6px #fff,0 0 18px #ff4fb3,0 0 42px #ff4fb3,0 0 80px #ff2f9a">${tm}</div>` },
  jelly: { name: '젤리 버블', draw: (tm, sz) => `<div style="display:flex;gap:4px;font-family:'HK Fredoka';font-weight:600;font-size:${sz}px;line-height:1">${[...tm].map((d, i) => { const c = ['#ff8fb8', '#ffb36b', '#c9b8ee', '#7fcfb0', '#8db8ff'][i % 5]; return `<span style="color:${c};text-shadow:0 ${sz * .04}px 0 ${c}aa,0 ${sz * .07}px ${sz * .1}px rgba(0,0,0,.18)">${d}</span>`; }).join('')}</div>` },
  stitch: { name: '펠트 자수', draw: (tm, sz) => `<svg width="${sz * 2.9}" height="${sz * 1.1}" style="overflow:visible"><g style="font-family:'HK Fredoka';font-weight:600;font-size:${sz}px" text-anchor="middle"><text x="${sz * 1.45}" y="${sz * .9}" fill="#f4e6d4" stroke="#f4e6d4" stroke-width="${sz * .1}" stroke-linejoin="round" style="filter:drop-shadow(0 5px 6px rgba(0,0,0,.3))">${tm}</text><text x="${sz * 1.45}" y="${sz * .9}" fill="#f7ecdf" stroke="#b5566a" stroke-width="${sz * .014}" stroke-dasharray="${sz * .045} ${sz * .03}" stroke-linecap="round">${tm}</text></g></svg>` },
  chalk: { name: '분필 손글씨', draw: (tm, sz) => `<div style="font-family:'HK Gaegu';font-weight:700;font-size:${sz}px;line-height:1;color:rgba(255,255,248,.96);text-shadow:0 0 2px rgba(255,255,255,.7),0 2px 12px rgba(0,0,0,.45);filter:url(#dcChalk)">${tm}</div>` },
  spice: { name: '불꽃 블록', draw: (tm, sz) => `<div style="font-family:'HK Spice';font-size:${sz}px;line-height:1;filter:drop-shadow(0 4px 10px rgba(0,0,0,.35))">${tm}</div>` },
};
/* ── 장면 (기본 숫자·배치·연출) ── */
export const SCENES = [
  { id: 'spring', name: '봄 벚꽃', bg: 'seasonspring', bgsize: '175% auto', bgpos: 'center bottom', font: 'pixflower', lay: 'B', fx: 'petals', dc: '#7a4a5a', size: .27, plate: true },
  { id: 'winter', name: '겨울 눈', bg: 'seasonwinter', font: 'stitch', lay: 'A', fx: 'snow', dc: '#ffffff', size: .38, shade: 'rgba(30,40,70,.18)' },
  { id: 'rain', name: '비 오는 창가', bg: 'cozyrain', font: 'neon', lay: 'A', fx: 'rain', dc: '#ffd9ef', size: .38, dark: true, shade: 'rgba(10,10,25,.38)' },
  { id: 'fire', name: '포근한 벽난로', bg: 'cozyfire', font: 'nixie', lay: 'B', fx: 'embers', dc: '#ffe0b8', size: .32, dark: true, shade: 'linear-gradient(90deg,rgba(25,12,5,.55),rgba(25,12,5,.15))' },
  { id: 'heart', name: '하트 구름', bg: 'lovelyheart', font: 'pixheart', lay: 'C', fx: 'hearts', dc: '#8a3a5a', size: .26, plate: true },
  { id: 'milk', name: '딸기우유', bg: 'lovelystrawberry', font: 'jelly', lay: 'A', fx: 'bubbles', dc: '#9a5a72', size: .42, shade: 'rgba(255,250,252,.25)' },
  { id: 'autumn', name: '가을 낙엽', bg: 'seasonautumn', font: 'chalk', lay: 'C', fx: 'leaves', dc: '#fff6e6', size: .38, shade: 'linear-gradient(90deg,rgba(60,30,10,.55),rgba(60,30,10,.1))' },
  { id: 'stars', name: '별바다', bg: 'fairystarsea', font: 'spice', lay: 'B', fx: 'stars', dc: '#e6e0ff', size: .31, dark: true, shade: 'rgba(5,8,30,.3)' },
];
const LAYS = { A: '가운데', B: '날씨 카드', C: '사진 액자' };

function cfg() {
  const c = store.getSettings().deskClock || {};
  const sc = SCENES.find((x) => x.id === c.scene) || SCENES[0];
  return { scene: sc.id, font: FONTS[c.font] ? c.font : sc.font, lay: LAYS[c.lay] ? c.lay : sc.lay, fx: c.fx !== false, realwx: c.realwx !== false, night: c.night !== false, h12: !!c.h12, photoSrc: c.photoSrc || 'pick', photos: Array.isArray(c.photos) ? c.photos : [] };
}
async function saveCfg(patch) { const c = { ...(store.getSettings().deskClock || {}), ...patch }; await store.saveSettings({ deskClock: c }, { silent: true }); }

/* ── 연출 (캔버스) ── */
function makeFx(cv) {
  const g = cv.getContext('2d');
  let W = 0, H = 0, P = [], kind = '', tt = 0, shoot = null;
  const R = (a, b) => a + Math.random() * (b - a), i4 = () => Math.floor(Math.random() * 4);
  function size() { const dpr = Math.min(2, window.devicePixelRatio || 1); W = cv.clientWidth; H = cv.clientHeight; cv.width = W * dpr; cv.height = H * dpr; g.setTransform(dpr, 0, 0, dpr, 0, 0); }
  function make(init) {
    const o = { x: R(0, W), y: init ? R(0, H) : -20, ph: R(0, 6.28), s: R(.6, 1.4) * Math.max(.8, H / 400), r: R(0, 6.28), vr: R(-2, 2) };
    if (kind === 'petals') { o.vx = R(.5, 1.6); o.vy = R(.5, 1.3); o.c = ['#ffc4d6', '#ffb0c8', '#ffd8e4', '#fbe1ea'][i4()]; }
    if (kind === 'snow') { o.vy = R(.35, 1.1) * o.s; o.rad = R(1.2, 3.6) * o.s; }
    if (kind === 'rain') { o.vy = R(9, 14); o.len = R(12, 24); o.a = R(.18, .4); }
    if (kind === 'embers') { o.y = init ? R(H * .3, H) : H + 10; o.x = R(W * .02, W * .5); o.vy = -R(.6, 1.6); o.life = init ? R(0, 1) : 0; }
    if (kind === 'hearts' || kind === 'bubbles') { o.y = init ? R(0, H) : H + 30; o.vy = -R(.4, 1.0); o.rad = R(6, 16) * Math.max(.8, H / 400); o.c = ['#ff8fb8', '#ffa8c8', '#ff6fa0', '#ffd1e0'][i4()]; }
    if (kind === 'leaves') { o.vx = R(-.4, .8); o.vy = R(.6, 1.4); o.c = ['#e0782f', '#c9512c', '#e8a83a', '#b8662a'][i4()]; }
    if (kind === 'stars') { o.y = R(0, H * .75); o.tw = R(.5, 2); }
    return o;
  }
  function set(k) { size(); kind = k || ''; P = []; shoot = null; const n = { petals: 46, snow: 130, rain: 170, embers: 60, hearts: 26, bubbles: 20, leaves: 30, stars: 90 }[kind] || 0; for (let i = 0; i < n; i++) P.push(make(true)); g.clearRect(0, 0, W, H); }
  function step(dt) {
    tt += dt; const k = dt * 60; g.clearRect(0, 0, W, H);
    for (let i = 0; i < P.length; i++) {
      const o = P[i];
      if (kind === 'petals') { o.x += (o.vx + Math.sin(tt * 1.3 + o.ph) * .6) * k; o.y += o.vy * k; o.r += o.vr * .02 * k; g.save(); g.translate(o.x, o.y); g.rotate(o.r); g.scale(Math.cos(tt * 2 + o.ph), 1); g.fillStyle = o.c; g.globalAlpha = .9; g.beginPath(); g.ellipse(0, 0, 7 * o.s, 4.2 * o.s, 0, 0, 6.29); g.fill(); g.restore(); if (o.y > H + 20 || o.x > W + 20) { P[i] = make(false); P[i].x = R(-60, W * .8); } }
      else if (kind === 'snow') { o.x += Math.sin(tt * .8 + o.ph) * .4 * k; o.y += o.vy * k; g.globalAlpha = .85; g.fillStyle = '#fff'; g.beginPath(); g.arc(o.x, o.y, o.rad, 0, 6.29); g.fill(); if (o.y > H + 5) P[i] = make(false); }
      else if (kind === 'rain') { o.y += o.vy * k; o.x -= o.vy * .12 * k; g.globalAlpha = o.a; g.strokeStyle = '#dfe9ff'; g.lineWidth = 1.2; g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(o.x + o.len * .12, o.y - o.len); g.stroke(); if (o.y > H + 20) { P[i] = make(false); P[i].x = R(0, W + 80); } }
      else if (kind === 'embers') { o.y += o.vy * k; o.x += Math.sin(tt * 2 + o.ph) * .5 * k; o.life += dt * .35; const a = Math.max(0, 1 - o.life) * (.6 + .4 * Math.sin(tt * 9 + o.ph)); g.globalAlpha = a; const gr = g.createRadialGradient(o.x, o.y, 0, o.x, o.y, 5 * o.s); gr.addColorStop(0, '#fff2c0'); gr.addColorStop(.4, '#ffad4d'); gr.addColorStop(1, 'rgba(255,90,0,0)'); g.fillStyle = gr; g.beginPath(); g.arc(o.x, o.y, 5 * o.s, 0, 6.29); g.fill(); if (o.life > 1 || o.y < -10) P[i] = make(false); }
      else if (kind === 'hearts') { o.y += o.vy * k; o.x += Math.sin(tt * 1.2 + o.ph) * .5 * k; g.globalAlpha = .75 * Math.max(0, Math.min(1, o.y / (H * .5))); g.fillStyle = o.c; g.save(); g.translate(o.x, o.y); g.scale(o.rad / 10, o.rad / 10); g.beginPath(); g.moveTo(0, 7); g.bezierCurveTo(-9, 0, -8, -7, -3.5, -7); g.bezierCurveTo(-1.5, -7, 0, -5.5, 0, -4); g.bezierCurveTo(0, -5.5, 1.5, -7, 3.5, -7); g.bezierCurveTo(8, -7, 9, 0, 0, 7); g.fill(); g.restore(); if (o.y < -20) P[i] = make(false); }
      else if (kind === 'bubbles') { o.y += o.vy * k; o.x += Math.sin(tt * 1.1 + o.ph) * .6 * k; const r = o.rad * 1.4; g.globalAlpha = .8; const gr = g.createRadialGradient(o.x - r * .35, o.y - r * .35, 1, o.x, o.y, r); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(.25, 'rgba(255,255,255,.15)'); gr.addColorStop(.85, 'rgba(200,170,255,.2)'); gr.addColorStop(1, 'rgba(255,170,215,.6)'); g.fillStyle = gr; g.beginPath(); g.arc(o.x, o.y, r, 0, 6.29); g.fill(); g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 1; g.stroke(); if (o.y < -30) P[i] = make(false); }
      else if (kind === 'leaves') { o.x += (o.vx + Math.sin(tt * 1.4 + o.ph) * 1.1) * k; o.y += o.vy * k; o.r += o.vr * .03 * k; g.save(); g.translate(o.x, o.y); g.rotate(o.r); g.scale(Math.cos(tt * 2.2 + o.ph), 1); g.globalAlpha = .92; g.fillStyle = o.c; g.beginPath(); g.moveTo(0, -10 * o.s); g.quadraticCurveTo(8 * o.s, -2 * o.s, 0, 10 * o.s); g.quadraticCurveTo(-8 * o.s, -2 * o.s, 0, -10 * o.s); g.fill(); g.strokeStyle = 'rgba(90,40,10,.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -9 * o.s); g.lineTo(0, 12 * o.s); g.stroke(); g.restore(); if (o.y > H + 20) P[i] = make(false); }
      else if (kind === 'stars') { g.globalAlpha = .35 + .65 * Math.abs(Math.sin(tt * o.tw + o.ph)); g.fillStyle = '#fff8e0'; g.beginPath(); g.arc(o.x, o.y, 1.2 * o.s, 0, 6.29); g.fill(); }
    }
    if (kind === 'stars') {
      if (!shoot && (tt % 4.2) < dt) shoot = { x: R(W * .4, W), y: R(10, H * .3), t: 0 };
      if (shoot) { shoot.t += dt; const d = shoot.t * 520, x0 = shoot.x - d, y0 = shoot.y + d * .45; g.globalAlpha = Math.max(0, 1 - shoot.t / .8); const gr = g.createLinearGradient(x0, y0, x0 + 90, y0 - 40); gr.addColorStop(0, '#fff'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.strokeStyle = gr; g.lineWidth = 2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + 90, y0 - 40); g.stroke(); if (shoot.t > .8) shoot = null; }
    }
    g.globalAlpha = 1;
  }
  return { set, step, size, get kind() { return kind; } };
}

/* ── 날씨 (지금 · 시간별) ── */
let wxCache = null, wxFail = '';
async function getWeather() {
  wxFail = '';
  if (wxCache && Date.now() - wxCache.at < 30 * 60e3) return wxCache;
  try {
    const W = await import('./weather.js');
    if (!W.available()) { wxFail = 'unavailable'; return null; }
    if ((await W.permState()) !== 'granted') { wxFail = 'perm'; return null; }
    if (!(await W.locationEnabled())) { wxFail = 'off'; return null; }
    let loc = null; try { loc = await W.locate({ precise: false }); } catch { /* */ }
    if (!loc || loc.lat == null) { wxFail = 'noloc'; return null; }
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${Number(loc.lat).toFixed(2)}&longitude=${Number(loc.lon).toFixed(2)}&current=temperature_2m,weather_code&hourly=weather_code,temperature_2m&daily=temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=2`;
    const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 10000);
    let j; try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); j = await r.json(); } finally { clearTimeout(tm); }
    const now = new Date(), h = now.getHours();
    const hrs = [];
    for (let i = 1; hrs.length < 4 && i < 30; i++) { const hh = h + i * 3; if (hh >= 48) break; hrs.push({ h: hh % 24, k: W.kindOf(j.hourly.weather_code[hh]), t: Math.round(j.hourly.temperature_2m[hh]) }); }
    wxCache = { at: Date.now(), k: W.kindOf(j.current.weather_code), t: Math.round(j.current.temperature_2m), hi: Math.round(j.daily.temperature_2m_max[0]), lo: Math.round(j.daily.temperature_2m_min[0]), pop: j.daily.precipitation_probability_max?.[0] ?? null, place: W.placeName(loc), hrs, svg: W.wxSvg, name: W.nameOf };
    return wxCache;
  } catch (e) { console.warn('[clock] weather', e); wxFail = wxFail || 'net'; return null; }
}
/** 예보 시각 표시: 나라별 형식 (ko '2시', en '2', ja '2時' …) */
function hourLabel(h) { try { const d = new Date(); d.setHours(h, 0, 0, 0); return d.toLocaleTimeString(document.documentElement.lang || undefined, { hour: 'numeric', hourCycle: 'h23' }); } catch { return h + ':00'; } }
const WETFX = { rain: 'rain', cloudrain: 'rain', shower: 'rain', thunder: 'rain', snow: 'snow', sleet: 'snow' };

/* ── 사진 ── */
async function photoIds(c) {
  if (c.photoSrc === 'pick' && c.photos.length) return c.photos;
  const ids = [];
  for (const e of [...store.live()].reverse()) { for (const p of e.photos || []) { ids.push(p); if (ids.length >= 40) return ids; } }
  return ids;
}

/* ── 열기 ── */
let open = null;
export async function show() {
  if (open) return;
  if (!canUse()) { const { go } = await import('./app.js'); go('/plus?from=clock'); return; }
  const plug = DC();
  if (plug) { try { await plug.enter(); } catch (e) { console.warn('[clock] enter', e); } }
  injectFonts();
  const root = document.createElement('div');
  root.className = 'dc-root';
  root.innerHTML = `<div class="dc-bg"></div><div class="dc-shade"></div><div class="dc-photo-full"></div><canvas class="dc-fx"></canvas><div class="dc-ui"></div><div class="dc-night"></div>
    <svg width="0" height="0" style="position:absolute"><filter id="dcChalk"><feTurbulence baseFrequency=".9" numOctaves="2" result="n"/><feDisplacementMap in="SourceGraphic" in2="n" scale="4"/></filter></svg>
    <div class="dc-panel" hidden></div>`;
  document.body.append(root);
  const $ = (s) => root.querySelector(s);
  const fx = makeFx($('.dc-fx'));
  let wakeUntil = 0, wxT = 0, wxState = 'busy', c = cfg(), raf = 0, last = 0, lastMin = '', wx = null, photos = [], pIdx = 0, pTimer = 0, hideT = 0, nightOn = false, acc = 0;

  function sceneObj() { return SCENES.find((x) => x.id === c.scene) || SCENES[0]; }
  function timeText() { const d = new Date(); let h = d.getHours(); if (c.h12) h = h % 12 || 12; return String(h).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); }
  function dateText() { const d = new Date(); try { return d.toLocaleDateString(document.documentElement.lang || undefined, { month: 'long', day: 'numeric', weekday: 'long' }); } catch { return d.toDateString(); } }
  function wxLine() { return wx ? ` · ${wx.t}°` : ''; }
  function wxCard(dark) {
    if (!wx) {
      const M = { busy: [t('날씨를 불러오는 중이에요…'), ''], perm: [t('날씨를 보려면 위치 권한이 필요해요.'), t('날씨 켜기')], denied: [t('위치 권한이 꺼져 있어요. 폰 설정에서 하루칸의 위치를 \'앱 사용 중에만 허용\'으로 바꿔 주세요.'), t('설정 열기')], off: [t('폰의 위치 기능이 꺼져 있어요.'), t('위치 켜기')], noloc: [t('지금 위치를 찾지 못했어요.'), t('다시 시도')], net: [t('날씨 서버에 연결하지 못했어요. 5분마다 저절로 다시 불러와요.'), t('다시 시도')], unavailable: [t('이 버전에서는 날씨를 쓸 수 없어요.'), ''] };
      const [msg, btn] = M[wxState] || M.perm;
      return `<div class="dc-glass dc-wx${dark ? ' dk' : ''}" style="max-width:240px"><div style="opacity:.9;line-height:1.45">${msg}</div>${btn ? `<button class="dc-wxon">${btn}</button>` : ''}</div>`;
    }
    return `<div class="dc-glass dc-wx${dark ? ' dk' : ''}"><div class="dc-wx-big">${wx.svg(wx.k, 44)}<div><b>${wx.t}°</b><div class="dc-sub">${wx.name(wx.k)}${wx.place ? ' · ' + wx.place : ''}</div></div></div>
      <div class="dc-sub" style="margin-top:6px">${t('최고')} ${wx.hi}° · ${t('최저')} ${wx.lo}°${wx.pop != null ? ` · ${t('비')} ${wx.pop}%` : ''}</div>
      <div class="dc-hr">${wx.hrs.map((x) => `<div><div class="dc-sub">${hourLabel(x.h)}</div>${wx.svg(x.k, 22)}<div>${x.t}°</div></div>`).join('')}</div></div>`;
  }
  function render() {
    const sc = sceneObj(), H = root.clientHeight || 390;
    $('.dc-bg').style.backgroundImage = `url(backgrounds/${sc.bg}_wide.webp)`;
    $('.dc-bg').style.backgroundSize = sc.bgsize || 'cover'; $('.dc-bg').style.backgroundPosition = sc.bgpos || 'center';
    $('.dc-shade').style.background = sc.shade || 'none';
    root.classList.toggle('dk', !!sc.dark);
    const sz = Math.round(H * sc.size * (c.lay === 'A' ? 1.1 : 1) * (c.font === sc.font ? 1 : (c.font === 'pixheart' || c.font === 'pixflower' ? .72 : c.font === 'nixie' ? .82 : 1)));
    const tm = FONTS[c.font].draw(timeText(), Math.min(sz, H * .42));
    const date = `<div class="dc-date" style="color:${sc.dc}">${dateText()}${wxLine()}</div>`;
    const plate = sc.plate || ((c.font === 'pixheart' || c.font === 'pixflower') && !sc.dark);
    const block = plate ? `<div class="dc-plate">${tm}${date}</div>` : `<div>${tm}${date}</div>`;
    const ui = $('.dc-ui');
    if (c.lay === 'A') ui.innerHTML = `<div class="dc-a">${block}</div>`;
    else if (c.lay === 'B') ui.innerHTML = `<div class="dc-row">${block}${wxCard(sc.dark)}</div>`;
    else ui.innerHTML = `<div class="dc-row">${block}<div class="dc-pol-wrap"><div class="dc-pol"><div class="dc-pol-img"></div><span></span></div><div class="dc-dots"></div></div></div>`;
    ui.querySelector('.dc-wxon')?.addEventListener('click', (ev) => { ev.stopPropagation(); weatherOn(); });
    if (c.lay === 'C') showPhoto(false);
    lastMin = timeText();
  }
  async function showPhoto(next) {
    if (c.lay !== 'C') return;
    const box = $('.dc-pol-img'); if (!box) return;
    if (!photos.length) { box.innerHTML = `<div class="dc-nophoto">${t('사진을 골라 주세요')}</div>`; box.style.backgroundImage = ''; return; }
    if (next) pIdx = (pIdx + 1) % photos.length;
    const d = await store.getPhoto(photos[pIdx]).catch(() => null);
    if (!d || !box.isConnected) return;
    box.innerHTML = ''; box.style.backgroundImage = `url("${d}")`;
    const dots = $('.dc-dots'); if (dots) dots.innerHTML = photos.slice(0, 8).map((_, i) => `<i class="${i === pIdx % 8 ? 'on' : ''}"></i>`).join('');
  }
  function effectKind() {
    if (!c.fx || nightOn) return '';
    if (c.realwx && wx && WETFX[wx.k]) return WETFX[wx.k];
    return sceneObj().fx;
  }
  function applyFx() { const k = effectKind(); if (k !== fx.kind) fx.set(k); }
  function checkNight() {
    /* 밤(23~6시) 살짝 어둡게 (2026-11-13 사용자 '화면이 왜 이렇게 어두워' → 덮개 62%→30%, 밝기 5%→30%). 화면을 누르면 1분 동안 원래대로 */
    const h = new Date().getHours(), on = c.night && (h >= 23 || h < 6) && Date.now() > wakeUntil;
    if (on === nightOn) return;
    nightOn = on; root.classList.toggle('night', on);
    try { plug?.dim({ level: on ? 0.3 : -1 }); } catch { /* */ }
    applyFx();
  }
  function loop(ts) {
    if (!root.isConnected) return;
    raf = requestAnimationFrame(loop);
    if (document.hidden) { last = 0; return; }
    const dt = last ? Math.min(.1, (ts - last) / 1000) : 0; last = ts;
    acc += dt;
    if (acc >= 1 / 30) { if (fx.kind) fx.step(acc); acc = 0; }        // 30fps 로 충분 (배터리)
    if (timeText() !== lastMin) { render(); checkNight(); }
  }
  /* 날씨 켜기 (2026-11-13 사용자: '날씨 불러오기를 눌렀는데 반응이 없다') — 앱의 안내 창은 이 화면 뒤에 가려지므로 카드 안에서 알린다.
     안드로이드가 권한 창을 더 띄우지 않으면(두 번 거절) 폰 설정의 하루칸 권한 화면으로 보낸다 */
  async function weatherOn() {
    const W = await import('./weather.js');
    if (wxState === 'denied') { window.__hkPermFlow = Date.now(); await W.openSettings('app'); wxState = 'perm'; return; }
    if (wxState === 'off') { window.__hkPermFlow = Date.now(); await W.openSettings('location'); return; }
    wxState = 'busy'; render();
    if ((await W.permState()) !== 'granted') {
      window.__hkPermFlow = Date.now();                       // 권한 창에서 돌아올 때 다시 잠그지 않게
      const st = await W.requestPerm();
      try { DC()?.enter(); } catch { /* 권한 창 뒤 가로·막대 숨김 다시 */ }
      if (st !== 'granted') { wxState = 'denied'; render(); return; }
    }
    await store.saveSettings({ weatherAuto: true, weatherAsked: true }, { silent: true });
    wxCache = null; wx = await getWeather();
    wxState = wx ? '' : (wxFail || 'net');
    render(); applyFx();
  }
  async function reloadPhotos() { photos = await photoIds(c); pIdx = 0; showPhoto(false); }

  /* 고르기 판 — 화면을 누르면 나오고 6초 뒤 숨는다 */
  function chip(label, on, act) { return `<button class="dc-chip${on ? ' on' : ''}" data-act="${act}">${label}</button>`; }
  function panelHTML() {
    return `<div class="dc-prow"><span>${t('장면')}</span>${SCENES.map((s) => chip(t(s.name), s.id === c.scene, 'scene:' + s.id)).join('')}</div>
      <div class="dc-prow"><span>${t('숫자')}</span>${Object.entries(FONTS).map(([k, f]) => chip(t(f.name), k === c.font, 'font:' + k)).join('')}</div>
      <div class="dc-prow"><span>${t('배치')}</span>${Object.entries(LAYS).map(([k, n]) => chip(t(n), k === c.lay, 'lay:' + k)).join('')}
        <span style="margin-left:10px">${t('사진')}</span>${chip(t('직접 고른 사진') + (c.photos.length ? ` ${c.photos.length}` : ''), c.photoSrc === 'pick', 'psrc:pick')}${chip(t('일기 사진'), c.photoSrc === 'diary', 'psrc:diary')}${chip('+ ' + t('앨범에서 고르기'), false, 'pick')}</div>
      <div class="dc-prow"><span>${t('연출')}</span>${chip(t('연출'), c.fx, 'tog:fx')}${chip(t('실제 날씨 따라가기'), c.realwx, 'tog:realwx')}${chip(t('밤에는 살짝 어둡게 (23~6시)'), c.night, 'tog:night')}${chip(t('12시간제'), c.h12, 'tog:h12')}
        <button class="dc-chip dc-close" data-act="close">${t('닫기')}</button></div>`;
  }
  function showPanel() {
    const p = $('.dc-panel'); p.innerHTML = panelHTML(); p.hidden = false;
    clearTimeout(hideT); hideT = setTimeout(() => { p.hidden = true; }, 6000);
  }
  root.addEventListener('click', async (ev) => {
    if (nightOn) { wakeUntil = Date.now() + 60e3; checkNight(); setTimeout(checkNight, 61e3); }
    const b = ev.target.closest('[data-act]');
    if (!b) { const p = $('.dc-panel'); if (p.hidden) showPanel(); else { p.hidden = true; } return; }
    ev.stopPropagation();
    const [a, v] = b.dataset.act.split(':');
    if (a === 'close') { close(); return; }
    if (a === 'scene') { const sc = SCENES.find((x) => x.id === v); await saveCfg({ scene: v, font: sc.font, lay: sc.lay }); }
    if (a === 'font') await saveCfg({ font: v });
    if (a === 'lay') await saveCfg({ lay: v });
    if (a === 'tog') await saveCfg({ [v]: !c[v] });
    if (a === 'psrc') await saveCfg({ photoSrc: v });
    if (a === 'pick') {
      const N = await import('./native.js');
      const r = await N.pickPhotos({ multiple: true, maxEdge: 1600 }).catch(() => null);
      if (r?.photos?.length) {
        const ids = [];
        for (const d of r.photos.slice(0, 30)) ids.push(await store.putPhoto(d));
        for (const old of c.photos) store.deletePhoto?.(old).catch?.(() => {});
        await saveCfg({ photos: ids, photoSrc: 'pick', lay: 'C' });
      }
      try { await DC()?.enter(); } catch { /* 고르기 창에서 돌아오면 다시 가로·막대 숨김 */ }
    }
    c = cfg();
    if (a === 'pick' || a === 'psrc' || a === 'scene' || a === 'lay') await reloadPhotos();
    render(); applyFx(); showPanel();
  });

  function close() {
    if (!open) return;
    const open0 = open; open = null; cancelAnimationFrame(raf); clearInterval(pTimer); clearInterval(wxT); clearTimeout(hideT);
    window.removeEventListener('resize', onResize);
    if (open0?.onVis) document.removeEventListener('visibilitychange', open0.onVis);
    root.remove();
    try { DC()?.exit(); } catch { /* */ }
    window.__hkClockBack = null;
  }
  const onResize = () => { fx.size(); fx.set(effectKind()); render(); };
  window.addEventListener('resize', onResize);
  window.__hkClockBack = () => { const p = $('.dc-panel'); if (p && !p.hidden) { p.hidden = true; return true; } close(); return true; };
  open = { close };

  await new Promise((r) => setTimeout(r, 250));   // 가로로 돌아가는 동안
  render(); checkNight(); applyFx();
  raf = requestAnimationFrame(loop);
  reloadPhotos();
  pTimer = setInterval(() => showPhoto(true), 30000);
  wx = await getWeather(); wxState = wx ? '' : (wxFail || 'perm'); if (root.isConnected) { render(); applyFx(); }
  const onVis = async () => { if (document.hidden || wx || !root.isConnected) return; try { DC()?.enter(); } catch { /* */ } wxCache = null; wx = await getWeather(); wxState = wx ? '' : (wxFail || 'perm'); render(); applyFx(); };
  document.addEventListener('visibilitychange', onVis);
  open.onVis = onVis;
  /* 못 받았으면 5분마다, 받았으면 30분마다 다시 (2026-11-13: 날씨 서버가 한동안 응답하지 않던 일) */
  let wxLast = Date.now();
  wxT = setInterval(async () => { if (wx && Date.now() - wxLast < 30 * 60e3) return; wxLast = Date.now(); const w = await getWeather(); if (w) wx = w; if (!wx) wxState = wxFail || 'net'; else wxState = ''; if (root.isConnected) { render(); applyFx(); } }, 5 * 60e3);
  showPanel();
  try { (await import('./analytics.js')).design('clock:open:' + c.scene); } catch { /* */ }
}
export function close() { open?.close(); }

let fontsDone = false;
function injectFonts() {
  if (fontsDone) return; fontsDone = true;
  const st = document.createElement('style');
  st.textContent = [['HK Nixie', 'NixieOne', 400], ['HK Neon', 'TiltNeon', 400], ['HK Fredoka', 'Fredoka', 600], ['HK Gaegu', 'Gaegu', 700], ['HK Spice', 'BungeeSpice', 400]]
    .map(([n, f, w]) => `@font-face{font-family:'${n}';font-weight:${w};src:url(vendor/clockfonts/${f}.woff2) format('woff2');}`).join('') + CSS;
  document.head.append(st);
}
const CSS = `
.dc-root{position:fixed;inset:0;z-index:290;background:#111;overflow:hidden;font-family:inherit;-webkit-tap-highlight-color:transparent;user-select:none}
.dc-bg{position:absolute;inset:0;background-size:cover;background-position:center}
.dc-shade,.dc-night{position:absolute;inset:0;pointer-events:none}
.dc-night{background:rgba(0,0,0,0);transition:background 1.2s}
.dc-root.night .dc-night{background:rgba(0,0,0,.3)}
.dc-fx{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.dc-ui{position:absolute;inset:0;display:flex;align-items:center;padding:0 max(36px,env(safe-area-inset-left)) 0 max(36px,env(safe-area-inset-right));box-sizing:border-box}
.dc-a{width:100%;display:flex;justify-content:center;text-align:center}
.dc-a .dc-date{text-align:center}
.dc-row{width:100%;display:flex;align-items:center;justify-content:space-between;gap:20px}
.dc-date{font-size:clamp(14px,4.4vh,22px);font-weight:600;margin-top:8px;letter-spacing:.02em;text-shadow:0 1px 6px rgba(0,0,0,.18)}
.dc-plate{background:rgba(255,255,255,.58);backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);border-radius:26px;padding:18px 24px 12px}
.dc-glass{background:rgba(255,255,255,.62);backdrop-filter:blur(14px);-webkit-backdrop-filter:blur(14px);border-radius:22px;box-shadow:0 8px 24px rgba(0,0,0,.12);color:#3a2b33}
.dc-glass.dk{background:rgba(20,16,24,.45);color:#fff}
.dc-wx{padding:14px 18px;min-width:200px;font-size:13px}
.dc-wx-big{display:flex;align-items:center;gap:10px}.dc-wx-big b{font-size:30px;font-weight:700;line-height:1}
.dc-sub{opacity:.8;font-size:12.5px}
.dc-hr{display:flex;justify-content:space-between;margin-top:10px;text-align:center;gap:12px;font-size:12.5px}
.dc-wxon{margin-top:10px;border:0;border-radius:14px;padding:8px 14px;font:inherit;font-weight:700;background:#fff;color:#7a3a5a}
.dc-pol-wrap{display:flex;flex-direction:column;align-items:center}
.dc-pol{background:#fff;padding:9px 9px 30px;border-radius:4px;box-shadow:0 12px 26px rgba(0,0,0,.28);transform:rotate(3deg)}
.dc-pol-img{width:min(30vw,260px);height:min(46vh,190px);background-size:cover;background-position:center;background-color:#eee;transition:background-image .6s;display:grid;place-items:center}
.dc-nophoto{color:#9a8a90;font-size:13px}
.dc-dots{display:flex;gap:5px;margin-top:12px}.dc-dots i{width:6px;height:6px;border-radius:3px;background:rgba(255,255,255,.55)}.dc-dots i.on{width:16px;background:#fff}
.dc-panel{position:absolute;left:0;right:0;bottom:0;padding:10px 14px max(10px,env(safe-area-inset-bottom));background:rgba(20,16,24,.72);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);color:#fff;display:flex;flex-direction:column;gap:6px;max-height:62vh;overflow:auto}
.dc-panel[hidden]{display:none}
.dc-prow{display:flex;gap:6px;align-items:center;overflow-x:auto;white-space:nowrap;scrollbar-width:none}
.dc-prow>span{font-size:12px;opacity:.7;min-width:34px}
.dc-chip{border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.08);color:#fff;border-radius:16px;padding:6px 12px;font:inherit;font-size:13px;flex:none}
.dc-chip.on{background:#fff;color:#4a2c40;border-color:#fff;font-weight:700}
.dc-close{margin-left:auto;background:#c4566f;border-color:#c4566f;font-weight:700}
`;
