/* ===========================================================
   mysticker.js — 내 사진으로 스티커 만들기 (2026-11-22 사용자: '내 사진을 스티커로 만드는 방법이 있을까?', '한 번 개발 진행해줘')

   두 가지 길
     ① 모양 따기 — 사진을 고르고 동그라미·하트·둥근 네모·별 중 하나로 딴다. 흰 테두리와 그림자.
     ② 오려 낸 사진 — 삼성 갤러리·아이폰에서 사람·사물을 오려 내 저장한(배경이 투명한) PNG 를 고르면
        '모양 그대로' 가 골라져, 오려 낸 모양을 따라 흰 테두리를 두른다.
   사진은 안드로이드 사진 선택 창(input file)으로 받는다 — 앱의 사진 고르기는 JPEG 로 바꿔 투명이 사라진다.
   모든 처리는 이 폰 안에서만 한다 (사진을 어디에도 보내지 않는다).

   저장
     그림: store.putPhoto (일기 사진과 같은 곳 — 잠금을 켜면 암호화, 백업에 포함)
     목록: meta 'mySticks' [{ id, at, hidden?, from? }]  — 서랍에서 지워도(hidden) 그림은 남긴다. 붙여 둔 일기에서는 계속 보여야 한다.
     스티커 이름: 'my/<사진 id>'  (entry.stickers 의 s)
   =========================================================== */
import * as store from './store.js';
import * as plus from './plus.js';
import * as analytics from './analytics.js';
import { el, icon, esc, toast, openSheet, closeSheet } from './ui.js';
import { t } from './i18n.js';

/** 2026-11-22 사용자 '무료 기능을 배포해' — 누구나 (true 면 플러스·체험 중만) */
export const MY_PLUS = false;
export const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
const OUT = 480;                       // 만들어지는 스티커 긴 쪽 px
const cache = new Map();               // 사진 id → dataURL
let list = null;

export function isMine(sid) { return typeof sid === 'string' && sid.startsWith('my/'); }
export function canUse() { return !MY_PLUS || plus.canUseTextBox(); }
const idOf = (sid) => sid.slice(3);
export function cached(sid) { return cache.get(idOf(sid)) || null; }
export async function ensure(sid) {
  const id = idOf(sid);
  if (cache.has(id)) return cache.get(id);
  const d = await store.getPhoto(id);
  if (d) cache.set(id, d);
  return d;
}
/** 목록과 그림을 미리 읽어 둔다 (서랍·일기·PDF 가 바로 그리게) */
export async function load() {
  list = (await store.metaGet('mySticks', [])) || [];
  await Promise.all(list.map((x) => ensure('my/' + x.id).catch(() => null)));
  return list;
}
export function loaded() { return list != null; }
export function items() { return (list || []).filter((x) => !x.hidden && cache.has(x.id)).map((x) => 'my/' + x.id); }
async function addImage(dataUrl) {
  const id = await store.putPhoto(dataUrl);
  cache.set(id, dataUrl);
  list = (await store.metaGet('mySticks', [])) || [];
  list.unshift({ id, at: Date.now() });
  await store.metaSet('mySticks', list);
  return 'my/' + id;
}
/** 서랍에서만 뺀다 — 붙여 둔 일기의 스티커는 그대로 보인다 */
export async function hide(sid) {
  const id = idOf(sid);
  list = ((await store.metaGet('mySticks', [])) || []).map((x) => (x.id === id ? { ...x, hidden: true } : x));
  await store.metaSet('mySticks', list);
}

