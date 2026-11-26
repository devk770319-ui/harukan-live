/* ===========================================================
   alarmwarn.js — '알람 및 리마인더' 권한이 꺼져 있을 때 알림 탭 위 경고 띠 (2026-11-19, 의견 80·86 점검:
   앱을 닫으면 알림이 안 울리거나 늦게 온다). 권한이 없으면 안드로이드가 정시 알람을 허락하지 않아
   중요 알림(알람 소리)은 조용한 알림만 남고, 일정·일기 알림은 절전에서 크게 늦어질 수 있다.
   걸어 둔 알림이 있는 사람에게만 보인다. [켜기] → '알람 및 리마인더' 설정, 돌아오면 다시 확인.
   =========================================================== */
import * as native from './native.js';
import * as analytics from './analytics.js';
import { el, esc, icon } from './ui.js';
import { t } from './i18n.js';

/** 걸어 둔 알림이 있나 (습관 알림 시각, 남은 일정 알림, 매일 일기 알림) */
async function hasAlarms() {
  try {
    const H = await import('./habits.js'); await H.load();
    if (H.active().some((h) => Array.isArray(h.reminders) && h.reminders.some(Boolean))) return true;
  } catch { /* */ }
  try {
    const P = await import('./plans.js'); await P.loadAll();
    const today = new Date(); const k = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    if (P.all().some((p) => !p.done && p.remindMin != null && p.date >= k)) return true;
  } catch { /* */ }
  try { const S = await import('./store.js'); if (S.getSettings().reminderOn) return true; } catch { /* */ }
  return false;
}

/** 중요 알림(알람 소리) 습관이 있나 */
async function hasImportant() {
  try { const H = await import('./habits.js'); await H.load(); return H.active().some((h) => h.important && Array.isArray(h.reminders) && h.reminders.some(Boolean)); } catch { return false; }
}

/* 안드로이드 14 이상에서 '전체 화면 알림'이 꺼져 있으면 잠금 화면에 알람 화면이 안 뜬다 (알림 버튼으로만 끌 수 있다).
   중요 알림 습관이 있는 사람에게만 (2026-11-20 사용자: '앱을 열지 않고도 알람을 끌 수 있게') */
let fsShown = false;
async function fullScreenBanner(where) {
  if ((await native.fullScreenState()) !== 'denied') return null;
  if (!(await hasImportant())) return null;
  const b = el('div', { class: 'alw', role: 'note' });
  b.innerHTML = `<span class="alw-i">${icon('bell')}</span><span class="alw-t"><b>${esc(t('잠금 화면에서 알람을 바로 끄려면'))}</b><span>${esc(t("'전체 화면 알림'을 켜 주세요. 화면이 꺼져 있어도 알람 화면이 떠요."))}</span></span>`;
  const on = el('button', { class: 'btn btn-sm btn-primary alw-on', type: 'button' }, esc(t('켜기')));
  on.addEventListener('click', async () => {
    analytics.design('notif:fsi:warn_tap:' + where);
    const back = async () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', back);
      if ((await native.fullScreenState()) !== 'denied') { analytics.design('notif:fsi:warn_fixed'); b.remove(); }
    };
    document.addEventListener('visibilitychange', back);
    await native.openFullScreenSetting();
  });
  b.append(on);
  if (!fsShown) { fsShown = true; analytics.design('notif:fsi:warn_shown:' + where); }
  return b;
}

let shownOnce = false;
/** 경고 띠 (필요 없으면 null). 기다리지 않게 자리만 먼저 두고 채운다: mount(root) */
export async function banner(where = 'plans') {
  if (!native.isNative()) return null;
  if ((await native.exactAlarmState()) !== 'denied') return fullScreenBanner(where);
  if (!(await hasAlarms())) return null;
  const b = el('div', { class: 'alw', role: 'alert' });
  b.innerHTML = `<span class="alw-i">${icon('bell')}</span><span class="alw-t"><b>${esc(t('알림이 늦거나 울리지 않을 수 있어요'))}</b><span>${esc(t("'알람 및 리마인더'를 켜야 약·약속 알림이 정시에 와요."))}</span></span>`;
  const on = el('button', { class: 'btn btn-sm btn-primary alw-on', type: 'button' }, esc(t('켜기')));
  on.addEventListener('click', async () => {
    analytics.design('notif:exact:warn_tap:' + where);
    const back = async () => {
      if (document.visibilityState !== 'visible') return;
      document.removeEventListener('visibilitychange', back);
      if ((await native.exactAlarmState()) !== 'denied') { analytics.design('notif:exact:warn_fixed'); b.remove(); try { const A = await import('./app.js'); await A.syncHabitReminders(); await A.scheduleReminder(); } catch { /* */ } try { await (await import('./plans.js')).syncReminders(); } catch { /* */ } }
    };
    document.addEventListener('visibilitychange', back);
    await native.openExactAlarmSetting();
  });
  b.append(on);
  if (!shownOnce) { shownOnce = true; analytics.design('notif:exact:warn_shown:' + where); }
  return b;
}
/** root 맨 앞(또는 after 다음)에 자리를 두고, 필요하면 띠로 바꾼다 */
export function mount(root, where, after = null) {
  if ((!!window.Capacitor?.isNativePlatform?.() && !window.Capacitor?.Plugins?.HabitAlarm?.fullScreenState)) return;   // 경고 띠는 1.9.0 앱부터 (패치 90: 옛 앱도 같은 패치를 받으므로)
  const slot = el('div', { class: 'alw-slot' });
  if (after && after.parentNode === root) after.after(slot); else root.prepend(slot);
  banner(where).then((b) => { if (b && slot.isConnected) slot.replaceWith(b); else slot.remove(); }).catch(() => slot.remove());
}
