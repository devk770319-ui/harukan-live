/* ──────────────────────────────────────────────────────────────
   photoview.js — 사진 크게 보기 (2026-11-06 사용자: "사진 묶음으로 등록된 사진을 클릭하면 크게 보는 기능")

   글 보기 화면에서 사진(낱장·사진 묶음 모두)을 누르면 화면 가득 크게 연다.
   · 옆으로 밀면 그 글의 다음·이전 사진
   · 두 손가락으로 벌리기, 두 번 누르기로 확대 — 확대한 채로는 끌어서 옮긴다
   · 아래로 내리거나 X·뒤로 버튼으로 닫는다
   · 잠금(암호화)된 사진도 store.fillImage 로 푼다. 내려받기·공유 단추는 두지 않는다
   ────────────────────────────────────────────────────────────── */
import * as store from './store.js';
import { t } from './i18n.js';
import * as analytics from './analytics.js';

let root = null;
let api = null;

export function isOpen() { return !!root; }
try { window.__hkPhotoViewBack = () => handleBack(); window.__hkPhotoViewClose = () => close(); } catch { /* */ }
/** 안드로이드 뒤로 버튼 — 열려 있으면 닫고 true */
export function handleBack() { if (!root) return false; close(); return true; }

export function close() {
  if (!root) return;
  const r = root; root = null; api = null;
  r.classList.add('pv-out');
  document.documentElement.classList.remove('pv-open');
  import('./ads.js').then((A) => A.onPhotoView?.(false)).catch(() => {});
  setTimeout(() => r.remove(), 180);
}

/**
 * @param {string[]} pids 사진 id (화면 순서)
 * @param {number} index 처음 보일 사진
 */
export function open(pids, index = 0) {
  if (!pids?.length) return;
  if (root) close();
  analytics.design('photo:view_open');
  let i = Math.max(0, Math.min(pids.length - 1, index));
  root = document.createElement('div');
  root.className = 'pv-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `<div class="pv-bg"></div>
    <div class="pv-track"></div>
    <div class="pv-top"><span class="pv-count"></span>
      <button class="pv-x" type="button" aria-label="${t('닫기')}"><svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>`;
  document.body.append(root);
  document.documentElement.classList.add('pv-open');
  import('./ads.js').then((A) => A.onPhotoView?.(true)).catch(() => {});
  const track = root.querySelector('.pv-track');
  const bg = root.querySelector('.pv-bg');
  const count = root.querySelector('.pv-count');
  root.querySelector('.pv-x').addEventListener('click', close);

  /* 슬라이드 셋 (이전·지금·다음)만 그림을 채운다 */
  const slides = pids.map(() => { const s = document.createElement('div'); s.className = 'pv-slide'; const im = document.createElement('img'); im.alt = ''; im.draggable = false; s.append(im); track.append(s); return s; });
  const fill = (k) => { const im = slides[k]?.querySelector('img'); if (im && !im.src) store.fillImage(im, pids[k], () => {}); };

  let W = window.innerWidth;
  let dx = 0, dy = 0;                 // 넘기기·내리기 중 이동
  let scale = 1, tx = 0, ty = 0;      // 지금 사진 확대·이동
  const cur = () => slides[i].querySelector('img');
  const paintZoom = (anim) => { const im = cur(); im.style.transition = anim ? 'transform .2s' : 'none'; im.style.transform = `translate(${tx}px,${ty}px) scale(${scale})`; };
  const resetZoom = (anim) => { scale = 1; tx = 0; ty = 0; paintZoom(anim); };
  const paint = (anim) => {
    track.style.transition = anim ? 'transform .25s ease' : 'none';
    track.style.transform = `translate(${-i * W + dx}px, ${dy}px)`;
    const fade = Math.max(0, 1 - Math.abs(dy) / 400);
    bg.style.opacity = String(fade);
    count.textContent = pids.length > 1 ? `${i + 1} / ${pids.length}` : '';
  };
  const go = (k) => {
    if (k < 0 || k >= pids.length) { dx = 0; paint(true); return; }
    if (k !== i) { resetZoom(false); i = k; }
    dx = 0; paint(true); fill(i); fill(i - 1); fill(i + 1);
  };
  const onResize = () => { W = window.innerWidth; paint(false); };
  window.addEventListener('resize', onResize);
  new MutationObserver((m, o) => { if (!root || !root.isConnected) { window.removeEventListener('resize', onResize); o.disconnect(); } }).observe(document.body, { childList: true });

  /* ── 손가락 ── */
  const pts = new Map();
  let mode = null;                    // 'swipe' | 'pan' | 'pinch'
  let sx = 0, sy = 0, stx = 0, sty = 0, pd = 0, ps = 1, lastTap = 0, moved = false;
  const dist = () => { const a = [...pts.values()]; return Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y); };
  track.addEventListener('pointerdown', (ev) => {
    track.setPointerCapture?.(ev.pointerId);
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pts.size === 2) { mode = 'pinch'; pd = dist(); ps = scale; return; }
    sx = ev.clientX; sy = ev.clientY; stx = tx; sty = ty; moved = false;
    mode = scale > 1.01 ? 'pan' : null;
  });
  track.addEventListener('pointermove', (ev) => {
    if (!pts.has(ev.pointerId)) return;
    pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (mode === 'pinch' && pts.size === 2) { scale = Math.max(1, Math.min(4, ps * dist() / (pd || 1))); paintZoom(false); return; }
    const mx = ev.clientX - sx, my = ev.clientY - sy;
    if (Math.abs(mx) + Math.abs(my) > 8) moved = true;
    if (mode === 'pan') { tx = stx + mx; ty = sty + my; paintZoom(false); return; }
    if (!mode && moved) mode = Math.abs(mx) > Math.abs(my) ? 'swipe' : 'down';
    if (mode === 'swipe') { dx = mx; paint(false); }
    else if (mode === 'down') { dy = Math.max(0, my); paint(false); }
  });
  const up = (ev) => {
    if (!pts.has(ev.pointerId)) return;
    pts.delete(ev.pointerId);
    if (mode === 'pinch') { if (pts.size === 0) { mode = null; if (scale < 1.05) resetZoom(true); } return; }
    if (mode === 'swipe') { if (dx < -W * 0.18) go(i + 1); else if (dx > W * 0.18) go(i - 1); else go(i); }
    else if (mode === 'down') { if (dy > 110) { close(); return; } dy = 0; paint(true); }
    else if (!moved) {
      const now = Date.now();
      if (now - lastTap < 300) { if (scale > 1.01) resetZoom(true); else { scale = 2.5; const r = cur().getBoundingClientRect(); tx = (r.left + r.width / 2 - ev.clientX) * 1.5; ty = (r.top + r.height / 2 - ev.clientY) * 1.5; paintZoom(true); } lastTap = 0; }
      else lastTap = now;
    }
    mode = null;
  };
  track.addEventListener('pointerup', up);
  track.addEventListener('pointercancel', up);

  api = { go };
  go(i);
}

/** 시험용: 지금 몇 번째 사진인지 */
export function _state() { return root ? { open: true, count: root.querySelector('.pv-count')?.textContent || '' } : { open: false }; }
