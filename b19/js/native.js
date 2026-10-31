/* ===========================================================
   native.js — 네이티브(Capacitor) 껍데기 안에서만 켜지는 기능
   웹 브라우저에서 열면 전부 조용히 웹 방식으로 되돌아간다.
   그래서 파일 하나로 PWA와 APK 두 곳을 다 커버한다.
   =========================================================== */

const DAILY_BASE_ID = 4000;
import { t } from './i18n.js';
const DAYS_AHEAD = 14;          // 앱을 열 때마다 앞으로 2주치를 다시 깔아둔다

function cap() { return window.Capacitor; }

/** Capacitor 네이티브 껍데기 안에서 실행 중인가 */
export function isNative() {
  try { return !!cap()?.isNativePlatform?.(); } catch { return false; }
}

export function platform() {
  try { return cap()?.getPlatform?.() || 'web'; } catch { return 'web'; }
}

function LN() { return cap()?.Plugins?.LocalNotifications || null; }

/* ── 사진 고르기 (1.5.1) ───────────────────────────
   앱 안에 둔 PhotoPick 플러그인(android/app/.../PhotoPickPlugin.java)이 시스템 사진 선택기를
   직접 띄우고, 줄인 JPEG dataURL 을 돌려준다.
   웹의 <input type="file"> 을 쓰지 않는 이유: 안드로이드 웹뷰는 고르기 창을 한 번에 하나만 받아서
   앞선 요청이 답을 못 받고 남으면 그 뒤로는 누르지도 않은 것처럼 아무 반응이 없었다
   (1.5.0 '사진 고르기가 안 돼요'). 플러그인이 없는 곳(웹, 옛 네이티브)에서는 null 을 돌려주고
   부르는 쪽이 예전 방식으로 되돌아간다. */
export function canPickNative() {
  try { return isNative() && !!cap()?.isPluginAvailable?.('PhotoPick'); } catch { return false; }
}

/**
 * @param {{multiple?: boolean, maxEdge?: number, quality?: number}} opts
 * @returns {Promise<{photos: string[], failed: number, cancelled: boolean} | null>}
 */
/* 앱 평가 요청 (1.6.7) — 앱 안의 Review 플러그인(ReviewPlugin.java)이 구글 인앱 리뷰를 띄운다 */
export function canReview() {
  try { return isNative() && !!cap()?.isPluginAvailable?.('Review'); } catch { return false; }
}
/** 리뷰 흐름이 끝까지 갔으면 true (별점을 줬는지는 알 수 없다) */
export async function requestReview() {
  if (!canReview()) return false;
  const r = await cap().Plugins.Review.request();
  return !!r?.done;
}

export async function pickPhotos({ multiple = false, maxEdge = 1600, quality = 82 } = {}) {
  if (!canPickNative()) return null;
  const pp = cap().Plugins.PhotoPick;
  const r = await pp.pick({ multiple, maxEdge, quality });
  return { photos: r?.photos || [], failed: r?.failed || 0, cancelled: !!r?.cancelled };
}

/** 카메라로 한 장 찍기 (1.7.2). 시스템 카메라 앱에 맡긴다 — 결과는 pickPhotos 와 같은 모양 */
export async function capturePhoto({ maxEdge = 1600, quality = 82 } = {}) {
  if (!canPickNative()) return null;
  const r = await cap().Plugins.PhotoPick.capture({ maxEdge, quality });
  return { photos: r?.photos || [], failed: r?.failed || 0, cancelled: !!r?.cancelled };
}
/**
 * 네이티브 브리지 호출은 "절대 안 끝날" 수 있다.
 * 안드로이드가 권한 설정 화면으로 튕겨보내면 앱이 백그라운드로 내려가면서
 * WebView 가 멈추고, 그 사이 Promise 는 영원히 대기 상태가 된다.
 * 그러면 설정 화면의 토글이 통째로 먹통이 되므로 항상 시간 제한을 건다.
 */
function withTimeout(p, ms = 6000) {
  return Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('bridge-timeout')), ms)),
  ]);
}

/* ── 정확 알람 (안드로이드 13+) ────────────────────
   안드로이드는 시각을 지정한 알람에 "알람 및 리마인더" 특수 권한을 요구한다.
   플러그인은 권한이 없으면 설정 화면을 열어버리므로, 먼저 상태를 확인하고
   사용자에게 설명한 뒤에 보내야 한다.
   ------------------------------------------------ */
