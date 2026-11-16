/* ===========================================================
   hangul.js — 한글 초성 검색 / 자모 유틸
   "ㅇㄷ" 로 "운동"을 찾을 수 있게 해주는 부분.
   국내 앱에서는 당연한 편의지만 해외 일기앱엔 대부분 없다.
   =========================================================== */

const BASE = 0xac00, LAST = 0xd7a3;
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';

/** 문자열 → 초성 문자열. 한글이 아닌 글자는 그대로 둔다. */
export function toChoseong(str) {
  let out = '';
  for (const ch of str) {
    const c = ch.codePointAt(0);
    if (c >= BASE && c <= LAST) out += CHO[Math.floor((c - BASE) / 588)];
    else out += ch;
  }
  return out;
}

/** 이 질의가 "초성만으로 이루어졌는가?" (ㄱ~ㅎ 자음 + 공백/영숫자 아님) */
export function isChoseongQuery(q) {
  const s = q.replace(/\s/g, '');
  if (s.length < 1) return false;
  for (const ch of s) if (!CHO.includes(ch)) return false;
  return true;
}

/** 한글 음절인지 */
export function isHangulSyllable(ch) {
  const c = ch.codePointAt(0);
  return c >= BASE && c <= LAST;
}

/**
 * 검색 매칭. 초성 질의면 초성 인덱스로, 아니면 일반 부분일치.
 * 대소문자 무시. 반환: 매치 시작 위치(없으면 -1)
 */
export function matchIndex(text, query) {
  if (!query) return -1;
  const q = query.trim();
  if (!q) return -1;
  if (isChoseongQuery(q)) {
    return toChoseong(text).indexOf(q.replace(/\s/g, ''));
  }
  return text.toLowerCase().indexOf(q.toLowerCase());
}

export function matches(text, query) {
  return matchIndex(text, query) >= 0;
}

/** 검색어 주변을 잘라 <mark> 로 감싼 HTML 조각을 만든다 */
export function highlightExcerpt(text, query, radius = 60) {
  const i = matchIndex(text, query);
  const esc = (s) => s.replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
  if (i < 0) {
    return esc(text.slice(0, radius * 2)) + (text.length > radius * 2 ? '…' : '');
  }
  const qlen = isChoseongQuery(query) ? query.replace(/\s/g, '').length : query.trim().length;
  const start = Math.max(0, i - radius);
  const end = Math.min(text.length, i + qlen + radius);
  return (start > 0 ? '…' : '')
    + esc(text.slice(start, i))
    + '<mark>' + esc(text.slice(i, i + qlen)) + '</mark>'
    + esc(text.slice(i + qlen, end))
    + (end < text.length ? '…' : '');
}

export { CHO, JUNG };
