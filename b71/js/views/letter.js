/* ===========================================================
   views/letter.js — 친구에게 편지 보내기 (2026-11-03 사용자: "앱을 만들어서 에뮬레이터에서 확인할 수 있게")
   · 일기와 따로다. 일기 데이터는 읽지도 쓰지도 않는다. 통계·달력에도 안 들어간다
   · 편지는 이 폰에서 이미지(PNG)로 그려 폰의 공유 창으로 보낸다 — 서버 없음
   · 보낸 편지는 이 폰에만 (store meta 'letters', 앱 잠금 뒤). 썸네일과 다시 열 수 있는 내용
   · 편지지 고르기는 뺐다 (2026-11-03 사용자: "편지지는 넣지 말아, 다 마음에 안 들어, 삭제해") — 민무늬 한 장만 쓴다.
     예전에 다른 편지지로 보낸 편지도 다시 열면 민무늬로 보인다 (보낸 그림 썸네일은 그대로)
   · 무료: 기본 스티커. 플러스: 위로 스티커, 글자 상자, 카드 아래 '하루칸에서 쓴 편지' 띠 끄기. 체험 중에는 모두 된다
   #/letter (새 편지) · #/letter?id=… (보낸 편지 다시 열기) · #/letters (보낸 편지함)
   =========================================================== */
import * as store from '../store.js';
import * as plus from '../plus.js';
import * as NB from '../newbadge.js';
import * as analytics from '../analytics.js';
import { el, esc, icon, toast, openSheet, closeSheet, todayKey, fmtDate } from '../ui.js';
import { go, back } from '../app.js';
import { t } from '../i18n.js';

/* ── 편지지 ─────────────────────────────────────── */
/* 편지지 15종 (2026-11-06 사용자 시안 승인, 모두 무료) — 기본 7종(색과 선만) + 그림 8종(한 가지 색의 가는 선 그림을 연하게).
   base→base2 는 160° 그라데이션(CSS 와 그림이 똑같게), nm 은 To·From 이름 색, frame: 'double'(겹선) | 'thin'(가는 테두리)
   wm: 그림 img/letter/wm_<n>.webp 를 c 색으로 칠해 o 진하기로. 자리·크기는 카드 너비 비율 — x·w·h, 위에서 y 또는 아래(H 기준)에서 b */
export const PAPERS = [
  { id: 'plain', name: '크림', base: '#fdfaf4', ink: '#3b3128' },
  { id: 'lined', name: '아이보리 줄', base: '#fbf7ee', ink: '#3b3128', pattern: 'lined' },
  { id: 'frame', name: '클래식 테두리', base: '#fbf6ec', ink: '#3a2a2e', frame: 'double', fc: '#6b2440' },
  { id: 'wine', name: '깊은 와인', base: '#6e2340', base2: '#4b1529', ink: '#f6e7da', nm: '#f2d3a5', dark: true },
  { id: 'navy', name: '밤 남색', base: '#22305a', base2: '#141c38', ink: '#efe8da', nm: '#e5c98f', dark: true, frame: 'thin', fc: 'rgba(229,201,143,.4)' },
  { id: 'forest', name: '깊은 초록', base: '#28463a', base2: '#173027', ink: '#eee8d6', nm: '#e0cf9a', dark: true },
  { id: 'sumi', name: '먹색', base: '#34302f', base2: '#201d1c', ink: '#ece6dc', nm: '#d9c3a0', dark: true },
  { id: 'w-plum', art: true, name: '매화 가지', base: '#fdfaf4', ink: '#3b3128', nm: '#6b2440', wm: { n: 'plum', c: '#7a2a48', o: 0.22, x: 0.427, y: -0.033, w: 0.633, h: 0.833 } },
  { id: 'w-moon', art: true, name: '달과 별', base: '#22305a', base2: '#141c38', ink: '#efe8da', nm: '#e5c98f', dark: true, wm: { n: 'moon', c: '#e5c98f', o: 0.3, x: 0.467, y: 0.053, w: 0.5, h: 0.427 } },
  { id: 'w-cat', art: true, name: '잠자는 고양이', base: '#fbf7ee', ink: '#3b3128', wm: { n: 'cat', c: '#3b3128', o: 0.2, x: 0.393, b: 0.048, w: 0.567, h: 0.61 } },
  { id: 'w-bouquet', art: true, name: '들꽃 다발', base: '#f9efec', ink: '#3e2a2c', nm: '#8c3f4d', wm: { n: 'bouquet', c: '#8c3f4d', o: 0.22, x: 0.02, b: 0.015, w: 0.367, h: 0.707 } },
  { id: 'w-coffee', art: true, name: '커피와 책', base: '#f4ecdf', ink: '#3d2e22', nm: '#6b4c33', wm: { n: 'coffee', c: '#6b4c33', o: 0.22, x: 0.217, b: 0.048, w: 0.567, h: 0.36 } },
  { id: 'w-sea', art: true, name: '바다와 등대', base: '#eef2f4', ink: '#25323d', nm: '#34587e', wm: { n: 'sea', c: '#34587e', o: 0.26, x: 0.047, b: 0.035, w: 0.907, h: 0.453 } },
  { id: 'w-olive', art: true, name: '올리브 가지', base: '#28463a', base2: '#173027', ink: '#eee8d6', nm: '#e0cf9a', dark: true, wm: { n: 'olive', c: '#eee8d6', o: 0.16, x: -0.02, b: 0.015, w: 0.567, h: 0.533 } },
  { id: 'w-letter', art: true, name: '봉투와 깃펜', base: '#6e2340', base2: '#4b1529', ink: '#f6e7da', nm: '#f2d3a5', dark: true, wm: { n: 'letter', c: '#f2d3a5', o: 0.14, x: 0.133, y: 0.4, w: 0.733, h: 0.507 } },
];
const wmSrc = (P) => `img/letter/wm_${P.wm.n}.webp`;
/** 편집 화면용 바탕 (그림과 같은 160° 그라데이션) */
const paperBg = (P) => (P.base2 ? `linear-gradient(160deg, ${P.base}, ${P.base2})` : P.base);
const paperOf = (id) => PAPERS.find((p) => p.id === id) || PAPERS[0];
/* 편지 기능은 무료 (2026-11-05 사용자 결정) — 편지지·꼬리말 플러스 게이트 없음. 위로 스티커·글자 상자는 다른 화면과 같은 규칙 */