export async function exactAlarmState() {
  const ln = LN();
  if (!isNative() || !ln?.checkExactNotificationSetting) return 'granted';
  try {
    const r = await withTimeout(ln.checkExactNotificationSetting(), 4000);
    return r?.exact_alarm || 'unknown';
  } catch { return 'unknown'; }
}

/** "알람 및 리마인더" 설정 화면을 연다 (돌아오면 앱이 알아서 다시 예약한다) */
export async function openExactAlarmSetting() {
  const ln = LN();
  if (!isNative() || !ln?.changeExactNotificationSetting) return false;
  try { await withTimeout(ln.changeExactNotificationSetting(), 2500); } catch { /* 화면 전환은 정상 */ }
  return true;
}

/* ── 권한 ───────────────────────────────────────── */
export async function notifyPermission() {
  if (isNative()) {
    const ln = LN();
    if (!ln) return 'unsupported';
    const r = await ln.checkPermissions();
    return r.display;                      // granted | denied | prompt
  }
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission === 'default' ? 'prompt' : Notification.permission;
}

export async function requestNotifyPermission() {
  if (isNative()) {
    const ln = LN();
    if (!ln) return false;
    const r = await ln.requestPermissions();
    return r.display === 'granted';
  }
  if (!('Notification' in window)) return false;
  return (await Notification.requestPermission()) === 'granted';
}

/* ── 매일 알림 ──────────────────────────────────── */
/**
 * 앞으로 DAYS_AHEAD 일치 알림을 다시 예약한다.
 * "반복 알림" 하나를 거는 대신 날짜별로 거는 이유:
 * 이미 오늘 글을 썼으면 오늘 것만 빼고 깔 수 있기 때문이다.
 * 앱을 열 때마다 갱신되므로 2주가 지나도 끊기지 않는다.
 *
 * allowWhileIdle(정확 알람)은 일부러 쓰지 않는다. 안드로이드 13+ 에서 그걸 쓰면
 * SCHEDULE_EXACT_ALARM 특수 권한 화면으로 사용자를 튕겨보내는데,
 * 일기 알림에 그만한 마찰을 요구할 이유가 없다. 대신 시각이 몇 분 어긋날 수 있다.
 *
 * @param {string} time  'HH:MM'
 * @param {(dateKey:string)=>boolean} hasEntryOn
 */
export async function refreshDailyReminders(time, hasEntryOn, bodyFor = null) {
  const ln = LN();
  if (!isNative() || !ln) return false;

  await cancelDailyReminders();
  if ((await notifyPermission()) !== 'granted') return false;
  /* 1.7.9: '알람 및 리마인더' 권한이 없어도(안드로이드 14+ 새 설치 기본) 몇 분 늦게라도 오게 한다 — 매일 알림 기본 켬 */
  const exact = (await exactAlarmState()) !== 'denied';

  const [hh, mm] = String(time || '22:00').split(':').map(Number);
  const now = new Date();
  const list = [];

  for (let i = 0; i < DAYS_AHEAD; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() + i);
    d.setHours(hh, mm, 0, 0);
    if (d <= now) continue;                                  // 이미 지난 시각
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (i === 0 && hasEntryOn?.(key)) continue;              // 오늘 이미 썼으면 건너뛴다
    /* 1.7.9 패치: 앞쪽 알림 몇 개는 '최근 일기 한 줄'로 (bodyFor 가 정한다, 잠금·글 없으면 null) */
    const custom = bodyFor ? bodyFor(list.length, d) : null;
    list.push({
      id: DAILY_BASE_ID + i,
      title: t('하루칸'),
      body: custom?.body || t(BODIES[i % BODIES.length]),
      schedule: { at: d },
      ...(exact ? {} : { isExactNotification: false }),
      smallIcon: 'ic_stat_harukan',
      iconColor: '#c2703d',
      extra: custom?.body ? { date: key, recall: 1 } : { date: key },
    });
  }
  if (!list.length) return true;
  try { await withTimeout(ln.schedule({ notifications: list })); }
  catch { return 'need-exact'; }        // 브리지가 멈췄다면 권한 화면으로 튕긴 것이다
  return exact ? true : 'inexact';
}