/* ── 사진 받기 ───────────────────────────────── */
function pickFile() {
  return new Promise((resolve) => {
    try { window.__hkOutAt = Date.now(); } catch { /* 다른 화면에 다녀와도 잠그지 않게 */ }
    const inp = el('input', { type: 'file', accept: 'image/*', style: 'position:fixed;left:-9999px;opacity:0' });
    let done = false;
    const finish = (f) => { if (done) return; done = true; inp.remove(); resolve(f || null); };
    inp.addEventListener('change', () => finish(inp.files?.[0]));
    inp.addEventListener('cancel', () => finish(null));
    document.body.append(inp);
    inp.click();
  });
}
function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => resolve({ im, url });
    im.onerror = () => { URL.revokeObjectURL(url); reject(new Error('img')); };
    im.src = url;
  });
}
/** 너무 큰 사진은 줄여서 다룬다 (긴 쪽 1400px) */
function toCanvas(im, max = 1400) {
  const k = Math.min(1, max / Math.max(im.naturalWidth, im.naturalHeight));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
  c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
  return c;
}
/** 투명한 곳이 있나 + 보이는 부분의 상자 (오려 낸 사진) */
function alphaBox(src) {
  const k = Math.min(1, 256 / Math.max(src.width, src.height));
  const w = Math.max(1, Math.round(src.width * k)), h = Math.max(1, Math.round(src.height * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1, clear = 0;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = d[(y * w + x) * 4 + 3];
    if (a < 16) { clear++; continue; }
    if (x < x0) x0 = x; if (y < y0) y0 = y; if (x > x1) x1 = x; if (y > y1) y1 = y;
  }
  if (x1 < 0 || clear < w * h * 0.04) return null;      // 거의 안 투명하면 일반 사진
  return { x: x0 / k, y: y0 / k, w: (x1 - x0 + 1) / k, h: (y1 - y0 + 1) / k };
}

/* ── 모양 ────────────────────────────────────── */
export const SHAPES = ['circle', 'heart', 'round', 'star', 'cut'];
const SHAPE_LABEL = () => ({ circle: t('동그라미'), heart: t('하트'), round: t('둥근 네모'), star: t('별'), cut: t('모양 그대로') });
function shapePath(g, shape, x, y, s) {
  g.beginPath();
  if (shape === 'circle') { g.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2); return; }
  if (shape === 'round') { const r = s * 0.2; g.moveTo(x + r, y); g.arcTo(x + s, y, x + s, y + s, r); g.arcTo(x + s, y + s, x, y + s, r); g.arcTo(x, y + s, x, y, r); g.arcTo(x, y, x + s, y, r); g.closePath(); return; }
  if (shape === 'heart') {
    const cx = x + s / 2, top = y + s * 0.27;
    g.moveTo(cx, top);
    g.bezierCurveTo(cx - s * 0.08, y + s * 0.02, x - s * 0.02, y + s * 0.06, x + s * 0.02, y + s * 0.36);
    g.bezierCurveTo(x + s * 0.06, y + s * 0.62, cx - s * 0.16, y + s * 0.78, cx, y + s * 0.97);
    g.bezierCurveTo(cx + s * 0.16, y + s * 0.78, x + s * 0.94, y + s * 0.62, x + s * 0.98, y + s * 0.36);
    g.bezierCurveTo(x + s * 1.02, y + s * 0.06, cx + s * 0.08, y + s * 0.02, cx, top);
    g.closePath(); return;
  }
  if (shape === 'star') {
    const cx = x + s / 2, cy = y + s * 0.53, R = s * 0.5, r = R * 0.5;
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R; const px = cx + Math.cos(a) * rr, py = cy + Math.sin(a) * rr; if (i) g.lineTo(px, py); else g.moveTo(px, py); }
    g.closePath(); g.lineJoin = 'round';
  }
}

/** 스티커 그리기. st = { shape, border, z, ox, oy } */
export function render(src, box, st, size = OUT) {
  const border = st.border ? Math.round(size * 0.045) : 0;
  if (st.shape === 'cut' && box) {
    /* 오려 낸 모양 그대로 — 보이는 부분만 잘라 테두리를 모양 따라 두른다 */
    const k = (size - border * 2 - 8) / Math.max(box.w, box.h);
    const iw = Math.round(box.w * k), ih = Math.round(box.h * k);
    const W = iw + border * 2 + 8, H = ih + border * 2 + 8;
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d');
    const ix = border + 4, iy = border + 4;
    if (border) {
      const sil = document.createElement('canvas'); sil.width = W; sil.height = H;
      const sg = sil.getContext('2d');
      for (let i = 0; i < 24; i++) { const a = i * Math.PI / 12; sg.drawImage(src, box.x, box.y, box.w, box.h, ix + Math.cos(a) * border, iy + Math.sin(a) * border, iw, ih); }
      sg.drawImage(src, box.x, box.y, box.w, box.h, ix, iy, iw, ih);
      sg.globalCompositeOperation = 'source-in'; sg.fillStyle = '#fff'; sg.fillRect(0, 0, W, H);
      g.save(); g.shadowColor = 'rgba(0,0,0,.22)'; g.shadowBlur = size * 0.02; g.shadowOffsetY = size * 0.006; g.drawImage(sil, 0, 0); g.restore();
    }
    g.drawImage(src, box.x, box.y, box.w, box.h, ix, iy, iw, ih);
    return c;
  }
  const c = document.createElement('canvas'); c.width = size; c.height = size;
  const g = c.getContext('2d');
  const pad = Math.round(size * 0.03);
  const s = size - pad * 2;
  if (border) {
    g.save(); g.shadowColor = 'rgba(0,0,0,.22)'; g.shadowBlur = size * 0.025; g.shadowOffsetY = size * 0.008;
    g.fillStyle = '#fff'; shapePath(g, st.shape, pad, pad, s); g.fill(); g.restore();
  }
  const inner = s - border * 2, ix = pad + border, iy = pad + border;
  g.save(); shapePath(g, st.shape, ix, iy, inner); g.clip();
  /* 사진을 칸에 꽉 차게(cover) 놓고, 확대·이동 */
  const sw = box ? box.w : src.width, sh = box ? box.h : src.height, sx = box ? box.x : 0, sy = box ? box.y : 0;
  const k = Math.max(inner / sw, inner / sh) * (st.z || 1);
  const dw = sw * k, dh = sh * k;
  const dx = ix + (inner - dw) / 2 + (st.ox || 0) * inner, dy = iy + (inner - dh) / 2 + (st.oy || 0) * inner;
  g.drawImage(src, sx, sy, sw, sh, dx, dy, dw, dh);
  g.restore();
  return c;
}