/* 글자 크기·자리는 카드 너비에 대한 비율 — 편집 화면과 그림(1080px)이 똑같이 나오게 */
const L = { pad: 0.085, toY: 0.075, to: 0.056, body: 0.044, lh: 1.72, bodyY: 0.19, from: 0.048 };
const SHAPES = { portrait: 1.25, square: 1 };
/* '길게' (2026-11-03 사용자: 내용이 길어지면 편지지도 길어지게) — 본문 줄 수에 맞춰 아래로 늘어난다. 최소 4:5, 최대 1:4 (손글씨는 글자가 커서 1:3 이면 13문장 남짓에서 막혔다) */
const LONG_MIN = 1.25, LONG_MAX = 26, BOT = 0.2;   // 2026-11-03 사용자: '내용이 길 수 있다' → 사실상 제한 없이 (1080×약 13,000px, 손글씨로 3,000자 넘게)
let mcv = null;
const mctx = () => (mcv || (mcv = document.createElement('canvas'))).getContext('2d');
/** 카드 높이(너비 대비)·본문 글자 비율·가득 찼는지. 편집 화면과 그림이 같은 계산을 쓴다 */
export function layoutOf(st, fs) {
  const x = mctx(); const MW = 1000;
  const linesAt = (k) => { x.font = `400 ${L.body * MW * fs.scale * k}px ${fs.canvas}`; return wrapLines(x, st.body || '', MW * (1 - 2 * L.pad)).length; };
  const lhR = (k) => L.body * fs.scale * k * L.lh;
  if (st.shape === 'long') {
    const need = L.bodyY + (Math.max(1, linesAt(1)) + 1) * lhR(1) + BOT;
    let r = need;
    for (const it of st.items || []) {   // 붙인 것이 잘리지 않게 — 실제 높이(hr = 높이/너비)와 회전까지 따진다
      const a = ((it.r || 0) * Math.PI) / 180, h = it.w * (it.hr || 1);
      r = Math.max(r, it.y + 0.5 * (it.w * Math.abs(Math.sin(a)) + h * Math.abs(Math.cos(a))) + 0.04);
    }
    return { ratio: Math.max(LONG_MIN, Math.min(LONG_MAX, r)), k: 1, full: need > LONG_MAX + 1e-6 };
  }
  const ratio = SHAPES[st.shape] || 1.25, avail = ratio - L.bodyY - BOT;
  for (let k = 1; k >= 0.749; k -= 0.05) if (linesAt(k) * lhR(k) <= avail + 1e-6) return { ratio, k, full: false };
  return { ratio, k: 0.75, full: true };
}
let curRatio = 1.25;
let relayoutHook = null;   // 편집 화면이 열려 있을 때 카드 높이를 다시 잰다
const MAX_ITEMS = 12;

function blank() {
  return { id: '', paper: 'plain', shape: 'long', font: 'mongle', to: '', body: '', from: '', band: true, items: [] };
}

let S = blank();          // 지금 쓰는 편지 (화면을 옮겨 다녀와도 남는다 — 사진 고르기 등)
let stage = 'write';      // write | send

/* ── 보낸 편지함 저장 ─────────────────────────────── */
async function loadSent() { return (await store.metaGet('letters', [])) || []; }
async function saveSent(rec) {
  const list = await loadSent();
  const i = list.findIndex((x) => x.id === rec.id);
  if (i >= 0) list.splice(i, 1);
  list.unshift(rec);
  await store.metaSet('letters', list.slice(0, 60));
}

/* ── 글씨체 ─────────────────────────────────────── */
let FONTS = null;
async function fontsMod() { if (!FONTS) FONTS = await import('../fonts.js'); return FONTS; }
async function fontStack(id) {
  const F = await fontsMod();
  if (!id) return { css: 'var(--font-body)', canvas: '"Noto Sans KR", "Apple SD Gothic Neo", sans-serif', scale: 1 };
  await F.load(id).catch(() => {});
  return { css: F.stackFor(id) || 'var(--font-body)', canvas: F.canvasStack(id) || 'sans-serif', scale: F.scaleFor(id) || 1 };
}

/* ── 화면: 편지 쓰기 ─────────────────────────────── */
export async function render(root, params = {}) {
  NB.used('letter');   // 홈 '편지 쓰기' 카드 NEW (2026-11-05)
  if (params.id && params.id !== S.id) {
    const rec = (await loadSent()).find((x) => x.id === params.id);
    if (rec?.state) { S = { ...blank(), ...rec.state, id: '' }; analytics.design('letter:reopen'); }
  } else if (params.new === '1') { S = blank(); }
  if (!S.to && !S.body && !S.items.length && params.new !== '1') S = { ...blank(), ...S };
  stage = 'write';
  analytics.design('letter:open');
  root.classList.add('letter-view');
  await drawWrite(root);
  return chromeWrite(root);
}

function chromeWrite(root) {
  return {
    title: t('편지 쓰기'),
    left: { icon: 'back', onClick: () => leave() },
    right: [{ text: `<span class="lt-send-btn">${esc(t('보내기'))}</span>`, label: t('보내기'), onClick: () => toSend(root) }],
  };
}

async function leave() {
  if ((S.body.trim() || S.items.length) && stage === 'write') {
    const { confirmSheet } = await import('../ui.js');
    const ok = await confirmSheet({ title: t('편지를 그만 쓸까요?'), text: t('쓰던 편지는 이 화면을 다시 열면 그대로 있어요.'), ok: t('나가기') });
    if (!ok) return;
  }
  back();
}