const BODIES = [
  '오늘 한 칸, 한 줄이면 충분해요.',
  '오늘 어땠는지 딱 한 문장만 남겨볼까요?',
  '기억은 생각보다 빨리 흐려져요.',
  '잘 쓰지 않아도 괜찮아요. 그냥 쓰면 돼요.',
  '오늘의 한 칸이 비어 있어요.',
  '피곤하다, 한 마디도 훌륭한 기록이에요.',
  '나중의 내가 오늘을 궁금해할 거예요.',
];

/* ── 일정 알림 ───────────────────────────────────
   일기 알림(4000번대)과 번호대를 겹치지 않게 5000번대를 쓴다.
   일정은 개수가 정해져 있지 않으므로, 다시 맞출 때마다 5000번대를 통째로
   지우고 앞으로 올 것만 다시 건다. 지난 일정에 알림을 걸 이유는 없다. */
const PLAN_BASE_ID = 5000;
const PLAN_MAX = 60;            // 안드로이드가 앱당 예약 개수를 제한한다

/**
 * 앞으로 올 일정 알림을 다시 건다.
 * @param {Array<{id:string,title:string,at:Date}>} items 알림 시각이 정해진 것만
 */
export async function refreshPlanReminders(items) {
  const ln = LN();
  if (!isNative() || !ln) return false;

  await cancelPlanReminders();
  if (!items.length) return true;
  if ((await notifyPermission()) !== 'granted') return 'no-permission';
  /* 정확 알람 권한이 없으면 예약하지 않고 물러난다.
     그냥 schedule() 을 부르면 플러그인이 아무 설명 없이 시스템 설정 화면으로
     사용자를 튕겨보낸다. 앱을 켜자마자 그러면 무슨 일인지 알 수가 없다.
     부르는 쪽이 적절한 때에 askExactAlarm() 으로 먼저 설명한다. */
  if ((await exactAlarmState()) === 'denied') return 'need-exact';

  const now = Date.now();
  const list = items
    .filter((it) => it.at instanceof Date && it.at.getTime() > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, PLAN_MAX)
    .map((it, i) => ({
      id: PLAN_BASE_ID + i,
      title: it.title || t('일정'),
      body: it.body || t('곧 시작해요.'),
      schedule: { at: it.at },
      smallIcon: 'ic_stat_harukan',
      iconColor: '#c2703d',
      extra: { plan: it.id },
    }));
  if (!list.length) return exactDenied ? 'need-exact' : true;
  try { await withTimeout(ln.schedule({ notifications: list })); }
  catch {
    /* 정시 예약이 거절되면 절전 예외 없이 한 번 더 — 늦더라도 오게 */
    try { await withTimeout(ln.schedule({ notifications: list.map((n) => ({ ...n, schedule: { at: n.schedule.at }, isExactNotification: false })) })); }
    catch { return 'fail'; }
    return 'need-exact';
  }
  return exactDenied ? 'need-exact' : true;
}

export async function cancelPlanReminders() {
  const ln = LN();
  if (!isNative() || !ln) return;
  try {
    const pending = await withTimeout(ln.getPending(), 4000);
    const ids = (pending?.notifications || [])
      .filter((n) => n.id >= PLAN_BASE_ID && n.id < PLAN_BASE_ID + PLAN_MAX + 40)
      .map((n) => ({ id: n.id }));
    if (ids.length) await withTimeout(ln.cancel({ notifications: ids }), 4000);
  } catch { /* 예약된 게 없거나 브리지가 멈춘 경우 */ }
}

/* ── 습관 알림 (2026-10-30) ──────────────────────────
   번호 대역 8000~8199 (3999 시험, 4000 매일, 5000 일정, 6000 묻어둔 글, 7000 쉬어 간 날과 겹치지 않게) */
const HABIT_BASE_ID = 8000;
const HABIT_MAX = 150;

