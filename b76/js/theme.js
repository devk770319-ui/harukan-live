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

  /* ── 동화 4종 (2026-10-31 사용자: "동화 같은 예쁜 이미지", 시안 4종 모두 승인) ──
     배경에는 소품이 없고(위는 하늘·질감, 장식은 아래쪽만) 소품은 backgrounds/deco/<id>.webp 를
     홈 인사말 오른쪽에 따로 얹는다(deco) — 폰·태블릿 세로·가로 어디서나 같은 자리·크기.
     가로가 더 긴 화면은 backgrounds/<id>_wide.webp (wide). */
  { id: 'fairycastle', name: '구름성', group: 'fairy', glass: true, icons: true, deco: true, wide: true,
    light: { ...L('#f3dbe6', '#c77fa6', '#a8668b', '#f6e3ee', '#3d2a3e', '#7a6380', '#8a7390'), glassCard: 'rgba(255,250,252,.72)', tab: 'rgba(255,244,250,.72)', ctaAlpha: 0.8 } },
  { id: 'fairyforest', name: '숲속 오두막', group: 'fairy', glass: true, icons: true, deco: true, wide: true,
    light: { ...L('#f3ead2', '#7f9a5e', '#67814a', '#e8eedb', '#33362a', '#6b6f58', '#7b7f68'), glassCard: 'rgba(255,252,244,.74)', tab: 'rgba(252,248,236,.74)', ctaAlpha: 0.8 } },
  { id: 'fairystarsea', name: '별바다', group: 'fairy', glass: true, icons: true, deco: true, wide: true, alwaysDark: true, noVeil: true,
    dark: { bg: '#14204a', ink: '#f3f1e6', muted: '#b9c0dc', muted2: '#9ba3c3', accent: '#f0d58a', accent2: '#f6e3ae', accentBg: 'rgba(240,213,138,.2)', card: 'rgba(20,30,70,.55)', tab: 'rgba(14,22,52,.62)', ctaInk: '#1a2246' } },
  { id: 'fairygarden', name: '장미 정원', group: 'fairy', glass: true, icons: true, deco: true, wide: true,
    light: { ...L('#fbecd9', '#e48a74', '#c9705b', '#fbe3db', '#3f2d26', '#7d665a', '#8d766a'), glassCard: 'rgba(255,252,247,.74)', tab: 'rgba(255,246,236,.74)', ctaAlpha: 0.8 } },

  /* ── 사계절 4종 (2026-11-02 사용자: "고급스럽고 심플한 디자인", 참고 이미지 = 감성 사진 + 단색 아이콘 + 흰 선 위젯) ──
     필름 사진 배경(가로 화면은 _wide), '오늘의 한 칸'은 흰 테두리만, 카드는 뜿연 유리,
     탭 아이콘은 그림 파일 없이 사진에서 뽑은 단색 칸 + 하얀 선 기호(seasonCss). 플러스 규칙은 다른 배경과 같다. */
  { id: 'seasonsummer', name: '여름 해변', group: 'season', wide: true,
    simple: { tiles: ['#e6dfd5', '#aab4c2', '#d8cab7', '#b7c1cb', '#cdc4b9'], plus: '#9eafc3' },
    light: L('#e9e4de', '#7f93a8', '#6a7f95', '#e3e8ee', '#2f3640', '#55606c', '#66717d') },
  { id: 'seasonspring', name: '봄 벚꽃길', group: 'season', wide: true,
    simple: { tiles: ['#efe1e2', '#d7b6be', '#e4d3cc', '#c7b1bb', '#ede3de'], plus: '#d1a4b1' },
    light: L('#efe3e3', '#b47e8d', '#9c6877', '#f3e3e7', '#3a2e33', '#64555b', '#74656b') },
  { id: 'seasonautumn', name: '가을 억새', group: 'season', wide: true,
    simple: { tiles: ['#eae0cf', '#cbb696', '#e0d1b9', '#b7a283', '#d6c8b1'], plus: '#bc9f76' },
    light: L('#ebe2d2', '#9a7c52', '#82663f', '#efe5d4', '#352e24', '#5e5546', '#6e6556') },
  { id: 'seasonwinter', name: '겨울 호수', group: 'season', wide: true,
    simple: { tiles: ['#e7ecf0', '#b7c2cd', '#d3dbe2', '#a5b2bf', '#cdd4da'], plus: '#9aabbd' },
    light: L('#e6ebf0', '#77889b', '#627385', '#e2e8ee', '#2b323a', '#525c66', '#626c76') },

  /* ── 새 테마 6종 (2026-11-04 사용자: 큐티·러블리 / 아늑한 일러스트 / 사람들이 가장 좋아하는 이미지(고양이·구름·꽃·분홍)) ──
     동화와 같은 구조: 소품 없는 배경(+가로 _wide) + 홈 인사말 옆 소품(deco) + 같은 소재 탭 아이콘(38px). */
  { id: 'lovelystrawberry', name: '딸기우유', group: 'lovely', glass: true, icons: true, bigIcons: true, deco: true, wide: true,
    light: { ...L('#fbe3e6', '#e78ca2', '#cf6f87', '#fbe4ea', '#4a2a33', '#8a5d6a', '#9a6d7a'), glassCard: 'rgba(255,250,251,.74)', tab: 'rgba(255,240,244,.74)', ctaAlpha: 0.85 } },
  { id: 'lovelyheart', name: '하트 구름', group: 'lovely', glass: true, icons: true, bigIcons: true, deco: true, wide: true,
    light: { ...L('#eadff6', '#b58ad8', '#9a6fc0', '#efe6f8', '#3e2f52', '#75668c', '#85769c'), glassCard: 'rgba(255,252,255,.70)', tab: 'rgba(248,242,255,.72)', ctaAlpha: 0.85 } },
  { id: 'cozyrain', name: '비 오는 창가', group: 'cozy', glass: true, icons: true, bigIcons: true, deco: true, wide: true, alwaysDark: true, noVeil: true,
    dark: { bg: '#1d2a4a', ink: '#f5efe3', muted: '#c3c6d6', muted2: '#a5a9bd', accent: '#f0b96a', accent2: '#f5cf92', accentBg: 'rgba(240,185,106,.2)', card: 'rgba(26,36,64,.60)', tab: 'rgba(18,26,48,.62)', ctaInk: '#2a2218' } },
  { id: 'cozyfire', name: '겨울 벽난로', group: 'cozy', glass: true, icons: true, bigIcons: true, deco: true, wide: true,
    light: { ...L('#f6e7cf', '#c2484a', '#a53a3c', '#f6e0dc', '#3e2a1e', '#7a604d', '#8a705d'), glassCard: 'rgba(255,250,242,.76)', tab: 'rgba(253,244,230,.76)', ctaAlpha: 0.88 } },
  { id: 'catcloud', name: '구름 고양이', group: 'cat', glass: true, icons: true, bigIcons: true, deco: true, wide: true,
    light: { ...L('#f3e3ea', '#7fa3d9', '#6589c2', '#e4ecf8', '#3a3550', '#6f6a88', '#7f7a98'), glassCard: 'rgba(255,255,255,.66)', tab: 'rgba(255,255,255,.55)', ctaAlpha: 0.85 } },
  { id: 'catflower', name: '꽃밭 고양이', group: 'cat', glass: true, icons: true, bigIcons: true, deco: true, wide: true,
    light: { ...L('#fbe6ea', '#e58aa8', '#cc6f8e', '#fbe4ec', '#4a2c36', '#8a6370', '#9a7380'), glassCard: 'rgba(255,252,253,.74)', tab: 'rgba(255,244,247,.74)', ctaAlpha: 0.85 } },
  /* ── 꽃과 하늘 5종 (2026-11-11 사용자 '수채화 느낌 2·5번, 수채화 뺀 1·2·10번을 테스트폰에', 배경 담당 세션 전달, 시험판) ──
     그림은 아래쪽만 장식(위는 하늘). 소품·전용 탭 아이콘 없음(탭 아이콘은 '아래 탭 아이콘' 고른 것 그대로).
     FM 3장은 위 하늘이 진한 보라라 홈 인사말을 흰 글자로(greetWhite). */
  { id: 'flowerballoon', name: '하트 풍선', group: 'flower', glass: true, bottom: true,
    light: { ...L('#f6e6f0', '#c77fb3', '#a8669a', '#f6e3f0', '#3f2a44', '#7a6381', '#8a7391'), glassCard: 'rgba(255,252,255,.70)', tab: 'rgba(252,244,252,.72)', ctaAlpha: 0.85 } },
  { id: 'flowercosmoswc', name: '코스모스 수채', group: 'flower', glass: true, bottom: true,
    light: { ...L('#f7e7ef', '#d27fa6', '#b5668d', '#f8e4ee', '#422a3a', '#7d6375', '#8d7385'), glassCard: 'rgba(255,252,254,.72)', tab: 'rgba(253,244,249,.72)', ctaAlpha: 0.85 } },
  { id: 'flowercosmos', name: '코스모스 들판', group: 'flower', glass: true, bottom: true, greetWhite: true,
    light: { ...L('#f3dbe8', '#c46a9c', '#a75584', '#f6e0ee', '#3e2440', '#76597a', '#86698a'), glassCard: 'rgba(255,250,253,.74)', tab: 'rgba(250,238,246,.76)', ctaAlpha: 0.88 } },
  { id: 'flowertulip', name: '튤립 들판', group: 'flower', glass: true, bottom: true, greetWhite: true,
    light: { ...L('#ecdcf2', '#a77ccf', '#8c63b5', '#efe4f8', '#36284a', '#6f6286', '#7f7296'), glassCard: 'rgba(253,250,255,.74)', tab: 'rgba(244,238,252,.76)', ctaAlpha: 0.88 } },
  { id: 'flowerpetals', name: '꽃잎 바람', group: 'flower', glass: true, bottom: true, greetWhite: true,
    light: { ...L('#f4dde6', '#c9708f', '#ad5a78', '#f7e2ea', '#40263a', '#7a5c70', '#8a6c80'), glassCard: 'rgba(255,251,252,.74)', tab: 'rgba(250,238,243,.76)', ctaAlpha: 0.88 } },
  /* ── 파스텔 정원 7종 (2026-11-12 사용자 '채도를 2단계 올린 그 이미지에서 1,2,3,5,7,8,10 배경도 함께 패치로', 배경 담당 세션 전달) — 밝은 수채, 그림은 아래쪽 ── */
  { id: 'pastelbasket', name: '장미 꽃바구니', group: 'pastel', glass: true, bottom: true,
    light: { ...L('#fbeef0', '#d37f98', '#b8667f', '#fbe6ec', '#43303a', '#7e6670', '#8e7680'), glassCard: 'rgba(255,252,252,.74)', tab: 'rgba(255,246,248,.76)', ctaAlpha: 0.85 } },
  { id: 'pastelballoon', name: '하트 풍선 구름', group: 'pastel', glass: true, bottom: true,
    light: { ...L('#fbeef0', '#d37f98', '#b8667f', '#fbe6ec', '#43303a', '#7e6670', '#8e7680'), glassCard: 'rgba(255,252,252,.74)', tab: 'rgba(255,246,248,.76)', ctaAlpha: 0.85 } },
  { id: 'pastelpicnic', name: '피크닉', group: 'pastel', glass: true, bottom: true,
    light: { ...L('#fbeef0', '#d37f98', '#b8667f', '#fbe6ec', '#43303a', '#7e6670', '#8e7680'), glassCard: 'rgba(255,252,252,.74)', tab: 'rgba(255,246,248,.76)', ctaAlpha: 0.85 } },
  { id: 'pastelclouds', name: '분홍 구름', group: 'pastel', glass: true, bottom: true,
    light: { ...L('#fbeef0', '#d37f98', '#b8667f', '#fbe6ec', '#43303a', '#7e6670', '#8e7680'), glassCard: 'rgba(255,252,252,.74)', tab: 'rgba(255,246,248,.76)', ctaAlpha: 0.85 } },
  { id: 'pastelmeadow', name: '들꽃 들판', group: 'pastel', glass: true, bottom: true,
    light: { ...L('#fbeef0', '#d37f98', '#b8667f', '#fbe6ec', '#43303a', '#7e6670', '#8e7680'), glassCard: 'rgba(255,252,252,.74)', tab: 'rgba(255,246,248,.76)', ctaAlpha: 0.85 } },
  { id: 'pastelwindow', name: '창가 튤립', group: 'pastel', glass: true, bottom: true,
    light: { ...L('#fbeef0', '#d37f98', '#b8667f', '#fbe6ec', '#43303a', '#7e6670', '#8e7680'), glassCard: 'rgba(255,252,252,.74)', tab: 'rgba(255,246,248,.76)', ctaAlpha: 0.85 } },
  { id: 'pastelhill', name: '언덕 위 꽃바구니', group: 'pastel', glass: true, bottom: true,
    light: { ...L('#fbeef0', '#d37f98', '#b8667f', '#fbe6ec', '#43303a', '#7e6670', '#8e7680'), glassCard: 'rgba(255,252,252,.74)', tab: 'rgba(255,246,248,.76)', ctaAlpha: 0.85 } },
];

