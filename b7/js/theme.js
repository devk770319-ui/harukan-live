/* ===========================================================
   theme.js — 배경 꾸미기 (1.5.0, 하루칸 플러스)

   두 가지를 준다.
   · 그림 배경 6종 (바다·눈·여름·봄·가을·별밤) — 그림에 맞춰 강조색도 같이 바뀐다
   · 내 사진 배경 — 고른 사진을 화면 뒤에 깔고, 위에 덮는 막의 진하기를 고른다

   원칙
   · 밝게/어둡게(설정 → 화면 → 테마)는 그대로 살아 있다. 그림 배경은 '색'이 아니라
     '바탕'이라서, 어두운 모드에서는 그림을 어둡게 덮고 어두운 색표를 쓴다.
     별밤만은 그림 자체가 밤이라 늘 어둡게 그린다.
   · 글자는 반투명 카드 위에 올라간다. 그림 위에 글자를 바로 얹지 않는다 — 읽혀야 일기장이다.
   · 내 사진은 이 기기 안에만 있고, 잠금을 켜면 일기 사진과 같은 열쇠로 암호화된다
     (enableLock / disableLock 이 다시 싸서 넣는다 — app.js).
   · 권한은 plus.canUseBackground() 한 곳에서만 본다. 플러스가 아니게 되면
     (환불 등) 고른 값은 남겨두되 그리지 않는다. 다시 사면 그대로 돌아온다.
   · 플러스가 아니어도 '미리보기'는 된다. 꾸미기 화면 안에서만 잠깐 입혀 보고,
     화면을 나가면 원래대로 돌아간다. 입어보지 않은 옷은 안 산다.
   =========================================================== */

import * as store from './store.js';
import * as plus from './plus.js';
import { encryptJSON, decryptJSON } from './crypto.js';

/* 카드·선 — 그림이 비쳐 보이되 글자는 또렷하게 */
const LIGHT_SURF = {
  card: 'rgba(255,255,255,.82)', card2: 'rgba(255,255,255,.58)',
  line: 'rgba(40,30,20,.09)', line2: 'rgba(40,30,20,.16)',
};
const DARK_SURF = {
  card2: 'rgba(255,255,255,.08)',
  line: 'rgba(255,255,255,.09)', line2: 'rgba(255,255,255,.16)',
};

/**
 * 그림 배경 목록. name 은 t() 로 번역한다 (check-i18n 이 읽도록 views/decor.js 에 t('바다') 등이 있다).
 * light/dark 는 그 밝기에서 쓸 색표. veil 은 그림 위에 덮는 막 (어두운 모드에서 그림을 눌러준다).
 */
/* 어두운 모드 색표를 밝은 색표에서 만든다 (미니멀 배경용) — 강조색만 밝혀서 쓴다 */
function mixHex(a, b, t) {
  const p = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
}
function autoDark(light) {
  const a = light.accent;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(a.slice(i, i + 2), 16));
  return {
    bg: '#16151a', ink: '#ece8f0', muted: '#b3adbb', muted2: '#948e9c',
    accent: mixHex(a, '#ffffff', 0.42), accent2: mixHex(a, '#ffffff', 0.6),
    accentBg: `rgba(${r},${g},${b},.32)`, card: 'rgba(24,22,28,.84)',
  };
}
const L = (bg, accent, accent2, accentBg, ink = '#24201c', muted = '#665e55', muted2 = '#7a7168') =>
  ({ bg, ink, muted, muted2, accent, accent2, accentBg });