async function drawWrite(root) {
  root.innerHTML = '';
  const P = paperOf(S.paper);
  const wrap = el('div', { class: 'lt-wrap' });
  const card = el('div', { class: 'lt-card' + (P.dark ? ' dark' : ''), style: `--ink:${P.ink};--nm:${P.nm || P.ink}` });
  wrap.append(card);
  root.append(wrap);
  /* 감싼 칸의 좌우 여백(16px×2)을 빼야 실제 카드 너비와 맞는다 — 예전엔 32px 넓게 잡혀 높이가 늘고 붙인 것 자리가 어긋났다 (2026-11-03) */
  const W = Math.min((wrap.clientWidth || root.clientWidth || window.innerWidth) - 32, 488);
  const fs = await fontStack(S.font);
  let lay = layoutOf(S, fs); curRatio = lay.ratio;
  card.style.width = W + 'px'; card.style.height = (W * lay.ratio) + 'px';
  card.style.setProperty('--cw', W + 'px');   // 편지지 테두리·그림 자리 (paperLayer)
  queueMicrotask(() => fitPaper(card, P, W, lay.ratio));
  card.append(paperLayer(P));
  if (P.pattern === 'grid') card.querySelector('.lt-paper').style.setProperty('background-size', `${W / 24}px ${W / 24}px`, 'important');   // 길어져도 네모 그대로
  const px = (f) => (f * W) + 'px';
  card.style.setProperty('--lh', (L.body * W * fs.scale * lay.k * L.lh) + 'px');
  if (P.pattern === 'lined') card.querySelector('.lt-paper').style.backgroundPosition = '0 ' + (L.bodyY * W) + 'px';

  const to = el('input', { class: 'lt-to', type: 'text', maxlength: '24', placeholder: t('받는 사람'), value: S.to });
  to.style.cssText = `left:${px(L.pad)};top:${px(L.toY)};font-size:${(L.to * W * fs.scale).toFixed(1)}px;font-family:${fs.css}`;
  const toLbl = el('span', { class: 'lt-tolbl' }, 'To.');
  toLbl.style.cssText = `left:${px(L.pad)};top:${px(L.toY)};font-size:${(L.to * W * fs.scale).toFixed(1)}px;font-family:${fs.css}`;
  to.style.paddingLeft = (L.to * W * fs.scale * 1.75) + 'px';
  to.addEventListener('input', () => { S.to = to.value; });

  const body = el('textarea', { class: 'lt-body', maxlength: '6000', placeholder: t('마음을 담아 써 보세요'), rows: '8' });
  body.value = S.body;
  body.style.cssText = `left:${px(L.pad)};right:${px(L.pad)};top:${px(L.bodyY)};bottom:${px(BOT)};font-size:${(L.body * W * fs.scale * lay.k).toFixed(1)}px;line-height:${L.lh};font-family:${fs.css}`;
  const fullNote = el('div', { class: 'lt-full', hidden: '' });
  const relayout = () => {
    const nl = layoutOf(S, fs);
    if (nl.ratio !== lay.ratio) { card.style.height = (W * nl.ratio) + 'px'; curRatio = nl.ratio; fitPaper(card, P, W, nl.ratio); }
    if (nl.k !== lay.k) { body.style.fontSize = (L.body * W * fs.scale * nl.k).toFixed(1) + 'px'; card.style.setProperty('--lh', (L.body * W * fs.scale * nl.k * L.lh) + 'px'); }
    fullNote.hidden = !nl.full;
    fullNote.textContent = S.shape === 'long' ? t('편지지가 가득 찼어요. 글을 조금 줄여 주세요.') : t('편지지가 가득 찼어요 — ‘길게’로 바꾸면 더 쓸 수 있어요');
    if (nl.full && !lay.full) analytics.design('letter:full:' + S.shape);
    lay = nl;
  };
  body.addEventListener('input', () => { S.body = body.value; relayout(); });
  relayoutHook = relayout;

  const from = el('input', { class: 'lt-from', type: 'text', maxlength: '20', placeholder: t('보내는 사람'), value: S.from });
  from.style.cssText = `right:${px(L.pad)};bottom:${px(0.075)};font-size:${(L.from * W * fs.scale).toFixed(1)}px;font-family:${fs.css}`;
  const fromLbl = el('span', { class: 'lt-fromlbl' }, 'From.');
  from.addEventListener('input', () => { S.from = from.value; });
  const fromRow = el('div', { class: 'lt-fromrow', style: `right:${px(L.pad)};bottom:${px(0.075)};font-size:${(L.from * W * fs.scale).toFixed(1)}px;font-family:${fs.css}` });
  from.style.cssText = `font-size:inherit;font-family:inherit`;
  fromRow.append(fromLbl, from);

  card.append(toLbl, to, body, fromRow);
  const layer = el('div', { class: 'lt-items' });
  card.append(layer);
  for (const it of S.items) layer.append(itemNode(it, W, card));
  card.addEventListener('pointerdown', (e) => { if (!e.target.closest('.lt-item')) select(null); });

  /* 아래 도구 줄 */
  const bar = el('div', { class: 'lt-bar' });
  const tool = (ic, label, fn, lock = false) => {
    const b = el('button', { class: 'lt-tool', type: 'button' }, `${icon(ic)}<span>${esc(label)}</span>${lock ? '<em class="plus-mini">PLUS</em>' : ''}`);
    b.addEventListener('click', fn);
    return b;
  };
  bar.append(
    tool('book', t('편지지'), () => pickPaper(root)),   // 편지지 15종 (2026-11-06, 모두 무료)
    tool('type', t('글씨체'), () => pickFont(root)),
    tool('image', t('사진'), () => addPhoto(root)),
    tool('sticker', t('스티커'), () => pickSticker(root)),
    tool('quote', t('글자 상자'), () => addText(root), !plus.canUseTextBox()),
  );
  root.append(fullNote);
  relayout();
  root.append(bar);
  root.append(el('div', { class: 'lt-note' }, esc(t('편지는 이 폰에서 이미지로 만들어져 바로 보내져요. 일기는 보내지지 않아요.'))));
  const boxLink = el('button', { class: 'lt-boxlink', type: 'button' }, `<span>${esc(t('보낸 편지함'))}</span>${icon('chev')}`);
  boxLink.addEventListener('click', () => go('/letters'));
  root.append(boxLink);
}

function paperLayer(P) {
  const d = el('div', { class: 'lt-paper lt-p-' + P.id });
  d.style.background = paperBg(P);
  /* 테두리·그림 (2026-11-06) — 자리는 카드 너비(--cw) 비율 */
  if (P.frame === 'double') d.append(el('i', { class: 'lt-frame', style: `inset:calc(var(--cw) * .033);border:calc(var(--cw) * .005) solid ${P.fc}` }), el('i', { class: 'lt-frame', style: `inset:calc(var(--cw) * .047);border:max(.5px, calc(var(--cw) * .002)) solid ${P.fc}` }));
  if (P.frame === 'thin') d.append(el('i', { class: 'lt-frame', style: `inset:calc(var(--cw) * .04);border:max(.5px, calc(var(--cw) * .0027)) solid ${P.fc};border-radius:calc(var(--cw) * .01)` }));
  if (P.wm) {
    const w = P.wm, pos = w.b != null ? `bottom:calc(var(--cw) * ${w.b})` : `top:calc(var(--cw) * ${w.y})`;
    d.append(el('i', { class: 'lt-wm', style: `left:calc(var(--cw) * ${w.x});${pos};width:calc(var(--cw) * ${w.w});height:calc(var(--cw) * ${w.h});background:${w.c};opacity:${w.o};-webkit-mask-image:url(${wmSrc(P)});mask-image:url(${wmSrc(P)})` }));
  }
  if (P.img) {
    d.style.backgroundImage = `linear-gradient(rgba(${P.dark ? '10,16,40' : '255,253,248'},${P.veil}), rgba(${P.dark ? '10,16,40' : '255,253,248'},${P.veil})), url("${P.img}")`;
    d.style.backgroundSize = 'cover'; d.style.backgroundPosition = 'center';
  }
  return d;
}

