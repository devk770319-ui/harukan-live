/* ===========================================================
   tabicons.js — 아래 탭 아이콘 모양 고르기 (2026-11-04 사용자:
   "버튼 디자인을 따로 선택해서 아래 아이콘만 고를 수 있게, 대신 지금 이미지 색에 맞춰 자동으로")

   · settings.tabIcons: 'theme'(기본 — 테마 그대로) | 'face'(표정) | 'sticker'(스티커) | 'animal'(동물 친구) | 'crayon'(색연필)
   · 그림 원본은 분홍 한 벌(backgrounds/tabicons/<style>_<home|cal|list|chart|gear|plus>.webp).
     지금 화면의 강조색(--accent, 배경 그림에 맞춘 색)을 읽어 canvas 로 색을 바꿔 입힌다.
       - 표정·스티커·색연필: 분홍 계열만 강조색으로 바꾸고, 하양·크림·검정(눈)은 그대로
       - 동물 친구: 아이콘마다 색이 달라서 색 전체를 같은 만큼 돌린다(분홍이 강조색이 되게)
     밝기는 그대로 두어 파스텔 느낌을 지킨다. 강조색이 흐린 테마(겨울 호수 등)는 채도도 같이 낮춘다.
   · 배경 꾸미기와 같은 규칙(plus.canUseBackground). 플러스가 아니면 꾸미기 화면 안에서만 미리보기.
   · 배경이 바뀔 때마다 app.applyTheme() 이 theme.apply() 다음에 apply() 를 부른다.
   =========================================================== */
import * as store from './store.js';
import * as plus from './plus.js';

export const STYLES = ['theme', 'face', 'sticker', 'animal', 'crayon'];
const NAMES = ['home', 'cal', 'list', 'chart', 'gear', 'plus'];
const MODE = { face: 'mono', sticker: 'mono', crayon: 'mono', animal: 'rotate' };
const BASE_HUE = 345;              // 원본 분홍의 색상각

let preview = null;                // 꾸미기 화면 미리보기 (플러스가 아닌 사람)
export function setPreview(v) { preview = v; }
export function previewing() { return preview; }
/** 지금 그릴 모양 (권한까지 따져서) */
export function current() {
  if (preview) return preview;
  const v = store.getSettings().tabIcons;
  return STYLES.includes(v) && v !== 'theme' && plus.canUseBackground() ? v : 'theme';
}
/** 저장된 모양 (꾸미기 화면 선택 표시용) */
export function saved() { const v = store.getSettings().tabIcons; return STYLES.includes(v) ? v : 'theme'; }

/* ── 색 계산 ───────────────────────────────── */
function rgbToHsl(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), l = (mx + mn) / 2;
  if (mx === mn) return [0, 0, l];
  const d = mx - mn, s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
  let h = mx === r ? (g - b) / d + (g < b ? 6 : 0) : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360 / 360;
  if (s === 0) { const v = Math.round(l * 255); return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { t = (t + 1) % 1; return t < 1 / 6 ? p + (q - p) * 6 * t : t < 1 / 2 ? q : t < 2 / 3 ? p + (q - p) * (2 / 3 - t) * 6 : p; };
  return [Math.round(f(h + 1 / 3) * 255), Math.round(f(h) * 255), Math.round(f(h - 1 / 3) * 255)];
}
function parseColor(c) {
  c = String(c || '').trim();
  let m = c.match(/^#([0-9a-f]{3})$/i);
  if (m) return m[1].split('').map((x) => parseInt(x + x, 16));
  m = c.match(/^#([0-9a-f]{6})/i);
  if (m) return [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16));
  m = c.match(/rgba?\(\s*([\d.]+)[ ,]+([\d.]+)[ ,]+([\d.]+)/i);
  if (m) return [+m[1], +m[2], +m[3]];
  return [173, 100, 54];          // 앱 기본 강조색
}
export function accentNow() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--accent');
  const [r, g, b] = parseColor(v);
  return '#' + [r, g, b].map((x) => Math.round(x).toString(16).padStart(2, '0')).join('');
}

const cache = new Map();           // 'style|#hex|name' → dataURL
function loadImg(src) {
  return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
}
async function tinted(style, n, hex) {
  const key = `${style}|${hex}|${n}`;
  if (cache.has(key)) return cache.get(key);
  const img = await loadImg(new URL(`backgrounds/tabicons/${style}_${n}.webp`, document.baseURI).href);
  const c = document.createElement('canvas');
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.drawImage(img, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  const [th, ts] = rgbToHsl(...parseColor(hex));
  const f = Math.max(0.3, Math.min(1.3, ts / 0.6));        // 강조색이 흐리면 아이콘도 흐리게
  const mono = MODE[style] === 'mono', rot = th - BASE_HUE;
  for (let i = 0; i < p.length; i += 4) {
    if (p[i + 3] < 8) continue;
    let [h, s, l] = rgbToHsl(p[i], p[i + 1], p[i + 2]);
    if (s < 0.12 || l < 0.22 || l > 0.97) continue;          // 하양·검정(눈)·회색은 그대로
    if (mono) {
      const dh = Math.abs(((h - BASE_HUE + 540) % 360) - 180);
      if (dh > 45) continue;                                 // 크림·노랑 같은 다른 색은 그대로
      h = th;
    } else h = h + rot;
    s = Math.min(1, s * f);
    const [r, gg, b] = hslToRgb(h, s, l);
    p[i] = r; p[i + 1] = gg; p[i + 2] = b;
  }
  g.putImageData(d, 0, 0);
  const url = c.toDataURL('image/png');
  cache.set(key, url);
  return url;
}
/** 꾸미기 화면 견본용: 그 모양의 아이콘(색 바꾼 것) 주소들 */
export async function sample(style, names = ['home', 'cal', 'plus']) {
  const hex = accentNow();
  return Promise.all(names.map((n) => tinted(style, n, hex)));
}

/* ── 아래 탭에 입히기 ─────────────────────────── */
let styleEl = null, seq = 0;
export async function apply() {
  const my = ++seq;
  const st = current();
  if (!styleEl) { styleEl = document.createElement('style'); styleEl.id = 'tabicons-style'; document.head.appendChild(styleEl); }
  if (st === 'theme') { styleEl.textContent = ''; return; }
  const hex = accentNow();
  let urls;
  try { urls = await Promise.all(NAMES.map((n) => tinted(st, n, hex))); } catch (e) { console.warn('탭 아이콘을 그리지 못했어요', e); return; }
  if (my !== seq) return;                                    // 그 사이 다시 바뀌었다
  let css = '';
  NAMES.slice(0, 5).forEach((n, i) => {
    css += `html body .tabbar .tab-ico[data-i="${n}"]{ width:38px !important; height:38px !important; background:url("${urls[i]}") center/contain no-repeat !important; }\n`
      + `html body .tabbar .tab-ico[data-i="${n}"] svg{ display:none !important; }\n`;
  });
  css += `html body .tabbar .tab-write{ background:url("${urls[5]}") center/contain no-repeat !important; box-shadow:none !important; }\n`
    + `html body .tabbar .tab-write-plus{ opacity:0 !important; }\n`;
  styleEl.textContent = css;
}
