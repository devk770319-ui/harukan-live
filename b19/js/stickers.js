/* ===========================================================
   stickers.js — 일기에 스티커 붙이기 (1.4.0, 2026-10-13)

   어디서 붙이나
     쓰기(고쳐 쓰기) 화면이 곧 '종이 한 장'이다. 제목·사진·본문·태그가 글 보기
     화면과 같은 순서로 놓이고, 그 위에서 바로 스티커를 붙이고 옮긴다.
     (사용자 요청: 글 고치기와 스티커 고치기를 따로 하지 말고 버튼 하나로)
     아래 툴바의 스티커 버튼이 서랍을 열고, 글 칸이나 화면을 누르면 서랍이 내려간다.
     글 보기 화면은 보여주기만 한다.

   스티커는 '무엇 위에' 붙었는지를 기억한다 (닻)
     head(제목/날짜 줄) · chips(칩 줄) · photo(사진 i번째) · body(본문) · tags(태그)
     종이 전체 기준으로 두면 나중에 사진·칩을 넣어 내용이 밀릴 때 스티커만 제자리에
     남아 엉뚱한 곳을 덮는다. 닻에 붙이면 같이 움직이고, 쓰기·보기 화면에서 같은 자리에 온다.

   누가 쓸 수 있나 (plus.canUseStickers) — 1.6.6, 2026-10-18 사용자 결정
     · 기본 팩          — 하루칸 플러스를 산 사람 + 30일 체험 중인 사람
     · 계절·동물·테이프 — 하루칸 플러스를 산 사람 (체험 중에도 잠긴다). 따로 파는 상품은 없다.
     · 이미 붙인 스티커는 체험이 끝나도 그대로 보이고, 옮기거나 뗄 수 있다.
       새로 붙이는 것만 막는다. 붙여둔 것을 가리면 일기를 인질로 잡는 셈이다.

   저장 모양 (entry.stickers, 잠금이 켜져 있으면 본문처럼 암호화된다)
     [{ s:'basic/coffee', a:'photo', i:0, x, y, w, r }]
       a, i — 닻 (photo 일 때만 i)
       x    — 스티커 가운데의 가로 위치, 닻 상자 너비 비율
       y    — 세로 위치. 사진이면 사진 높이 비율, 나머지 닻은 상자 위쪽에서 잰 거리를
              상자 너비 단위로 (본문 칸 높이는 화면마다 달라서 높이 비율로 재면 어긋난다)
       w    — 스티커 너비 / 닻 상자 너비
       r    — 기울기(도)
     a 가 없으면(개발 중 만든 옛 모양) 종이 기준: x·y·w 모두 종이 너비 비율.
   =========================================================== */

import * as plus from './plus.js';
import * as NB from './newbadge.js';
import * as analytics from './analytics.js';
import * as store from './store.js';
import { el, icon, esc, toast, openSheet, haptic } from './ui.js';
import { t, current as i18nCurrent } from './i18n.js';

/* ── 목록 ────────────────────────────────────────
   그림 파일: stickers/<팩>/<이름>.webp  (글자 없는 그림이라 9개 언어 공용) */
export const PACKS = [
  { id: 'basic', tier: 'basic', items: [
    'coffee', 'cat', 'flowers', 'heart', 'stars', 'rain', 'gingham', 'sprout',
    'sun', 'rainbow', 'moon', 'letter', 'gift', 'cake', 'book', 'pencil',
    'clover', 'cherry', 'ribbon', 'balloons', 'camera', 'music', 'sneakers', 'donut',
  ] },
  /* 계절(16)·동물(8)·테이프(8) — 1.6.6, 2026-10-18 사용자 결정: 따로 팔지 않고 하루칸 플러스에 넣는다.
     (1.6.0~1.6.5 내부 테스트에서만 '스티커 플러스'로 따로 팔려고 했다. 상품은 만들지 않았다.)
     tier:'plus' — 플러스를 산 사람만. 체험 중에도 잠긴다 (1.4.0 때 정한 규칙 그대로). */
  /* 2026-10-25 사용자 결정: 계절·동물·테이프도 기본(무료)으로. 새로 만든 위로 스티커만 플러스 */
  { id: 'season', tier: 'basic', items: [
    'blossom', 'tulip', 'butterfly', 'strawberry', 'watermelon', 'sunflower', 'icecream', 'shell',
    'maple', 'acorn', 'pumpkin', 'mushroom', 'snowman', 'mittens', 'tree', 'snowflake',
  ] },
  { id: 'animal', tier: 'basic', items: [
    'puppy', 'bunny', 'bear', 'duckling', 'penguin', 'hamster', 'fox', 'hedgehog',
  ] },
  { id: 'tape', tier: 'basic', items: [
    'stripe', 'dot', 'floral', 'mint', 'star', 'cloud', 'lace', 'kraft',
  ] },
  /* 위로 스티커 (1.7.6, 2026-10-25 사용자 결정: 플러스 회원) — 곰·토끼·고양이·강아지 각 30개.
     그림에는 글자가 없고, 문구는 사용자 언어로 앱이 그림 아래에 그려 넣는다 (caption, stickers-cheer.js) */
  ...['cheer_bear', 'cheer_bunny', 'cheer_cat', 'cheer_puppy'].map((id) => ({
    id, tier: 'plus', caption: true, items: Array.from({ length: 30 }, (_, i) => String(i + 1).padStart(2, '0')),
  })),
];