/* 그림 편지지가 길어지면 (2026-11-03): 그림을 억지로 키우지 않고 위에 제 비율로 두고, 아래로 갈수록 바탕색으로 자연스럽게 이어 준다 */
const IMG_AR = {};
async function imgAR(src) { if (IMG_AR[src]) return IMG_AR[src]; const im = await loadImg(src); IMG_AR[src] = im ? im.height / im.width : 1.6; return IMG_AR[src]; }
async function fitPaper(card, P, W, ratio) {
  if (!P.img) return;
  const d = card.querySelector('.lt-paper'); if (!d) return;
  const ar = await imgAR(P.img);
  const c = P.dark ? '10,16,40' : '255,253,248';
  const veil = `linear-gradient(rgba(${c},${P.veil}), rgba(${c},${P.veil}))`;
  if (ratio <= ar + 0.01) { d.style.backgroundImage = `${veil}, url("${P.img}")`; d.style.backgroundSize = 'cover'; d.style.backgroundPosition = 'center'; d.style.backgroundRepeat = 'no-repeat'; return; }
  const ih = W * ar;
  d.style.backgroundImage = `${veil}, linear-gradient(to bottom, transparent ${Math.round(ih * 0.7)}px, ${P.base} ${Math.round(ih)}px), url("${P.img}")`;
  d.style.backgroundSize = 'auto, 100% 100%, 100% auto'; d.style.backgroundPosition = 'top center'; d.style.backgroundRepeat = 'no-repeat';
}

/* ── 붙인 것(사진·스티커·글자 상자): 끌어 옮기기, 모서리로 크기, ×로 지우기 ── */
let selected = null;
/** 각도를 -180~180 으로, 0°·±90°·180° 근처(6° 안)에서는 딱 맞춘다 */
export function snapDeg(d) {
  let a = ((d + 180) % 360 + 360) % 360 - 180;
  for (const t0 of [0, 90, -90, 180, -180]) if (Math.abs(a - t0) < 6) a = t0 === -180 ? 180 : t0;
  return Math.round(a * 10) / 10;
}
function select(n) {
  if (selected && selected !== n) selected.classList.remove('sel');
  selected = n;
  if (n) n.classList.add('sel');
}
function itemNode(it, W, card) {
  const n = el('div', { class: 'lt-item lt-' + it.k });
  const measure = () => { const b = n.offsetWidth; if (b > 0) { const hr = n.offsetHeight / b; if (Math.abs((it.hr || 0) - hr) > 0.01) { it.hr = Math.round(hr * 100) / 100; relayoutHook?.(); } } };
  n.addEventListener('load', measure, true);   // 사진·스티커 그림이 뜨면 높이를 잰다
  const place = () => {
    n.style.left = (it.x * W) + 'px'; n.style.top = (it.y * W) + 'px';
    n.style.width = (it.w * W) + 'px';
    n.style.transform = `translate(-50%,-50%) rotate(${it.r || 0}deg)`;
    if (it.k === 'text') n.querySelector('.stk-text').style.fontSize = (it.w * W * 0.16) + 'px';
  };
  if (it.k === 'photo') {
    n.innerHTML = `<div class="lt-polaroid"><img src="${it.src}" alt="" draggable="false"></div>`;
  } else if (it.k === 'sticker') {
    /* 위로 스티커는 글자를 얹은 그림으로 (2026-11-06 사용자 신고: 편지에서 위로 스티커 글자가 안 보였다 — 글자 없는 원본 그림을 쓰고 있었다) */
    n.innerHTML = `<img src="${stickerSrc(it.sid)}" alt="" draggable="false">`;
  } else {
    const tx = el('div', { class: 'stk-text' }); tx.textContent = it.tx; tx.dataset.bg = it.bg || 'none';
    tx.style.color = it.c || ''; tx.style.fontWeight = it.fw === 'n' ? '500' : '800'; tx.style.setProperty('--tbc', it.c || 'var(--ink)');
    n.append(tx);
  }
  const del = el('button', { class: 'lt-del', type: 'button', 'aria-label': t('지우기') }, icon('close'));
  const rs = el('span', { class: 'lt-rs', title: t('돌리기·크기') }, '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.34-5.66"/><path d="M20 4v5h-5"/></svg>');
  n.append(del, rs);
  del.addEventListener('pointerdown', (e) => e.stopPropagation());
  del.addEventListener('click', (e) => { e.stopPropagation(); S.items = S.items.filter((x) => x !== it); n.remove(); selected = null; relayoutHook?.(); });
  /* 옮기기 + 두 손가락으로 크기·회전 (2026-11-03 사용자: 편지 사진도 스티커처럼 돌리게) */
  const pts = new Map(); let base = null;
  const resetBase = () => {
    const p = [...pts.values()];
    base = { x: it.x, y: it.y, w: it.w, r: it.r || 0, p0: p[0] };
    if (p.length >= 2) { base.d = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) || 1; base.a = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x); base.mx = (p[0].x + p[1].x) / 2; base.my = (p[0].y + p[1].y) / 2; }
  };
  n.addEventListener('pointerdown', (e) => {
    if (e.target === rs || e.target === del || rs.contains(e.target)) return;
    e.preventDefault(); select(n);
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); resetBase();
    if (pts.size > 1) return;
    const r = card.getBoundingClientRect();
    const move = (ev) => {
      if (!pts.has(ev.pointerId)) return;
      pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
      const p = [...pts.values()];
      if (p.length >= 2 && base.d) {
        const d = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) || 1;
        const ang = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
        it.w = Math.max(0.12, Math.min(0.9, base.w * d / base.d));
        it.r = snapDeg(base.r + ((ang - base.a) * 180) / Math.PI);
        const mx = (p[0].x + p[1].x) / 2, my = (p[0].y + p[1].y) / 2;
        it.x = Math.max(0.02, Math.min(0.98, base.x + (mx - base.mx) / W));
        it.y = Math.max(0.02, Math.min(curRatio - 0.02, base.y + (my - base.my) / W));
      } else {
        it.x = Math.max(0.02, Math.min(0.98, base.x + (p[0].x - base.p0.x) / W));
        it.y = Math.max(0.02, Math.min(curRatio - 0.02, base.y + (p[0].y - base.p0.y) / W));
      }
      place();
    };
    const up = (ev) => {
      pts.delete(ev.pointerId);
      if (pts.size) { resetBase(); return; }
      window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up);
      measure(); relayoutHook?.();
    };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
    void r;
  });
  /* 모서리 손잡이: 돌리면 회전, 바깥으로 당기면 커짐 (일기 사진·스티커와 같은 방식). 0°·±90°·180° 근처에서 딱 맞춘다 */
  rs.addEventListener('pointerdown', (e) => {
    e.preventDefault(); e.stopPropagation(); select(n);
    const r = card.getBoundingClientRect();
    const cx = it.x * W + r.left, cy = it.y * W + r.top;
    const d0 = Math.hypot(e.clientX - cx, e.clientY - cy) || 1, w0 = it.w;
    const a0 = Math.atan2(e.clientY - cy, e.clientX - cx), r0 = it.r || 0;
    const move = (ev) => {
      it.w = Math.max(0.12, Math.min(0.9, w0 * Math.hypot(ev.clientX - cx, ev.clientY - cy) / d0));
      it.r = snapDeg(r0 + ((Math.atan2(ev.clientY - cy, ev.clientX - cx) - a0) * 180) / Math.PI);
      place();
    };
    const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up); if (it.r) analytics.design('letter:rotate:' + it.k); measure(); relayoutHook?.(); };
    window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', up);
  });
  place();
  return n;
}
function addItem(root, it) {
  if (S.items.length >= MAX_ITEMS) { toast(t('한 편지에는 {n}개까지 붙일 수 있어요.', { n: MAX_ITEMS })); return; }
  S.items.push(it);
  const card = root.querySelector('.lt-card'); const layer = card.querySelector('.lt-items');
  const n = itemNode(it, card.clientWidth, card); layer.append(n); select(n);
  requestAnimationFrame(() => { const b = n.offsetWidth; if (b) it.hr = Math.round((n.offsetHeight / b) * 100) / 100; relayoutHook?.(); });
}

