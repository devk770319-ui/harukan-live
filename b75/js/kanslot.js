/* ===========================================================
   kanslot.js — 하루칸이 (하루칸 캐릭터, 패치 75, 2026-11-14 사용자 결정: 모두 무료, 기본으로 켬, 처음 자리는 화면 아래)
   · 홈 화면 위에 떠 있는 3D 캐릭터. 손가락으로 끌어 어디든 옮기고, 화면 아래쪽(62% 아래)에 놓으면
     아래 탭 바로 위를 좌우로 걸어 다닌다(가끔 쉼). 놓은 자리는 기억한다(hk.kanPos)
   · 기분 (사용자 2026-11-14): 3일 넘게 앱에 오지 않으면 시무룩(안 좋음), 일기를 쓰면 기분이 좋아진다.
     오늘 일기를 썼으면 좋음(그 일기 기분이 아주 밝으면 아주 좋음), 아니면 보통
   · 누르면 웃고 소리(무음·진동 모드면 진동만). 설정 › 하루칸이 보이기 로 숨길 수 있다(settings.kanOn, 기본 켬)
   · 홈을 떠나면 숨고 그리기도 멈춘다. 3D(WebGL)를 못 그리는 폰에서는 나오지 않는다
   =========================================================== */
import * as store from './store.js';
import { todayKey } from './ui.js';

const K_POS = 'hk.kanPos', K_OPEN = 'hk.kanLastOpen', K_SAD = 'hk.kanSadSince';
const AWAY = 3 * 864e5;
const SPEED = { great: 52, good: 44, calm: 34, sad: 22 };       // 걷는 빠르기 (px/초)
const W = 104, H = 116;
const ls = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch { /* */ } }, del(k) { try { localStorage.removeItem(k); } catch { /* */ } } };
const reduce = () => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } };
const tabbarH = () => document.getElementById('tabbar')?.getBoundingClientRect().height || 64;
const floorY = () => innerHeight - tabbarH() - H + 10;            // 걷는 줄: 아래 탭 바로 위
function loadPos() { try { return JSON.parse(ls.get(K_POS) || 'null'); } catch { return null; } }
function savePos(p) { ls.set(K_POS, JSON.stringify(p)); }

let glOk = null;
function hasGL() {
  if (glOk !== null) return glOk;
  try { const c = document.createElement('canvas'); glOk = !!(c.getContext('webgl2') || c.getContext('webgl')); } catch { glOk = false; }
  return glOk;
}
export function enabled() { return store.getSettings().kanOn !== false && hasGL(); }

/* 앱에 들어온 시각 기록 — 3일 넘게 안 왔으면 시무룩해진다 (일기를 쓰면 풀린다) */
function noteVisit() {
  const now = Date.now(), last = +ls.get(K_OPEN) || 0;
  if (last && now - last >= AWAY && !ls.get(K_SAD)) ls.set(K_SAD, String(now));
  ls.set(K_OPEN, String(now));
}
export function moodNow() {
  const today = todayKey();
  const mine = store.realLive();
  const sad = +ls.get(K_SAD) || 0;
  if (sad) {
    if (mine.some((e) => (e.createdAt || 0) >= sad || (e.updatedAt || 0) >= sad)) ls.del(K_SAD);   // 돌아와서 일기를 썼다 → 풀림
    else return 'sad';
  }
  const t = mine.filter((e) => e.date === today);
  if (!t.length) return 'calm';
  const v = [...t].reverse().find((e) => e.mood && typeof e.mood.v === 'number')?.mood.v;
  return typeof v === 'number' && v >= 0.5 ? 'great' : 'good';
}

let S = null;   // 하나만 만든다 (홈을 다시 그려도 같은 하루칸이)
let visitArmed = false;

export async function mount(greet) {
  if (!visitArmed) {
    visitArmed = true; noteVisit();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible') { ls.set(K_OPEN, String(Date.now())); return; }
      noteVisit();
      if (S && S.greet?.isConnected) S.setMood(moodNow());     // 앱을 다시 열었을 때 (며칠 만이면 시무룩)
    });
  }
  if (!enabled()) { S?.hideNow(); return; }
  for (let i = 0; i < 120 && !greet.isConnected; i++) await new Promise((r) => requestAnimationFrame(r));   // 홈은 다 그린 뒤 화면에 붙는다
  if (!greet.isConnected) return;
  const mood = moodNow();
  if (S) { const before = S.mood; S.greet = greet; S.setMood(mood); S.show(); if ((before === 'sad' || before === 'calm') && (mood === 'good' || mood === 'great')) S.cheer(); return; }
  try { S = await create(greet, mood); } catch (e) { console.warn('[kan]', e); }
}
/** 설정에서 끄면 바로 숨긴다 */
export function hideNow() { S?.hideNow(); }