/** @param items [{ habit, at:Date, title, body }] — 부르는 쪽(app.js)이 앞으로 7일치를 만들어 넘긴다 */
export async function refreshHabitReminders(items) {
  const ln = LN();
  if (!isNative() || !ln) return false;
  await cancelHabitReminders();
  if (!items.length) return true;
  if ((await notifyPermission()) !== 'granted') return 'no-permission';
  /* 2026-10-31 (광고분석 세션 지적): '알람 및 리마인더' 권한이 없으면 예전엔 하나도 안 걸었다 → 알림이 아예 안 왔다.
     권한이 없어도 매일 일기 알림처럼 정확하지 않은 예약으로라도 걸어 두고(몇 분 늦을 수 있음), 'need-exact' 를 돌려 점검 창을 띄운다 */
  const exactDenied = (await exactAlarmState()) === 'denied';
  const now = Date.now();
  const list = items
    .filter((it) => it.at instanceof Date && it.at.getTime() > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, HABIT_MAX)
    .map((it, i) => ({
      id: HABIT_BASE_ID + i,
      title: it.title || t('습관'),
      body: it.body || t('습관 알림 시간이에요.'),
      /* 습관(약·아이 데리러 가기)은 정시가 중요하다 — 절전(도즈) 중에도 울리게 (2026-10-31 사용자 지적).
         일기 알림과 달리 '알람 및 리마인더' 권한을 요구하고, 없으면 위에서 need-exact 로 돌아간다 */
      schedule: { at: it.at, allowWhileIdle: true },
      /* 정확한 알람 권한이 없으면 플러그인이 권한 화면으로 튕기며 멈춘다 — 매일 일기 알림처럼 '정확하지 않음' 표시로 건다 */
      ...(exactDenied ? { isExactNotification: false } : {}),
      smallIcon: 'ic_stat_harukan',
      iconColor: '#c2703d',
      extra: { habit: it.habit },
    }));
  if (!list.length) return exactDenied ? 'need-exact' : true;
  try { await withTimeout(ln.schedule({ notifications: list })); }
  catch {
    /* 정시 예약이 거절되면 절전 예외 없이 한 번 더 — 늦더라도 오게 */
    try { await withTimeout(ln.schedule({ notifications: list.map((n) => ({ ...n, schedule: { at: n.schedule.at }, isExactNotification: false })) })); }
    catch { return 'fail'; }
    return 'need-exact';
  }
  return exactDenied ? 'need-exact' : true;
}

/** 배터리 최적화에서 빠져 있나 (true/false). 이 기능이 없는 옛 앱(스토어 버전)이면 null — 확인할 수 없음 */
export async function batteryUnrestricted() {
  const L = cap()?.Plugins?.Locate;
  if (!isNative() || !L) return null;
  try { const r = await withTimeout(L.battery(), 3000); return typeof r?.ignoring === 'boolean' ? r.ignoring : null; }
  catch { return null; }
}

/** 습관 알림 시험 — 10초 뒤 정시 알람 한 번 (알림 점검 창, 2026-10-31 1분 → 10초) */
export async function testHabitReminder(sec = 10) {
  const ln = LN();
  if (!isNative() || !ln) return 'web';
  if ((await notifyPermission()) !== 'granted') return 'no-permission';
  if ((await exactAlarmState()) === 'denied') return 'need-exact';
  try {
    await withTimeout(ln.schedule({ notifications: [{ id: 3998, title: t('하루칸'), body: t('습관 알림이 이렇게 와요. 앱을 닫아 두어도 와요.'),
      schedule: { at: new Date(Date.now() + sec * 1000), allowWhileIdle: true }, smallIcon: 'ic_stat_harukan', iconColor: '#c2703d' }] }));
    return true;
  } catch { return 'need-exact'; }
}

export async function cancelHabitReminders() {
  const ln = LN();
  if (!isNative() || !ln) return;
  try {
    const pending = await withTimeout(ln.getPending(), 4000);
    const ids = (pending?.notifications || [])
      .filter((n) => n.id >= HABIT_BASE_ID && n.id < HABIT_BASE_ID + 200)
      .map((n) => ({ id: n.id }));
    if (ids.length) await withTimeout(ln.cancel({ notifications: ids }), 4000);
  } catch { /* 예약된 게 없거나 브리지가 멈춘 경우 */ }
}

/* ── 묻어둔 글이 열리는 날 ──────────────────────────
   일정 알림과 번호 대역을 나눈다. 같은 대역을 쓰면 한쪽을 다시 걸 때
   다른 쪽이 통째로 지워진다 — 3년 뒤 알림이 그렇게 사라지면 알 길이 없다. */
const SEALED_BASE_ID = 6000;
const SEALED_MAX = 40;

/**
 * 묻어둔 글의 알림을 지금 상태에 맞게 다시 건다.
 * @param items [{ id, at:Date, body }]
 */