/* ── 도구들 ─────────────────────────────────────── */

/* 편지지 고르기 (2026-11-06 사용자 시안 승인, 모두 무료) — 기본 7종 / 그림 8종 */
async function pickPaper(root) {
  const box = el('div', { class: 'lt-sheet' });
  for (const [label, list] of [[t('기본'), PAPERS.filter((p) => !p.art)], [t('그림'), PAPERS.filter((p) => p.art)]]) {
    box.append(el('div', { class: 'lt-papers-h' }, esc(label)));
    const grid = el('div', { class: 'lt-papers' });
    for (const P of list) {
      const b = el('button', { class: 'lt-paper-pick' + (S.paper === P.id ? ' on' : ''), type: 'button' });
      const sw = paperLayer(P); sw.classList.add('lt-swatch');
      b.append(sw, el('span', { class: 'lt-paper-n' }, esc(t(P.name))));
      b.addEventListener('click', async () => { S.paper = P.id; analytics.design('letter:paper:' + P.id); closeSheet(); await drawWrite(root); });
      grid.append(b);
    }
    box.append(grid);
  }
  openSheet({ title: t('편지지'), content: box });
  /* 견본 칸 너비에 맞춰 테두리·그림 자리를 잡는다 */
  requestAnimationFrame(() => { for (const sw of box.querySelectorAll('.lt-swatch')) sw.style.setProperty('--cw', (sw.clientWidth || 72) + 'px'); });
}

async function pickFont(root) {
  const F = await fontsMod();
  const box = el('div', { class: 'lt-fonts' });
  const opts = [['', t('기본 글씨')], ...F.FONT_SETS.map((f) => [f.id, t(f.name)])];
  for (const [id, name] of opts) {
    const b = el('button', { class: 'lt-font' + (S.font === id ? ' on' : ''), type: 'button' }, esc(name));
    fontStack(id).then((fs) => { b.style.fontFamily = fs.css; });
    b.addEventListener('click', async () => { S.font = id; closeSheet(); await drawWrite(root); });
    box.append(b);
  }
  openSheet({ title: t('글씨체'), content: box });
}

async function addPhoto(root) {
  const native = await import('../native.js');
  let src = null;
  try {
    const r = await native.pickPhotos({ multiple: false, maxEdge: 1200, quality: 85 });
    if (r && r.photos?.length) src = r.photos[0];
    else if (r === null) {    // 웹: 파일 고르기
      const f = await new Promise((res) => { const i = el('input', { type: 'file', accept: 'image/*' }); i.addEventListener('change', () => res(i.files?.[0] || null)); i.click(); });
      if (f) src = await store.fileToDataUrl(f);
    }
  } catch (e) { console.error(e); }
  if (!src) return;
  addItem(root, { k: 'photo', src, x: 0.32, y: 0.85, w: 0.42, r: 0 });   // 똑바로 넣고, 기울이기는 손잡이로 (2026-11-03 사용자)
  analytics.design('letter:photo');
}

async function pickSticker(root) {
  const K = await import('../stickers.js');
  const box = el('div', { class: 'lt-stk' });
  for (const pack of K.PACKS) {
    const ok = plus.canUseStickers(pack.tier);
    for (const name of pack.items) {
      const sid = `${pack.id}/${name}`;
      const b = el('button', { class: 'stk-cell' + (ok ? '' : ' locked'), type: 'button' });
      b.append(el('img', { src: K.src(sid), alt: '', loading: 'lazy', draggable: 'false' }));
      if (!ok) b.insertAdjacentHTML('beforeend', `<span class="stk-lock">${icon('lock')}</span>`);
      b.addEventListener('click', () => {
        closeSheet();
        if (!ok) { analytics.design('letter:locked:sticker'); plus.lockSheet('letter_sticker', t('위로 스티커는 하루칸 플러스 기능이에요'), t('기본·계절·동물·테이프 스티커는 무료예요.')); return; }
        const k = S.items.filter((i) => i.k === 'sticker').length;
        addItem(root, { k: 'sticker', sid, x: 0.72 - (k % 3) * 0.16, y: 0.72 + (k % 2) * 0.12, w: 0.2, r: (k % 2 ? 6 : -4) });
      });
      box.append(b);
    }
  }
  openSheet({ title: t('스티커'), content: box });
}

async function addText(root) {
  if (!plus.canUseTextBox()) { analytics.design('letter:locked:text'); plus.lockSheet('letter_text', t('글자 상자는 하루칸 플러스 기능이에요'), t('붙여 둔 글자 상자는 그대로 남고 옮길 수 있어요. 새로 만들거나 글을 고치려면 플러스가 필요해요.')); return; }
  const K = await import('../stickers.js');
  const r = await K.editText({});
  if (!r) return;
  addItem(root, { k: 'text', ...r, x: 0.7, y: 0.68, w: 0.4, r: -2 });
}

/* ── 그림으로 그리기 (1080px) ─────────────────────── */
const imgCache = new Map();
/* 스티커 그림 주소 — 위로 스티커(cheer_*)는 지금 언어 문구를 얹은 그림(stickers.src). 아직 안 만들어졌으면 원본 */
let STK = null;
import('../stickers.js').then((m) => { STK = m; m.prepareCaptions().catch(() => {}); }).catch(() => {});
function stickerSrc(sid) { try { return STK ? STK.src(sid) : `stickers/${sid}.webp`; } catch { return `stickers/${sid}.webp`; } }