const MAX_PER_ENTRY = 30;
const MIN_PX = 28;                 // 이보다 작게는 못 줄인다 (손가락으로 다시 못 잡는다)

/* ── 글자 상자 (2026-10-31 사용자: '글자를 써서 스티커처럼 조절') ──────────
   스티커와 같은 배열(entry.stickers)에 { s:'text', tx, c, bg, fw } 로 넣는다 — 옮기기·크기·회전·닻·암호화(stickers 는
   잠금 시 암호화되는 칸)·백업을 그대로 쓴다. 옛 묶음은 known('text') 가 false 라 그리지 않고 건너뛰며, 저장할 때 배열을 그대로 둔다.
   글자 크기는 상자 너비에 비례한다 (모서리로 키우면 글자도 커진다). */
export const TEXT_COLORS = ['', '#2b2521', '#c2453d', '#e07a2e', '#c9a227', '#3f8f5a', '#2f7fae', '#6a55b5', '#c25a8c', '#ffffff'];
export function isText(s) { return !!s && s.s === 'text' && typeof s.tx === 'string'; }
const TXT_K = 0.13;                // 글자 크기 = 상자 너비 × 이 값
function paintText(n, s) {
  n.textContent = s.tx;
  n.dataset.bg = s.bg || 'none';
  n.style.color = s.c || '';
  n.style.fontWeight = s.fw === 'n' ? '500' : '800';
  n.style.setProperty('--tbc', s.c || 'var(--ink)');
}
/** 글자 상자 편집 창. 돌려주는 것: { tx, c, bg, fw } 또는 null(취소) / 'delete' */
export function editText(init = {}) {
  return new Promise((resolve) => {
    const v = { tx: init.tx || '', c: init.c || '', bg: init.bg || 'none', fw: init.fw || 'b' };
    const box = el('div', { class: 'tb-ed' });
    const ta = el('textarea', { class: 'lock-input tb-ta', rows: '3', maxlength: '80', placeholder: t('글자를 써 주세요') });
    ta.value = v.tx;
    const prev = el('div', { class: 'tb-prev' });
    const pv = el('div', { class: 'stk-text tb-pv' });
    prev.append(pv);
    const draw = () => { v.tx = ta.value; paintText(pv, { ...v, tx: v.tx || t('글자를 써 주세요') }); };
    ta.addEventListener('input', draw);
    const colors = el('div', { class: 'tb-colors' });
    for (const c of TEXT_COLORS) {
      const b = el('button', { class: 'tb-col' + (c === v.c ? ' on' : '') + (c ? '' : ' auto'), type: 'button', 'aria-label': c || t('기본') });
      if (c) b.style.background = c;
      b.addEventListener('click', () => { v.c = c; colors.querySelectorAll('.tb-col').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
      colors.append(b);
    }
    const seg = (items, key) => {
      const r = el('div', { class: 'segmented tb-seg' });
      for (const [val, label] of items) {
        const b = el('button', { class: (v[key] === val ? 'on' : ''), type: 'button' }, esc(label));
        b.addEventListener('click', () => { v[key] = val; r.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b)); draw(); });
        r.append(b);
      }
      return r;
    };
    const row = el('div', { class: 'btn-row', style: 'margin-top:14px' });
    const cancel = el('button', { class: 'btn', type: 'button' }, esc(t('취소')));
    const ok = el('button', { class: 'btn btn-primary', type: 'button' }, esc(init.tx != null && init.tx !== '' ? t('바꾸기') : t('붙이기')));
    row.append(cancel, ok);
    box.append(ta, prev, colors,
      seg([['none', t('글자만')], ['box', t('상자')], ['marker', t('형광펜')]], 'bg'),
      seg([['b', t('굵게')], ['n', t('보통')]], 'fw'), row);
    let done = false;
    const finish = (r) => { if (done) return; done = true; close(); resolve(r); };
    cancel.addEventListener('click', () => finish(null));
    ok.addEventListener('click', () => { const tx = ta.value.trim().slice(0, 80); if (!tx) { toast(t('글자를 써 주세요')); return; } finish({ ...v, tx }); });
    const close = openSheet({ title: t('글자 상자'), content: box, onClose: () => { if (!done) { done = true; resolve(null); } } });
    draw();
    setTimeout(() => ta.focus(), 80);
  });
}

function packName(id) {
  return { basic: t('기본'), season: t('계절'), animal: t('동물'), tape: t('테이프'),
    cheer_bear: t('포근이 곰'), cheer_bunny: t('콩콩이 토끼'), cheer_cat: t('나른이 고양이'), cheer_puppy: t('몽글이 강아지') }[id] || id;
}
function packOf(sid) { return PACKS.find((p) => sid.startsWith(p.id + '/')) || null; }
/** 그림 주소. 위로 스티커는 문구를 얹은 그림(만들어 두었으면)을 준다 */
export function src(sid) {
  const art = `stickers/${sid}.webp`;
  if (!sid.startsWith('cheer_')) return art;
  const c = captioned.get(sid);
  if (c) return c;
  prepareCaptions().catch(() => {});
  return art;
}

/* ── 위로 스티커 문구 합성 (1.7.6) ─────────────────
   지금 언어의 문구를 그림 아래쪽에 흰 테두리 글씨로 얹어 120장을 미리 만들어 둔다(메모리).
   다 만들면 화면에 글자 없는 그림으로 떠 있던 스티커를 바꿔 끼운다. 언어가 바뀌면 다시 만든다. */
