/* ===========================================================
   permsetup.js — 처음 시작할 때 권한 한 번에 (1.7.8, 사용자 요청 2026-10-26)

   "처음에 앱 실행할 때 정확도 위치와 알람 허용 등을 할 수 있게" —
   첫 사용 가이드가 끝나면 한 화면에서 무엇에 쓰는지 먼저 말하고(앱 안 안내 — Play 정책),
   사용자가 [허용]을 누른 것만 안드로이드 권한 창을 띄운다. 언제든 [나중에 할게요]로 넘길 수 있다.

    · 위치(정확한 위치): 일기 쓴 곳 지도 + 그날 날씨 → placeAuto, weatherAuto 를 켠다
    · 알림: 매일 저녁 알림 → reminderOn 을 켜고 예약한다 (안드로이드 14+ 는 '알람 및 리마인더'도 안내)
   새로 설치한 사람에게 한 번 (settings.permSetupSeen). 이미 쓰던 사람은 설정에서 따로 켠다.
   =========================================================== */
import * as store from './store.js';
import * as native from './native.js';
import * as place from './place.js';
import { esc, toast } from './ui.js';
import { t, fmtClock } from './i18n.js';
import * as analytics from './analytics.js';

const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>';
const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 1.8 6.5 1.8 6.5H4.2S6 14 6 9Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17l9-10"/></svg>';

let open = null;
let onBackKey = null;

export function isOpen() { return !!open; }
export function handleBack() { if (!open || !onBackKey) return false; onBackKey(); return true; }

/** 새로 설치한 사람에게 한 번 */
export async function maybeShow() {
  if (!native.isNative() || open) return;
  if (store.getSettings().permSetupSeen) return;
  await show();
}

async function locState() { const s = await place.permState(); return s === 'granted' ? 'on' : (s === 'approx' ? 'approx' : 'off'); }
async function notiState() { return (await native.notifyPermission()) === 'granted' && store.getSettings().reminderOn ? 'on' : 'off'; }

async function allowLocation() {
  const st = await place.requestPerm();
  analytics.design('permsetup:loc:' + st);
  if (st === 'granted' || st === 'approx') {
    await store.saveSettings({ placeAuto: true, placeAsked: true, weatherAuto: true, weatherAsked: true }, { silent: true });
    return true;
  }
  return false;
}
async function allowNotify() {
  const ok = await native.requestNotifyPermission();
  analytics.design('permsetup:noti:' + (ok ? 'granted' : 'denied'));
  try { await store.metaSet('reminderAsked', true); } catch {}
  if (!ok) return false;
  await store.saveSettings({ reminderOn: true }, { silent: true });
  const app = await import('./app.js');
  const r = await app.scheduleReminder();
  if (r === 'need-exact') await app.askExactAlarm();
  return true;
}

export async function show() {
  if (open) return;
  const time = store.getSettings().reminderTime || '22:00';
  const root = document.createElement('div');
  root.className = 'ps-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="ps-in">
      <div class="ps-kicker">${esc(t('시작하기 전에'))}</div>
      <h2 class="ps-title">${esc(t('두 가지만 허용해 주세요'))}</h2>
      <p class="ps-sub">${esc(t('허용하지 않아도 하루칸은 그대로 쓸 수 있어요. 나중에 설정에서 언제든 바꿀 수 있어요.'))}</p>
      <div class="ps-card" data-k="loc">
        <span class="ps-ico">${PIN}</span>
        <span class="ps-txt"><b>${esc(t('정확한 위치'))}</b><span>${esc(t('일기 쓴 곳을 지도에 남기고, 그날 날씨를 붙여요. 위치는 이 폰에만 저장되고 개발자에게 보내지 않아요.'))}</span></span>
        <button type="button" class="ps-btn" data-act="loc">${esc(t('허용'))}</button>
      </div>
      <div class="ps-card" data-k="noti">
        <span class="ps-ico">${BELL}</span>
        <span class="ps-txt"><b>${esc(t('알림'))}</b><span>${esc(t('매일 {t}에 오늘 칸이 비어 있으면 살짝 알려드려요. 광고 알림은 보내지 않아요.', { t: fmtClock(time) }))}</span></span>
        <button type="button" class="ps-btn" data-act="noti">${esc(t('허용'))}</button>
      </div>
      <button type="button" class="btn btn-primary ps-all" data-act="all">${esc(t('모두 허용하기'))}</button>
      <button type="button" class="ps-later" data-act="later">${esc(t('나중에 할게요'))}</button>
    </div>`;
  document.body.append(root);
  document.documentElement.classList.add('ob-open');
  open = root;
  requestAnimationFrame(() => root.classList.add('on'));
  analytics.design('permsetup:show');

  const paint = async () => {
    const st = { loc: await locState(), noti: await notiState() };
    for (const k of ['loc', 'noti']) {
      const card = root.querySelector(`.ps-card[data-k="${k}"]`);
      const b = card.querySelector('.ps-btn');
      const on = st[k] !== 'off';
      card.classList.toggle('done', on);
      b.disabled = on;
      b.innerHTML = on ? CHECK + `<span>${esc(st[k] === 'approx' ? t('대략 허용됨') : t('허용됨'))}</span>` : esc(t('허용'));
    }
    const all = root.querySelector('.ps-all');
    const done = st.loc !== 'off' && st.noti !== 'off';
    all.textContent = done ? t('시작하기') : t('모두 허용하기');
    all.dataset.act = done ? 'later' : 'all';
    return st;
  };
  await paint();

  let busy = false;
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b || busy) return;
    busy = true;
    try {
      const act = b.dataset.act;
      if (act === 'loc') { if (!(await allowLocation())) toast(t('위치를 허용하지 않았어요. 설정에서 언제든 켤 수 있어요.')); }
      else if (act === 'noti') { if (!(await allowNotify())) toast(t('알림이 꺼져 있어요. 설정에서 켤 수 있습니다.')); }
      else if (act === 'all') {
        let st = await paint();
        if (st.loc === 'off') await allowLocation();
        st = await paint();
        if (st.noti === 'off') await allowNotify();
        st = await paint();
        if (st.loc !== 'off' && st.noti !== 'off') { toast(t('준비됐어요. 오늘 한 칸을 채워 볼까요?')); finish('all'); return; }
      } else if (act === 'later') { finish('later'); return; }
      await paint();
    } finally { busy = false; }
  });
  onBackKey = () => finish('back');

  function finish(why) {
    if (!open) return;
    analytics.design('permsetup:close:' + why);
    store.saveSettings({ permSetupSeen: true }, { silent: true }).catch(() => {});
    root.classList.remove('on');
    document.documentElement.classList.remove('ob-open');
    setTimeout(() => root.remove(), 220);
    open = null;
    onBackKey = null;
  }
}