export async function refreshSealedReminders(items) {
  const ln = LN();
  if (!isNative() || !ln) return false;

  await cancelSealedReminders();
  if (!items.length) return true;
  if ((await notifyPermission()) !== 'granted') return 'no-permission';
  if ((await exactAlarmState()) === 'denied') return 'need-exact';

  const now = Date.now();
  const list = items
    .filter((it) => it.at instanceof Date && it.at.getTime() > now)
    .sort((a, b) => a.at - b.at)
    .slice(0, SEALED_MAX)
    .map((it, i) => ({
      id: SEALED_BASE_ID + i,
      title: t('묻어둔 글이 열렸어요'),
      body: it.body || t('그날의 내가 오늘의 나에게 남긴 글이에요.'),
      schedule: { at: it.at },
      smallIcon: 'ic_stat_harukan',
      iconColor: '#c2703d',
      extra: { sealed: it.id },
    }));
  if (!list.length) return exactDenied ? 'need-exact' : true;
  try { await withTimeout(ln.schedule({ notifications: list })); }
  catch {
    /* 정시 예약이 거절되면 절전 예외 없이 한 번 더 — 늦더라도 오게 */
    try { await withTimeout(ln.schedule({ notifications: list.map((n) => ({ ...n, schedule: { at: n.schedule.at }, isExactNotification: false })) })); }
    catch { return 'fail'; }
    return 'need-exact';
  }
  return exactDenied ? 'need-exact' : true;
}

export async function cancelSealedReminders() {
  const ln = LN();
  if (!isNative() || !ln) return;
  try {
    const pending = await withTimeout(ln.getPending(), 4000);
    const ids = (pending?.notifications || [])
      .filter((n) => n.id >= SEALED_BASE_ID && n.id < SEALED_BASE_ID + SEALED_MAX)
      .map((n) => ({ id: n.id }));
    if (ids.length) await withTimeout(ln.cancel({ notifications: ids }), 4000);
  } catch { /* 예약된 게 없거나 브리지가 멈춘 경우 */ }
}

/* ── 쉬어 간 날 알림 (1.7.6, nudge.js) ───────────────────────
   다른 알림과 번호대를 나눈다 (7000번대). 정확 알람을 바라지 않는다 — 권한이 없어도 설정 화면으로
   튕기지 않고 조금 늦게라도 온다 (isExactNotification:false). */
const NUDGE_BASE_ID = 7000;

/** @param items [{ kind, at:Date, title, body }] */
export async function scheduleNudges(items) {
  const ln = LN();
  if (!isNative() || !ln || !items.length) return false;
  const list = items.slice(0, 5).map((it, i) => ({
    id: NUDGE_BASE_ID + i,
    title: it.title,
    body: it.body,
    schedule: { at: it.at },
    isExactNotification: false,
    smallIcon: 'ic_stat_harukan',
    iconColor: '#c2703d',
    extra: it.recall ? { nudge: it.kind, recall: 1 } : { nudge: it.kind },
  }));
  try { await withTimeout(ln.schedule({ notifications: list })); return true; }
  catch { return false; }
}

export async function cancelNudges() {
  const ln = LN();
  if (!isNative() || !ln) return;
  try {
    const pending = await withTimeout(ln.getPending(), 4000);
    const ids = (pending?.notifications || [])
      .filter((n) => n.id >= NUDGE_BASE_ID && n.id < NUDGE_BASE_ID + 10)
      .map((n) => ({ id: n.id }));
    if (ids.length) await withTimeout(ln.cancel({ notifications: ids }), 4000);
  } catch { /* 예약된 게 없거나 브리지가 멈춘 경우 */ }
}

/* ── 음성 입력 (1.7.6) ─────────────────────────────
   안드로이드 웹뷰의 웹 음성 인식(webkitSpeechRecognition)은 있는 척만 하고 동작하지 않는다
   (사용자 신고: '말해보세요'만 뜨고 아무 반응이 없다). 폰의 음성 인식(SpeechRecognizer)을 쓴다.
   마이크 권한(RECORD_AUDIO)이 없으면 먼저 묻는다. 말소리는 폰의 음성 인식 서비스가 글자로 바꾸고,
   하루칸은 바뀐 글자만 받는다 (녹음 파일을 만들거나 보내지 않는다). */