/* 사계절 테마 — 흰 선 위젯·뜿연 유리 카드·단색 탭 아이콘 (그림 파일 없음) */
function seasonCss(th, dark) {
  const s = th.simple;
  const sh = 'text-shadow:0 1px 10px rgba(0,0,0,.22);';
  let css = `
html[data-bg][data-theme]{ --card:${dark ? 'rgba(22,22,26,.55)' : 'rgba(255,255,255,.52)'}; --card-2:rgba(255,255,255,${dark ? '.08' : '.35'}); --line:rgba(255,255,255,${dark ? '.14' : '.55'}); }
html[data-bg] .card, html[data-bg] .eitem, html[data-bg] .stat, html[data-bg] .set-list{ -webkit-backdrop-filter:blur(20px) saturate(1.1); backdrop-filter:blur(20px) saturate(1.1);
  border:1px solid rgba(255,255,255,${dark ? '.14' : '.6'}); box-shadow:none; }
html[data-bg][data-area="home"] .topbar:not(.scrolled){ background:transparent; -webkit-backdrop-filter:none; backdrop-filter:none; }
html[data-bg][data-area="home"] .topbar:not(.scrolled) h1, html[data-bg][data-area="home"] .topbar:not(.scrolled) .icon-btn{ color:#fff; ${sh} }
html[data-bg] .greet, html[data-bg] .greet *{ color:#fff; ${sh} }
html[data-bg] .today-cta{ background:transparent; border:2px solid rgba(255,255,255,.95); box-shadow:none;
  -webkit-backdrop-filter:blur(2px); backdrop-filter:blur(2px); }
html[data-bg] .today-cta, html[data-bg] .today-cta *{ color:#fff; ${sh} }
html[data-bg][data-area="home"] .section-head, html[data-bg][data-area="home"] .section-head *{ color:#fff; ${sh} }
html[data-bg] .tabbar{ background:rgba(255,255,255,${dark ? '.08' : '.18'}); -webkit-backdrop-filter:blur(18px); backdrop-filter:blur(18px);
  border-top:1px solid rgba(255,255,255,.35); box-shadow:none; }
html[data-bg] .tab-label{ color:#fff; text-shadow:0 1px 6px rgba(0,0,0,.25); font-weight:600; }
html[data-bg] .tab-ico{ box-sizing:border-box; width:38px; height:38px; padding:9px; border-radius:11px; color:#fff; box-shadow:0 2px 8px rgba(0,0,0,.08); }
html[data-bg] .tab-ico svg{ stroke:#fff; }
html[data-bg] .write-page::before, html[data-bg] .entry-page::before{ background:${dark ? 'rgba(22,22,26,.86)' : 'rgba(255,255,255,.86)'}; }   /* 쓰기·글 보기 종이는 더 진하게 */
html[data-bg] div.empty:not(.icon-btn){ background:var(--card); border:1px solid rgba(255,255,255,${dark ? '.14' : '.6'}); border-radius:var(--radius);
  -webkit-backdrop-filter:blur(20px); backdrop-filter:blur(20px); padding:28px 18px; }   /* 사진 위 빈 안내 글이 읽히게 */
html[data-bg] .tab-write{ background:transparent; box-shadow:none; }
html[data-bg] .tab-write-plus{ background:${s.plus}; color:#fff; border-radius:15px; box-shadow:0 4px 14px rgba(0,0,0,.12); }
`;
  ['home', 'cal', 'list', 'chart', 'gear'].forEach((n, i) => { css += `html[data-bg] .tab-ico[data-i="${n}"]{ background:${s.tiles[i]}; }\n`; });
  return css;
}