const captioned = new Map();
let capLang = '', capJob = null;
export function prepareCaptions(force = false) {
  const lang = i18nCurrent();
  if (!force && capLang === lang && capJob) return capJob;
  capLang = lang;
  captioned.clear();
  capJob = (async () => {
    const { CHEER } = await import('./stickers-cheer.js');
    const fam = '"Jua", "Baloo 2", "Kiwi Maru", "ZCOOL KuaiLe", "Itim", "Baloo Bhaijaan 2", "Noto Sans KR", sans-serif';
    /* 글씨는 '동글 젤리' 글꼴로 (받지 못하면 기본 글꼴의 굵은 글씨) */
    try {
      const F = await import('./fonts.js');
      await Promise.race([F.load('jelly', lang), new Promise((r) => setTimeout(r, 2500))]);
    } catch { /* 기본 글꼴로 */ }
    const rtl = lang === 'ar';
    for (const [pack, def] of Object.entries(CHEER)) {
      for (const [n, ph] of Object.entries(def.items)) {
        if (capLang !== lang) return;                       // 그 사이 언어가 바뀌었다
        const sid = `${pack}/${n}`;
        const text = ph[lang] || ph.en || ph.ko || '';
        const im = await new Promise((res) => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = `stickers/${sid}.webp`; });
        if (!im) continue;
        const W = im.width, H = im.height;
        const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
        const x = cv.getContext('2d');
        x.drawImage(im, 0, 0);
        if (text) {
          let size = Math.round(W * 0.15);
          x.font = `800 ${size}px ${fam}`;
          while (x.measureText(text).width > W * 0.92 && size > 14) { size -= 2; x.font = `800 ${size}px ${fam}`; }
          x.textAlign = 'center'; x.textBaseline = 'alphabetic'; x.direction = rtl ? 'rtl' : 'ltr';
          const y = H - Math.round(H * 0.06);
          x.lineJoin = 'round'; x.lineWidth = Math.max(6, size * 0.32); x.strokeStyle = '#ffffff';
          x.strokeText(text, W / 2, y);
          x.fillStyle = def.color || '#7a4a32';
          x.fillText(text, W / 2, y);
        }
        captioned.set(sid, cv.toDataURL('image/webp', 0.9));
        cv.width = cv.height = 0;
      }
    }
    /* 글자 없는 그림으로 떠 있던 것들을 바꿔 끼운다 */
    for (const img of document.querySelectorAll('img[src^="stickers/cheer_"]')) {
      const m = img.getAttribute('src').match(/^stickers\/(cheer_[a-z]+\/\d+)\.webp$/);
      if (m && captioned.has(m[1])) img.src = captioned.get(m[1]);
    }
  })();
  return capJob;
}
/** 목록에 있는 스티커인가 (그림이 빠졌거나 옛 이름이면 그리지 않는다) */
export function known(sid) {
  const p = packOf(sid);
  return !!p && p.items.includes(sid.slice(p.id.length + 1));
}

/* ── NEW 표시 ───────────────────────────────────────
   새 기능을 알리려고 스티커 버튼과 고쳐 쓰기 버튼에 작은 NEW 를 붙인다
   (사용자 요청 2026-10-13). 스티커 서랍을 한 번 열면 사라진다 — 이미 아는 기능에
   계속 붙어 있으면 소음이다. 글자는 9개 언어 모두 'NEW' 그대로 둔다. */
/* 1.7.8: 새 기능 NEW 는 newbadge.js 로 모았다. 스티커 버튼의 NEW 는 '위로 스티커'를 한 번 열어 볼 때까지 */
export function paintNew(btn) {
  /* 패치 14: 글자 상자를 아직 안 써 봤으면 그 NEW 를 먼저 (하나만 붙인다) */
  return NB.corner(btn, NB.isNew('textbox') ? 'textbox' : 'cheer');
}
function markSeen() {
  if (store.getSettings().stickersSeen) return;
  store.saveSettings({ stickersSeen: true }, { silent: true });
}

/* ── 닻 찾기 ─────────────────────────────────────
   화면마다 "이 닻은 이 요소"를 알려준다. 그 닻이 지금 없으면(칩을 다 지웠다 등)
   가까운 다른 닻으로 대신한다. list() 는 끈 뒤 다시 붙일 곳을 고를 후보 [{a, i, el}] */
const FALLBACK = { chips: 'head', photo: 'body', tags: 'body', head: 'body', body: 'head' };
function anchorSet(page, sel) {
  const pick = (a, i) => {
    if (a === 'photo') return page.querySelectorAll(sel.photo)[i | 0] || null;
    return sel[a] ? page.querySelector(sel[a]) : null;
  };
  return {
    get(a, i) {
      return pick(a, i) || pick(FALLBACK[a]) || pick(FALLBACK[FALLBACK[a]]) || null;
    },
    list() {
      const out = [];
      const add = (a, node, i) => { if (node) out.push({ a, i, el: node }); };
      add('head', pick('head'));
      add('chips', pick('chips'));
      page.querySelectorAll(sel.photo).forEach((img, i) => add('photo', img, i));
      add('body', pick('body'));
      add('tags', pick('tags'));
      return out;
    },
  };
}
export function readingAnchors(page) {
  return anchorSet(page, {
    head: '.entry-head', chips: '.chip-row', photo: '.entry-photos img', body: '.entry-body', tags: '.entry-tags',
  });
}
/** 쓰기 화면: 제목(없으면 첫 줄) · 고른 칩 줄 · 사진 · 본문 칸 · 태그 줄 */
export function writingAnchors(page) {
  return anchorSet(page, {
    /* 본문 닻: 글 사이 사진이 있으면 글 칸들과 사진을 묶은 .wp-flow 전체 (1.7.5) — 앞에 오는 쪽이 잡힌다 */
    head: '.title-in, .wp-head', chips: '.wp-chips', photo: '.wp-photo img', body: '.wp-flow, textarea.body-in', tags: '.wp-tags',
  });
}