function SPEECH() { return cap()?.Plugins?.SpeechRecognition || null; }
export function speechNative() { return isNative() && !!SPEECH(); }
export async function speechAvailable() {
  try { return !!(await withTimeout(SPEECH().available(), 4000))?.available; } catch { return false; }
}
/** 'granted' | 'denied' | 'prompt' … */
export async function speechPerm() {
  try { return (await withTimeout(SPEECH().checkPermissions(), 4000))?.speechRecognition || 'prompt'; } catch { return 'prompt'; }
}
export async function speechRequest() {
  try { return (await SPEECH().requestPermissions())?.speechRecognition || 'denied'; } catch { return 'denied'; }
}
/** 폰의 음성 인식 창을 띄워 한 번 듣고 글자를 돌려준다. 취소하면 '' */
export async function speechListen(language, prompt) {
  const r = await SPEECH().start({ language, maxResults: 1, prompt, partialResults: false, popup: true });
  return (r?.matches || [])[0] || '';
}

export async function cancelDailyReminders() {
  const ln = LN();
  if (!isNative() || !ln) return;
  try {
    const pending = await withTimeout(ln.getPending(), 4000);
    const ids = (pending?.notifications || [])
      .filter((n) => n.id >= DAILY_BASE_ID && n.id < DAILY_BASE_ID + 100)
      .map((n) => ({ id: n.id }));
    if (ids.length) await withTimeout(ln.cancel({ notifications: ids }), 4000);
  } catch { /* 예약된 게 없거나 브리지가 멈춘 경우 — 다음 실행 때 다시 맞춘다 */ }
}

/** 설정 화면에서 "지금 테스트" 용 */
export async function testNotification() {
  const ln = LN();
  if (isNative() && ln) {
    await ln.schedule({
      notifications: [{
        id: 3999, title: t('하루칸'),
        body: t('알림이 이렇게 옵니다. 앱이 꺼져 있어도 와요.'),
        schedule: { at: new Date(Date.now() + 5000) },
        smallIcon: 'ic_stat_harukan', iconColor: '#c2703d',
      }],
    });
    return t('5초 뒤에 알림이 옵니다. 앱을 닫고 기다려보세요.');
  }
  if ((await notifyPermission()) === 'granted') {
    new Notification(t('하루칸'), { body: t('알림이 이렇게 옵니다.'), icon: 'icons/icon-192.png' });
    return t('알림을 보냈어요.');
  }
  return t('알림 권한이 없어요.');
}

/* ── 지문 · 얼굴 인증 ──────────────────────────────
   중요: 지문은 비밀번호를 "대체"하지 않는다.
   암호화 열쇠는 비밀번호에서 파생되는데(PBKDF2) 지문은 열쇠를 만들지 못한다.
   그래서 비밀번호를 안드로이드 키스토어에 넣어두고, 지문으로 그걸 꺼내 쓴다.
   지문은 빠른 입구일 뿐이고, 비밀번호는 언제나 원본이자 대체 수단으로 남는다.
   ------------------------------------------------ */
const BIO_SERVER = 'app.harukan.diary';

function BIO() { return cap()?.Plugins?.NativeBiometric || null; }

/** 이 기기가 생체 인증을 지원하고 등록도 되어 있는가 */
export async function bioAvailable() {
  const b = BIO();
  if (!isNative() || !b) return { ok: false, reason: 'unsupported' };
  try {
    const r = await withTimeout(b.isAvailable({ useFallback: false }), 4000);
    return { ok: !!r?.isAvailable, type: r?.biometryType, reason: r?.errorCode };
  } catch { return { ok: false, reason: 'error' }; }
}

/** 지문을 확인시키고 비밀번호를 키스토어에 넣는다 */
export async function bioEnroll(passphrase) {
  const b = BIO();
  if (!isNative() || !b) return false;
  await b.verifyIdentity({
    reason: t('하루칸 잠금을 지문으로 열기 위해 확인합니다'),
    title: t('지문 확인'), subtitle: '', description: '',
  });
  await b.setCredentials({ username: 'harukan', password: passphrase, server: BIO_SERVER });
  return true;
}

/** 지문을 확인시키고 저장해둔 비밀번호를 꺼낸다. 실패하면 null */
export async function bioUnlock() {
  const b = BIO();
  if (!isNative() || !b) return null;
  try {
    await b.verifyIdentity({
      reason: t('하루칸을 열려면 확인이 필요합니다'),
      title: t('지문으로 열기'), subtitle: '', description: '',
    });
    const c = await b.getCredentials({ server: BIO_SERVER });
    return c?.password || null;
  } catch { return null; }        // 취소하거나 실패하면 비밀번호 입력으로 돌아간다
}