function loadImg(src) {
  if (imgCache.has(src)) return imgCache.get(src);
  const p = new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = src; });
  imgCache.set(src, p);
  return p;
}
function rrect(x, c, y, w, h, r) { x.beginPath(); x.moveTo(c + r, y); x.arcTo(c + w, y, c + w, y + h, r); x.arcTo(c + w, y + h, c, y + h, r); x.arcTo(c, y + h, c, y, r); x.arcTo(c, y, c + w, y, r); x.closePath(); }
function wrapLines(x, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para) { out.push(''); continue; }
    let line = '';
    for (const ch of Array.from(para)) {
      const test = line + ch;
      if (x.measureText(test).width > maxW && line) {
        const sp = line.lastIndexOf(' ');
        if (sp > 0 && ch !== ' ') { out.push(line.slice(0, sp)); line = line.slice(sp + 1) + ch; }   // 화면(글 칸)처럼 띄어쓰기에서 끊는다
        else { out.push(line); line = ch; }
      } else line = test;
    }
    out.push(line);
  }
  return out;
}

export async function renderCard(st = S, W = 1080, opt = {}) {
  const fs = await fontStack(st.font);
  const lay = layoutOf(st, fs);
  /* 아주 긴 편지는 그림 높이가 한도(기본 16,000px)를 넘지 않게 너비를 줄여 그린다 (폰 메모리·메신저 한도). 너비는 600px 아래로는 안 줄인다 */
  const maxH = opt.maxH || 16000;
  if (W * lay.ratio > maxH) W = Math.max(600, Math.floor(maxH / lay.ratio));
  const H = Math.round(W * lay.ratio);
  const meta = opt.meta || null;   // 여러 장으로 나눌 때 쓰는 자리 정보 (글 줄·붙인 것)
  if (meta) { meta.W = W; meta.H = H; meta.lines = []; meta.items = []; meta.base = paperOf(st.paper).base; meta.ink = paperOf(st.paper).ink; meta.dark = !!paperOf(st.paper).dark; }
  const band = !opt.noBand;   // 꼬리말은 늘 (무료, 2026-11-05)
  const BH0 = Math.round(W * 0.085);   // 꼬리말 글자·표시 크기 기준
  /* 테두리 편지지는 꼬리말이 테두리 안에 들어오게 아래를 조금 더 둔다 (2026-11-06) */
  const BH = band ? BH0 + (paperOf(st.paper).frame ? Math.round(W * 0.05) : 0) : 0;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H + BH;
  const x = cv.getContext('2d');
  const P = paperOf(st.paper);
  /* 바탕은 꼬리말까지 한 번에 (그라데이션이 끝까지 이어지게, 2026-11-06) */
  x.fillStyle = P.base2 ? cssGradient(x, W, H + BH, 160, P.base, P.base2) : P.base; x.fillRect(0, 0, W, H + BH);
  if (P.wm) await drawWatermark(x, P, W, H);
  if (P.frame) drawFrame(x, P, W, H + BH);
  if (P.img) {
    const im = await loadImg(P.img);
    if (im && H / W <= im.height / im.width + 0.01) { const s = Math.max(W / im.width, H / im.height); x.drawImage(im, (W - im.width * s) / 2, (H - im.height * s) / 2, im.width * s, im.height * s); }
    else if (im) {   /* 길게: 위에 제 비율로, 아래는 바탕색으로 이어 준다 (편집 화면 fitPaper 와 같게) */
      const ih = W * im.height / im.width; x.drawImage(im, 0, 0, W, ih);
      const g = x.createLinearGradient(0, ih * 0.7, 0, ih); g.addColorStop(0, P.base + '00'); g.addColorStop(1, P.base);
      x.fillStyle = g; x.fillRect(0, ih * 0.7, W, ih * 0.3 + 1); x.fillStyle = P.base; x.fillRect(0, ih, W, H - ih);
    }
    x.fillStyle = P.dark ? `rgba(10,16,40,${P.veil})` : `rgba(255,253,248,${P.veil})`; x.fillRect(0, 0, W, H);
  }
  if (P.pattern === 'lined') { x.strokeStyle = 'rgba(150,120,80,.3)'; x.lineWidth = 2; const step = L.body * W * fs.scale * lay.k * L.lh; for (let yy = L.bodyY * W + step; yy < H - W * 0.12; yy += step) { x.beginPath(); x.moveTo(W * L.pad, yy); x.lineTo(W * (1 - L.pad), yy); x.stroke(); } }
  if (P.pattern === 'grid') { x.strokeStyle = 'rgba(120,140,160,.14)'; x.lineWidth = 1.5; const g = W / 24; for (let v = g; v < W; v += g) { x.beginPath(); x.moveTo(v, 0); x.lineTo(v, H); x.stroke(); } for (let v = g; v < H; v += g) { x.beginPath(); x.moveTo(0, v); x.lineTo(W, v); x.stroke(); } }
  if (P.pattern === 'kraft') { for (let i = 0; i < Math.round(2200 * H / W / 1.25); i++) { x.fillStyle = `rgba(${Math.random() < 0.5 ? '90,60,30' : '255,240,210'},${Math.random() * 0.08})`; x.fillRect(Math.random() * W, Math.random() * H, 2, 2); } }

  x.fillStyle = P.nm || P.ink; x.textBaseline = 'top';   // 이름 색 (진한 편지지는 금빛)
  const fTo = L.to * W * fs.scale;
  x.font = `700 ${fTo}px ${fs.canvas}`;
  x.fillText('To. ' + (st.to || ''), W * L.pad, W * L.toY + fTo * 0.15);
  if (meta) meta.lines.push({ y: W * L.toY, h: fTo * 1.4 });
  x.fillStyle = P.ink;
  const fB = L.body * W * fs.scale * lay.k;   // 4:5·정사각은 넘치면 조금씩 줄인다
  x.font = `400 ${fB}px ${fs.canvas}`;
  const lines = wrapLines(x, st.body || '', W * (1 - 2 * L.pad));
  let yy = W * L.bodyY + fB * (L.lh - 1) / 2;
  for (const ln of lines) { if (yy > H - W * 0.2) break; x.fillText(ln, W * L.pad, yy); if (meta) meta.lines.push({ y: yy - fB * (L.lh - 1) / 2, h: fB * L.lh }); yy += fB * L.lh; }
  const fF = L.from * W * fs.scale;
  x.font = `700 ${fF}px ${fs.canvas}`; x.textAlign = 'right'; x.fillStyle = P.nm || P.ink;
  if (st.from) x.fillText('From. ' + st.from, W * (1 - L.pad), H - W * 0.075 - fF * 1.1);
  if (meta && st.from) meta.lines.push({ y: H - W * 0.075 - fF * 1.2, h: fF * 1.4 });
  x.textAlign = 'left';

  for (const it of st.items) {
    const cx = it.x * W, cy = it.y * W, w = it.w * W;
    if (meta) { const a = ((it.r || 0) * Math.PI) / 180; const hh = w * (it.k === 'photo' ? 1.25 : it.k === 'text' ? 0.6 : 1); const ext = 0.5 * (w * Math.abs(Math.sin(a)) + hh * Math.abs(Math.cos(a))); meta.items.push({ top: cy - ext, bottom: cy + ext }); }
    x.save(); x.translate(cx, cy); x.rotate(((it.r || 0) * Math.PI) / 180);
    if (it.k === 'photo') {
      const im = await loadImg(it.src);
      if (im) {
        const pad = w * 0.06, iw = w - pad * 2, ih = iw * (im.height / im.width), h = ih + pad * 1 + w * 0.16;
        x.shadowColor = 'rgba(0,0,0,.18)'; x.shadowBlur = w * 0.05; x.shadowOffsetY = w * 0.015;
        x.fillStyle = '#fff'; x.fillRect(-w / 2, -h / 2, w, h); x.shadowColor = 'transparent';
        x.drawImage(im, -w / 2 + pad, -h / 2 + pad, iw, ih);
      }
    } else if (it.k === 'sticker') {
      if (String(it.sid).startsWith('cheer_')) { try { const m = await import('../stickers.js'); STK = m; await m.prepareCaptions(); } catch { /* 글자 없이라도 */ } }
      const im = await loadImg(stickerSrc(it.sid));   // 보내는 그림에도 위로 스티커 글자 (2026-11-06)
      if (im) { const h = w * (im.height / im.width); x.drawImage(im, -w / 2, -h / 2, w, h); }
    } else if (it.k === 'text') {
      const fz = w * 0.16; x.font = `${it.fw === 'n' ? 500 : 800} ${fz}px ${fs.canvas}`;
      const tl = wrapLines(x, it.tx, w * 0.86); const lh = fz * 1.3; const h = tl.length * lh + fz * 0.7;
      const col = it.c || P.ink;
      if (it.bg === 'box') { x.fillStyle = 'rgba(255,255,255,.88)'; rrect(x, -w / 2, -h / 2, w, h, fz * 0.5); x.fill(); x.strokeStyle = col; x.lineWidth = 2; x.setLineDash([8, 6]); x.stroke(); x.setLineDash([]); }
      if (it.bg === 'marker') { x.fillStyle = (it.c || '#e8b04b') + '55'; rrect(x, -w / 2, -h / 2 + fz * 0.2, w, h - fz * 0.4, fz * 0.2); x.fill(); }
      x.fillStyle = it.bg === 'marker' ? (P.dark ? '#fff' : '#2b2521') : col; x.textAlign = 'center'; x.textBaseline = 'middle';
      tl.forEach((ln, i) => x.fillText(ln, 0, -h / 2 + fz * 0.35 + lh * (i + 0.5)));
      x.textAlign = 'left'; x.textBaseline = 'top';
    }
    x.restore();
  }
  if (BH) {
    /* 꼬리말 (2026-11-05 사용자: 색 띠가 어색하다) — 종이 색 그대로 이어서, 가는 구분선 + 작은 표시 + Harukan + 오른쪽에 작게 '하루칸에서 쓴 편지' */
    const pad = W * L.pad;
    const ink = P.dark ? 'rgba(255,255,255,.62)' : 'rgba(112,88,64,.62)';
    x.strokeStyle = P.dark ? 'rgba(255,255,255,.28)' : 'rgba(112,88,64,.3)'; x.lineWidth = Math.max(1.5, W * 0.002);
    x.beginPath(); x.moveTo(pad, H + 1); x.lineTo(W - pad, H + 1); x.stroke();
    const cy = H + BH0 * 0.55, m = BH0 * 0.34;
    x.strokeStyle = ink; x.lineWidth = Math.max(1.2, W * 0.0022);
    rrect(x, pad, cy - m / 2, m, m, m * 0.24); x.stroke();
    x.beginPath(); x.moveTo(pad + m * 0.28, cy - m * 0.13); x.lineTo(pad + m * 0.72, cy - m * 0.13); x.moveTo(pad + m * 0.28, cy + m * 0.15); x.lineTo(pad + m * 0.56, cy + m * 0.15); x.stroke();
    x.fillStyle = ink; x.textBaseline = 'middle'; x.textAlign = 'left';
    x.font = `700 ${BH0 * 0.34}px "Noto Sans KR", sans-serif`; x.fillText('Harukan', pad + m * 1.35, cy);
    x.font = `500 ${BH0 * 0.26}px "Noto Sans KR", sans-serif`; x.textAlign = 'right'; x.fillText(t('하루칸에서 쓴 편지'), W - pad, cy);
    x.textAlign = 'left'; x.textBaseline = 'top';
  }
  return cv;
}

