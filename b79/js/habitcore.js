/* ===========================================================
   habitcore.js — 습관 계산 규칙 (순수 함수, 화면·저장 없음)
   habit-app(D:\07.newapp\habit-app) 설계서 §3.1~3.4 를 옮겼다 (2026-10-30).
   · 주기 schedule: { kind:'daily' } | { kind:'weekdays', mask } (월=bit0 … 일=bit6)
                    | { kind:'weekly', n } | { kind:'monthly', n } | { kind:'every', n }
   · 목표 goal: { kind:'check' } | { kind:'count', target } | { kind:'quantity', target, unit, step }
                | { kind:'limit', max, period:'day'|'week'|'month' }
   · 기록 log: { 'YYYY-MM-DD': 숫자 | 'skip' }
   · 주는 월요일에 시작한다.
   =========================================================== */

export const DAY = 86400000;

export function keyOf(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dateOf(k) { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); }
export function addDays(k, n) { const d = dateOf(k); d.setDate(d.getDate() + n); return keyOf(d); }
export function diffDays(a, b) { return Math.round((dateOf(b) - dateOf(a)) / DAY); }   // b - a
/** 월=0 … 일=6 */
export function weekdayIdx(k) { return (dateOf(k).getDay() + 6) % 7; }
export function weekStart(k) { return addDays(k, -weekdayIdx(k)); }
export function monthStart(k) { return k.slice(0, 8) + '01'; }
function monthEnd(k) { const d = dateOf(monthStart(k)); d.setMonth(d.getMonth() + 1); d.setDate(0); return keyOf(d); }

function inRange(h, k) { return k >= (h.start || '0000-00-00') && (!h.end || k <= h.end); }
export function isSkip(h, k) { return h.log?.[k] === 'skip'; }
export function valueOn(h, k) { const v = h.log?.[k]; return typeof v === 'number' ? v : 0; }

/** 그날 하루 목표를 채웠나 (limit 은 하루 기준이 아니라 기간 기준 — periodOk 참고) */
export function dayDone(h, k) {
  const v = valueOn(h, k);
  const g = h.goal || { kind: 'check' };
  if (g.kind === 'count' || g.kind === 'quantity') return v >= (g.target || 1);
  if (g.kind === 'limit') return false;
  return v >= 1;
}

/** 일 단위 습관: 그날 해야 하는 날인가 */
export function scheduledOn(h, k) {
  if (!inRange(h, k)) return false;
  const s = h.schedule || { kind: 'daily' };
  if (h.goal?.kind === 'limit') return true;
  switch (s.kind) {
    case 'weekdays': return !!((s.mask || 0) & (1 << weekdayIdx(k)));
    case 'every': return diffDays(h.start || k, k) % Math.max(2, s.n || 2) === 0;
    default: return true;   // daily · weekly · monthly 는 매일 보인다
  }
}

/** 이 습관의 평가 단위: 'day' | 'week' | 'month' */
export function unitOf(h) {
  if (h.goal?.kind === 'limit') return h.goal.period || 'day';
  const k = h.schedule?.kind;
  return k === 'weekly' ? 'week' : k === 'monthly' ? 'month' : 'day';
}

/** k 가 속한 기간 [시작, 끝] */
export function periodOf(h, k) {
  const u = unitOf(h);
  if (u === 'week') { const s = weekStart(k); return [s, addDays(s, 6)]; }
  if (u === 'month') return [monthStart(k), monthEnd(k)];
  return [k, k];
}

function eachDay(a, b, fn) { for (let k = a; k <= b; k = addDays(k, 1)) fn(k); }

/** 기간 진행: { done, need, total(limit 합), state:'ok'|'fail'|'pending'|'exempt' } */
export function periodState(h, k, today) {
  const [a, b] = periodOf(h, k);
  const g = h.goal || { kind: 'check' };
  const closed = b < today;
  if (g.kind === 'limit') {
    let total = 0, live = 0;
    eachDay(a, b, (d) => { if (inRange(h, d) && !isSkip(h, d)) { total += valueOn(h, d); live++; } });
    if (!live) return { done: total, need: g.max, total, state: 'exempt' };
    if (total > (g.max ?? 0)) return { done: total, need: g.max, total, state: 'fail' };
    return { done: total, need: g.max, total, state: closed ? 'ok' : 'pending' };
  }
  const u = unitOf(h);
  if (u === 'day') {
    if (!scheduledOn(h, k)) return { done: 0, need: 0, state: 'exempt' };
    if (isSkip(h, k)) return { done: 0, need: 0, state: 'exempt' };
    if (dayDone(h, k)) return { done: 1, need: 1, state: 'ok' };
    return { done: 0, need: 1, state: k < today ? 'fail' : 'pending' };
  }
  const n = u === 'week' ? (h.schedule.n || 1) : (h.schedule.n || 1);
  let avail = 0, done = 0;
  eachDay(a, b, (d) => { if (inRange(h, d) && !isSkip(h, d)) { avail++; if (dayDone(h, d)) done++; } });
  const need = Math.min(n, avail);
  if (need <= 0) return { done, need: 0, state: 'exempt' };
  if (done >= need) return { done, need, state: 'ok' };
  return { done, need, state: closed ? 'fail' : 'pending' };
}

/** 오늘 목록에 보일지: 해당 없음이면 false */
export function dueOn(h, k) {
  if (h.archived || !inRange(h, k)) return false;
  return scheduledOn(h, k);
}

/* 단위 열거: 오늘이 속한 단위부터 거꾸로 */
function prevUnitKey(h, k) {
  const u = unitOf(h);
  if (u === 'week') return addDays(weekStart(k), -1);
  if (u === 'month') return addDays(monthStart(k), -1);
  return addDays(k, -1);
}

/** 현재 연속: 진행 중 단위는 성공이면 넣고 미달이면 끊지 않는다. 면제는 건너뛴다 */
export function currentStreak(h, today) {
  let n = 0, k = today, guard = 0;
  const first = h.start || today;
  while (k >= first && guard++ < 4000) {
    const s = periodState(h, k, today);
    const isCurrent = periodOf(h, k)[1] >= today;
    if (s.state === 'ok') n++;
    else if (s.state === 'fail') break;
    else if (s.state === 'pending' && !isCurrent) break;
    k = prevUnitKey(h, k);
  }
  return n;
}

/** 최고 연속 */
export function bestStreak(h, today) {
  const first = h.start || today;
  const units = [];
  let k = today, guard = 0;
  while (k >= first && guard++ < 4000) { units.push(periodState(h, k, today)); k = prevUnitKey(h, k); }
  let best = 0, run = 0;
  for (const s of units.reverse()) {
    if (s.state === 'ok') { run++; best = Math.max(best, run); }
    else if (s.state === 'fail') run = 0;
  }
  return best;
}

/** 최근 days 일 달성률 (성공 단위 ÷ (해당 단위 − 면제 단위)), 확정된 단위만. null = 셀 게 없음 */
export function completionRate(h, today, days = 30) {
  const from = addDays(today, -(days - 1));
  let ok = 0, all = 0;
  const seen = new Set();
  for (let k = today; k >= from; k = addDays(k, -1)) {
    const [a] = periodOf(h, k);
    if (seen.has(a)) continue;
    seen.add(a);
    const s = periodState(h, k, today);
    if (s.state === 'exempt' || s.state === 'pending') continue;
    all++; if (s.state === 'ok') ok++;
  }
  return all ? ok / all : null;
}
