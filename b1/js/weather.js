/* ===========================================================
   weather.js — 일기에 그날 날씨 붙이기 (1.7.2, 사용자 요청)
   · 일기를 쓰는 시각에 폰의 '대략적인 위치'(Locate 플러그인)로 Open-Meteo 에서 그날 시간별 날씨를 받는다.
     (가입·키 없는 무료 날씨 서비스. 좌표는 소수 둘째 자리 ≈ 1km 로 줄여서 보낸다.)
   · 아침(6~12시)과 쓰는 시각 무렵(최근 3시간)을 비교해 다르면 '맑다가 흐림'처럼 'a>b' 로 남긴다.
   · 동네 이름은 폰 안의 Geocoder 가 만든다. 좌표는 저장하지 않는다.
   · 저장 모양: entry.weather = { k:'clear>cloudy', t:18, hi:21, lo:12, place:'서울 강남구', at:시각, auto:true }
     잠금을 켜면 본문처럼 암호화된다 (store SECRET_FIELDS).
   =========================================================== */

import { isNative } from './native.js';
import { t, current as lang } from './i18n.js';
import { KINDS, wxSvg } from './weather-icons.js';

export { wxSvg, KINDS };

function Locate() { try { return window.Capacitor?.Plugins?.Locate || null; } catch { return null; } }
export function available() {
  try { return isNative() && !!window.Capacitor?.isPluginAvailable?.('Locate'); } catch { return false; }
}

/* ── 권한 ───────────────────────────── */
export async function permState() {
  if (!available()) return 'unavailable';
  try { const r = await Locate().status(); return r?.location || 'prompt'; } catch { return 'prompt'; }
}
/** 위치가 켜져 있나 (폰의 위치 스위치) */
export async function locationEnabled() {
  if (!available()) return false;
  try { const r = await Locate().status(); return r?.enabled !== false; } catch { return true; }
}

/** 앱 권한 화면 · 위치 설정 화면 열기 (1.7.6) */
export async function openSettings(what = 'app') {
  if (!available()) return false;
  try { await Locate().openSettings({ what }); return true; } catch { return false; }
}

/** 마지막으로 날씨를 못 가져온 이유: perm | off | noloc | net | data */
export let lastFail = '';

export async function requestPerm() {
  if (!available()) return 'unavailable';
  try { const r = await Locate().request(); return r?.location || 'denied'; } catch { return 'denied'; }
}

/* ── 날씨 코드(WMO) → 하루칸 날씨 종류 ───── */
function kindOf(code) {
  if (code == null) return null;
  if (code <= 1) return 'clear';
  if (code === 2) return 'partly';
  if (code === 3) return 'cloudy';
  if (code === 45 || code === 48) return 'fog';
  if ([51, 53, 55, 61].includes(code)) return 'rain';
  if ([56, 57, 63, 65, 66, 67].includes(code)) return 'cloudrain';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'snow';
  if (code >= 80 && code <= 82) return 'shower';
  if (code >= 95) return 'thunder';
  return 'cloudy';
}
const WET = new Set(['rain', 'cloudrain', 'shower', 'thunder', 'snow', 'sleet']);
const FAMILY = { clear: 'sun', partly: 'sun', cloudy: 'cloud', fog: 'cloud', rain: 'rain', cloudrain: 'rain', shower: 'rain', snow: 'snow', sleet: 'snow', thunder: 'thunder' };

/** 몇 시간치 날씨 중 대표 하나 — 비·눈이 두 시간 넘게 왔으면 그쪽, 아니면 가장 많은 하늘 */
function dominant(kinds) {
  const ks = kinds.filter(Boolean);
  if (!ks.length) return null;
  const cnt = {};
  for (const k of ks) cnt[k] = (cnt[k] || 0) + 1;
  if (cnt.thunder) return 'thunder';
  const snow = cnt.snow || 0, rainN = (cnt.rain || 0) + (cnt.cloudrain || 0) + (cnt.shower || 0);
  if (snow && rainN && snow + rainN >= 2) return 'sleet';
  if (snow >= Math.min(2, ks.length)) return 'snow';
  if (rainN >= Math.min(2, ks.length)) {
    if ((cnt.shower || 0) >= rainN / 2) return 'shower';
    return (cnt.cloudrain || 0) >= (cnt.rain || 0) ? 'cloudrain' : 'rain';
  }
  const sky = ['clear', 'partly', 'cloudy', 'fog'].sort((a, b) => (cnt[b] || 0) - (cnt[a] || 0));
  return cnt[sky[0]] ? sky[0] : ks[ks.length - 1];
}

/** 시간별 코드 + 쓰는 시각 → 'clear' 또는 'clear>cloudy' */
export function summarize(hourly, hourNow) {
  const at = (h) => kindOf(hourly[h]);
  const end = Math.max(0, Math.min(23, hourNow));
  const recent = dominant([at(end - 2), at(end - 1), at(end)].filter((x, i) => end - 2 + i >= 0));
  if (end < 10) return recent || at(end);
  const morning = dominant([6, 7, 8, 9, 10, 11].filter((h) => h < end - 2).map(at));
  if (!morning || !recent) return recent || morning;
  if (FAMILY[morning] === FAMILY[recent]) {
    // 같은 갈래면 하나로. 비·눈이 섞였으면 젖은 쪽을 남긴다
    return WET.has(recent) ? recent : (WET.has(morning) ? morning : recent);
  }
  return `${morning}>${recent}`;
}