export const BG_THEMES = [
  /* ── 미니멀 (1.6.2, 2026-10-18 사용자 요청: "간단한 꽃이나 보석, 화면에 방해되지 않게") ──
     화면 대부분이 단색이고 모서리에만 작은 꽃·보석. 강조색을 그림에 맞춘다. */
  { id: 'wildflower', name: '들꽃', group: 'minimal', light: L('#fbf6ec', '#b0587a', '#94455f', '#f6e1ea') },
  { id: 'branch', name: '꽃가지', group: 'minimal', light: L('#f8e3e3', '#b5506a', '#983f56', '#f9e0e6', '#2c1f22', '#6c5559', '#806a6e') },
  { id: 'daisy', name: '데이지', group: 'minimal', light: L('#dfe6d3', '#4f7445', '#3e5f36', '#e3edd9', '#1f2a1c', '#4f5c48', '#63705b') },
  { id: 'lily', name: '은방울꽃', group: 'minimal', light: L('#e2f2ea', '#2f7a62', '#23634f', '#d8efe5', '#15241f', '#4a6058', '#5e746c') },
  { id: 'pressed', name: '압화', group: 'minimal', light: L('#f1e7d8', '#a5576b', '#8a4558', '#f3e0e3', '#2a221b', '#67594b', '#7b6c5e') },
  { id: 'sapphire', name: '사파이어', group: 'minimal', light: L('#e9e1f6', '#5b4bb0', '#4a3c96', '#e6e0f7', '#1f1b2e', '#57506b', '#6b6480') },
  { id: 'crystal', name: '크리스털 빛', group: 'minimal', light: L('#f8f3ea', '#7a64b8', '#644fa0', '#ece6f6') },
  { id: 'pearl', name: '진주', group: 'minimal', light: L('#f6d9cc', '#b9583f', '#9b4732', '#f9e2d8', '#2b1d17', '#6d554b', '#82695e') },
  { id: 'emerald', name: '에메랄드', group: 'minimal', alwaysDark: true, noVeil: true,
    dark: { bg: '#0f2117', ink: '#e6efe8', muted: '#a9bfb0', muted2: '#8ba293', accent: '#6fd3a0', accent2: '#95e0b9', accentBg: 'rgba(40,130,90,.38)', card: 'rgba(14,30,22,.8)' } },
  { id: 'diamond', name: '다이아 별빛', group: 'minimal', alwaysDark: true, noVeil: true,
    dark: { bg: '#0b1230', ink: '#e8ebf7', muted: '#aab2cf', muted2: '#8d96b5', accent: '#a9c2ff', accent2: '#c5d5ff', accentBg: 'rgba(70,90,160,.42)', card: 'rgba(16,24,54,.8)' } },
];
/* 어두운 색표가 없는 밝은 배경은 만들어 둔다 */
for (const b of BG_THEMES) if (!b.dark) b.dark = autoDark(b.light);

export function byId(id) { return BG_THEMES.find((b) => b.id === id) || null; }
/* 절대 주소로 넣는다. CSS 변수 안의 상대 주소는 그 변수를 쓰는 css/app.css 기준으로 풀려서
   css/backgrounds/… 를 찾는다 (실제로 그렇게 빈 화면이 났다) */
export function imageUrl(id) { return new URL(`backgrounds/${id}.webp`, document.baseURI).href; }

/* ── 미리보기 ─────────────────────────────────
   꾸미기 화면에서만 쓴다. null 이면 저장된 값을 그린다. */
let preview = null;               // null | 'none' | 그림 id | 'photo'
export function setPreview(v) { preview = v; }
export function previewing() { return preview; }

/** 지금 화면에 그릴 배경 (권한까지 따져서) */
export function activeId() {
  if (preview) return preview;
  const id = store.getSettings().bgTheme || 'none';
  if (id === 'none') return 'none';
  /* 1.6.3 에서 풍경 6종·꾸미기 키트를 뺄다 — 그걸 골라두었던 사람은 기본으로 */
  if (id !== 'photo' && !byId(id)) return 'none';
  return plus.canUseBackground() ? id : 'none';
}

/** 지금 배경이 '언제나 어둡게'를 요구하나 (별밤) */
export function forcesDark() {
  return !!byId(activeId())?.alwaysDark;
}

/* ── 내 사진 ──────────────────────────────────
   meta 'bgPhoto' = { d: dataURL } 또는 잠금이 켜져 있으면 { sec: 암호문 }.
   일기 사진 저장소(photos)에 넣지 않는 이유: 일기 사진은 글에 딸려 있어서
   글을 지우면 같이 지워지고 백업에도 글 단위로 들어간다. 배경 사진은 글이 아니다. */
const PHOTO_KEY = 'bgPhoto';
let photoCache = null;            // 복호화된 dataURL

export async function getPhoto() {
  if (photoCache) return photoCache;
  const r = await store.metaGet(PHOTO_KEY, null);
  if (!r) return null;
  if (r.sec) {
    const k = store._key();
    if (!k) return null;                       // 잠겨 있으면 아직 못 연다 — 풀린 뒤 다시 그린다
    try { photoCache = await decryptJSON(k, r.sec); } catch { return null; }
  } else {
    photoCache = r.d || null;
  }
  return photoCache;
}

/** 사진을 저장한다. 잠금이 켜져 있으면 지금 열쇠로 싸서 넣는다 */
export async function savePhoto(dataUrl) {
  const k = store._key();
  await store.metaSet(PHOTO_KEY, k ? { sec: await encryptJSON(k, dataUrl) } : { d: dataUrl });
  photoCache = dataUrl;
}

