import { t } from './i18n.js';
/* ===========================================================
   ics.js — 일정을 .ics(iCalendar) 파일로 내보낸다

   구글·삼성·애플 캘린더가 전부 읽는 표준 형식이다. 계정 연동도,
   구글 클라우드 프로젝트도, 인터넷 연결도 필요 없다.
   사용자가 파일을 캘린더 앱에 넘기는 순간에만 데이터가 움직인다.
   =========================================================== */

const CRLF = '\r\n';

/** iCalendar 는 쉼표·세미콜론·역슬래시·줄바꿈을 이스케이프해야 한다. */
function esc(s) {
  return String(s ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

/** 75옥텟이 넘으면 접어야 한다. 안 접으면 캘린더 앱이 줄을 잘라먹는다. */
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 73) return line;
  const out = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {                       // 코드포인트 단위 — 한글이 깨지지 않게
    const n = new TextEncoder().encode(ch).length;
    if (len + n > 73) { out.push(cur); cur = ' '; len = 1; }
    cur += ch; len += n;
  }
  out.push(cur);
  return out.join(CRLF);
}

function stampUTC(d) {
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T`
       + `${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
/** 시간대 없는 지역 시각. 폰이 어느 나라에 있든 "3시"는 3시로 뜬다. */
function localStamp(dateKey, time) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const [hh, mm] = (time || '00:00').split(':').map(Number);
  const p = (n) => String(n).padStart(2, '0');
  return `${y}${p(m)}${p(d)}T${p(hh)}${p(mm)}00`;
}
function dateOnly(dateKey) { return dateKey.replace(/-/g, ''); }
function addDay(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}${p(dt.getMonth() + 1)}${p(dt.getDate())}`;
}

const RRULE = {
  daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY',
  monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY',
};

/**
 * 일정 목록 → .ics 문자열
 * @param {Array} plans plans.js 의 일정 객체들
 */
export function build(plans, { now = new Date() } = {}) {
  const L = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Harukan//Plans//KO',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ];
  for (const p of plans) {
    L.push('BEGIN:VEVENT');
    L.push(`UID:${p.id}@harukan.app`);
    L.push(`DTSTAMP:${stampUTC(now)}`);
    if (p.time) {
      L.push(`DTSTART:${localStamp(p.date, p.time)}`);
      // 길이를 안 받으므로 1시간짜리로 둔다 — 캘린더가 0분짜리를 이상하게 그리는 걸 피한다
      const [hh, mm] = p.time.split(':').map(Number);
      const end = `${String((hh + 1) % 24).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
      L.push(`DTEND:${localStamp(hh + 1 >= 24 ? addDayKey(p.date) : p.date, end)}`);
    } else {
      L.push(`DTSTART;VALUE=DATE:${dateOnly(p.date)}`);
      L.push(`DTEND;VALUE=DATE:${addDay(p.date)}`);      // 종일 일정은 끝이 다음 날이다
    }
    L.push(fold(`SUMMARY:${esc(p.title || t('(제목 없음)'))}`));
    if (p.memo) L.push(fold(`DESCRIPTION:${esc(p.memo)}`));
    if (p.repeat && RRULE[p.repeat]) L.push(`RRULE:${RRULE[p.repeat]}`);
    if (p.done) L.push('STATUS:COMPLETED');
    if (p.remindMin != null && p.time) {
      L.push('BEGIN:VALARM', 'ACTION:DISPLAY',
        fold(`DESCRIPTION:${esc(p.title || '')}`),
        `TRIGGER:-PT${p.remindMin}M`, 'END:VALARM');
    }
    L.push('END:VEVENT');
  }
  L.push('END:VCALENDAR');
  return L.join(CRLF) + CRLF;
}

function addDayKey(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