/* ── 이름 (9개 언어) ─────────────────── */
const KO_FROM = { clear: '맑다가', partly: '구름 조금 끼다가', cloudy: '흐리다가', rain: '비 오다가', cloudrain: '비 오다가', shower: '소나기 오다가', snow: '눈 오다가', sleet: '진눈깨비 오다가', thunder: '천둥 치다가', fog: '안개 끼다가' };
const KO_TO = { clear: '갬', partly: '구름 조금', cloudy: '흐림', rain: '비', cloudrain: '비', shower: '소나기', snow: '눈', sleet: '비와 눈', thunder: '천둥번개', fog: '안개' };
export function nameOf(kind) {
  if (!kind) return '';
  if (!kind.includes('>')) return t(KINDS[kind] || kind);
  const [a, b] = kind.split('>');
  if (lang() === 'ko') {
    if (b === 'clear') return ({ partly: '구름 걷히고 맑음', cloudy: '흐리다 갬', fog: '안개 걷힘', snow: '눈 온 뒤 갬', sleet: '눈비 온 뒤 갬' })[a] || '비 온 뒤 갬';
    return `${KO_FROM[a]} ${KO_TO[b]}`;
  }
  const dir = document.documentElement.dir === 'rtl' ? ' ← ' : ' → ';
  return t(KINDS[a]) + dir + t(KINDS[b]);
}

/** 동네 이름: '서울 강남구' / 'Shibuya, Tokyo' */
export function placeName(r) {
  if (!r) return '';
  const short = (s) => String(s || '').replace(/(특별시|광역시|특별자치시|특별자치도)$/, '').replace(/^경기도$/, '경기');
  if (r.country === 'KR') {
    const a = short(r.admin), b = r.subLocality || r.locality || r.subAdmin || '';
    const c = (r.locality && r.subLocality && r.locality !== r.admin && !b.includes(r.locality)) ? r.locality + ' ' : '';
    return [a, c + b].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  }
  const local = r.subLocality || r.locality || r.subAdmin || '';
  const big = r.locality && r.locality !== local ? r.locality : (r.admin || '');
  return [local, big].filter(Boolean).join(', ');
}

/* ── 위치 (1.7.8) ───────────────────────
   날씨와 '일기 쓴 곳'(place.js)이 같은 자리에서 두 번 위치를 묻지 않게 90초 기억한다.
   정확한 위치를 받아 둔 게 있으면 날씨도 그것을 쓴다 (날씨 서버에는 여전히 소수 둘째 자리로 줄여 보낸다) */
let locMemo = null;     // { at, precise, loc }
export async function locate({ precise = false } = {}) {
  if (locMemo && Date.now() - locMemo.at < 90000 && (locMemo.precise || !precise)) return locMemo.loc;
  const loc = await Locate().get({ lang: lang() || 'ko', precise, timeoutMs: precise ? 20000 : 15000 });
  if (loc && loc.lat != null) locMemo = { at: Date.now(), precise, loc };
  return loc;
}

/* ── 가져오기 ─────────────────────────── */
function ymd(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }

async function fetchJSON(url, ms = 9000) {
  const ac = new AbortController();
  const tm = setTimeout(() => ac.abort(), ms);
  try { const r = await fetch(url, { signal: ac.signal }); if (!r.ok) throw new Error('HTTP ' + r.status); return await r.json(); }
  finally { clearTimeout(tm); }
}

/**
 * dateKey(YYYY-MM-DD) 날 날씨. 오늘이면 지금 시각까지, 지난날이면 저녁 8시 기준으로 요약한다.
 * 실패하면 null (인터넷·위치가 없으면 그냥 날씨 없이 쓴다)
 */
export async function fetchFor(dateKey, { now = new Date() } = {}) {
  if (!available()) return null;
  lastFail = '';
  if ((await permState()) !== 'granted') { lastFail = 'perm'; return null; }
  let loc;
  try { loc = await locate({ precise: false }); }
  catch (e) { lastFail = String(e?.code || e?.message || '').includes('OFF') ? 'off' : 'noloc'; return null; }
  if (!loc || loc.lat == null) { lastFail = 'noloc'; return null; }
  const lat = Number(loc.lat).toFixed(2), lon = Number(loc.lon).toFixed(2);
  const today = ymd(now);
  const isToday = dateKey === today;
  const daysAgo = Math.round((new Date(today) - new Date(dateKey)) / 86400000);
  if (daysAgo < 0) return null;                       // 앞날 일기에는 붙이지 않는다
  const base = daysAgo <= 80 ? 'https://api.open-meteo.com/v1/forecast' : 'https://archive-api.open-meteo.com/v1/archive';
  const url = `${base}?latitude=${lat}&longitude=${lon}&hourly=weather_code,temperature_2m&daily=temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${dateKey}&end_date=${dateKey}`;
  let j;
  try { j = await fetchJSON(url); } catch { lastFail = 'net'; return null; }
  const codes = j?.hourly?.weather_code, temps = j?.hourly?.temperature_2m;
  if (!Array.isArray(codes) || codes.length < 24) { lastFail = 'data'; return null; }
  const hour = isToday ? now.getHours() : 20;
  const k = summarize(codes, hour);
  if (!k) return null;
  const r1 = (x) => (x == null || Number.isNaN(Number(x)) ? null : Math.round(Number(x)));
  return {
    k,
    t: isToday ? r1(temps?.[hour]) : null,
    hi: r1(j?.daily?.temperature_2m_max?.[0]),
    lo: r1(j?.daily?.temperature_2m_min?.[0]),
    place: placeName(loc),
    at: Date.now(),
    auto: true,
  };
}

/* ── 화면 조각 ─────────────────────────── */
export function tempText(w) {
  if (!w) return '';
  const parts = [];
  if (w.t != null) parts.push(t('쓸 때 {n}°', { n: w.t }));
  if (w.hi != null && w.lo != null) parts.push(t('최고 {hi}° / 최저 {lo}°', { hi: w.hi, lo: w.lo }));
  return parts.join(' · ');
}
