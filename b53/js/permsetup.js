/* ===========================================================
   permsetup.js — 처음 시작할 때 권장 권한 (1.7.8 → 패치 4)

   1.7.8: 첫 사용 가이드 뒤에 '정확한 위치 + 알림' 두 가지를 한 화면에서 물었다.
   패치 4 (사용자 지시 2026-10-28 "처음 설치자는 알람과 날씨, 위치정보 정확도를 권장해서 쓸 수 있도록"):
    · 한 화면에 세 가지를 '권장'으로 보여 준다 — 알림 / 날씨 / 정확한 위치(일기 쓴 곳).
      무엇에 쓰는지 먼저 말하고(앱 안 안내 — Play 정책), 사용자가 누른 것만 안드로이드 권한 창을 띄운다.
    · 화면이 뜨면 알림 권한 창은 바로 띄운다 (매일 알림 기본 켬, settings.reminderOn 기본 true).
    · [모두 허용하기]: 알림 → 위치(정확) 순서로 묻고, 허용되면 날씨 자동·일기 쓴 곳을 함께 켠다.
    · 날씨만: 대략적인 위치로 충분하다 (weather.requestPerm). 정확한 위치: place.requestPerm (정확 요청).
    · 알림을 허용하지 않고 넘기면 매일 알림을 끈다 (설정 화면이 사실대로 보이게). 첫 일기 뒤 한 번 더 묻는다(nudge).
   새로 설치한 사람에게 한 번 (settings.permSetupSeen). 이미 쓰던 사람은 홈 카드·설정에서 켠다.
   =========================================================== */
import * as store from './store.js';
import * as native from './native.js';
import * as place from './place.js';
import * as wx from './weather.js';
import { esc, toast } from './ui.js';
import { t, fmtClock } from './i18n.js';
import * as analytics from './analytics.js';

const BELL = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 9a6 6 0 0 1 12 0c0 5 1.8 6.5 1.8 6.5H4.2S6 14 6 9Z"/><path d="M10 19a2 2 0 0 0 4 0"/></svg>';
const SUN = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="9" r="3.2"/><path d="M9 2.5v1.6M9 13.9v1.1M2.5 9h1.6M4.4 4.4l1.1 1.1M13.6 4.4l-1.1 1.1"/><path d="M10.5 19.5h7a3.5 3.5 0 0 0 .3-7 4.6 4.6 0 0 0-8.6 1.4 2.8 2.8 0 0 0 1.3 5.6Z"/></svg>';
const PIN = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>';
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

/* 상태: 'on' | 'approx' | 'off' */
async function notiState() { return (await native.notifyPermission()) === 'granted' && store.getSettings().reminderOn ? 'on' : 'off'; }
async function wxState() { return store.getSettings().weatherAuto && (await wx.permState()) === 'granted' ? 'on' : 'off'; }
async function locState() {
  if (!store.getSettings().placeAuto) return 'off';
  const s = await place.permState();
  return s === 'granted' ? 'on' : (s === 'approx' ? 'approx' : 'off');
}

/** 알림 권한을 묻고, 허용되면 매일 알림을 예약한다 */
async function allowNotify() {
  const ok = await native.requestNotifyPermission();
  analytics.design('permsetup:noti:' + (ok ? 'granted' : 'denied'));
  try { await store.metaSet('reminderAsked', true); } catch {}
  await store.saveSettings({ reminderOn: ok }, { silent: true });
  const app = await import('./app.js');
  const r = await app.scheduleReminder();
  if (ok && r === 'need-exact') await app.askExactAlarm();
  return ok;
}
/** 날씨: 대략적인 위치로 충분 */
async function allowWeather() {
  let st = await wx.permState();
  if (st !== 'granted') st = await wx.requestPerm();
  analytics.design('permsetup:wx:' + st);
  if (st !== 'granted') return false;
  await store.saveSettings({ weatherAuto: true, weatherAsked: true }, { silent: true });
  return true;
}
/** 정확한 위치: 일기 쓴 곳 지도 (+ 날씨도 같은 권한으로 켠다) */
async function allowPrecise() {
  const st = await place.requestPerm();
  analytics.design('permsetup:loc:' + st);
  if (st !== 'granted' && st !== 'approx') return 'off';
  await store.saveSettings({ placeAuto: true, placeAsked: true, weatherAuto: true, weatherAsked: true }, { silent: true });
  return st === 'granted' ? 'on' : 'approx';
}