/** CSS linear-gradient(<deg>, a, b) 와 같은 방향·길이의 캔버스 그라데이션 */
function cssGradient(x, W, H, deg, a, b) {
  const r = (deg * Math.PI) / 180, dx = Math.sin(r), dy = -Math.cos(r);
  const len = Math.abs(W * dx) + Math.abs(H * dy);
  const cx = W / 2, cy = H / 2;
  const g = x.createLinearGradient(cx - dx * len / 2, cy - dy * len / 2, cx + dx * len / 2, cy + dy * len / 2);
  g.addColorStop(0, a); g.addColorStop(1, b);
  return g;
}
/** 편지지 테두리 (편집 화면 paperLayer 와 같은 비율) */
function drawFrame(x, P, W, H) {
  x.save(); x.strokeStyle = P.fc;
  const box = (ins, lw, rad = 0) => { x.lineWidth = Math.max(1, W * lw); const o = W * ins + x.lineWidth / 2; rrect(x, o, o, W - o * 2, H - o * 2, W * rad); x.stroke(); };
  if (P.frame === 'double') { box(0.033, 0.005); box(0.047, 0.002); }
  if (P.frame === 'thin') box(0.04, 0.0027, 0.01);
  x.restore();
}
/** 그림 편지지: 선 그림을 한 색으로 칠해 연하게 (칸 안에 비율 그대로 맞춤) */
async function drawWatermark(x, P, W, H) {
  const im = await loadImg(wmSrc(P)); if (!im) return;
  const w = P.wm, bw = w.w * W, bh = w.h * W, bx = w.x * W, by = w.b != null ? H - w.b * W - bh : w.y * W;
  const s = Math.min(bw / im.width, bh / im.height), iw = im.width * s, ih = im.height * s;
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(iw)); c.height = Math.max(1, Math.round(ih));
  const cx = c.getContext('2d'); cx.drawImage(im, 0, 0, c.width, c.height);
  cx.globalCompositeOperation = 'source-in'; cx.fillStyle = w.c; cx.fillRect(0, 0, c.width, c.height);
  x.save(); x.globalAlpha = w.o; x.drawImage(c, bx + (bw - iw) / 2, by + (bh - ih) / 2); x.restore();
  c.width = c.height = 0;
}