/* 동화 소품·가로 배경 — 소품은 홈 인사말(.greet, 홈에만 있음) 오른쪽에 124px.
   가로가 더 긴 화면(태블릿 가로)은 넓게 그린 배경을 쓴다. 장식이 아래쪽에 있어 아래 기준으로 덮는다. */
function fairyCss(th) {
  const u = (p) => new URL(`backgrounds/${p}.webp`, document.baseURI).href;
  let css = `html[data-bg] .bg-layer{ background-position:center bottom; }\n`;
  if (th.wide) css += `@media (min-aspect-ratio: 1/1){ html[data-bg] .bg-layer{ background-image:url("${u(th.id + '_wide')}"); } }\n`;
  if (th.deco) css += `html[data-bg] .greet{ position:relative; min-height:96px; padding-right:132px; }
html[data-bg] .greet::after{ content:""; position:absolute; right:0; top:50%; transform:translateY(-55%); width:124px; height:124px;
  background:url("${u('deco/' + th.id)}") center/contain no-repeat; pointer-events:none; }\n`;
  return css;
}

/* 말랑 테마 아이콘 — 기본 선 아이콘(svg)을 숨기고 그림 아이콘을 얹는다 */
/* 동화 테마 탭 아이콘 모양 (2026-11-01 사용자: 젤리를 기본, 동화 소품과 둘 중 고르기 — 수채는 뺐다)
   style 'jelly' | 'story' 이면 backgrounds/icons/<id>_<style>_<n>.webp 를 조금 크게(38px) */