/* ── 종이 위에 그리기 ───────────────────────────────
   page    : 스티커를 얹을 바탕 (position:relative 가 된다)
   entry   : 글. entry.stickers 를 직접 고친다
   anchors : readingAnchors(page) / writingAnchors(page)
   opts.interactive : 옮기기·크기·회전·떼기 + 아래 서랍 (쓰기 화면)
   opts.onChange    : 바뀔 때마다 부른다 (저장은 부르는 쪽이 한다)
   opts.drawerHost  : 서랍을 붙일 곳 (화면이 바뀌면 같이 사라지도록 #view 안)
   돌려주는 것: { refresh, openDrawer, closeDrawer, isOpen } */
export function mount(page, entry, { anchors, interactive = false, onChange = () => {}, drawerHost = null } = {}) {
  if (!Array.isArray(entry.stickers)) entry.stickers = [];
  page.classList.add('stk-page');
  if (interactive) page.classList.add('stk-edit');
  const layer = el('div', { class: 'stk-layer' });
  page.append(layer);

  const nodes = new Map();          // 스티커 → <img>
  const live = new Map();           // 끄는 중인 스티커의 화면 좌표 {cx, cy, wpx}
  let selected = null;
  let frame = null;

  const W = () => page.clientWidth || 1;
  /** 요소의 상자를 종이 기준 px 로 */
  function rel(node) {
    const pr = page.getBoundingClientRect();
    const r = node.getBoundingClientRect();
    return { left: r.left - pr.left, top: r.top - pr.top, width: r.width || 1, height: r.height || 1 };
  }
  /** 이 스티커의 닻 상자. 닻을 못 찾으면 종이 기준으로 */
  function box(s) {
    const node = s.a ? anchors.get(s.a, s.i) : null;
    if (node) return rel(node);
    return { left: 0, top: 0, width: W(), height: W() };     // 옛 모양: 종이 너비 기준
  }
  const yUnit = (a, b) => (a === 'photo' ? b.height : b.width);
  /** 저장된 비율 → 화면 px */
  function geom(s) {
    const lv = live.get(s);
    if (lv) return lv;
    const b = box(s);
    return { cx: b.left + s.x * b.width, cy: b.top + s.y * yUnit(s.a, b), wpx: Math.max(MIN_PX, s.w * b.width) };
  }

  function place(s) {
    const n = nodes.get(s);
    if (!n) return;
    const g = geom(s);
    n.style.width = g.wpx + 'px';
    n.style.left = g.cx + 'px';
    n.style.top = g.cy + 'px';
    n.style.transform = `translate(-50%,-50%) rotate(${s.r}deg)`;
    if (isText(s)) n.style.fontSize = (g.wpx * TXT_K).toFixed(1) + 'px';
    if (s === selected) placeFrame();
  }
  function placeAll() { for (const s of entry.stickers) place(s); fitHeight(); }

  /* 종이가 스티커를 다 품도록 — 아래 버튼 위로 삐져나가지 않게 */
  function fitHeight() {
    page.style.minHeight = '';
    let need = 0;
    for (const s of entry.stickers) {
      const n = nodes.get(s); if (!n) continue;
      const g = geom(s);
      /* 기울인 스티커는 둘러싼 상자가 더 높다 (h·cos + w·sin) */
      const h = n.offsetHeight || g.wpx, a = Math.abs((s.r || 0) * Math.PI / 180);
      const half = (h * Math.cos(a) + g.wpx * Math.sin(a)) / 2;
      need = Math.max(need, g.cy + half + 10);
    }
    /* ⚠ scrollHeight 는 튀어나온 스티커(절대 위치)까지 세서 늘 need 보다 커 보였다 → 종이가 안 늘어나 스티커가 아래 버튼 위로 삐져나왔다 (2026-10-25 사용자 신고). 종이 자체 높이(offsetHeight)와 견준다 */
    if (need > page.offsetHeight) page.style.minHeight = Math.ceil(need) + 'px';
  }

  function add(s) {
    if (isText(s)) {
      const n = el('div', { class: 'stk stk-text' });
      paintText(n, s);
      nodes.set(s, n);
      layer.append(n);
      place(s);
      if (interactive) wireSticker(s, n);
      return n;
    }
    if (!known(s.s)) return null;
    const n = el('img', { class: 'stk', src: src(s.s), alt: '', draggable: 'false' });
    n.addEventListener('load', () => { place(s); fitHeight(); });
    n.addEventListener('error', () => { n.remove(); nodes.delete(s); });
    nodes.set(s, n);
    layer.append(n);
    place(s);
    if (interactive) wireSticker(s, n);
    return n;
  }

  for (const s of entry.stickers) add(s);

  /* 사진이 늦게 뜨거나, 글을 고치거나, 화면 폭이 바뀌면 닻 상자가 움직인다 → 다시 놓는다 */
  let raf = 0;
  const relayout = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; placeAll(); }); };
  const ro = new ResizeObserver(() => { if (!page.isConnected) { ro.disconnect(); mo.disconnect(); return; } relayout(); });
  ro.observe(page);
  const mo = new MutationObserver((list) => {
    if (list.every((m) => layer.contains(m.target))) return;   // 내 스티커 층이 바뀐 건 무시
    relayout();
  });
  mo.observe(page, { childList: true, subtree: true });
  page.addEventListener('load', relayout, true);             // 사진이 다 뜬 순간
  page.addEventListener('input', relayout, true);            // 글을 쓰는 동안 칸 높이가 바뀐다
  requestAnimationFrame(placeAll);

  /* 개발 중 만든 옛 모양(닻 없이 종이 기준)은 사진이 다 뜬 뒤 지금 자리에서 닻을 찾아 바꾼다 */
  if (entry.stickers.some((s) => !s.a) && anchors.list().length) {
    const imgs = [...page.querySelectorAll('img')].filter((i) => !i.classList.contains('stk'));
    const ready = () => imgs.every((i) => i.complete && i.naturalWidth);
    let tries = 0;
    const tick = () => {
      if (!page.isConnected) return;
      if (!ready() && tries++ < 20) { setTimeout(tick, 150); return; }
      for (const s of entry.stickers) if (!s.a) settle(s);
      onChange();
    };
    setTimeout(tick, 150);
  }

  /* 스티커 목록이 통째로 바뀜 때 (사진을 지워 그 사진의 스티커도 떼어낼 때 등) */
  function rebuildAll() {
    for (const n of nodes.values()) n.remove();
    nodes.clear();
    for (const s of entry.stickers) add(s);
    placeAll();
  }

  const ctrl = { refresh: placeAll, rebuild: rebuildAll, openDrawer() {}, closeDrawer() {}, isOpen: () => false };
  if (!interactive) return ctrl;
  ctrl.rebuild = () => { select(null); rebuildAll(); };

  /* ── 쓰기 화면: 고르기·옮기기 ─────────────────── */
  function select(s) {
    if (selected === s) return;
    selected = s;
    frame?.remove(); frame = null;
    if (!s) return;
    const i = entry.stickers.indexOf(s);      // 고른 것을 맨 위로 (배열 끝 = 가장 위)
    if (i >= 0 && i !== entry.stickers.length - 1) {
      entry.stickers.splice(i, 1); entry.stickers.push(s);
      layer.append(nodes.get(s));
    }
    frame = el('div', { class: 'stk-frame' });
    const del = el('button', { class: 'stk-del', type: 'button', 'aria-label': t('스티커 떼기') }, icon('close'));
    const rs = el('button', { class: 'stk-rs', type: 'button', 'aria-label': t('크기와 방향') }, icon('refresh'));
    del.addEventListener('click', (ev) => { ev.stopPropagation(); remove(s); });
    wireHandle(rs);
    frame.append(del, rs);
    layer.append(frame);
    placeFrame();
  }

  function placeFrame() {
    const s = selected, n = nodes.get(s);
    if (!frame || !n) return;
    const g = geom(s);
    Object.assign(frame.style, {
      width: (g.wpx + 14) + 'px', height: ((n.offsetHeight || g.wpx) + 14) + 'px',
      left: g.cx + 'px', top: g.cy + 'px', transform: `translate(-50%,-50%) rotate(${s.r}deg)`,
    });
  }

  function remove(s) {
    const i = entry.stickers.indexOf(s);
    if (i < 0) return;
    entry.stickers.splice(i, 1);
    nodes.get(s)?.remove(); nodes.delete(s);
    select(null);
    haptic(8);
    fitHeight();
    onChange();
  }

  /** 끈 뒤: 가운데가 놓인 곳의 닻을 다시 고르고 비율로 바꿔 저장한다 */
  function settle(s) {
    const g = live.get(s) || geom(s);
    live.delete(s);
    let best = null, bestD = Infinity;
    for (const c of anchors.list()) {
      const b = rel(c.el);
      const dx = Math.max(b.left - g.cx, 0, g.cx - (b.left + b.width));
      const dy = Math.max(b.top - g.cy, 0, g.cy - (b.top + b.height));
      const d = Math.hypot(dx, dy);          // 상자 안이면 0. 닻 후보끼리는 겹치지 않는다
      if (d < bestD) { bestD = d; best = { ...c, b }; }
    }
    if (best) {
      s.a = best.a; if (best.a === 'photo') s.i = best.i; else delete s.i;
      s.x = (g.cx - best.b.left) / best.b.width;
      s.y = (g.cy - best.b.top) / yUnit(best.a, best.b);
      s.w = g.wpx / best.b.width;
    } else {                                   // 닻이 하나도 없는 글(드물다) — 종이 기준
      delete s.a; delete s.i;
      s.x = g.cx / W(); s.y = g.cy / W(); s.w = g.wpx / W();
    }
    s.x = +s.x.toFixed(4); s.y = +s.y.toFixed(4); s.w = +s.w.toFixed(4); s.r = Math.round(s.r * 10) / 10;
    place(s);
    fitHeight();
  }

  const clampPx = (w) => Math.max(MIN_PX, Math.min(W() * 0.95, w));
  const clampLive = (lv) => { lv.cx = Math.max(0, Math.min(W(), lv.cx)); lv.cy = Math.max(0, lv.cy); };

  /* 스티커 몸통: 한 손가락 = 옮기기, 두 손가락 = 크기·회전.
     누르는 순간 글 칸 포커스가 생기지 않게 막는다 (키보드가 튀어 오르지 않게) */
  function wireSticker(s, n) {
    n.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (document.activeElement && page.contains(document.activeElement)) document.activeElement.blur();
      wasSel = selected === s;
      select(s);
      startGesture(s, ev);
    });
  }

  let g = null;   // 진행 중인 손짓
  let wasSel = false;   // 이미 고른 글자 상자를 한 번 더 누르면 고치기
  function startGesture(s, ev) {
    if (g && g.s === s) { g.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY }); resetBase(); return; }
    live.set(s, { ...geom(s) });
    g = { s, pts: new Map([[ev.pointerId, { x: ev.clientX, y: ev.clientY }]]), moved: false };
    resetBase();
    window.addEventListener('pointerdown', onDown, true);
    window.addEventListener('pointermove', onMove, true);
    window.addEventListener('pointerup', onUp, true);
    window.addEventListener('pointercancel', onUp, true);
  }
  function resetBase() {
    const p = [...g.pts.values()], lv = live.get(g.s);
    g.base = { cx: lv.cx, cy: lv.cy, wpx: lv.wpx, r: g.s.r, p0: p[0] };
    if (p.length >= 2) {
      g.base.d = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y) || 1;
      g.base.a = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
      g.base.mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
    }
  }
  function onDown(ev) {            // 두 번째 손가락은 스티커 밖에 닿을 수도 있다
    if (!g) return;
    ev.preventDefault();
    g.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    resetBase();
  }
  function onMove(ev) {
    if (!g || !g.pts.has(ev.pointerId)) return;
    ev.preventDefault();
    g.pts.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    const p = [...g.pts.values()], s = g.s, b = g.base, lv = live.get(s);
    if (p.length >= 2 && b.d) {
      const d = Math.hypot(p[1].x - p[0].x, p[1].y - p[0].y);
      const a = Math.atan2(p[1].y - p[0].y, p[1].x - p[0].x);
      const mid = { x: (p[0].x + p[1].x) / 2, y: (p[0].y + p[1].y) / 2 };
      lv.wpx = clampPx(b.wpx * d / b.d);
      s.r = b.r + (a - b.a) * 180 / Math.PI;
      lv.cx = b.cx + (mid.x - b.mid.x);
      lv.cy = b.cy + (mid.y - b.mid.y);
    } else {
      lv.cx = b.cx + (p[0].x - b.p0.x);
      lv.cy = b.cy + (p[0].y - b.p0.y);
    }
    clampLive(lv);
    g.moved = true;
    place(s);
  }
  function onUp(ev) {
    if (!g) return;
    g.pts.delete(ev.pointerId);
    if (g.pts.size) { resetBase(); return; }
    const moved = g.moved, s = g.s;
    g = null;
    window.removeEventListener('pointerdown', onDown, true);
    window.removeEventListener('pointermove', onMove, true);
    window.removeEventListener('pointerup', onUp, true);
    window.removeEventListener('pointercancel', onUp, true);
    if (moved) { settle(s); onChange(); } else { live.delete(s); if (wasSel && isText(s)) editExisting(s); }
  }

  /* 모서리 손잡이: 가운데를 축으로 끌면 크기와 방향이 같이 바뀐다 (한 손으로 되게) */
  function wireHandle(h) {
    h.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); ev.stopPropagation();
      const s = selected, n = nodes.get(s);
      if (!s || !n) return;
      const r = n.getBoundingClientRect();
      const c = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      const v0 = { x: ev.clientX - c.x, y: ev.clientY - c.y };
      const d0 = Math.hypot(v0.x, v0.y) || 1, a0 = Math.atan2(v0.y, v0.x);
      const lv = { ...geom(s) }; live.set(s, lv);
      const w0 = lv.wpx, r0 = s.r;
      h.setPointerCapture(ev.pointerId);
      const move = (e2) => {
        const v = { x: e2.clientX - c.x, y: e2.clientY - c.y };
        lv.wpx = clampPx(w0 * Math.hypot(v.x, v.y) / d0);
        s.r = r0 + (Math.atan2(v.y, v.x) - a0) * 180 / Math.PI;
        place(s);
      };
      const up = () => {
        h.removeEventListener('pointermove', move);
        h.removeEventListener('pointerup', up);
        h.removeEventListener('pointercancel', up);
        settle(s); onChange();
      };
      h.addEventListener('pointermove', move);
      h.addEventListener('pointerup', up);
      h.addEventListener('pointercancel', up);
    });
  }

  async function editExisting(s) {
    const r = await editText(s);
    if (!r) return;
    Object.assign(s, r);
    const n = nodes.get(s); if (n) paintText(n, s);
    place(s); fitHeight(); onChange();
  }

  /** 새 글자 상자 — 보이는 종이 한가운데에 */
  async function addText() {
    if (entry.stickers.length >= MAX_PER_ENTRY) { toast(t('한 글에는 스티커를 {n}개까지 붙일 수 있어요.', { n: MAX_PER_ENTRY })); return; }
    setOpen(false);
    const r = await editText({});
    if (!r) return;
    const pr = page.getBoundingClientRect();
    const top = Math.max(document.querySelector('#topbar')?.getBoundingClientRect().bottom || 0, pr.top);
    const barTop = document.querySelector('.writebar')?.getBoundingClientRect().top || window.innerHeight;
    const bottom = Math.min(barTop, Math.max(pr.bottom, top + 160));
    const w = W();
    const s = { s: 'text', ...r, x: 0, y: 0, w: 0, r: 0 };
    live.set(s, { cx: w * 0.5, cy: (top + bottom) / 2 - pr.top, wpx: Math.min(220, w * 0.6) });
    clampLive(live.get(s));
    entry.stickers.push(s);
    add(s); settle(s); select(s);
    haptic(10); analytics.design('sticker:text'); NB.used('textbox');
    onChange();
  }
  ctrl.addText = addText;

  /* ── 서랍 ───────────────────────────────────── */
  const host = drawerHost || document.body;
  const drawer = buildDrawer((sid) => {
    if (entry.stickers.length >= MAX_PER_ENTRY) {
      toast(t('한 글에는 스티커를 {n}개까지 붙일 수 있어요.', { n: MAX_PER_ENTRY }));
      return;
    }
    setOpen(false);                 // 붙이면 서랍을 내려서 종이를 넓게 보여준다
    requestAnimationFrame(() => {
      // 지금 보이는 종이 한가운데에 붙인다 (머리띠 아래, 아래 툴바 위)
      const pr = page.getBoundingClientRect();
      const top = Math.max(document.querySelector('#topbar')?.getBoundingClientRect().bottom || 0, pr.top);
      const barTop = document.querySelector('.writebar')?.getBoundingClientRect().top || window.innerHeight;
      const bottom = Math.min(barTop, Math.max(pr.bottom, top + 160));
      const w = W();
      const tape = sid.startsWith('tape/');
      const s = { s: sid, x: 0, y: 0, w: 0, r: Math.round((Math.random() - 0.5) * 16) };
      live.set(s, {
        cx: w * (0.5 + (Math.random() - 0.5) * 0.24),
        cy: (top + bottom) / 2 - pr.top + (Math.random() - 0.5) * 40,
        wpx: Math.min(tape ? 150 : 110, w * (tape ? 0.42 : 0.3)),
      });
      clampLive(live.get(s));
      entry.stickers.push(s);
      add(s);
      settle(s);
      select(s);
      haptic(10);
      onChange();
    });
  }, () => setOpen(false), () => addText());
  host.append(drawer);

  const html = document.documentElement;
  function setOpen(v) {
    drawer.classList.toggle('open', v);
    html.classList.toggle('stk-drawer-open', v);
    if (v) {
      markSeen();
      // 아래 툴바 바로 위에 뜬다 (툴바 높이는 기기·글꼴마다 다르다)
      const bar = document.querySelector('.writebar');
      drawer.style.bottom = bar ? bar.offsetHeight + 'px' : '0px';
    }
  }
  ctrl.openDrawer = () => {
    if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();  // 키보드를 내린다
    setOpen(true);
    analytics.design('sticker:drawer');
  };
  ctrl.closeDrawer = () => setOpen(false);
  ctrl.isOpen = () => drawer.classList.contains('open');

  /* 글 칸이나 화면을 누르면 서랍이 내려간다 (사용자 요청). 빈 곳을 누르면 선택도 푼다.
     스티커 버튼(data-stk-toggle)은 열고 닫기를 스스로 한다 */
  const onDocDown = (ev) => {
    if (!page.isConnected) { cleanup(); return; }
    const tgt = ev.target;
    if (!tgt.closest('.stk, .stk-frame, .stk-drawer, [data-stk-toggle]')) select(null);
    if (ctrl.isOpen() && !tgt.closest('.stk-drawer, [data-stk-toggle]')) setOpen(false);
  };
  const onFocus = (ev) => {
    if (!page.isConnected) { cleanup(); return; }
    if (ev.target.matches?.('input, textarea')) { setOpen(false); select(null); }
  };
  document.addEventListener('pointerdown', onDocDown, true);
  document.addEventListener('focusin', onFocus, true);
  // 화면이 바뀌면(#view 가 비워지면) 서랍·표시·이벤트를 걷는다
  const mo2 = new MutationObserver(() => { if (!drawer.isConnected) cleanup(); });
  mo2.observe(host, { childList: true });
  function cleanup() {
    document.removeEventListener('pointerdown', onDocDown, true);
    document.removeEventListener('focusin', onFocus, true);
    html.classList.remove('stk-drawer-open');
    mo2.disconnect();
  }

  return ctrl;
}

