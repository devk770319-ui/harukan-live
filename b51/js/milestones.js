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