/* 플러스가 아닌 사람은 아이콘 모양도 미리보기만 (저장 안 함, 꾸미기 화면을 나가면 원래대로) — 2026-11-01 사용자 */
let stylePreview = null;
export function setIconStylePreview(v) { stylePreview = v; }
export function fairyIconStyle() { const v = stylePreview || store.getSettings().tabIconStyle; return v === 'story' ? 'story' : 'jelly'; }
function iconCss(id, style, big) {
  const sfx = style === 'jelly' || style === 'story' ? `_${style}` : '';
  const sz = sfx || big ? 38 : 32;
  const u = (n) => new URL(`backgrounds/icons/${id}${sfx}_${n}.webp`, document.baseURI).href;
  let css = '';
  for (const n of ['home', 'cal', 'list', 'chart', 'gear']) {
    css += `html[data-bg] .tab-ico[data-i="${n}"]{ width:${sz}px; height:${sz}px; background:url("${u(n)}") center/contain no-repeat; }
 html[data-bg] .tab-ico[data-i="${n}"] svg{ display:none; }\n`;
  }
  /* contain: 태블릿에서는 + 칸이 넓어 cover 면 아이콘이 늘어난다 (2026-10-31) */
  css += `html[data-bg] .tab-write{ background:url("${u('plus')}") center/contain no-repeat !important; box-shadow:none !important; }
 html[data-bg] .tab-write-plus{ opacity:0; }\n`;
  return css;
}