/* ── 서랍 ───────────────────────────────────────────
   아래 툴바 바로 위에 뜨는 판. 손잡이 줄을 탭하거나 아래로 밀면 닫힌다. */
function buildDrawer(onPick, onClose, onText = null) {
  const d = el('div', { class: 'stk-drawer', role: 'region', 'aria-label': t('스티커') });
  const bar = el('button', { class: 'stk-bar', type: 'button', 'aria-label': t('닫기') });
  bar.innerHTML = `<span class="stk-grab"></span>
    <span class="stk-bar-row"><b>${esc(t('스티커'))}</b>
    <span>${esc(t('탭하면 붙어요 · 끌어서 옮기고, 모서리로 크기·방향'))}</span>
    <i class="stk-chev">${icon('chevD')}</i></span>`;
  const tabs = el('div', { class: 'stk-tabs', role: 'tablist' });
  const note = el('div', { class: 'stk-note' });
  const grid = el('div', { class: 'stk-grid' });
  d.append(bar, tabs, note, grid);

  let sy = null, swiped = false;
  bar.addEventListener('pointerdown', (ev) => {
    sy = ev.clientY; swiped = false;
    try { bar.setPointerCapture(ev.pointerId); } catch { /* 없어도 탭은 된다 */ }
  });
  bar.addEventListener('pointermove', (ev) => {
    if (sy == null || swiped) return;
    if (ev.clientY - sy > 24) { swiped = true; onClose(); }
  });
  bar.addEventListener('pointerup', () => { sy = null; });
  bar.addEventListener('pointercancel', () => { sy = null; });
  bar.addEventListener('click', () => { if (!swiped) onClose(); swiped = false; });

  /* 1.7.6 (사용자 요청 2026-10-25): 무료 스티커는 '기본' 탭 하나로 모으고(기본·계절·동물·테이프),
     플러스 위로 스티커는 캐릭터별 탭으로 (포근이 곰 · 콩콩이 토끼 · 나른이 고양이 · 몽글이 강아지).
     저장된 스티커 이름(season/blossom, cheer_bear/01 …)은 그대로 두고, 보여줄 때만 묶는다 */
  const TABS = [
    { id: 'basic', tier: 'basic', packs: PACKS.filter((p) => p.tier === 'basic') },
    ...PACKS.filter((p) => p.tier === 'plus').map((p) => ({ id: p.id, tier: 'plus', packs: [p] })),
  ].filter((x) => x.packs.length);
  const tabName = (id) => (id === 'basic' ? t('기본') : packName(id));
  let cur = TABS[0].id;
  function paint() {
    tabs.innerHTML = '';
    tabs.hidden = TABS.length < 2 && !onText;
    if (onText) {   /* 글자 상자 (2026-10-31) — 맨 앞, 무료 */
      const b = el('button', { class: 'stk-tab stk-tab-text', type: 'button' }, '＋ ' + esc(t('글자 상자')) + NB.pill('textbox'));
      b.addEventListener('click', () => onText());
      tabs.append(b);
    }
    for (const tb of TABS) {
      const ok = plus.canUseStickers(tb.tier);
      const b = el('button', { class: 'stk-tab' + (tb.id === cur ? ' on' : ''), type: 'button', role: 'tab' },
        esc(tabName(tb.id)) + (ok ? '' : `<em>${esc(t('플러스'))}</em>`) + (tb.tier === 'plus' ? NB.pill('cheer') : ''));
      b.addEventListener('click', () => { cur = tb.id; if (tb.tier === 'plus') NB.used('cheer'); paint(); grid.scrollTop = 0; });
      tabs.append(b);
    }
    const tab = TABS.find((x) => x.id === cur);
    const ok = plus.canUseStickers(tab.tier);
    const left = plus.trialDaysLeft();
    note.textContent = '';
    if (!plus.isPlus() && left) note.textContent = t('체험 중이라 모든 스티커를 쓸 수 있어요 · {n}일 남음', { n: left });
    else if (!ok && tab.tier === 'plus') note.textContent = t('플러스를 사면 쓸 수 있어요.');
    else if (!ok) note.textContent = basicLockText();
    note.hidden = !note.textContent;

    grid.innerHTML = '';
    for (const pack of tab.packs) {
      for (const name of pack.items) {
        const sid = `${pack.id}/${name}`;
        const b = el('button', { class: 'stk-cell' + (ok ? '' : ' locked'), type: 'button', 'aria-label': name });
        b.append(el('img', { src: src(sid), alt: '', loading: 'lazy', draggable: 'false' }));
        if (!ok) b.insertAdjacentHTML('beforeend', `<span class="stk-lock">${icon('lock')}</span>`);
        b.addEventListener('click', () => (ok ? onPick(sid) : explainLock(pack.tier)));
        grid.append(b);
      }
    }
  }
  paint();
  return d;
}