/* 보내는 그림은 늘 한 장 (2026-11-05 사용자: 여러 장으로 나뉘면 잘리고 좋지 않다). 긴 편지는 renderCard 가 높이 한도(16,000px) 안에서 너비를 줄여 한 장으로 그린다 */
export async function renderPages(st = S, W = 1080) { return [await renderCard(st, W)]; }

/* ── 화면: 보내기 ─────────────────────────────────── */
async function toSend(root) {
  if (!S.body.trim() && !S.items.length) { toast(t('편지를 먼저 써 주세요.')); return; }
  stage = 'send';
  root.innerHTML = '';
  const { setChrome } = await import('../app.js');
  setChrome?.({ title: t('보내기'), left: { icon: 'back', onClick: async () => { stage = 'write'; await drawWrite(root); setChrome?.(chromeWrite(root)); } } });
  const pv = el('div', { class: 'lt-preview' });
  root.append(pv);
  const draw = async () => {
    const cv = await renderCard(S, 720);   // 늘 한 장 (2026-11-05)
    pv.innerHTML = ''; pv.classList.remove('multi');
    pv.append(el('img', { class: 'lt-preview-img', alt: '', src: cv.toDataURL('image/jpeg', 0.9) }));
  };
  await draw();

  root.append(el('div', { class: 'lt-note' }, esc(t('편지는 이 폰에서 이미지로 만들어져 바로 보내져요. 일기는 보내지지 않아요.'))));

  const row = el('div', { class: 'lt-actions' });
  /* 보내기 버튼 — '보내기 (왓츠앱·인스타·메시지)' 번역이 길어 한 줄에 안 들어가는 언어가 많다 (2026-11-05 광고분석 요청: 나라별 메신저 이름).
     괄호 앞은 크게, 괄호 안(앱 이름)은 작은 둘째 줄로 그린다 — 번역 키는 하나 그대로 */
  const sendLabel = t('보내기 (카톡·메시지·인스타)');
  const sm = sendLabel.match(/^(.*?)\s*[(（](.*)[)）]\s*$/);
  const sendB = el('button', { class: 'btn btn-primary btn-block lt-sendb', type: 'button' },
    `${icon('share')}<span class="lt-sendb-t">${esc(sm ? sm[1] : sendLabel)}</span>${sm ? `<span class="lt-sendb-s">${esc(sm[2])}</span>` : ''}`);
  const saveB = el('button', { class: 'btn btn-block', type: 'button' }, `${icon('down')}<span>${esc(t('이미지 저장'))}</span>`);
  sendB.addEventListener('click', () => deliver(root, 'send'));
  saveB.addEventListener('click', () => deliver(root, 'save'));
  row.append(sendB, saveB);
  root.append(row);
}

async function deliver(root, how) {
  const pages = await renderPages(S, 1080);   // 긴 편지는 여러 장 (2026-11-03)
  const backup = await import('../backup.js');
  const stamp = `${todayKey()}-${Date.now().toString(36).slice(-4)}`;
  let ok = false, nat = false;
  try {
    const saved = [];
    for (let i = 0; i < pages.length; i++) {
      const blob = await new Promise((r) => pages[i].toBlob(r, 'image/png'));
      const name = pages.length > 1 ? `harukan-letter-${stamp}-${i + 1}.png` : `harukan-letter-${stamp}.png`;
      saved.push({ name, res: await backup.saveFile(name, blob, 'image/png') });
    }
    nat = saved.every((x) => x.res?.where === 'native');
    if (how === 'send' && nat) ok = saved.length > 1 ? await backup.shareFiles(saved.map((x) => x.res.uri), t('하루칸 편지')) : await backup.shareFile(saved[0].res.uri, t('하루칸 편지'));
    else ok = true;
    if (how === 'save') toast(nat ? (saved.length > 1 ? t('문서 폴더에 {n}장 저장했어요.', { n: saved.length }) : t('문서 폴더에 저장했어요: {n}', { n: saved[0].res.name || saved[0].name })) : t('이미지를 내려받았어요.'));
    window.__ltPages = saved.length;
  } catch (e) { console.error(e); toast(t('이미지를 만들지 못했어요. 저장 공간을 확인해 주세요.')); return; }
  analytics.design('letter:' + how + (pages.length > 1 ? ':pages' : ''));
  /* 어느 앱으로 보냈나 (광고분석 요청 2026-11-05) — 패키지 이름만, 편지 내용·받는 사람은 안 남긴다 */
  if (how === 'send' && nat) analytics.design(ok ? 'letter:share_app:' + backup.shareAppTag() : 'letter:share_cancel');
  /* 보낸 편지함에 남긴다 (이 폰에만) */
  const th = await renderCard(S, 300);
  if (!S.id) S.id = 'l_' + Date.now().toString(36);
  await saveSent({ id: S.id, to: S.to, date: todayKey(), at: Date.now(), paper: S.paper, how, thumb: th.toDataURL('image/jpeg', 0.75), state: { ...S, items: S.items.map((i) => ({ ...i })) } });
  if (how === 'send' && ok !== false) toast(t('보낸 편지함에 담아 두었어요.'));
}

/* ── 화면: 보낸 편지함 ─────────────────────────────── */
export const Box = {
  async render(root) {
    const list = await loadSent();
    root.classList.add('letter-view');
    const top = el('button', { class: 'btn btn-primary btn-block lt-new', type: 'button' }, `${icon('edit')}<span>${esc(t('새 편지 쓰기'))}</span>`);
    top.addEventListener('click', () => go('/letter?new=1'));
    root.append(top);
    if (!list.length) root.append(el('div', { class: 'empty' }, esc(t('아직 보낸 편지가 없어요.'))));
    const grid = el('div', { class: 'lt-box' });
    for (const r of list) {
      const b = el('button', { class: 'lt-box-item', type: 'button' },
        `<img src="${r.thumb}" alt=""><span class="lt-box-to">To. ${esc(r.to || '')}</span><span class="lt-box-d">${esc(fmtDate(r.date, { weekday: false }))}</span>`);
      b.addEventListener('click', () => go('/letter?id=' + encodeURIComponent(r.id)));
      grid.append(b);
    }
    root.append(grid, el('div', { class: 'lt-note' }, esc(t('보낸 편지는 이 폰에만 저장돼요.'))));
    return { title: t('보낸 편지함'), left: { icon: 'back', onClick: back } };
  },
};

/* 시험·홈 카드에서 쓴다 */
export function _state() { return S; }
export function _reset() { S = blank(); }
