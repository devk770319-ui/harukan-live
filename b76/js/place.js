/* ===========================================================
   place.js — 일기 쓴 곳 (1.7.8, 사용자 요청 2026-10-25: "정확한 장소로")

   · 사용자가 '일기 쓴 장소 기록'을 켜면 새 일기를 열 때 그 자리의 정확한 위치를 일기에 남긴다.
   · 저장 모양: entry.place = { lat, lon, acc(m), name:'인천 서구', addr:'청라동 123-4', at, auto, approx? }
     일기와 함께 이 폰에만 저장하고, 잠금을 켜면 본문처럼 암호화된다 (store SECRET_FIELDS).
     개발자 서버로 보내지 않는다. 주소는 폰 안의 Geocoder 가 만든다.
   · 안드로이드 12+ 권한 창에서 '대략'을 고르면 대략 위치(수백 m~수 km)로 남기고 approx 표시를 한다.
   · 지난 일기(좌표 없이 날씨의 동네 이름만 있는 글)는 지도에서 동네 이름으로 대략 위치를 찾아
     연한 핀으로 보여 준다 (geoName). 이때만 동네 이름을 Open-Meteo 위치 검색으로 보낸다.
   =========================================================== */
import * as wx from './weather.js';
import { current as lang } from './i18n.js';

function Locate() { try { return window.Capacitor?.Plugins?.Locate || null; } catch { return null; } }
export function available() { return wx.available(); }

/** 'granted' | 'approx'(대략만 허용) | 'denied' | 'prompt' | 'unavailable' */
export async function permState() {
  if (!available()) return 'unavailable';
  try {
    const r = await Locate().status();
    if (r?.precise === 'granted') return 'granted';
    if (r?.location === 'granted') return 'approx';
    return r?.precise || r?.location || 'prompt';
  } catch { return 'prompt'; }
}

export async function requestPerm() {
  if (!available()) return 'unavailable';
  try { await Locate().requestPrecise(); } catch {}
  return permState();
}

/** 좌표를 짧게: 소수 다섯째 자리 ≈ 1m */
const r5 = (x) => Math.round(Number(x) * 1e5) / 1e5;

/** 주소 한 줄 → 짧은 주소 ('대한민국 인천광역시 서구 청라동 123-4' → '청라동 123-4') */
function shortAddr(loc) {
  if (!loc) return '';
  if (loc.country === 'KR') {
    /* '대한민국 인천광역시 서구 청라동 자이더테라스2단지(209동)' → '청라동 자이더테라스2단지(209동)'
       시·도·구 이름(name 에 이미 있는 것)은 뺀다 */
    const drop = new Set(['대한민국', loc.admin, loc.subAdmin, loc.locality].filter(Boolean));
    const parts = String(loc.line || '').split(/\s+/).filter((p) => p && !drop.has(p) && !/(특별시|광역시|특별자치시|특별자치도|^[가-힣]+도)$/.test(p) && !/^[가-힣]+(시|군|구)$/.test(p));
    const s = parts.join(' ').trim();
    if (s) return s;
    return [loc.subLocality, loc.thoroughfare, loc.subThoroughfare].filter(Boolean).join(' ');
  }
  const street = [loc.subThoroughfare, loc.thoroughfare].filter(Boolean).join(' ');
  return loc.premises || street || loc.feature || '';
}

export function fromLoc(loc, { precise = true } = {}) {
  if (!loc || loc.lat == null) return null;
  const acc = loc.acc != null ? Number(loc.acc) : null;
  const approx = !precise || (acc != null && acc > 300);
  return {
    lat: r5(loc.lat), lon: r5(loc.lon),
    acc,
    name: wx.placeName(loc),
    addr: approx ? '' : shortAddr(loc),
    at: Date.now(),
    auto: true,
    ...(approx ? { approx: true } : {}),
  };
}

/** 지금 있는 곳. 권한이 없으면 null */
export async function capture() {
  const st = await permState();
  if (st !== 'granted' && st !== 'approx') return null;
  try {
    const loc = await wx.locate({ precise: st === 'granted' });
    return fromLoc(loc, { precise: st === 'granted' });
  } catch { return null; }
}

/** 화면에 보일 이름: '청라동 123-4' 또는 '인천 서구' */
export function label(p) {
  if (!p) return '';
  return p.addr || p.name || `${p.lat?.toFixed?.(4)}, ${p.lon?.toFixed?.(4)}`;
}
export function fullLabel(p) {
  if (!p) return '';
  return [p.name, p.addr].filter(Boolean).join(' ');
}

/* ── 지난 일기: 동네 이름 → 대략 위치 (지도 화면에서만, 결과는 이 폰에 기억) ── */
const GEO_KEY = 'hk.geoNames';
function geoCache() { try { return JSON.parse(localStorage.getItem(GEO_KEY) || '{}'); } catch { return {}; } }
function geoSave(c) { try { localStorage.setItem(GEO_KEY, JSON.stringify(c)); } catch {} }
export function geoCached(name) { const v = geoCache()[name]; return Array.isArray(v) ? { lat: v[0], lon: v[1] } : null; }

/** '인천 서구' 를 찾는다. 못 찾으면 0 을 기억해 다시 묻지 않는다 */
export async function geoName(name) {
  if (!name) return null;
  const c = geoCache();
  if (name in c) return Array.isArray(c[name]) ? { lat: c[name][0], lon: c[name][1] } : null;
  const parts = name.split(/[\s,]+/).filter(Boolean);
  const tries = [name, parts[parts.length - 1], parts[0]].filter((x, i, a) => x && a.indexOf(x) === i);
  let hit = null;
  for (const q of tries) {
    try {
      const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=10&language=${encodeURIComponent(lang() || 'en')}&format=json`;
      const ac = new AbortController(); const tm = setTimeout(() => ac.abort(), 7000);
      const j = await fetch(url, { signal: ac.signal }).then((r) => r.json()).finally(() => clearTimeout(tm));
      const rs = j?.results || [];
      // 이름의 다른 조각(시·도)과 맞는 결과를 고른다
      const other = parts.filter((p) => p !== q);
      const pick = rs.find((r) => other.some((o) => [r.admin1, r.admin2, r.admin3].filter(Boolean).some((a) => a.includes(o) || o.includes(a)))) || (q === name ? rs[0] : null);
      if (pick) { hit = { lat: r5(pick.latitude), lon: r5(pick.longitude) }; break; }
    } catch { return null; }      // 인터넷 없음 — 기억하지 않고 다음에 다시
  }
  c[name] = hit ? [hit.lat, hit.lon] : 0;
  geoSave(c);
  return hit;
}