/* ── 만들기 창 ─────────────────────────────────── */
/** 사진을 골라 스티커를 만든다. 돌려주는 것: 새 스티커 이름('my/…') 또는 null */
export async function make() {
  if (!canUse()) { lockInfo(); return null; }
  analytics.design('mysticker:open');
  const file = await pickFile();
  if (!file) return null;
  let src, box;
  try { const { im, url } = await loadImage(file); src = toCanvas(im); URL.revokeObjectURL(url); box = alphaBox(src); }
  catch { toast(t('사진을 열 수 없어요. 다른 사진을 골라 주세요.')); return null; }
  return new Promise((resolve) => {
    const st = { shape: box ? 'cut' : 'circle', border: true, z: 1, ox: 0, oy: 0 };
    let result = null;
    const wrap = el('div', { class: 'mys' });
    const pv = el('canvas', { class: 'mys-pv', width: '320', height: '320' });
    const pvBox = el('div', { class: 'mys-pvbox' }); pvBox.append(pv);
    const draw = () => {
      const c = render(src, box, st, 640);
      const g = pv.getContext('2d'); pv.width = 320; pv.height = 320;
      g.clearRect(0, 0, 320, 320);
      const k = Math.min(300 / c.width, 300 / c.height);
      g.drawImage(c, (320 - c.width * k) / 2, (320 - c.height * k) / 2, c.width * k, c.height * k);
      zoomRow.hidden = st.shape === 'cut';
    };
    const shapes = el('div', { class: 'chip-row mys-shapes' });
    const L = SHAPE_LABEL();
    for (const sh of SHAPES) {
      if (sh === 'cut' && !box) continue;
      const b = el('button', { class: 'chip' + (st.shape === sh ? ' on' : ''), type: 'button' }, esc(L[sh]));
      b.addEventListener('click', () => { st.shape = sh; shapes.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
      shapes.append(b);
    }
    const borders = el('div', { class: 'chip-row' });
    for (const [v, lab] of [[true, t('흰 테두리')], [false, t('테두리 없음')]]) {
      const b = el('button', { class: 'chip' + (st.border === v ? ' on' : ''), type: 'button' }, esc(lab));
      b.addEventListener('click', () => { st.border = v; borders.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
      borders.append(b);
    }
    const zoomRow = el('label', { class: 'mys-zoom' }, `<span>${esc(t('확대'))}</span>`);
    const zr = el('input', { type: 'range', min: '1', max: '3', step: '0.02', value: '1' });
    zr.addEventListener('input', () => { st.z = +zr.value; draw(); });
    zoomRow.append(zr);
    /* 미리 보기를 끌어 사진 위치 옮기기 */
    let drag = null;
    pv.addEventListener('pointerdown', (ev) => { if (st.shape === 'cut') return; drag = { x: ev.clientX, y: ev.clientY, ox: st.ox, oy: st.oy }; try { pv.setPointerCapture(ev.pointerId); } catch { /* */ } });
    pv.addEventListener('pointermove', (ev) => { if (!drag) return; const r = pv.getBoundingClientRect(); st.ox = Math.max(-1, Math.min(1, drag.ox + (ev.clientX - drag.x) / r.width)); st.oy = Math.max(-1, Math.min(1, drag.oy + (ev.clientY - drag.y) / r.height)); draw(); });
    const end = () => { drag = null; };
    pv.addEventListener('pointerup', end); pv.addEventListener('pointercancel', end);
    const hint = el('div', { class: 'mys-hint' }, esc(box ? t('오려 낸 사진이라 모양 그대로 스티커가 돼요.') : t('미리 보기를 끌어서 위치를, 아래 막대로 크기를 맞춰요.')));
    const ok = el('button', { class: 'btn btn-primary btn-block', type: 'button' }, esc(t('스티커로 만들기')));
    ok.addEventListener('click', async () => {
      ok.disabled = true;
      try {
        const c = render(src, box, st, OUT);
        const url = c.toDataURL('image/webp', 0.9);
        result = await addImage(url.startsWith('data:image/webp') ? url : c.toDataURL('image/png'));
        analytics.design('mysticker:made:' + st.shape);
        toast(t('내 스티커에 넣었어요.'));
      } catch { toast(t('스티커를 만들지 못했어요.')); }
      closeSheet();
    });
    const tip = el('div', { class: 'mys-tip' }, esc(t('갤러리에서 사람이나 사물을 오려 내 저장한 사진을 고르면 배경 없는 스티커가 돼요.')));
    wrap.append(pvBox, hint, el('div', { class: 'mys-lab' }, esc(t('모양'))), shapes, el('div', { class: 'mys-lab' }, esc(t('테두리'))), borders, zoomRow, ok, tip);
    openSheet({ title: t('내 사진으로 스티커 만들기'), content: wrap, onClose: () => resolve(result) });
    draw();
    setTimeout(() => { try { document.activeElement?.blur(); } catch { /* */ } }, 50);   // 첫 칩에 생기는 포커스 테두리가 '고른 것'처럼 보였다
  });
}

function lockInfo() {
  analytics.design('mysticker:locked');
  plus.lockSheet('mysticker', t('내 사진 스티커는 하루칸 플러스 기능이에요'), t('붙여 둔 스티커는 그대로 남아요. 새로 만들려면 플러스가 필요해요.'));
}

/** 서랍의 '내 스티커' 칸 그리기 — onPick(sid) */
export function fillGrid(grid, onPick, repaint) {
  const ok = canUse();
  const mk = el('button', { class: 'stk-cell mys-add', type: 'button', 'aria-label': t('사진으로 만들기') }, `${icon('plus')}<span>${esc(t('사진으로 만들기'))}</span>`);
  mk.addEventListener('click', async () => { const sid = await make(); if (sid) { repaint?.(); onPick(sid); } });
  grid.append(mk);
  if (!loaded()) { load().then(() => repaint?.()).catch(() => {}); return; }
  for (const sid of items()) {
    const b = el('button', { class: 'stk-cell' + (ok ? '' : ' locked'), type: 'button', 'aria-label': t('내 스티커') });
    b.append(el('img', { src: cached(sid) || BLANK, alt: '', draggable: 'false' }));
    let lp = null, fired = false;
    b.addEventListener('pointerdown', () => { fired = false; lp = setTimeout(() => { fired = true; askHide(sid, repaint); }, 600); });
    for (const e of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(e, () => clearTimeout(lp));
    b.addEventListener('contextmenu', (ev) => ev.preventDefault());
    b.addEventListener('click', () => { if (fired) return; if (ok) onPick(sid); else lockInfo(); });
    grid.append(b);
  }
  if (!items().length) grid.append(el('div', { class: 'mys-empty' }, esc(t('사진을 골라 나만의 스티커를 만들어 보세요. 길게 누르면 지울 수 있어요.'))));
}
function askHide(sid, repaint) {
  openSheet({
    title: t('내 스티커에서 지울까요?'),
    text: t('이미 일기에 붙인 스티커는 그대로 남아요.'),
    items: [{ label: t('지우기'), icon: 'trash', danger: true, onClick: async () => { closeSheet(); await hide(sid); repaint?.(); analytics.design('mysticker:hide'); } }],
  });
}

/* ── 백업 ─────────────────────────────────────── */
/** exportJSON 이 부른다: 목록 + 그림 */
export async function exportPart(photos) {
  const l = (await store.metaGet('mySticks', [])) || [];
  for (const x of l) { if (photos[x.id]) continue; const d = await store.getPhoto(x.id); if (d) photos[x.id] = d; }
  return l;
}
/** importJSON 이 부른다: 그림을 새 id 로 넣고 { 'my/옛': 'my/새' } 를 돌려준다 */
export async function importPart(data) {
  const map = {};
  const incoming = data.mySticks || [];
  if (!incoming.length) return map;
  const cur = (await store.metaGet('mySticks', [])) || [];
  for (const x of incoming) {
    const dup = cur.find((y) => y.from === x.id || y.id === x.id);
    if (dup) { map['my/' + x.id] = 'my/' + dup.id; continue; }
    const d = data.photos?.[x.id];
    if (!d) continue;
    const id = await store.putPhoto(d);
    cache.set(id, d);
    cur.push({ id, at: x.at || Date.now(), from: x.id, ...(x.hidden ? { hidden: true } : {}) });
    map['my/' + x.id] = 'my/' + id;
  }
  await store.metaSet('mySticks', cur);
  list = cur;
  return map;
}