export async function show() {
  if (open) return;
  const time = store.reminderTimeOf();
  const root = document.createElement('div');
  root.className = 'ps-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  const card = (k, ico, title, text) => `
      <div class="ps-card" data-k="${k}">
        <span class="ps-ico">${ico}</span>
        <span class="ps-txt"><b>${esc(title)} <em class="ps-rec">${esc(t('권장'))}</em></b><span>${esc(text)}</span></span>
        <button type="button" class="ps-btn" data-act="${k}">${esc(t('허용'))}</button>
      </div>`;
  root.innerHTML = `
    <div class="ps-in">
      <div class="ps-kicker">${esc(t('시작하기 전에'))}</div>
      <h2 class="ps-title">${esc(t('세 가지를 켜 두면 하루칸이 훨씬 편해요'))}</h2>
      <p class="ps-sub">${esc(t('허용하지 않아도 하루칸은 그대로 쓸 수 있어요. 나중에 설정에서 언제든 바꿀 수 있어요.'))}</p>
      ${card('noti', BELL, t('알림'), t('매일 {t}에 오늘 칸이 비어 있으면 살짝 알려드려요. 광고 알림은 보내지 않아요.', { t: fmtClock(time) }))}
      ${card('wx', SUN, t('날씨'), t('일기에 그날 날씨를 저절로 붙여요. 동네 단위의 대략적인 위치만 써요.'))}
      ${card('loc', PIN, t('정확한 위치'), t('일기 쓴 곳을 지도에 남겨요. 위치는 이 폰에만 저장되고 개발자에게 보내지 않아요.'))}
      <button type="button" class="btn btn-primary ps-all" data-act="all">${esc(t('모두 허용하기'))}</button>
      <button type="button" class="ps-later" data-act="later">${esc(t('나중에 할게요'))}</button>
    </div>`;
  document.body.append(root);
  document.documentElement.classList.add('ob-open');
  open = root;
  requestAnimationFrame(() => root.classList.add('on'));
  analytics.design('permsetup:show');

  const paint = async () => {
    const st = { noti: await notiState(), wx: await wxState(), loc: await locState() };
    for (const k of ['noti', 'wx', 'loc']) {
      const c = root.querySelector(`.ps-card[data-k="${k}"]`);
      const b = c.querySelector('.ps-btn');
      const on = st[k] === 'on';
      c.classList.toggle('done', st[k] !== 'off');
      b.disabled = on;
      b.innerHTML = st[k] === 'on' ? CHECK + `<span>${esc(t('허용됨'))}</span>`
        : st[k] === 'approx' ? `<span>${esc(t('대략 허용됨'))}</span>` : esc(t('허용'));
    }
    const all = root.querySelector('.ps-all');
    const done = st.noti === 'on' && st.wx === 'on' && st.loc !== 'off';
    all.textContent = done ? t('시작하기') : t('모두 허용하기');
    all.dataset.act = done ? 'start' : 'all';
    return st;
  };
  await paint();

  let busy = false;
  const run = async (act, auto) => {
    if (busy || !open) return;
    busy = true;
    try {
      let st = await paint();
      if (act === 'noti') {
        if (st.noti === 'off' && !(await allowNotify()) && !auto) toast(t('알림이 꺼져 있어요. 설정에서 켤 수 있습니다.'));
      } else if (act === 'wx') {
        if (!(await allowWeather())) toast(t('위치를 허용하지 않았어요. 설정에서 언제든 켤 수 있어요.'));
      } else if (act === 'loc') {
        const r = await allowPrecise();
        if (r === 'off') toast(t('위치를 허용하지 않았어요. 설정에서 언제든 켤 수 있어요.'));
        else if (r === 'approx') toast(t('대략적인 위치만 허용돼서 동네 단위로 남겨요. 폰 설정에서 정확한 위치를 켤 수 있어요.'));
      } else if (act === 'all') {
        if (st.noti === 'off') await allowNotify();
        st = await paint();
        if (st.loc === 'off' || st.wx === 'off') await allowPrecise();
        st = await paint();
        if (st.noti === 'on' && st.wx === 'on' && st.loc !== 'off') { toast(t('준비됐어요. 오늘 한 칸을 채워 볼까요?')); finish('all'); return; }
      } else if (act === 'start') { finish('done'); return; }
      else if (act === 'later') { finish('later'); return; }
      await paint();
    } finally { busy = false; }
  };
  root.addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) run(b.dataset.act, false); });
  onBackKey = () => finish('back');
  /* 매일 알림은 기본으로 켠다: 화면이 뜨면 알림 권한 창부터 띄운다 (안드로이드 12 이하는 창 없이 켜진다).
     날씨·위치는 사용자가 누를 때만 묻는다 */
  setTimeout(() => run('noti', true), 700);

  async function finish(why) {
    if (!open) return;
    const r = root; open = null; onBackKey = null;
    analytics.design('permsetup:close:' + why);
    /* 알림 권한 없이 넘겼으면 매일 알림을 끈 상태로 둔다 — 켜져 있다고 보이면 안 된다 */
    try { if ((await native.notifyPermission()) !== 'granted') await store.saveSettings({ reminderOn: false }, { silent: true }); } catch {}
    store.saveSettings({ permSetupSeen: true }, { silent: true }).catch(() => {});
    r.classList.remove('on');
    document.documentElement.classList.remove('ob-open');
    setTimeout(() => r.remove(), 220);
  }
}