async function create(greet, mood0) {
  const box = document.createElement('div');
  box.className = 'kan-float';
  box.style.cssText = `position:fixed;left:0;top:0;width:${W}px;height:${H}px;z-index:140;-webkit-tap-highlight-color:transparent;will-change:transform;touch-action:none`;
  const cv = document.createElement('canvas');
  cv.style.cssText = 'width:100%;height:100%;display:block;touch-action:none';
  cv.setAttribute('aria-label', 'Harukan');
  box.append(cv); document.body.append(box);
  const { createKan } = await import('./kan/kan.js');
  const k = createKan(cv, { mood: mood0, w: W, h: H, fps: 30 });
  const snd = import('./kan/sound.js').catch(() => null);
  const an = import('./analytics.js').catch(() => null);
  an.then((A) => A?.design('kan:show:' + mood0));

  const st = { greet, mood: mood0, mode: 'walk', x: 0, y: 0, dir: 1, walking: false, pauseT: 0.6, nextPause: 6, visible: true, drag: null, last: 0, raf: 0 };
  /* 처음 자리: 저장한 곳, 없으면 화면 아래(걸어 다니기) — 사용자 2026-11-14 '기본 위치는 하단' */
  const p = loadPos();
  if (p && p.mode) { st.mode = p.mode; st.x = p.fx * innerWidth; st.y = p.mode === 'walk' ? floorY() : p.fy * innerHeight; }
  else { st.mode = 'walk'; st.x = innerWidth * 0.62 - W / 2; st.y = floorY(); }
  const clampXY = () => { st.x = Math.max(-8, Math.min(innerWidth - W + 8, st.x)); st.y = Math.max(40, Math.min(floorY(), st.y)); if (st.mode === 'walk') st.y = floorY(); };
  const place = () => { clampXY(); box.style.transform = `translate(${Math.round(st.x)}px,${Math.round(st.y)}px)`; };
  place();

  /* 끌기 · 누르기 */
  let tapLog = 0;
  cv.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    try { cv.setPointerCapture(ev.pointerId); } catch { /* */ }
    st.drag = { id: ev.pointerId, sx: ev.clientX, sy: ev.clientY, ox: ev.clientX - st.x, oy: ev.clientY - st.y, moved: false, lx: ev.clientX, lt: performance.now(), vx: 0 };
  });
  cv.addEventListener('pointermove', (ev) => {
    const d = st.drag; if (!d || ev.pointerId !== d.id) return;
    if (!d.moved && Math.hypot(ev.clientX - d.sx, ev.clientY - d.sy) < 8) return;
    if (!d.moved) { d.moved = true; st.mode = 'free'; st.walking = false; k.setWalk(false); }
    const now = performance.now(); d.vx = (ev.clientX - d.lx) / Math.max(1, now - d.lt) * 1000; d.lx = ev.clientX; d.lt = now;
    k.setHeld(true, d.vx);
    st.x = ev.clientX - d.ox; st.y = ev.clientY - d.oy; place();
  });
  const end = (ev) => {
    const d = st.drag; if (!d || (ev && ev.pointerId !== d.id)) return;
    st.drag = null;
    if (d.moved) {
      k.setHeld(false); k.land();
      if (st.y + H / 2 > innerHeight * 0.62) { st.mode = 'walk'; st.dir = d.vx < -40 ? -1 : 1; st.pauseT = 0.8; st.nextPause = 5 + Math.random() * 4; }
      else st.mode = 'free';
      place();
      savePos({ mode: st.mode, fx: st.x / innerWidth, fy: st.y / innerHeight });
      an.then((A) => A?.design('kan:drag:' + st.mode));
      return;
    }
    k.tap(); snd.then((m) => m?.play(st.mood));
    if (Date.now() - tapLog > 60000) { tapLog = Date.now(); an.then((A) => A?.design('kan:tap')); }
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', (ev) => { end(ev); });

  /* 걷기 */
  const loop = (t) => {
    st.raf = requestAnimationFrame(loop);
    if (!st.visible || document.hidden) { st.last = 0; return; }
    if (!st.greet.isConnected) { hide(); return; }                // 홈을 떠났다
    const dt = st.last ? Math.min(0.05, (t - st.last) / 1000) : 0; st.last = t;
    if (st.mode !== 'walk' || st.drag || reduce()) { if (st.walking) { st.walking = false; k.setWalk(false); } return; }
    if (st.pauseT > 0) {                                          // 쉬는 중
      st.pauseT -= dt;
      if (st.walking) { st.walking = false; k.setWalk(false); }
      if (st.pauseT <= 0) { st.nextPause = 5 + Math.random() * 5; if (Math.random() < 0.35) st.dir = -st.dir; }
      return;
    }
    if (!st.walking) { st.walking = true; k.setWalk(true, st.dir, SPEED[st.mood] / 40); }
    st.x += st.dir * SPEED[st.mood] * dt;
    if (st.x < -6) { st.x = -6; st.dir = 1; k.setWalk(true, 1, SPEED[st.mood] / 40); }
    if (st.x > innerWidth - W + 6) { st.x = innerWidth - W + 6; st.dir = -1; k.setWalk(true, -1, SPEED[st.mood] / 40); }
    st.nextPause -= dt;
    if (st.nextPause <= 0) st.pauseT = 1.4 + Math.random() * 2.2;
    place();
  };
  st.raf = requestAnimationFrame(loop);
  addEventListener('resize', () => { if (!st.visible) return; if (st.mode === 'walk') st.y = floorY(); place(); k.resize(); });

  function hide() { if (!st.visible) return; st.visible = false; box.style.display = 'none'; k.setPaused(true); }
  return {
    get greet() { return st.greet; }, set greet(g) { st.greet = g; },
    get mood() { return st.mood; },
    cheer() { setTimeout(() => { k.tap(); snd.then((m) => m?.play(st.mood)); }, 450); },   // 일기를 쓰고 돌아오면 반가워한다
    setMood(m) { if (m !== st.mood) an.then((A) => A?.design('kan:mood:' + m)); st.mood = m; k.setMood(m); if (st.walking) k.setWalk(true, st.dir, SPEED[m] / 40); },
    show() { if (st.visible) return; st.visible = true; box.style.display = ''; k.setPaused(false); if (st.mode === 'walk') st.y = floorY(); place(); k.resize(); },
    hideNow: hide,
  };
}
