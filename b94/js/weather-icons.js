/* ===========================================================
   weather-icons.js — 날씨 그림 (시안, 2026-10-22)
   SVG 로 직접 그린 말랑한 날씨 그림. 용량이 거의 없고 크기와 상관없이 선명하다.
   · 하나짜리: 맑음·구름 조금·흐림·비·흐리고 비·소나기·눈·비와 눈·천둥번개·안개
   · 바뀐 날: "맑다가 흐림"처럼 앞·뒤 그림을 화살표로 잇는다 (가로로 긴 그림)
   =========================================================== */

let uid = 0;

function defs(id) {
  return `<defs>
    <radialGradient id="sun${id}" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#FFF1A8"/><stop offset=".55" stop-color="#FFD35C"/><stop offset="1" stop-color="#FFAE3D"/></radialGradient>
    <linearGradient id="cl${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#DCE5F1"/></linearGradient>
    <linearGradient id="cd${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9D1DE"/><stop offset="1" stop-color="#97A3B7"/></linearGradient>
    <linearGradient id="dr${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#9AD6FF"/><stop offset="1" stop-color="#4B9BEF"/></linearGradient>
    <linearGradient id="bo${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFE36B"/><stop offset="1" stop-color="#FFAF1F"/></linearGradient>
    <filter id="sh${id}" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.4" flood-color="#5a6b85" flood-opacity=".22"/></filter>
  </defs>`;
}

/* ── 부품 ───────────────────────────── */
function sun(id, cx, cy, r) {
  let rays = '';
  for (let i = 0; i < 8; i++) {
    const a = (Math.PI / 4) * i;
    const x1 = cx + Math.cos(a) * (r + 4.5), y1 = cy + Math.sin(a) * (r + 4.5);
    const x2 = cx + Math.cos(a) * (r + 9), y2 = cy + Math.sin(a) * (r + 9);
    rays += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"/>`;
  }
  return `<g stroke="#FFC24D" stroke-width="3.6" stroke-linecap="round">${rays}</g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#sun${id})" filter="url(#sh${id})"/>
    <ellipse cx="${cx - r * .35}" cy="${cy - r * .42}" rx="${r * .38}" ry="${r * .22}" fill="#fff" opacity=".55" transform="rotate(-25 ${cx - r * .35} ${cy - r * .42})"/>`;
}
/** 구름: (x,y) 가 왼쪽 위, s 는 배율(1 = 폭 44) */
function cloud(id, x, y, s, dark = false) {
  const p = 'M10 28H34A10 10 0 0 0 35.5 8.2A13 13 0 0 0 11 9A9.5 9.5 0 0 0 10 28Z';
  const hl = dark ? '' : `<path d="M13 12a9 9 0 0 1 9-6" fill="none" stroke="#fff" stroke-width="2.6" stroke-linecap="round" opacity=".9"/>`;
  return `<g transform="translate(${x} ${y}) scale(${s})" filter="url(#sh${id})">
    <path d="${p}" fill="url(#${dark ? 'cd' : 'cl'}${id})" stroke="${dark ? '#8a96aa' : '#c9d5e5'}" stroke-width="1"/>${hl}</g>`;
}
function drop(id, x, y, s = 1) {
  return `<path transform="translate(${x} ${y}) scale(${s})" d="M0-5C2.6-1.6 3.6.6 3.6 2.2A3.6 3.6 0 0 1-3.6 2.2C-3.6.6-2.6-1.6 0-5Z" fill="url(#dr${id})"/>`;
}
function flake(x, y, s = 1) {
  return `<g transform="translate(${x} ${y}) scale(${s})" stroke="#9cc3ea" stroke-width="1.5" stroke-linecap="round">
    <line x1="0" y1="-4" x2="0" y2="4"/><line x1="-3.5" y1="-2" x2="3.5" y2="2"/><line x1="-3.5" y1="2" x2="3.5" y2="-2"/></g>
    <circle cx="${x}" cy="${y}" r="${1.6 * s}" fill="#fff" stroke="#9cc3ea" stroke-width="1"/>`;
}
function bolt(id, x, y) {
  return `<path transform="translate(${x} ${y})" d="M6 0L0 11H5L2 20L11 7H6L9 0Z" fill="url(#bo${id})" stroke="#e69a12" stroke-width=".8" stroke-linejoin="round"/>`;
}
function fogLines(y) {
  return `<g stroke="#b7c3d4" stroke-width="3" stroke-linecap="round"><line x1="12" y1="${y}" x2="46" y2="${y}"/><line x1="18" y1="${y + 6}" x2="52" y2="${y + 6}"/><line x1="14" y1="${y + 12}" x2="40" y2="${y + 12}"/></g>`;
}