export async function hasPhoto() { return !!(await store.metaGet(PHOTO_KEY, null)); }

export async function clearPhoto() {
  await store.metaDel(PHOTO_KEY);
  photoCache = null;
}

/** 잠글 때 (열쇠를 버리기 전에) 부른다 — 화면에서 사진이 남아 보이지 않게 */
export function forgetPhotoCache() { photoCache = null; }

/* ── 그리기 ───────────────────────────────────
   <html data-bg="sea"> 와 <style id="bgVars"> 한 장으로 끝낸다.
   색표를 style 태그로 넣는 이유: html[data-theme="dark"] 블록보다 세게 걸려야 해서
   선택자를 html[data-bg][data-theme] 로 쓴다 (속성 두 개). */
let layer = null;
let styleEl = null;
let drawSeq = 0;

function ensureNodes() {
  if (!layer) {
    layer = document.createElement('div');
    layer.className = 'bg-layer';
    layer.setAttribute('aria-hidden', 'true');
    document.body.prepend(layer);
  }
  if (!styleEl) {
    styleEl = document.createElement('style');
    styleEl.id = 'bgVars';
    document.head.append(styleEl);
  }
}

function varsCss(p, surf, onAccent) {
  const s = { ...surf, ...p };
  return `html[data-bg][data-theme]{
  --bg:${s.bg}; --bg-2:${s.bg};
  --card:${s.card}; --card-2:${s.card2}; --line:${s.line}; --line-2:${s.line2};
  --ink:${s.ink}; --ink-2:${s.ink}14; --muted:${s.muted}; --muted-2:${s.muted2};
  --accent:${s.accent}; --accent-2:${s.accent2}; --accent-bg:${s.accentBg};
  ${onAccent ? `--on-accent:${onAccent};` : ''}
}`;
}

/**
 * 배경을 입힌다. applyTheme() 이 data-theme 을 정한 뒤에 부른다.
 * @param {boolean} dark 지금 어두운 모드인가
 */
export async function apply(dark) {
  const seq = ++drawSeq;
  const root = document.documentElement;
  const id = activeId();

  if (id === 'none') {
    delete root.dataset.bg;
    if (layer) layer.style.removeProperty('--bg-img');
    if (styleEl) styleEl.textContent = '';
    return;
  }
  ensureNodes();

  if (id === 'photo') {
    const url = await getPhoto();
    if (seq !== drawSeq) return;               // 그 사이 다른 배경을 골랐다
    if (!url) { delete root.dataset.bg; styleEl.textContent = ''; return; }
    const dim = Math.max(0, Math.min(70, store.getSettings().bgPhotoDim ?? 25)) / 100;
    root.dataset.bg = 'photo';
    layer.style.setProperty('--bg-img', `url("${url}")`);
    /* 내 사진은 색을 모른다 — 앱 기본 색은 그대로 두고 카드만 비치게, 막은 사용자가 고른 만큼 */
    layer.style.setProperty('--bg-veil', dark ? `rgba(8,8,10,${(dim + 0.2).toFixed(2)})` : `rgba(255,255,255,${dim.toFixed(2)})`);
    styleEl.textContent = dark
      /* 내 사진은 그림 배경보다 복잡해서(글자·사람 등) 카드를 더 진하게 깔다 — 1.5.1, 실기기에서 뒤 글자가 비쳤다 */
      ? `html[data-bg][data-theme]{ --card:rgba(24,22,19,.88); --card-2:rgba(255,255,255,.10); --line:rgba(255,255,255,.09); --line-2:rgba(255,255,255,.16); }`
      : `html[data-bg][data-theme]{ --card:rgba(255,253,249,.93); --card-2:rgba(255,255,255,.72); --line:rgba(40,30,20,.09); --line-2:rgba(40,30,20,.16); }`;
    return;
  }

  const th = byId(id);
  if (!th) { delete root.dataset.bg; styleEl.textContent = ''; return; }
  const useDark = dark || th.alwaysDark;
  root.dataset.bg = th.id;
  layer.style.setProperty('--bg-img', `url("${imageUrl(th.id)}")`);
  layer.style.setProperty('--bg-veil', useDark && !th.noVeil ? 'rgba(6,8,12,.5)' : 'transparent');
  styleEl.textContent = useDark
    ? varsCss(th.dark, DARK_SURF, null)        // 어두운 모드의 --on-accent 는 app.css 가 정한다
    : varsCss(th.light, LIGHT_SURF, '#fff');
}