/* 유리 카드 — 프리미엄 그림 위에서만. 카드를 조금 더 비치게 하고 뒤를 흐린다.
   글 쓰는 화면(write-page)은 손대지 않는다 — 읽기·쓰기가 먼저다. */
function hexRgba(h, a) {
  if (!/^#[0-9a-f]{6}$/i.test(h)) return h;
  const n = parseInt(h.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
function glassCss(p, dark) {
  const edge = dark ? 'rgba(255,255,255,.10)' : 'rgba(255,255,255,.55)';
  const card = dark ? p.card : (p.glassCard || 'rgba(255,253,249,.66)');
  return `
html[data-bg][data-theme]{ --card:${card}; }
html[data-bg] .card, html[data-bg] .eitem, html[data-bg] .set-list, html[data-bg] .stat, html[data-bg] .ps-card, html[data-bg] .notif-card{
  -webkit-backdrop-filter:blur(14px) saturate(1.2); backdrop-filter:blur(14px) saturate(1.2);
  border-color:${edge}; box-shadow:0 8px 24px rgba(0,0,0,${dark ? '.25' : '.06'}); }
html[data-bg] .today-cta{ background:${hexRgba(p.accent, p.ctaAlpha || (dark ? 0.5 : 0.72))};
  -webkit-backdrop-filter:blur(16px) saturate(1.3); backdrop-filter:blur(16px) saturate(1.3);
  border:1px solid rgba(255,255,255,.35); box-shadow:0 12px 30px ${hexRgba(p.accent, 0.28)}; }
html[data-bg] .tabbar{ background:${dark ? 'rgba(10,14,30,.55)' : hexRgba(p.bg, 0.62)};
  -webkit-backdrop-filter:blur(18px); backdrop-filter:blur(18px); border-top-color:rgba(255,255,255,.3); }
html[data-bg] .greet{ text-shadow:0 1px 10px ${dark ? 'rgba(0,0,0,.35)' : 'rgba(255,255,255,.6)'}; }`
  + (p.ctaInk ? `
html[data-bg] .today-cta{ background:${hexRgba(p.accent, 0.9)}; border-color:rgba(255,255,255,.25); box-shadow:0 12px 30px rgba(0,0,0,.3); }
html[data-bg] .today-cta, html[data-bg] .today-cta *{ color:${p.ctaInk}; }
html[data-bg] .card, html[data-bg] .eitem, html[data-bg] .stat{ -webkit-backdrop-filter:blur(16px) saturate(1.2); backdrop-filter:blur(16px) saturate(1.2); box-shadow:0 10px 28px rgba(0,0,0,.28); }
html[data-bg] .greet-date{ color:${p.muted}; }` : '')
  + (p.tab ? `
html[data-bg] .tabbar{ background:${p.tab}; }` : '')
  /* 머리글 투명·모서리 소품은 홈(인사말 옆 빈자리)에서만. 다른 화면은 그 자리에 글·카드가 와서 소품과 겹친다 (2026-10-31 사용자: '습관 화면이 화면에 맞지 않아')
     → 홈이 아닌 화면은 머리글을 원래대로 두고, 위쪽을 배경색으로 은은하게 덮어 소품을 뒤로 물린다 */
  + (p.topClear ? `
html[data-bg][data-area="home"] .topbar:not(.scrolled){ background:transparent; -webkit-backdrop-filter:none; backdrop-filter:none; }   /* 맨 위에서는 흐림도 끈다 — 흐림 경계에 소품 그림이 잘려 보였다 (2026-10-31 폰 확인) */
html[data-bg]:not([data-area="home"]) .bg-layer::before{ content:""; position:absolute; left:0; right:0; top:0; height:300px; z-index:1;
  background:linear-gradient(to bottom, ${hexRgba(p.bg, 0.92)} 0%, ${hexRgba(p.bg, 0.78)} 55%, ${hexRgba(p.bg, 0)} 100%); }` : '');
}
/* 어두운 색표가 없는 밝은 배경은 만들어 둔다 */
for (const b of BG_THEMES) if (!b.dark) b.dark = autoDark(b.light);

export function byId(id) { return BG_THEMES.find((b) => b.id === id) || null; }
/* 절대 주소로 넣는다. CSS 변수 안의 상대 주소는 그 변수를 쓰는 css/app.css 기준으로 풀려서
   css/backgrounds/… 를 찾는다 (실제로 그렇게 빈 화면이 났다) */
export function imageUrl(id) { return new URL(`backgrounds/${id}.webp`, document.baseURI).href; }

/* ── 미리보기 ─────────────────────────────────
   꾸미기 화면에서만 쓴다. null 이면 저장된 값을 그린다. */
let preview = null;               // null | 'none' | 그림 id | 'photo'
export function setPreview(v) { preview = v; if (!v) stylePreview = null; }
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
  if (th.glass) styleEl.textContent += glassCss(useDark ? { ...DARK_SURF, ...th.dark, topClear: th.topClear } : th.light, useDark);
  if (th.icons) styleEl.textContent += iconCss(th.id, th.group === 'fairy' ? fairyIconStyle() : null, th.bigIcons);
  if (th.deco || th.wide || th.bottom) styleEl.textContent += fairyCss(th);
  /* 위 하늘이 진한 배경은 홈 인사말을 흰 글자로 (꽃과 하늘, 2026-11-11). 어두운 화면은 이미 흰 글자 */
  if (th.greetWhite && !useDark) styleEl.textContent += `html[data-bg] .greet, html[data-bg] .greet *{ color:#fff !important; text-shadow:0 1px 10px rgba(40,10,50,.45) !important; }\n`
    + `html[data-bg]:not([data-area="home"]) .bg-layer::before{ content:""; position:absolute; left:0; right:0; top:0; height:48vh; z-index:1; background:linear-gradient(to bottom, ${hexRgba(th.light.bg, 0.9)} 0%, ${hexRgba(th.light.bg, 0.72)} 55%, ${hexRgba(th.light.bg, 0)} 100%); }\n`;   /* 홈 밖에서는 위 하늘을 배경색으로 덮어 제목·안내 글자가 보이게 */
  if (th.simple) styleEl.textContent += seasonCss(th, useDark);
}
