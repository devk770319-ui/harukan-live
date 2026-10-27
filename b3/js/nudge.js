/* ===========================================================
   nudge.js — 쉬어 간 날 알림 (1.7.6, 광고 분석 결과로 사용자 지시 2026-10-24)
   설치한 사람의 42% 만 앱을 열고, 연 사람의 48% 가 첫 일기를 쓴다(10/22 기준).
   가장 크게 새는 곳은 '첫 실행 뒤 다시 오기' — 그 자리를 짧고 따뜻한 알림 한 번으로 메운다.

   언제 보내나 (기기 시각 20:30, 하루 최대 1번)
   · 아직 일기를 한 편도 안 쓴 사람: 처음 연 날 다음 날 1번, 3일째 1번. 그 뒤로는 보내지 않는다.
   · 일기를 쓴 사람: 마지막으로 쓴 다음 날까지 안 쓰면 그날 저녁 1번. 다시 쓰기 전까지 더 보내지 않는다.
   보내지 않는 경우
   · '저녁 알림'(매일 알림)을 켠 사람 — 이미 매일 받는다. 겹치지 않게 이쪽을 끈다.
   · 설정의 '쉬어 간 날 알림'을 끈 사람, 알림 권한이 없는 사람.
   · 알림 본문은 정해진 문구뿐이다 — 일기 내용·제목은 절대 넣지 않는다 (잠금 중에도 안전).
   정확 알람 권한은 요구하지 않는다(inexact). 몇 분 늦을 수 있지만 설정 화면으로 튕기지 않는다.
   =========================================================== */

import * as store from './store.js';
import * as native from './native.js';
import * as analytics from './analytics.js';
import { t } from './i18n.js';

export const NUDGE_HOUR = 20, NUDGE_MIN = 30;
const D = 86400000;

const BODY = {
  first1: '오늘 하루, 한 칸만 남겨 볼까요? 한 줄이면 충분해요.',
  first3: '잘 쓰지 않아도 괜찮아요. 오늘 기분 하나만 골라 볼까요?',
  gap: '오늘의 한 칸이 비어 있어요. 짧게 한 줄 어때요?',
};

const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** ms 시각이 있는 날로부터 plus 일 뒤 20:30 */
function evening(ms, plus) {
  const d = new Date(ms);
  d.setDate(d.getDate() + plus);
  d.setHours(NUDGE_HOUR, NUDGE_MIN, 0, 0);
  return d;
}

/** 쓴 기록: 휴지통 빼고, 예시(둘러보기) 빼고. 묻어둔 글도 쓴 것이다 */
function written() {
  return store.all().filter((e) => !e.deletedAt && !e.demo);
}

/**
 * 지금 상태로 보낼 알림 목록 (순수 계산 — 시험하기 쉽게 따로 둔다)
 * @returns {Array<{kind:string, at:Date}>}
 */
export function plan(now = Date.now(), s = store.getSettings(), entries = written(), firstOpen = null) {
  if (s.reminderOn || s.nudgeOn === false) return [];
  const out = [];
  if (!entries.length) {
    const start = firstOpen || s.trialStartedAt || now;
    out.push({ kind: 'first1', at: evening(start, 1) }, { kind: 'first3', at: evening(start, 3) });
  } else {
    /* '마지막으로 쓴 날' = 마지막으로 글을 만든(저장한) 시각. 지난 날짜로 써 넣은 글도 쓴 것이다 */
    const last = Math.max(...entries.map((e) => e.createdAt || e.updatedAt || 0));
    out.push({ kind: 'gap', at: evening(last || now, 1) });
  }
  return out.filter((x) => x.at.getTime() > now + 60000);
}

/** 앱을 열 때 · 돌아올 때 · 글을 저장한 뒤 · 설정을 바꾼 뒤 부른다 */
export async function refresh() {
  if (!native.isNative()) return false;
  try {
    let first = await store.metaGet('nudgeFirstOpen', 0);
    if (!first) { first = store.getSettings().trialStartedAt || Date.now(); await store.metaSet('nudgeFirstOpen', first); }
    await native.cancelNudges();
    const list = plan(Date.now(), store.getSettings(), written(), first);
    if (!list.length) return true;
    if ((await native.notifyPermission()) !== 'granted') return 'no-permission';
    await native.scheduleNudges(list.map((x) => ({ kind: x.kind, at: x.at, title: t('하루칸'), body: t(BODY[x.kind]) })));
    /* 같은 알림을 여러 번 예약해도 한 번만 센다 (kind@날짜) */
    const logged = await store.metaGet('nudgeLogged', []);
    const fresh = list.map((x) => `${x.kind}@${dayKey(x.at)}`).filter((k) => !logged.includes(k));
    for (const k of fresh) analytics.design('notif:nudge:scheduled:' + k.split('@')[0]);
    if (fresh.length) await store.metaSet('nudgeLogged', [...logged, ...fresh].slice(-30));
    return true;
  } catch (e) { console.error('쉬어 간 날 알림', e); return false; }
}

/**
 * 첫 일기를 저장한 직후 한 번만: 알림 권한을 부탁한다.
 * 시스템 창을 맨몸으로 띄우지 않고 무엇을 보내는지 먼저 말한다. 거절하면 다시 묻지 않는다.
 * 이미 권한이 있거나(안드로이드 12 이하 포함) 시스템이 이미 물어본 적이 있으면 묻지 않는다.
 */
export async function offerPermissionOnce() {
  if (!native.isNative()) return;
  const s = store.getSettings();
  if (s.reminderOn || s.nudgeOn === false) return;
  if (await store.metaGet('nudgePermAsked', false)) return;
  if ((await native.notifyPermission()) !== 'prompt') { await refresh(); return; }
  await new Promise((r) => setTimeout(r, 1500));
  if (document.getElementById('sheetRoot')?.childElementCount) return;      // 다른 창(평가 부탁 등)이 떠 있으면 다음 기회에
  await store.metaSet('nudgePermAsked', true);
  const { confirmSheet } = await import('./ui.js');
  const yes = await confirmSheet({
    title: t('가끔 알려드려도 될까요?'),
    text: t('한동안 일기를 쓰지 않으면 저녁에 한 번만 살짝 알려드려요. 일기 내용은 알림에 보이지 않아요. 설정에서 언제든 끌 수 있어요.'),
    ok: t('좋아요'),
  });
  analytics.design('notif:perm:offer:' + (yes ? 'yes' : 'no'));
  if (!yes) return;
  const ok = await native.requestNotifyPermission();
  analytics.design(ok ? 'notif:perm:granted' : 'notif:perm:denied');
  await refresh();
}

/** 알림을 눌러 들어왔을 때 (app.js onNotificationTap) */
export function opened(kind) {
  analytics.design('notif:nudge:open:' + (BODY[kind] ? kind : 'other'));
}
