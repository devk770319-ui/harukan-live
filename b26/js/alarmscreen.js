/* ===========================================================
   alarmscreen.js — 중요 습관 알람 화면 (2026-11-01, 사용자: "알람이 오면 별도 화면에
   '하루칸에서 알려드립니다 · 약 먹을 시간이에요'가 나오고 아래에 알람 종료가 있으면 좋겠다")

   · 알람이 울리는 중(또는 15분 안에 울렸고 아직 안 끈 것)에 앱을 열면 화면 전체를 덮는다
   · [알람 끄기] · [다 했어요 ✓](오늘 체크) · [10분 뒤 다시]. 뒤로가기 = 알람 끄기
   · 알림의 [다 했어요]로 쌓인 체크(앱 밖에서 누른 것)는 앱이 열릴 때 가져와 반영한다
   · 앱 잠금 화면이 떠 있으면 풀린 뒤에 보인다
   네이티브(HabitAlarmService)가 있는 앱에서만 동작한다.
   =========================================================== */
import * as native from './native.js';
import * as analytics from './analytics.js';
import { el, esc, toast, haptic } from './ui.js';
import { t, fmtClock } from './i18n.js';

let open = null;
let checking = false;
let watchT = 0;

/* 2026-11-01 사용자 신고: 1분 간격으로 알람 2개를 맞췄더니 첫 알람은 화면으로 껐는데 두 번째는 화면이 안 떠 끌 수 없었다.
   예전엔 앱을 열거나 돌아올 때만 확인했다 → 앱이 앞에 있는 동안 새 알람이 울리면 화면이 안 떴다.
   이제 앱이 보이는 동안 2초마다 확인하고, 다른 알람이 새로 울리면 화면을 그 알람으로 바꾼다 */
const keyOf = (it) => it ? [it.id ?? '', it.at ?? '', it.habit ?? ''].join('|') : '';   // firedAt 은 기록 쪽에만 붙어서 비교에서 뺀다
function startWatch() {
  if (watchT || !native.alarmAvailable()) return;
  watchT = setInterval(async () => {
    if (document.hidden || checking) return;
    const r = await native.alarmRinging().catch(() => null);
    if (!r?.item) return;
    if (open && keyOf(open.item) === keyOf(r.item)) return;
    if (open && !r.ringing) return;                // 지금 화면이 있고 새로 울리는 건 아니면 그대로
    if (open) { const o = open; open = null; o.root.remove(); document.documentElement.classList.remove('alarm-open'); }
    if (lockUp()) return;
    show(r.item, r.ringing);
  }, 2000);
}

/** 알림 [다 했어요]로 쌓인 체크를 반영 */
export async function applyPending() {
  const list = await native.alarmTakePending();
  if (!list.length) return 0;
  const H = await import('./habits.js');
  const C = await import('./habitcore.js');
  await H.load();
  let n = 0;
  for (const p of list) {
    const h = H.byId(p.habit);
    if (!h) continue;
    const day = C.keyOf(new Date(p.at || Date.now()));
    if (C.dayDone(h, day)) continue;
    await H.tap(h.id, day);
    n++;
  }
  if (n) {
    analytics.design('habit:alarm:done_from_notif');
    try { (await import('./app.js')).syncHabitReminders(); } catch { /* */ }
  }
  return n;
}

function lockUp() { const ls = document.getElementById('lockscreen'); return !!(ls && !ls.hidden); }

/** 울리는 알람이 있으면 화면을 띄운다 (앱 시작·앱으로 돌아올 때) */
export async function check() {
  if (!native.alarmAvailable() || checking) return;
  startWatch();
  checking = true;
  try {
    await applyPending();
    const r = await native.alarmRinging();
    /* 알람이 끝난 뒤 알림을 눌러 열었으면 습관 화면으로 (2026-11-01 사용자: 습관 알람을 눌렀는데 일기로 갔다) */
    if (await native.alarmTakeOpen()) { try { (await import('./app.js')).go('/habits'); } catch { /* */ } }   // 알람 화면을 닫으면 습관 화면이 보이게
    if (!r?.item || open) return;
    /* 앱 잠금이 풀릴 때까지 기다린다 (최대 3분) */
    for (let i = 0; i < 360 && lockUp(); i++) await new Promise((res) => setTimeout(res, 500));
    if (lockUp()) return;
    show(r.item, r.ringing);
  } finally { checking = false; }
}

export function handleBack() { if (!open) return false; close('stop'); return true; }
export function isOpen() { return !!open; }

function close(how) {
  if (!open) return;
  const { root, item } = open;
  open = null;
  root.classList.remove('on');
  setTimeout(() => root.remove(), 220);
  document.documentElement.classList.remove('alarm-open');
  analytics.design('habit:alarm:' + how);
  return item;
}

export function show(item, ringing = true) {
  if (open) return;
  const now = new Date();
  const hm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
  const root = el('div', { class: 'alarm-root', role: 'alertdialog', 'aria-modal': 'true' });
  root.innerHTML = `
    <div class="alarm-in">
      <div class="alarm-from">${esc(item.title || t('하루칸에서 알려드립니다'))}</div>
      <div class="alarm-ico${ringing ? ' ring' : ''}">${esc(item.icon || '⏰')}</div>
      <div class="alarm-body">${esc(item.body || t('습관 알림 시간이에요.'))}</div>
      <div class="alarm-time">${esc(fmtClock(hm))}</div>
      <div class="alarm-btns">
        <button type="button" class="alarm-stop" data-act="stop">${esc(t('알람 끄기'))}</button>
        ${item.habit ? `<button type="button" class="alarm-done" data-act="done">✓ ${esc(t('다 했어요'))}</button>` : ''}
        <button type="button" class="alarm-snooze" data-act="snooze">${esc(t('10분 뒤 다시'))}</button>
      </div>
    </div>`;
  document.body.append(root);
  document.documentElement.classList.add('alarm-open');
  open = { root, item };
  requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('on')));
  analytics.design('habit:alarm:screen');
  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    haptic(10);
    const act = b.dataset.act;
    if (act === 'stop') { close('stop'); await native.alarmStop(false); return; }
    if (act === 'done') {
      close('done');
      await native.alarmStop(true);
      const n = await applyPending();
      toast(n ? t('오늘 체크했어요.') : t('알람을 껐어요.'));
      try { const app = await import('./app.js'); if (location.hash.startsWith('#/habits') || location.hash === '' || location.hash === '#/home') app.go(location.hash.slice(1) || '/home', { replace: true }); } catch { /* */ }
      return;
    }
    if (act === 'snooze') {
      close('snooze');
      await native.alarmStop(false);
      const ok = await native.alarmSnooze(item, 10);
      if (ok) toast(t('10분 뒤에 다시 알려드릴게요.'));
    }
  });
}
