/* ===========================================================
   i18n.js — 다국어
   설계:
   · 한국어 원문이 곧 키다. t('설정') → 현재 언어 사전에서 찾고,
     없으면 원문(한국어)을 그대로 돌려준다. ko 는 사전이 필요 없다.
   · 저장되는 데이터(칩 등)는 언제나 한국어 원형 — 화면에 그릴 때만 번역한다.
     그래서 언어를 바꿔도 과거 기록이 깨지지 않는다.
   · 날짜·숫자는 사전이 아니라 Intl 로 그 언어답게 그린다.
   · 아랍어는 RTL — 언어 적용 때 문서 방향까지 바꾼다.
   =========================================================== */

export const LANGS = [
  { code: 'auto', name: '' },                 // 시스템 언어 따라가기
  { code: 'ko', name: '한국어' },
  { code: 'en', name: 'English' },
  { code: 'ja', name: '日本語' },
  { code: 'zh', name: '中文(简体)' },
  { code: 'es', name: 'Español' },
  { code: 'pt', name: 'Português' },
  { code: 'de', name: 'Deutsch' },
  { code: 'fr', name: 'Français' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'pl', name: 'Polski' },
  { code: 'th', name: 'ไทย' },
  { code: 'ar', name: 'العربية' },
  { code: 'tr', name: 'Türkçe' },
];

const RTL = new Set(['ar']);
/** Intl 에 넘길 로케일 (지역 정보까지) */
const LOCALE = { ko: 'ko-KR', en: 'en-US', ja: 'ja-JP', zh: 'zh-CN', es: 'es-ES', pt: 'pt-BR', th: 'th-TH', ar: 'ar-EG', tr: 'tr-TR',
  de: 'de-DE', fr: 'fr-FR', nl: 'nl-NL', pl: 'pl-PL' };

let lang = 'ko';
let dict = null;               // 현재 언어 사전 (ko 면 null)
const listeners = new Set();

function systemLang() {
  const n = (navigator.language || 'ko').toLowerCase();
  for (const c of ['ko', 'en', 'ja', 'zh', 'es', 'pt', 'th', 'ar', 'tr', 'de', 'fr', 'nl', 'pl']) {
    if (n.startsWith(c)) return c;
  }
  return 'en';                 // 목록에 없는 언어는 영어로
}

/** 설정값('auto' | 코드)을 실제 언어 코드로 */
export function resolve(setting) {
  return (!setting || setting === 'auto') ? systemLang() : setting;
}

/** 부팅 때, 그리고 설정에서 언어를 바꿀 때 부른다 */
export async function apply(setting) {
  lang = resolve(setting);
  dict = null;
  if (lang !== 'ko') {
    try {
      const mod = await import(`./lang/${lang}.js`);
      dict = mod.DICT || null;
    } catch (e) { console.error('언어 파일을 못 읽었어요', lang, e); }
  }
  document.documentElement.lang = lang;
  document.documentElement.dir = RTL.has(lang) ? 'rtl' : 'ltr';
  for (const fn of listeners) { try { fn(lang); } catch (e) { console.error(e); } }
}

export function current() { return lang; }
export function locale() { return LOCALE[lang] || 'en-US'; }
export function isRTL() { return RTL.has(lang); }
export function onChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

/**
 * 번역. t('설정') / t('{n}편', {n: 3})
 * 사전에 없으면 한국어 원문을 그대로 쓴다 — 빠뜨린 문장이 있어도 앱은 동작한다.
 */
