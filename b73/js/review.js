/* ===========================================================
   review.js — 앱 평가 요청 (1.6.7, 2026-10-19 사용자 결정)
   일기를 3편 이상 쓴 사람에게, 새 글을 저장한 직후 구글 인앱 리뷰 창을 띄운다.

   · 몇 번째 글이든 '내가 쓴 글'(예시 데이터 제외)로 센다.
   · 처음은 3편째 이후 저장 때 한 번. 구글은 사람마다 창을 띄우는 횟수를 제한해서
     불러도 안 뜰 수 있고, 떴는지·별점을 줬는지 앱은 알 수 없다(구글 정책).
     그래서 한 번 더 기회를 둔다: 20편 이상 쓰고 첫 요청에서 60일이 지났을 때. 그 뒤로는 묻지 않는다.
   · 구글 정책상 "좋으셨나요?"로 먼저 걸러서 만족한 사람만 보내는 방식은 쓰지 않는다.
     보상을 주는 것도 안 된다. 창은 구글 것을 그대로 띄운다.
   · 잠금 화면·다른 안내창이 떠 있으면 이번엔 건너뛴다 (다음 저장 때 다시 본다).
   =========================================================== */

import * as store from './store.js';
import * as native from './native.js';
import * as analytics from './analytics.js';

const FIRST_AT = 3;          // 일기 몇 편부터
const SECOND_AT = 20;        // 두 번째 기회
const SECOND_GAP = 60 * 86400000;

export function maybeAsk() {
  if (!native.canReview()) return;
  const s = store.getSettings();
  const n = store.realLive().length;
  const count = s.reviewAskCount || 0;
  if (count >= 2) return;
  if (count === 0 && n < FIRST_AT) return;
  if (count === 1 && (n < SECOND_AT || Date.now() - (s.reviewAskedAt || 0) < SECOND_GAP)) return;

  // 저장 뒤 화면이 넘어가고 자리 잡을 때까지 잠깐 기다린다
  setTimeout(async () => {
    const sheet = document.getElementById('sheetRoot');
    if ((sheet && sheet.childElementCount) || !document.getElementById('lockscreen')?.hidden) return;
    if (location.hash.startsWith('#/write')) return;          // 아직 쓰는 중
    await store.saveSettings({ reviewAskedAt: Date.now(), reviewAskCount: count + 1 }, { silent: true });
    analytics.design('review:ask:' + (count + 1));
    try {
      const done = await native.requestReview();
      analytics.design('review:flow:' + (done ? 'done' : 'fail'));
    } catch (e) { console.error('평가 요청', e); }
  }, 1500);
}
