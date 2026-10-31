/* ===========================================================
   notifcard.js — 홈 화면 '알림을 허용해 주세요' 카드 (1.7.9, 사용자 지시 2026-10-28)
   "패치로 알람을 켤 수 있도록 유도 — '알람을 허용해 주세요?' 라고 하면서"

   언제 보이나 (앱에서만)
    · 매일 알림이 실제로 꺼져 있을 때 — 설정이 꺼졌거나, 켜져 있어도 폰의 알림 권한이 없을 때
    · [나중에]를 누르면 7일 동안 숨기고, 최대 3번까지만 다시 보인다 (meta 'notifCard' = { n, until })
   [알림 켜기]
    · 권한을 물을 수 있으면 → 폰의 알림 허용 창 → 허용되면 매일 알림을 켜고 예약
    · 이미 두 번 거절해서 창이 안 뜨면 → 폰 설정의 하루칸 화면을 연다 (안내 후).
      돌아오면 권한을 다시 보고 켜졌으면 매일 알림을 켠다.
   네이티브는 바꾸지 않는다 — 내려받기 업데이트(패치)로 보낼 수 있다.
   =========================================================== */
import * as store from './store.js';
import * as native from './native.js';
import * as analytics from './analytics.js';
import { el, esc, toast, confirmSheet } from './ui.js';
import { t, fmtClock } from './i18n.js';

const HIDE_DAYS = 7, MAX_LATER = 3;
const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 1.8 6.5 1.8 6.5H4.2S6 14 6 9Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>';

/** 매일 알림이 실제로 오는가 */
export async function dailyOn() {
  return !!store.getSettings().reminderOn && (await native.notifyPermission()) === 'granted';
}

async function turnOn() {
  await store.saveSettings({ reminderOn: true }, { silent: true });
  const app = await import('./app.js');
  await app.scheduleReminder();
  const time = store.reminderTimeOf();
  toast(t('매일 {t}에 알려드릴게요.', { t: fmtClock(time) }));
}

/** 홈에 붙일 카드 (보일 때가 아니면 null) */
export async function card() {
  if (!native.isNative()) return null;
  if (await dailyOn()) return null;
  const st = (await store.metaGet('notifCard', null)) || { n: 0, until: 0 };
  if (st.n >= MAX_LATER || Date.now() < (st.until || 0)) return null;

  const time = store.reminderTimeOf();
  const box = el('div', { class: 'notif-card' });
  box.innerHTML = `
    <span class="nc-ico">${BELL}</span>
    <div class="nc-tx">
      <div class="nc-t">${esc(t('알림을 허용해 주세요'))}</div>
      <div class="nc-s">${esc(t('매일 {t}, 오늘 칸이 비어 있으면 살짝 알려드려요. 그날 이미 썼으면 건너뛰어요.', { t: fmtClock(time) }))}</div>
      <div class="nc-btns">
        <button type="button" class="btn btn-primary btn-sm" data-act="on">${esc(t('알림 켜기'))}</button>
        <button type="button" class="btn btn-sm nc-later" data-act="later">${esc(t('나중에'))}</button>
      </div>
    </div>`;
  analytics.design('notif:card:show');

  let waitBack = false;
  const onVis = async () => {
    if (document.hidden || !waitBack) return;
    waitBack = false;
    document.removeEventListener('visibilitychange', onVis);
    if ((await native.notifyPermission()) === 'granted') {
      analytics.design('notif:card:settings_granted');
      await turnOn();
      box.remove();
    }
  };

  box.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'later') {
      await store.metaSet('notifCard', { n: (st.n || 0) + 1, until: Date.now() + HIDE_DAYS * 86400000 });
      analytics.design('notif:card:later');
      box.remove();
      return;
    }
    analytics.design('notif:card:on');
    const r = await askPermission();
    analytics.design('notif:card:' + r);
    if (r === 'granted') { await turnOn(); box.remove(); return; }
    if (r !== 'blocked') return;                 // 방금 창에서 '허용 안함' — 바로 설정으로 몰지 않는다
    if (await guideToSettings()) { waitBack = true; document.addEventListener('visibilitychange', onVis); }
  });
  return box;
}

/** 알림 권한 묻기 → 'granted' | 'denied'(창에서 거절) | 'blocked'(두 번 거절해 창이 안 뜸)
    안드로이드는 '다시 묻지 않음' 상태도 'prompt' 로 알려 주므로, 창 없이 곧바로 거절되면 blocked 로 본다 */
export async function askPermission() {
  if ((await native.notifyPermission()) === 'granted') return 'granted';
  const t0 = Date.now();
  const ok = await native.requestNotifyPermission();
  if (ok) return 'granted';
  return Date.now() - t0 < 700 ? 'blocked' : 'denied';
}

/** 폰 설정의 하루칸 화면으로 안내 (열었으면 true) */
export async function guideToSettings() {
  const go = await confirmSheet({
    title: t('폰 설정에서 알림을 켜 주세요'),
    text: t("하루칸 화면에서 '알림'을 눌러 허용으로 바꾼 뒤 돌아오면 바로 켜져요."),
    ok: t('설정 열기'),
  });
  if (!go) return false;
  analytics.design('notif:open_settings');
  try { const wx = await import('./weather.js'); await wx.openSettings('app'); return true; } catch { return false; }
}