export function t(key, params) {
  /* 숫자가 1이면 단수형이 따로 있는지 본다 ('{n}편|1' → "1 entry"). 영어·스페인어·포르투갈어처럼
     1일 때 낱말이 바뀌는 언어만 사전에 넣는다. 없으면 보통 형태를 쓴다 */
  let s = (dict && ((params && Number(params.n) === 1 && dict[key + '|1']) || dict[key])) || key;
  if (params) for (const [k, v] of Object.entries(params)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/* ── 날짜 ─────────────────────────────────────────
   한국어의 '9월 8일 (화)' 같은 표현을 언어마다 그 언어답게. */

export function fmtDateParts(d, { year = false, weekday = true } = {}) {
  const opts = { month: 'long', day: 'numeric' };
  if (year) opts.year = 'numeric';
  if (weekday) opts.weekday = 'short';
  try { return new Intl.DateTimeFormat(locale(), opts).format(d); }
  catch { return d.toLocaleDateString(); }
}

/**
 * '22:00' 같은 시각 문자열을 앱 언어의 표기로. 한국어 '오후 10:00', 영어 '10:00 PM',
 * 튀르키예어·포르투갈어·태국어·스페인어·일본어·중국어 '22:00'.
 * AM/PM 은 세계 공통이 아니다 — 나라마다 쓰는 방식을 따른다 (2026-10-15).
 */
export function fmtClock(hhmm) {
  if (!hhmm) return '';
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h)) return String(hhmm);
  try { return new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' }).format(new Date(2024, 0, 1, h, m || 0)); }
  catch { return String(hhmm); }
}

export function fmtTimeParts(d) {
  try { return new Intl.DateTimeFormat(locale(), { hour: 'numeric', minute: '2-digit' }).format(d); }
  catch { return d.toLocaleTimeString(); }
}

/* 달 이름. 한국어·일본어·중국어는 '10월'처럼 숫자 그대로 쓰고(사전이 '{m}월'·'{m}月'로 감싼다),
   나머지 언어는 Intl 의 달 이름을 쓴다 — 예전에는 '10. ay yazıları', 'Registros do mês 10',
   '10/2026' 처럼 숫자만 들어가 어색했다 (2026-10-14 번역 검수). */
const NUMERIC_MONTH = new Set(['ko', 'ja', 'zh']);
/** '{m}월' 자리에 넣을 값: 숫자(ko·ja·zh) 또는 그 언어의 달 이름 */
export function monthLabel(m) {
  if (NUMERIC_MONTH.has(lang)) return m;
  try { return new Intl.DateTimeFormat(locale(), { month: 'long' }).format(new Date(2024, m - 1, 1)); }
  catch { return m; }
}
/** 달력·일정 머리글 '2026년 10월' */
export function monthTitle(y, m) {
  if (NUMERIC_MONTH.has(lang)) return t('{y}년 {m}월', { y, m });
  try {
    const s = new Intl.DateTimeFormat(locale(), { year: 'numeric', month: 'long' }).format(new Date(y, m - 1, 1));
    return s.charAt(0).toLocaleUpperCase(locale()) + s.slice(1);
  } catch { return t('{y}년 {m}월', { y, m }); }
}

/** 요일 한 글자/짧은 표기 배열 (일~토) — 달력 머리글용 */
export function weekdayShort() {
  const f = new Intl.DateTimeFormat(locale(), { weekday: lang === 'ko' || lang === 'ja' || lang === 'zh' ? 'narrow' : 'short' });
  // 2023-01-01 은 일요일
  return [0, 1, 2, 3, 4, 5, 6].map((i) => f.format(new Date(2023, 0, 1 + i)));
}

/** 'N일 전' 같은 상대 표현 */
export function relDays(n) {
  if (n === 0) return t('오늘');
  if (n === 1) return t('어제');
  try {
    return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(-n, 'day');
  } catch { return t('{n}일 전', { n }); }
}
export function relWeeks(n) {
  try { return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(-n, 'week'); }
  catch { return t('{n}주 전', { n }); }
}
export function relMonths(n) {
  try { return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(-n, 'month'); }
  catch { return t('{n}개월 전', { n }); }
}
export function relYears(n) {
  try { return new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' }).format(-n, 'year'); }
  catch { return t('{n}년 전', { n }); }
}
