/* ===========================================================
   milestones.js — "몇 번째 일기인가" 익명 통계 (2026-10-21 요청, 다음 정기 배포 때 함께)
   GameAnalytics 무료판은 사람별 횟수 분포를 못 보여서, 누적 편수가 단계를 넘을 때
   그 단계 이벤트를 한 번씩 보낸다: entry:count:1 / 3 / 5 / 10 / 20 / 30 / 50 / 100
   → 'entry:count:5' 를 보낸 사람 수 = 일기를 5편 이상 쓴 사람 수.
   · 세는 것은 내가 쓴 글(예시 데이터 제외, 휴지통 제외)의 개수뿐. 내용은 보내지 않는다.
   · 단계마다 한 번만 (meta 'entryMilestones' 에 보낸 단계를 적는다).
   · 이미 쓰던 사람은 업데이트 후 첫 실행 때 지금 편수까지의 단계를 한꺼번에 보낸다.
   =========================================================== */

import * as store from './store.js';
import * as analytics from './analytics.js';

const STEPS = [1, 3, 5, 10, 20, 30, 50, 100];

export function realCount() {
  return store.all().filter((e) => !e.demo && !e.deletedAt).length;
}

/** 지금 편수까지 아직 안 보낸 단계를 보낸다. 보낸 단계 수를 돌려준다 */
export async function report(n = realCount()) {
  try {
    const sent = new Set(await store.metaGet('entryMilestones', []));
    const todo = STEPS.filter((s) => s <= n && !sent.has(s));
    if (!todo.length) return 0;
    for (const s of todo) { analytics.design('entry:count:' + s, n); sent.add(s); }
    await store.metaSet('entryMilestones', [...sent].sort((a, b) => a - b));
    return todo.length;
  } catch { return 0; }
}

/* ── 서로 다른 날 쓴 날 수 (2026-11-07 광고분석 요청: 3~7일차 이탈 — '며칠을 썼나') ──
   · writedays:3/5/7/10/14/20/30 — 쓴 날(서로 다른 작성 날짜) 수가 그 단계를 넘을 때 한 번씩. 이미 쓰던 사람은 첫 실행 때 지금까지를 한꺼번에.
   · writedays10:<0~10> — 하루 한 번, 어제까지 10일 가운데 쓴 날 수 ('10일 중 5일 이상' 질문용).
   · 날짜는 기기 날짜(글의 date). 예시·휴지통 제외. 내용은 보내지 않는다. */
const DAY_STEPS = [3, 5, 7, 10, 14, 20, 30];
function writtenDays() {
  const s = new Set();
  for (const e of store.all()) if (!e.demo && !e.deletedAt && e.date) s.add(e.date);
  return s;
}
export async function reportDays() {
  try {
    const n = writtenDays().size;
    const sent = new Set(await store.metaGet('writeDayMilestones', []));
    const todo = DAY_STEPS.filter((s) => s <= n && !sent.has(s));
    if (!todo.length) return 0;
    for (const s of todo) { analytics.design('writedays:' + s, n); sent.add(s); }
    await store.metaSet('writeDayMilestones', [...sent].sort((a, b) => a - b));
    return todo.length;
  } catch { return 0; }
}
const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** 어제까지 10일 가운데 쓴 날 수 (하루 한 번만 보낸다) */
export function lastTenDays(now = new Date()) {
  const days = writtenDays();
  let n = 0;
  for (let i = 1; i <= 10; i++) { const d = new Date(now); d.setDate(d.getDate() - i); if (days.has(keyOf(d))) n++; }
  return n;
}
export function reportTenDaily() {
  try {
    const dk = new Date().toDateString();
    if (localStorage.getItem('hk.wd10Day') === dk) return false;
    localStorage.setItem('hk.wd10Day', dk);
    analytics.design('writedays10:' + lastTenDays());
    return true;
  } catch { return false; }
}