/**
 * 지문으로 열기 — 무엇이 실패했는지까지 알려준다 (1.7.5).
 * @returns {Promise<{pass:string}|{why:'cancel'|'broken'}>}
 *   cancel = 지문 창을 닫았거나 지문이 안 맞음 → 그냥 비밀번호로
 *   broken = 지문은 맞았는데 저장해 둔 비밀번호 사본을 못 꺼냄. 앱을 지웠다 다시 깔아
 *            자동 백업이 사본만 되돌리고 그걸 풀 열쇠(폰 보안 칩)는 사라진 경우다 (2026-10-24 사용자 신고).
 */
export async function bioUnlockEx() {
  const b = BIO();
  if (!isNative() || !b) return { why: 'cancel' };
  try {
    await b.verifyIdentity({
      reason: t('하루칸을 열려면 확인이 필요합니다'),
      title: t('지문으로 열기'), subtitle: '', description: '',
    });
  } catch { return { why: 'cancel' }; }
  try {
    const c = await b.getCredentials({ server: BIO_SERVER });
    return c?.password ? { pass: c.password } : { why: 'broken' };
  } catch { return { why: 'broken' }; }
}

/** 지문 확인 없이 비밀번호 사본만 다시 저장한다 — 방금 비밀번호로 맞게 연 직후에만 쓴다 */
export async function bioSave(passphrase) {
  const b = BIO();
  if (!isNative() || !b) return false;
  await b.setCredentials({ username: 'harukan', password: passphrase, server: BIO_SERVER });
  return true;
}

export async function bioForget() {
  const b = BIO();
  if (!isNative() || !b) return;
  try { await b.deleteCredentials({ server: BIO_SERVER }); } catch { /* 없으면 그만 */ }
}

/* ── 안드로이드 뒤로가기 ───────────────────────────
   @capacitor/app 이 설치되면 시스템 뒤로가기가 기본 동작(앱 종료) 대신
   backButton 이벤트로 들어온다. 처리는 app.js 가 한다.
   ------------------------------------------------ */
/* ── 인앱 업데이트 (강제) ─────────────────────────
   Play 에 새 버전이 있으면 업데이트해야만 계속 쓸 수 있다. (2026-10-12 결정)

   1.3.4 까지는 '유연(flexible)' 방식으로 한 번 권하고 넘어갔다. 그러면 옛
   버전이 오래 남아서, 고친 버그(체험 중 숨은 배너 요청 같은)가 사용자에게
   닿지 않는다. 그래서 '즉시(immediate)' 방식으로 바꿨다. 구글이 띄우는
   전체 화면 업데이트 창을 쓰고, 그 창을 닫아도 app.js 의 안내 화면이 남아
   업데이트 말고는 할 수 있는 게 없다.

   쓰던 글은 잃지 않는다. 업데이트 창이 뜨면 앱이 가려지면서
   (visibilitychange) 쓰기 화면이 저장하고, 일기는 기기 저장소에 있어서
   업데이트로 지워지지 않는다.

   막지 않는 경우:
     · 오프라인이거나 Play 에 물어볼 수 없을 때. 일기는 비행기 안에서도 써야 한다
     · 스토어가 아닌 곳에서 설치한 앱(직접 깐 APK). 구글이 답을 주지 않는다

   Android 에서는 새 버전의 이름(versionName)을 알려주지 않는다. 번호
   (versionCode)만 온다. 그래서 화면에 버전을 적지 않는다. */
function UPD() { return cap()?.Plugins?.AppUpdate || null; }

const UPDATE_NOT_AVAILABLE = 1;    // AppUpdateAvailability.UPDATE_NOT_AVAILABLE
const UPDATE_AVAILABLE = 2;        // AppUpdateAvailability.UPDATE_AVAILABLE
const UPDATE_PRIORITY_FORCE = 4;   // publish.mjs --priority=4 이상이면 업데이트 안내 화면으로 막는다
const UPDATE_IN_PROGRESS = 3;      // 즉시 업데이트를 받다가 앱이 가려진 상태. 이어서 받게 한다
const DOWNLOADED = 11;             // 1.3.4 이하의 유연 방식으로 이미 다 받아둔 상태