/* ── 날씨 한 가지 (64×64 안에 그린다) ─────────── */
const DRAW = {
  clear: (id) => sun(id, 32, 32, 14),
  partly: (id) => sun(id, 24, 23, 11) + cloud(id, 15, 24, 1.1),
  cloudy: (id) => cloud(id, 3, 8, 0.85, true) + cloud(id, 11, 20, 1.15),
  rain: (id) => cloud(id, 6, 3, 1.18) + drop(id, 19, 48, 1.3) + drop(id, 32, 53, 1.3) + drop(id, 45, 48, 1.3),
  cloudrain: (id) => cloud(id, 6, 3, 1.18, true) + drop(id, 19, 48, 1.3) + drop(id, 32, 53, 1.3) + drop(id, 45, 48, 1.3),
  shower: (id) => sun(id, 21, 19, 9.5) + cloud(id, 13, 15, 1.1) + drop(id, 27, 52, 1.25) + drop(id, 41, 55, 1.25),
  snow: (id) => cloud(id, 6, 3, 1.18) + flake(19, 49, 1.35) + flake(32, 55, 1.35) + flake(45, 49, 1.35),
  sleet: (id) => cloud(id, 6, 3, 1.18) + drop(id, 19, 49, 1.3) + flake(32, 54, 1.35) + drop(id, 45, 49, 1.3),
  thunder: (id) => cloud(id, 6, 2, 1.18, true) + bolt(id, 26, 35) + drop(id, 15, 49, 1.1) + drop(id, 49, 49, 1.1),
  fog: (id) => cloud(id, 7, 2, 1.12) + fogLines(42),
};
export const KINDS = {
  clear: '맑음', partly: '구름 조금', cloudy: '흐림', rain: '비', cloudrain: '흐리고 비', shower: '소나기',
  snow: '눈', sleet: '비와 눈', thunder: '천둥번개', fog: '안개',
};

/** 날씨 그림 하나. kind 가 'a>b' 이면 바뀐 날(앞→뒤)로 그린다 */
export function wxSvg(kind, size = 40) {
  const id = 'w' + (++uid);
  if (kind.includes('>')) {
    const [a, b] = kind.split('>');
    const h = size, w = Math.round(size * 1.75);
    return `<svg class="wx-ico wx-two" viewBox="0 0 112 64" width="${w}" height="${h}" aria-hidden="true">${defs(id)}
      <g transform="translate(0 6) scale(.82)">${DRAW[a](id)}</g>
      <path d="M52 32h7m-3-3.5 3.5 3.5-3.5 3.5" fill="none" stroke="#c08a63" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
      <g transform="translate(60 2) scale(.9)">${DRAW[b](id)}</g></svg>`;
  }
  return `<svg class="wx-ico" viewBox="0 0 64 64" width="${size}" height="${size}" aria-hidden="true">${defs(id)}${DRAW[kind](id)}</svg>`;
}

/** 이름: 'clear>cloudy' → '맑다가 흐림' */
const FROM = { clear: '맑다가', partly: '구름 조금 끼다가', cloudy: '흐리다가', rain: '비 오다가', cloudrain: '비 오다가', shower: '소나기 오다가', snow: '눈 오다가', sleet: '진눈깨비 오다가', thunder: '천둥 치다가', fog: '안개 끼다가' };
const TO = { clear: '갬', partly: '구름 조금', cloudy: '흐림', rain: '비', cloudrain: '비', shower: '소나기', snow: '눈', sleet: '비와 눈', thunder: '천둥번개', fog: '안개' };
export function wxName(kind) {
  if (!kind.includes('>')) return KINDS[kind];
  const [a, b] = kind.split('>');
  if (b === 'clear') return ({ partly: '구름 걷히고 맑음', cloudy: '흐리다 갬', fog: '안개 걷힌', snow: '눈 온 뒤 갬', sleet: '눈비 온 뒤 갬' })[a] || '비 온 뒤 갬';
  return `${FROM[a]} ${TO[b]}`;
}