/* 기본 스티커가 잠긴 이유 — 체험이 끝난 사람과, 체험 없이 시작한 새 사용자(1.6.3~)에게 다르게 말한다 */
function basicLockText() {
  return plus.hadTrial()
    ? t('체험이 끝나 기본 스티커는 플러스에서 쓸 수 있어요. 붙여둔 스티커는 그대로 남아요.')
    : t('기본 스티커는 하루칸 플러스에서 쓸 수 있어요.');
}

/** 잠긴 스티커를 눌렀을 때 — 왜 잠겼고 어떻게 여는지 그 자리에서 말한다 */
function explainLock(tier) {
  analytics.design('sticker:locked:' + tier);
  const text = tier === 'plus'
    ? t('위로 스티커는 하루칸 플러스에서 쓸 수 있어요.')
    : basicLockText();
  openSheet({
    center: true,
    title: t('플러스 스티커'),
    text,
    items: [{ label: t('하루칸 플러스 알아보기'), icon: 'heart', onClick: () => plus.showInfo('sticker') }],
  });
}

/** 열려 있는 스티커 서랍을 닫는다. 닫았으면 true (안드로이드 뒤로가기용) */
export function collapseDrawer() {
  const d = document.querySelector('.stk-drawer.open');
  if (!d) return false;
  d.querySelector('.stk-bar')?.click();
  return true;
}

/** 홈 카드 같은 작은 자리에 맨 위 스티커 하나만 얹는다 */
export function topSticker(entry) {
  const list = (entry.stickers || []).filter((s) => known(s.s));
  return list.length ? list[list.length - 1] : null;
}