/**
 * 업데이트해야 하는지 Play 에 묻는다.
 * @returns {Promise<{state:'required', inProgress:boolean, downloaded:boolean}
 *                  | {state:'none'} | {state:'unknown'}>}
 *   none    = Play 가 "새 버전 없음" 이라고 답했다
 *   unknown = 물어보지 못했다 (오프라인, 스토어 설치가 아님, 응답 없음)
 *   둘을 나누는 이유: 안내 화면이 이미 떠 있을 때 'unknown' 이면 내리지 않는다.
 *   잠깐 비행기 모드를 켠다고 업데이트를 피해 갈 수 없게 하려는 것이다.
 */
export async function requiredUpdate() {
  const u = UPD();
  if (!isNative() || !u) return { state: 'unknown' };
  try {
    const i = await withTimeout(u.getAppUpdateInfo());
    if (i?.installStatus === DOWNLOADED) return { state: 'required', inProgress: false, downloaded: true };
    const a = i?.updateAvailability;
    if (a === UPDATE_AVAILABLE || a === UPDATE_IN_PROGRESS) {
      /* 1.7.4: 새 버전이 있다고 다 막지 않는다. 올릴 때 중요도(inAppUpdatePriority)를
         4 이상으로 준 '꼭 받아야 하는 업데이트'만 막는다. 나머지는 Play 자동 업데이트나
         스토어에서 조용히 받는다 (업데이트가 잦아 피곤하지 않게 — 사용자 요청).
         이미 받는 중(IN_PROGRESS)이면 끝까지 안내한다. */
      const urgent = Number(i?.updatePriority || 0) >= UPDATE_PRIORITY_FORCE;
      if (a === UPDATE_IN_PROGRESS || urgent) {
        return { state: 'required', inProgress: a === UPDATE_IN_PROGRESS, downloaded: false };
      }
      return { state: 'none' };
    }
    if (a === UPDATE_NOT_AVAILABLE) return { state: 'none' };
    return { state: 'unknown' };
  } catch { return { state: 'unknown' }; }    /* 스토어 설치가 아니거나 오프라인 */
}

/**
 * 구글의 즉시 업데이트 창을 띄운다. 받고 나면 앱이 스스로 다시 시작된다.
 * @returns {Promise<'ok'|'canceled'|'none'|'fail'>}
 *   fail 이면 부르는 쪽이 Play 스토어 페이지를 연다 (openStore).
 */
export async function runUpdate() {
  const u = UPD();
  if (!isNative() || !u) return 'fail';
  try {
    /* 플러그인은 업데이트 창을 한 번 띄우고 나면 받아둔 정보를 지운다.
       그래서 띄우기 직전에 매번 다시 묻는다. 안 물으면 INFO_MISSING(5) 이다. */
    const i = await withTimeout(u.getAppUpdateInfo());
    if (i?.installStatus === DOWNLOADED) { await u.completeFlexibleUpdate(); return 'ok'; }
    /* 창이 떠 있는 동안 기다리므로 시간 제한을 걸지 않는다 */
    const r = await u.performImmediateUpdate();
    switch (r?.code) {
      case 0: return 'ok';          // OK
      case 1: return 'canceled';    // CANCELED: 사용자가 뒤로가기로 닫았다
      case 3: return 'none';        // NOT_AVAILABLE
      default: return 'fail';       // FAILED, NOT_ALLOWED, INFO_MISSING
    }
  } catch { return 'fail'; }
}

/** 앱 안 업데이트가 안 될 때의 비상구. Play 스토어의 하루칸 페이지를 연다. */
export async function openStore() {
  const u = UPD();
  if (!isNative() || !u) return false;
  try { await u.openAppStore(); return true; }
  catch { return false; }
}

function APP() { return cap()?.Plugins?.App || null; }

export function onBackButton(handler) {
  const a = APP();
  if (!isNative() || !a) return;
  try { a.addListener('backButton', handler); } catch { /* 무시 */ }
}

export function exitApp() {
  try { APP()?.exitApp(); } catch { /* 무시 */ }
}

/** 알림을 탭해서 앱이 열렸을 때. extra 를 넘겨서 어디로 갈지 고르게 한다. */
export function onNotificationTap(handler) {
  const ln = LN();
  if (!isNative() || !ln) return;
  try {
    ln.addListener('localNotificationActionPerformed', (ev) => {
      handler(ev?.notification?.extra || null);
    });
  } catch { /* 무시 */ }
}
