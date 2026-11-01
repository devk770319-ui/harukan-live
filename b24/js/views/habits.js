/* ===========================================================
   views/habits.js — 습관 (2026-10-30)
     #/habits            오늘 할 습관 — 한 번 눌러 체크 / +1 / 수치 넣기
     #/habit/<id>        한 습관의 달력·연속·달성률
     #/habit-edit?id=    만들기·고치기 (새로 만들 때는 예시 고르기부터)
   계산은 habitcore.js, 저장은 habits.js.
   =========================================================== */
import * as H from '../habits.js';
import * as C from '../habitcore.js';
import * as plus from '../plus.js';
import * as analytics from '../analytics.js';
import * as NATIVE from '../native.js';
import * as STORE from '../store.js';
const native0 = () => NATIVE;
const store0 = () => STORE;
import { go, back, syncHabitReminders, dailyAlongWithHabit, alarmTexts } from '../app.js';
import { el, esc, icon, toast, haptic, openSheet, closeSheet, confirmSheet, promptSheet, timeInput, openTimePicker } from '../ui.js';
import * as i18n from '../i18n.js';
import { t } from '../i18n.js';

/* ── 공통 ─────────────────────────────────────── */
export function goalText(h) {
  const g = h.goal || { kind: 'check' };
  if (g.kind === 'count') return t('하루 {n}번', { n: g.target });
  if (g.kind === 'quantity') return t('하루 {n}{u}', { n: g.target, u: g.unit || '' });
  if (g.kind === 'limit') return ({ day: t('하루 최대 {n}번'), week: t('한 주 최대 {n}번'), month: t('한 달 최대 {n}번') })[g.period || 'day'].replace('{n}', g.max);
  return '';
}
/* 월요일부터 (번역은 i18n.weekdayShort — 일요일부터라 한 칸 돌린다) */
const WD = () => { const w = i18n.weekdayShort(); return [...w.slice(1), w[0]]; };
export function scheduleText(h) {
  const s = h.schedule || { kind: 'daily' };
  if (h.goal?.kind === 'limit') return '';
  if (s.kind === 'weekdays') { const w = WD(); return w.filter((_, i) => s.mask & (1 << i)).join('·'); }
  if (s.kind === 'weekly') return t('주 {n}회', { n: s.n });
  if (s.kind === 'monthly') return t('월 {n}회', { n: s.n });
  if (s.kind === 'every') return t('{n}일마다', { n: s.n });
  return t('매일');
}

/** 오늘 진행 글자: "3/8", "이번 주 2/3", "오늘 1/2" */
export function progressText(h, day) {
  const g = h.goal || { kind: 'check' };
  const v = C.valueOn(h, day);
  if (g.kind === 'limit') { const s = C.periodState(h, day, day); return `${s.total}/${g.max}`; }
  const u = C.unitOf(h);
  if (u !== 'day') { const s = C.periodState(h, day, day); return (u === 'week' ? t('이번 주 {a}/{b}') : t('이번 달 {a}/{b}')).replace('{a}', s.done).replace('{b}', s.need || h.schedule.n); }
  if (g.kind === 'count' || g.kind === 'quantity') return `${v}/${g.target}${g.kind === 'quantity' ? (g.unit || '') : ''}`;
  return '';
}

/** 한 줄 (오늘 목록·홈 카드에서 같이 쓴다) */
export function habitRow(h, day, { onChange, locked = false } = {}) {
  const done = C.dayDone(h, day);
  const skip = C.isSkip(h, day);
  const lim = h.goal?.kind === 'limit' ? C.periodState(h, day, day) : null;
  const row = el('div', { class: 'hb-row' + (done ? ' done' : '') + (skip ? ' skip' : '') + (lim?.state === 'fail' ? ' over' : ''), style: `--hc:${h.color}` });
  const ico = el('button', { class: 'hb-ico', type: 'button', 'aria-label': h.name }, esc(h.icon || '•'));
  const txt = el('button', { class: 'hb-txt', type: 'button' });
  txt.innerHTML = `<span class="hb-name">${esc(h.name)}</span><span class="hb-sub">${esc([progressText(h, day), skip ? t('건너뜀') : ''].filter(Boolean).join(' · ') || scheduleText(h))}</span>`;
  const btn = el('button', { class: 'hb-btn', type: 'button', 'aria-label': t('체크') });
  const g = h.goal?.kind || 'check';
  btn.innerHTML = g === 'check' ? icon('check') : (g === 'quantity' ? `+${h.goal.step || 1}` : '+1');
  if (g === 'check' && done) btn.classList.add('on');
  btn.addEventListener('click', async (e) => {
    e.stopPropagation(); haptic();
    if (locked) { analytics.design('habit:locked:check'); plus.showInfo('habits'); return; }   // 플러스 전용 (2026-11-01) — 보기만
    const wasDone = done;
    await H.tap(h.id, day);
    const nh = H.byId(h.id);
    if (!wasDone && nh && C.dayDone(nh, day)) { btn.classList.add('pop'); analytics.design('habit:done'); }
    syncHabitReminders();
    onChange?.();
  });
  /* 길게 누르기(또는 이름 누르기): 직접 넣기·건너뛰기·되돌리기 */
  txt.addEventListener('click', () => go(`/habit/${h.id}`));
  ico.addEventListener('click', () => go(`/habit/${h.id}`));
  let lp = null;
  if (locked) row.classList.add('locked');
  btn.addEventListener('pointerdown', () => { if (locked) return; lp = setTimeout(() => { lp = 'fired'; dayMenu(h, day, onChange); }, 520); });
  for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) btn.addEventListener(ev, () => { if (lp && lp !== 'fired') clearTimeout(lp); lp = null; });
  row.append(ico, txt, btn);
  return row;
}

/** 하루 기록 바꾸기 창 */
export function dayMenu(h, day, onChange) {
  const g = h.goal?.kind || 'check';
  const items = [];
  if (g !== 'check') items.push({ label: t('직접 넣기'), icon: 'edit', onClick: async () => {
    const v = await promptSheet({ title: h.name, text: t('이날 기록을 숫자로 넣어 주세요.'), value: String(C.valueOn(h, day) || ''), type: 'number', ok: t('저장') });
    if (v == null) return;
    const n = Math.max(0, Number(String(v).replace(',', '.')) || 0);
    await H.setLog(h.id, day, n || null); syncHabitReminders(); onChange?.();
  } });
  if (g !== 'check' && C.valueOn(h, day) > 0) items.push({ label: t('하나 빼기'), icon: 'back', onClick: async () => {
    const v = C.valueOn(h, day) - (g === 'quantity' ? (h.goal.step || 1) : 1);
    await H.setLog(h.id, day, v > 0 ? v : null); onChange?.();
  } });
  items.push(C.isSkip(h, day)
    ? { label: t('건너뛰기 취소'), icon: 'refresh', onClick: async () => { await H.setLog(h.id, day, null); onChange?.(); } }
    : { label: t('이날은 건너뛰기'), sub: t('연속 기록이 끊기지 않아요'), icon: 'close', onClick: async () => { await H.setLog(h.id, day, 'skip'); syncHabitReminders(); onChange?.(); } });
  if (C.valueOn(h, day) > 0 && g === 'check') items.push({ label: t('체크 지우기'), icon: 'trash', onClick: async () => { await H.setLog(h.id, day, null); onChange?.(); } });
  openSheet({ title: `${h.icon} ${h.name}`, text: day, items });
}

/* ── 오늘 목록 ─────────────────────────────────── */
export async function render(root) {
  import('../newbadge.js').then((m) => m.used('habit')).catch(() => {});   // 습관 화면을 열면 NEW 를 지운다 (패치 14)
  await H.load();
  const day = H.today();
  const draw = () => {
    root.innerHTML = '';
    if (H.isLockedOut()) { root.append(el('div', { class: 'empty' }, esc(t('잠금을 풀면 습관이 보여요.')))); return; }
    const { due, off } = H.split(day);
    /* 플러스 전용 (2026-11-01): 체험이 끝난 무료 사용자 — 만든 습관은 보이지만 체크·알림은 멈춤 */
    const locked = !plus.canUseHabits(H.active());
    if (locked) root.append(lockBanner(H.active().length > 0));
    if (!due.length && !off.length) {
      root.append(el('div', { class: 'empty', style: 'margin-top:40px' },
        `<span class="empty-emoji">🌱</span><div class="empty-title">${esc(t('작은 습관 하나부터'))}</div>
         <div class="empty-sub">${esc(t('물 마시기, 약 먹기, 아이 데리러 가기처럼 반복하는 일을 넣어 두면 알려 드리고 체크할 수 있어요.'))}</div>`));
      root.append(addBtn());
      return;
    }
    const doneN = due.filter((h) => C.periodState(h, day, day).state === 'ok' || C.dayDone(h, day)).length;
    const head = el('div', { class: 'hb-head' });
    head.innerHTML = `<div class="hb-ring" style="--p:${due.length ? Math.round(doneN / due.length * 100) : 0}"><b>${doneN}</b><span>/${due.length}</span></div>
      <div><div class="hb-head-t">${esc(t('오늘의 습관'))}</div><div class="hb-head-s">${esc(doneN === due.length && due.length ? t('오늘 할 습관을 다 했어요!') : t('한 번 누르면 체크돼요. 길게 누르면 건너뛰기·직접 넣기.'))}</div></div>`;
    root.append(head);
    const list = el('div', { class: 'hb-list' });
    for (const h of due) list.append(habitRow(h, day, { onChange: draw, locked }));
    root.append(list);
    if (off.length) {
      const d = el('details', { class: 'hb-off' });
      d.append(el('summary', {}, esc(t('오늘은 해당 없음 ({n})', { n: off.length }))));
      const l2 = el('div', { class: 'hb-list' });
      for (const h of off) l2.append(habitRow(h, day, { onChange: draw, locked }));
      d.append(l2);
      root.append(d);
    }
    root.append(addBtn());
  };
  const un = H.subscribe(() => { if (location.hash.startsWith('#/habits')) draw(); });
  draw();
  /* 습관이 하나도 없는데 못 쓰는 사람 — 바로 플러스 안내 */
  if (!plus.canUseHabits(H.active()) && !H.active().length && !H.isLockedOut()) { analytics.design('habit:locked:open'); setTimeout(() => plus.showInfo('habits'), 300); }
  render.teardown = un;
  return {
    title: t('습관'),
    right: [{ icon: 'plus', label: t('습관 추가'), onClick: () => startAdd() }],
  };
}
export function teardown() { try { render.teardown?.(); } catch { /* */ } }

function addBtn() {
  const wrap = el('div');
  const b = el('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:18px' }, `${icon('plus')}<span>${esc(t('습관 추가'))}</span>`);
  b.addEventListener('click', () => startAdd());
  /* 알림이 제때 오게 하기 (2026-10-31 사용자: '배터리 최적화에서 제외해야 하는 거 아니야?') */
  const c = el('button', { class: 'btn btn-ghost btn-block', type: 'button', style: 'margin-top:6px' }, `${icon('bell')}<span>${esc(t('알림이 제때 오게 하기'))}</span>`);
  c.addEventListener('click', () => openReminderCheck());
  wrap.append(b, c);
  return wrap;
}

/**
 * 알림 점검 — 습관 알림(약·아이 데리러 가기)이 정시에 오려면
 *  ① 알림 권한  ② '알람 및 리마인더'(정확한 시각, 안드로이드 14부터 기본 꺼짐)  ③ 배터리 '제한 없음'(삼성 절전 앱에서 빼기).
 * ③은 앱이 직접 끌 수 없다(Play 정책상 배터리 예외를 바로 요청하는 앱은 제한된다) — 앱 설정을 열어 주고 방법을 안내한다.
 */
/* 설정에 다녀오면 점검 창을 다시 열어 바뀐 상태를 보여 준다 */
function reopenOnReturn() {
  const on = () => { if (document.visibilityState !== 'visible') return; document.removeEventListener('visibilitychange', on); setTimeout(() => openReminderCheck(), 600); };
  setTimeout(() => document.addEventListener('visibilitychange', on), 300);
}

export async function openReminderCheck({ reason = '' } = {}) {
  const native = await import('../native.js');
  const perm = await native.notifyPermission();
  const exact = await native.exactAlarmState();
  let bat = await native.batteryUnrestricted();     // true·false, 이 앱 버전에서 못 읽으면 null
  /* 2026-11-01 사용자 신고('배터리 절전에서 뺐는데도 계속 안 됐다고 나온다'): 상태를 못 읽는 앱(1.7.9)에서는
     사용자가 '설정했어요'를 누르면 그 말을 믿고 ✓ 로 둔다 (폰에서 확인해 보니 실제로 예외 목록에 들어 있었다) */
  const batSaid = bat === null && !!(await STORE.metaGet('hbBatteryDone', false));
  const box = el('div', { class: 'hb-chk' });
  const row = (ok, title, sub, label, fn) => {
    const r = el('div', { class: 'hb-chk-row' + (ok ? ' ok' : '') });
    /* ok: true ✓(초록) · false !(주황) · null i(회색, 이 버전에서는 확인할 수 없음) */
    r.innerHTML = `<span class="hb-chk-dot"${ok === null ? ' style="background:var(--muted)"' : ''}>${ok === null ? 'i' : ok ? '✓' : '!'}</span><span class="hb-chk-t"><b>${esc(title)}</b><span>${esc(sub)}</span></span>`;
    if (label) { const b = el('button', { class: 'btn btn-sm', type: 'button' }, esc(label)); b.addEventListener('click', fn); r.append(b); }
    box.append(r);
  };
  row(perm === 'granted', t('알림 허용'), perm === 'granted' ? t('켜져 있어요.') : t('꺼져 있으면 알림이 오지 않아요.'),
    perm === 'granted' ? null : t('허용하기'), async () => { closeSheet(); if (await native.requestNotifyPermission()) { syncHabitReminders(); openReminderCheck(); } else { reopenOnReturn(); (await import('../notifcard.js')).guideToSettings(); } });
  row(exact !== 'denied', t('정해진 시각에 울리기'), exact !== 'denied' ? t('알람 및 리마인더 권한이 켜져 있어요.') : t("'알람 및 리마인더'를 켜야 약·약속 알림이 정시에 와요."),
    exact !== 'denied' ? null : t('설정 열기'), async () => { closeSheet(); reopenOnReturn(); await native.openExactAlarmSetting(); });
  row(batSaid ? true : bat, t('배터리 절전에서 빼기'), bat === true ? t("'제한 없음'으로 되어 있어요. 절전 중에도 알림이 와요.") : batSaid ? t('설정해 두셨다고 표시했어요. 바꾸려면 앱 설정에서 확인해 주세요.') : bat === null ? t("앱 정보 › 배터리에서 '제한 없음'으로 해 두셨다면 [설정했어요]를 눌러 주세요. 이 버전은 상태를 직접 읽지 못해요.")
      : t("앱 정보 › 배터리에서 '제한 없음'을 골라 주세요. 삼성은 설정 › 배터리 › 백그라운드 사용 한도에서 하루칸이 '절전 상태 앱'이나 '깊은 절전 앱'에 있으면 빼 주세요."),
    bat === true ? null : t('앱 설정 열기'), async () => { closeSheet(); reopenOnReturn(); try { await (await import('../weather.js')).openSettings('app'); } catch { toast(t('설정을 열지 못했어요.')); } });
  if (bat === null && !batSaid) {
    const said = el('button', { class: 'btn btn-sm', type: 'button', style: 'margin-inline-start:6px' }, esc(t('설정했어요')));
    said.addEventListener('click', async () => { await STORE.metaSet('hbBatteryDone', true); analytics.design('habit:battery_said'); closeSheet(); openReminderCheck(); });
    box.lastElementChild?.append(said);
  }
  /* 진동·무음 모드에서도 소리로 (1.8.0 중요 알림, 2026-11-01 사용자: '10초 뒤 알림을 눌렀는데 진동으로만 온다').
     예전 시험 버튼은 일반 알림이라 진동 모드면 진동만 왔고, 이미 만든 '약 먹기'는 중요 알림이 꺼져 있었다 */
  const alarmOk = native.alarmAvailable();
  let impSound = '';
  if (alarmOk) {
    await H.load();
    const withRem = H.active().filter((x) => x.reminders?.length);
    const imp = withRem.filter((x) => x.important);
    impSound = imp[0]?.sound || native.ALARM_SOUNDS[0];
    const info = await native.alarmInfo();
    const silent = info && info.ringerMode !== 'normal';
    row(imp.length ? (info?.alarmVolume === 0 ? false : true) : (withRem.length ? false : null), t('진동일 때도 소리로'),
      imp.length ? (info?.alarmVolume === 0 ? t('알람 음량이 0이에요. 휴대폰 음량에서 알람 음량을 올려 주세요.') : t('중요 알림: {n}', { n: imp.map((x) => x.name).join(', ') }))
        : (silent ? t('지금 폰이 진동·무음이라 일반 알림은 진동만 와요. 약 먹기 같은 습관은 중요 알림을 켜 주세요.') : t('약 먹기 같은 습관은 중요 알림을 켜면 진동·무음일 때도 소리로 알려요.')),
      withRem.length ? t('중요 알림 고르기') : null, () => { closeSheet(); pickImportant(withRem); });
  }
  const test = el('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:14px' }, esc(alarmOk ? t('10초 뒤 시험 알림 받기 (알람 소리)') : t('10초 뒤 시험 알림 받기')));
  test.addEventListener('click', async () => {
    const r = await native.testHabitReminder(10, alarmOk ? impSound : '', alarmOk ? alarmTexts(H.active().find((x) => x.important) || { name: t('약 먹기'), icon: '💊' }) : null);   // 1분은 너무 길다 (사용자 2026-10-31). 중요 알림이 되는 앱이면 알람 소리로
    if (r === true) { closeSheet(); toast(alarmOk ? t('10초 뒤에 알람 소리로 와요. 진동 모드여도 소리가 나요.') : t('10초 뒤에 알림이 와요. 화면을 끄고 기다려 보세요.')); }
    else if (r === 'need-exact') toast(t("먼저 '알람 및 리마인더'를 켜 주세요."));
    else if (r === 'no-permission') toast(t('먼저 알림을 허용해 주세요.'));
    else toast(t('앱에서만 쓸 수 있어요.'));
  });
  box.append(test);
  analytics.design('habit:remindcheck:' + (reason || 'open'));
  openSheet({
    title: t('알림이 제때 오게 하기'),
    text: reason === 'exact' ? t("지금은 '알람 및 리마인더' 권한이 꺼져 있어서 습관 알림을 걸지 못했어요.") : (alarmOk ? t('약 먹기처럼 시간이 중요한 알림은 아래 네 가지를 확인해 주세요.') : t('약 먹기처럼 시간이 중요한 알림은 아래 세 가지를 확인해 주세요.')),
    content: box,
  });
}

/* 점검 창에서 바로 중요 알림 켜기 — 알림이 있는 습관 목록에서 고른다 */
async function pickImportant(list) {
  const box = el('div', { class: 'hb-impick' });
  const native = await import('../native.js');
  for (const h of list) {
    const r = el('label', { class: 'hb-impick-row' });
    const cb = el('input', { type: 'checkbox' }); cb.checked = !!h.important;
    r.append(cb, el('span', {}, esc(((h.icon || '') + ' ' + h.name).trim())));
    box.append(r);
    cb.addEventListener('change', async () => {
      h.important = cb.checked; if (h.important && !h.sound) h.sound = native.ALARM_SOUNDS[0];
      await H.put(h); analytics.design('habit:important:' + (h.important ? 'on' : 'off') + ':check');
      syncHabitReminders();
    });
  }
  const done = el('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:14px' }, esc(t('확인')));
  done.addEventListener('click', () => { closeSheet(); openReminderCheck(); });
  box.append(done);
  openSheet({ title: t('중요 알림 고르기'), text: t('고른 습관은 진동·무음일 때도 알람 소리로 알려요. 소리는 습관 고치기에서 바꿀 수 있어요.'), content: box });
}


/* 체험이 끝나 습관을 못 쓰는 사람에게 보이는 띠 (2026-11-01) */
function lockBanner(hasHabits) {
  const b = el('div', { class: 'hb-lock' });
  b.innerHTML = `<div class="hb-lock-t"><span class="plus-mini">PLUS</span> ${esc(t('습관은 하루칸 플러스 기능이에요'))}</div>`
    + `<div class="hb-lock-s">${esc(hasHabits ? t('만들어 둔 습관과 기록은 그대로 있어요. 플러스를 사면 다시 체크하고 알림을 받을 수 있어요.') : t('체험 동안은 무료로 쓸 수 있어요. 플러스를 사면 습관 기록과 알림을 계속 쓸 수 있어요.'))}</div>`;
  const go2 = el('button', { class: 'btn btn-primary btn-sm', type: 'button' }, esc(t('플러스 보기')));
  go2.addEventListener('click', () => plus.showInfo('habits'));
  b.append(go2);
  return b;
}

/** 습관은 플러스 전용 — 못 쓰면 플러스 안내 */
export async function startAdd() {
  await H.load();
  const n = H.active().length;
  if (!plus.canAddHabit(n, H.active())) {
    analytics.design('habit:locked:add');
    const yes = await confirmSheet({
      title: t('습관은 하루칸 플러스 기능이에요'),
      text: t('체험 동안은 무료로 쓸 수 있어요. 플러스를 사면 습관 기록과 알림을 계속 쓸 수 있어요.') + (n ? ' ' + t('만들어 둔 습관과 기록은 그대로 있어요. 플러스를 사면 다시 체크하고 알림을 받을 수 있어요.') : ''),
      ok: t('플러스 보기'),
    });
    if (yes) plus.showInfo('habits');
    return;
  }
  go('/habit-edit');
}

/* ── 예시 ─────────────────────────────────────── */
export function templates() {
  return [
    { name: t('물 마시기'), icon: '💧', color: '#4f78b8', goal: { kind: 'count', target: 8 }, schedule: { kind: 'daily' }, reminders: ['10:00', '15:00'] },
    { name: t('약 먹기'), icon: '💊', color: '#d0555f', goal: { kind: 'count', target: 2 }, schedule: { kind: 'daily' }, reminders: ['08:30', '20:30'], important: true, sound: 'hk_bell' },
    { name: t('아이 데리러 가기'), icon: '🧒', color: '#d98b2b', goal: { kind: 'check' }, schedule: { kind: 'weekdays', mask: 0b11111 }, reminders: ['15:30'], important: true, sound: 'hk_bell' },
    { name: t('운동하기'), icon: '🏃', color: '#5f9a52', goal: { kind: 'check' }, schedule: { kind: 'weekly', n: 3 }, reminders: ['19:00'] },
    { name: t('커피 줄이기'), icon: '☕', color: '#9a6b4f', goal: { kind: 'limit', max: 2, period: 'day' }, schedule: { kind: 'daily' }, reminders: [] },
    { name: t('책 읽기'), icon: '📚', color: '#7a5fb0', goal: { kind: 'check' }, schedule: { kind: 'daily' }, reminders: ['22:00'] },
  ];
}

/* ── 상세 ─────────────────────────────────────── */
export const Detail = {
  async render(root, params) {
    await H.load();
    let h = H.byId(params.id);
    if (!h) { root.append(el('div', { class: 'empty' }, esc(t('습관을 찾지 못했어요.')))); return { title: t('습관'), left: { icon: 'back', onClick: back } }; }
    let month = C.monthStart(H.today());
    const draw = () => {
      h = H.byId(params.id); if (!h) return;
      root.innerHTML = '';
      const today = H.today();
      const top = el('div', { class: 'hb-dt-top', style: `--hc:${h.color}` });
      top.innerHTML = `<div class="hb-dt-ico">${esc(h.icon)}</div><div><div class="hb-dt-name">${esc(h.name)}</div><div class="hb-sub">${esc([scheduleText(h), goalText(h)].filter(Boolean).join(' · '))}</div></div>`;
      root.append(top);
      const rate = C.completionRate(h, today);
      const unitN = (n) => ({ day: t('{n}일'), week: t('{n}주'), month: t('{n}달') })[C.unitOf(h)].replace('{n}', n);
      const stats = el('div', { class: 'hb-stats' });
      stats.innerHTML = `<div><b>${esc(unitN(C.currentStreak(h, today)))}</b><span>${esc(t('지금 연속'))}</span></div>
        <div><b>${esc(unitN(C.bestStreak(h, today)))}</b><span>${esc(t('최고 연속'))}</span></div>
        <div><b>${rate == null ? '–' : Math.round(rate * 100) + '%'}</b><span>${esc(t('최근 30일'))}</span></div>`;
      root.append(stats);
      /* 달력 */
      const cal = el('div', { class: 'card hb-cal', style: `--hc:${h.color}` });
      const d0 = C.dateOf(month);
      const nav = el('div', { class: 'hb-cal-nav' });
      const pv = el('button', { class: 'icon-btn', type: 'button', 'aria-label': t('이전 달') }, icon('back'));
      const nx = el('button', { class: 'icon-btn', type: 'button', 'aria-label': t('다음 달') }, icon('chev'));
      pv.addEventListener('click', () => { const d = C.dateOf(month); d.setMonth(d.getMonth() - 1); month = C.keyOf(d); draw(); });
      nx.addEventListener('click', () => { const d = C.dateOf(month); d.setMonth(d.getMonth() + 1); month = C.keyOf(d); draw(); });
      nav.append(pv, el('div', { class: 'hb-cal-t' }, `${d0.getFullYear()}.${d0.getMonth() + 1}`), nx);
      cal.append(nav);
      const grid = el('div', { class: 'hb-grid' });
      for (const w of WD()) grid.append(el('div', { class: 'hb-wd' }, esc(w)));
      for (let i = 0; i < C.weekdayIdx(month); i++) grid.append(el('div'));
      for (let k = month; k.slice(0, 7) === month.slice(0, 7); k = C.addDays(k, 1)) {
        const cls = ['hb-day'];
        if (C.isSkip(h, k)) cls.push('skip');
        else if (C.dayDone(h, k)) cls.push('done');
        else if (C.valueOn(h, k) > 0) cls.push('part');
        if (!C.scheduledOn(h, k)) cls.push('off');
        if (k === today) cls.push('today');
        const b = el('button', { class: cls.join(' '), type: 'button', disabled: k > today ? '' : null }, String(Number(k.slice(8))));
        if (k > today) b.disabled = true;
        b.addEventListener('click', async () => {
          if (!plus.canUseHabits(H.active())) { analytics.design('habit:locked:check'); plus.showInfo('habits'); return; }
          if ((h.goal?.kind || 'check') === 'check' && !C.isSkip(h, k)) { await H.tap(h.id, k); draw(); syncHabitReminders(); }
          else dayMenu(h, k, draw);
        });
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); if (!plus.canUseHabits(H.active())) return; dayMenu(h, k, draw); });
        grid.append(b);
      }
      cal.append(grid);
      cal.append(el('div', { class: 'hb-hint' }, esc(t('날짜를 누르면 체크, 길게 누르면 건너뛰기·직접 넣기'))));
      root.append(cal);
      if (h.reminders?.length) root.append(el('div', { class: 'hb-hint', style: 'margin-top:10px' }, esc(t('알림: {t}', { t: h.reminders.join(', ') }))));
      const row = el('div', { class: 'btn-row', style: 'margin-top:18px' });
      const ar = el('button', { class: 'btn', type: 'button' }, esc(h.archived ? t('다시 꺼내기') : t('보관하기')));
      ar.addEventListener('click', async () => { h.archived = !h.archived; await H.put(h); syncHabitReminders(); toast(h.archived ? t('보관했어요. 기록은 그대로 남아요.') : t('다시 꺼냈어요.')); draw(); });
      const del = el('button', { class: 'btn', type: 'button', style: 'color:var(--danger, #c0392b)' }, esc(t('삭제')));
      del.addEventListener('click', async () => {
        if (!(await confirmSheet({ title: t('이 습관을 지울까요?'), text: t('기록도 함께 지워져요. 되돌릴 수 없어요.'), ok: t('삭제'), danger: true }))) return;
        await H.remove(h.id); syncHabitReminders(); toast(t('지웠어요.')); go('/habits', { replace: true });
      });
      row.append(ar, del);
      root.append(row);
    };
    draw();
    return { title: t('습관'), left: { icon: 'back', onClick: back }, right: [{ icon: 'edit', label: t('고치기'), onClick: () => (plus.canUseHabits(H.active()) ? go(`/habit-edit?id=${encodeURIComponent(h.id)}`) : plus.showInfo('habits')) }] };
  },
};

/* ── 만들기·고치기 ─────────────────────────────── */
export const Edit = {
  async render(root, params) {
    await H.load();
    /* 플러스 전용 (2026-11-01) — 주소로 바로 들어와도 막는다 */
    if (!plus.canUseHabits(H.active())) {
      root.append(lockBanner(H.active().length > 0));
      setTimeout(() => plus.showInfo('habits'), 200);
      return { title: t('습관'), left: { icon: 'back', onClick: back } };
    }
    const old = params.id ? H.byId(params.id) : null;
    const h = old ? JSON.parse(JSON.stringify(old)) : H.newHabit();
    const isNew = !old;

    const form = el('div', { class: 'hb-form' });
    const draw = () => {
      form.innerHTML = '';
      if (isNew && !h.name) {
        form.append(el('div', { class: 'section-title' }, esc(t('예시로 시작하기'))));
        const tp = el('div', { class: 'chip-row' });
        for (const x of templates()) {
          const c = el('button', { class: 'chip', type: 'button' }, `${esc(x.icon)} ${esc(x.name)}`);
          c.addEventListener('click', () => { Object.assign(h, JSON.parse(JSON.stringify(x))); draw(); });
          tp.append(c);
        }
        form.append(tp);
      }
      /* 이름 */
      form.append(el('div', { class: 'section-title', style: 'margin-top:18px' }, esc(t('이름'))));
      const name = el('input', { class: 'lock-input hb-in', type: 'text', value: h.name, placeholder: t('예: 물 마시기'), maxlength: '40', style: 'text-align:start' });
      name.addEventListener('input', () => { h.name = name.value; });
      form.append(name);
      /* 아이콘·색 */
      form.append(el('div', { class: 'section-title', style: 'margin-top:16px' }, esc(t('아이콘과 색'))));
      const em = el('div', { class: 'hb-emojis' });
      for (const e of H.EMOJIS) { const b = el('button', { class: 'hb-emo' + (h.icon === e ? ' on' : ''), type: 'button' }, e); b.addEventListener('click', () => { h.icon = e; draw(); }); em.append(b); }
      form.append(em);
      const cl = el('div', { class: 'hb-colors' });
      for (const c of H.COLORS) { const b = el('button', { class: 'hb-col' + (h.color === c ? ' on' : ''), type: 'button', style: `background:${c}`, 'aria-label': c }); b.addEventListener('click', () => { h.color = c; draw(); }); cl.append(b); }
      form.append(cl);
      /* 목표 */
      form.append(el('div', { class: 'section-title', style: 'margin-top:16px' }, esc(t('목표'))));
      const gk = h.goal.kind;
      const gr = el('div', { class: 'chip-row' });
      for (const [k, lab] of [['check', t('한 번 하기')], ['count', t('하루 여러 번')], ['quantity', t('양 채우기')], ['limit', t('줄이기')]]) {
        const b = el('button', { class: 'chip' + (gk === k ? ' on' : ''), type: 'button' }, esc(lab));
        b.addEventListener('click', () => {
          h.goal = k === 'check' ? { kind: 'check' } : k === 'count' ? { kind: 'count', target: 8 } : k === 'quantity' ? { kind: 'quantity', target: 2000, unit: 'ml', step: 250 } : { kind: 'limit', max: 2, period: 'day' };
          draw();
        });
        gr.append(b);
      }
      form.append(gr);
      const num = (label, val, set) => {
        const w = el('label', { class: 'hb-num' }, `<span>${esc(label)}</span>`);
        const i = el('input', { class: 'lock-input', type: 'number', inputmode: 'numeric', value: String(val ?? ''), min: '1' });
        i.addEventListener('input', () => set(Math.max(1, Number(i.value) || 1)));
        w.append(i); return w;
      };
      if (gk === 'count') form.append(num(t('하루 몇 번'), h.goal.target, (v) => { h.goal.target = v; }));
      if (gk === 'quantity') {
        form.append(num(t('하루 목표량'), h.goal.target, (v) => { h.goal.target = v; }));
        form.append(num(t('한 번 누를 때'), h.goal.step, (v) => { h.goal.step = v; }));
        const u = el('label', { class: 'hb-num' }, `<span>${esc(t('단위'))}</span>`);
        const ui = el('input', { class: 'lock-input', type: 'text', value: h.goal.unit || '', maxlength: '8' });
        ui.addEventListener('input', () => { h.goal.unit = ui.value; }); u.append(ui); form.append(u);
      }
      if (gk === 'limit') {
        form.append(num(t('최대 몇 번'), h.goal.max, (v) => { h.goal.max = v; }));
        const pr = el('div', { class: 'chip-row', style: 'margin-top:8px' });
        for (const [k, lab] of [['day', t('하루에')], ['week', t('한 주에')], ['month', t('한 달에')]]) {
          const b = el('button', { class: 'chip' + ((h.goal.period || 'day') === k ? ' on' : ''), type: 'button' }, esc(lab));
          b.addEventListener('click', () => { h.goal.period = k; draw(); }); pr.append(b);
        }
        form.append(pr);
      }
      /* 반복 */
      if (gk !== 'limit') {
        form.append(el('div', { class: 'section-title', style: 'margin-top:16px' }, esc(t('반복'))));
        const sk = h.schedule.kind;
        const sr = el('div', { class: 'chip-row' });
        for (const [k, lab] of [['daily', t('매일')], ['weekdays', t('요일 정하기')], ['weekly', t('주 몇 회')], ['monthly', t('월 몇 회')], ['every', t('며칠마다')]]) {
          const b = el('button', { class: 'chip' + (sk === k ? ' on' : ''), type: 'button' }, esc(lab));
          b.addEventListener('click', () => {
            h.schedule = k === 'weekdays' ? { kind: k, mask: 0b11111 } : k === 'weekly' ? { kind: k, n: 3 } : k === 'monthly' ? { kind: k, n: 10 } : k === 'every' ? { kind: k, n: 2 } : { kind: 'daily' };
            draw();
          });
          sr.append(b);
        }
        form.append(sr);
        if (sk === 'weekdays') {
          const wr = el('div', { class: 'hb-wds' });
          WD().forEach((w, i) => {
            const on = h.schedule.mask & (1 << i);
            const b = el('button', { class: 'hb-wdb' + (on ? ' on' : ''), type: 'button' }, esc(w));
            b.addEventListener('click', () => { h.schedule.mask ^= (1 << i); if (!h.schedule.mask) h.schedule.mask = 1 << i; draw(); });
            wr.append(b);
          });
          form.append(wr);
        }
        if (sk === 'weekly') form.append(num(t('한 주에 몇 번'), h.schedule.n, (v) => { h.schedule.n = Math.min(7, v); }));
        if (sk === 'monthly') form.append(num(t('한 달에 몇 번'), h.schedule.n, (v) => { h.schedule.n = Math.min(31, v); }));
        if (sk === 'every') form.append(num(t('며칠마다'), h.schedule.n, (v) => { h.schedule.n = Math.max(2, Math.min(365, v)); }));
      }
      /* 알림 */
      form.append(el('div', { class: 'section-title', style: 'margin-top:16px' }, esc(t('알림'))));
      const rl = el('div', { class: 'hb-rems' });
      /* 알림 시각을 카드로 (2026-11-01 사용자: '시간이 화면에 이쁘지 않게 표시된다') — 종 아이콘 + 오전/오후 작게 + 시각 크게.
         카드를 누르면 시간 고르기 창, × 는 지우기. 24시간 언어는 오전/오후 없이 시각만 */
      rl.style.setProperty('--hc', h.color || 'var(--accent)');
      (h.reminders || []).forEach((tm, i) => {
        const r = el('div', { class: 'hb-rem' });
        const ti = timeInput(tm, { faceClass: 'hb-rem-face' });
        const paint = () => {
          const p = clockParts(ti.input.value || tm);
          ti.wrap.querySelector('.hb-rem-face').innerHTML = `<span class="hb-rem-ico">${icon('bell')}</span><span class="hb-rem-t">${p.ap ? `<span class="ap">${esc(p.ap)}</span>` : ''}<span class="hm">${esc(p.hm)}</span></span>`;
        };
        paint();
        const upd = () => { h.reminders[i] = ti.input.value; paint(); };
        ti.input.addEventListener('change', upd);
        ti.input.addEventListener('input', upd);
        const x = el('button', { class: 'hb-rem-x', type: 'button', 'aria-label': t('지우기') }, icon('close'));
        x.addEventListener('click', (ev) => { ev.stopPropagation(); h.reminders.splice(i, 1); draw(); });
        r.append(ti.wrap, x); rl.append(r);
      });
      const addR = el('button', { class: 'hb-rem-add', type: 'button' }, `${icon('plus')}<span>${esc(t('알림 시간 추가'))}</span>`);
      /* 누르면 바로 시간 고르기 창 (2026-11-01 사용자 지시) — 예전엔 09:00 칸을 먼저 만들고 다시 눌러야 했다 */
      addR.addEventListener('click', async () => {
        const last = (h.reminders || []).slice(-1)[0];
        const v = await openTimePicker(last || '09:00', { title: t('알림 시간 추가') });
        if (!v) return;
        if (!(h.reminders || []).includes(v)) h.reminders = [...(h.reminders || []), v].sort();
        draw();
      });
      rl.append(addR);
      form.append(rl);
      form.append(el('div', { class: 'hb-hint' }, esc(t('그날 이미 다 했으면 알림을 보내지 않아요.'))));
      /* 중요 알림 (1.8.0, 2026-10-31 사용자: '약 먹기는 진동으로 해 놓으면 알람이 의미가 없다').
         알람 소리 플러그인이 있는 앱에서만 보인다 — 패치만 받은 옛 앱에서는 숨긴다 */
      if (NATIVE.alarmAvailable()) form.append(importantBox(h));
      /* 저장 */
      const sv = el('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:22px' }, esc(isNew ? t('습관 만들기') : t('저장')));
      sv.addEventListener('click', save);
      form.append(sv);
    };
    async function save() {
      h.name = (h.name || '').trim();
      if (!h.name) { toast(t('이름을 넣어 주세요.')); return; }
      if (isNew && !plus.canAddHabit(H.active().length)) { closeSheet(); return startAdd(); }
      h.reminders = [...new Set((h.reminders || []).filter((x) => /^\d\d:\d\d$/.test(x)))].sort();
      await H.put(h);
      if (isNew) { await plus.bumpHabitFloor(H.active().length); analytics.design('habit:create:' + h.goal.kind); }
      let r = await syncHabitReminders();
      /* 2026-10-31 (광고분석 세션 지적): 알림 권한이 없으면 예전엔 권한 창 없이 조용히 저장되고, 경고 토스트도 '만들었어요'에 덮였다.
         이제 알림 시각이 있는 습관을 저장할 때마다 권한을 묻고, 이미 거절(다시 묻지 않음)이면 폰 설정으로 안내한다 */
      let perm = 'granted';
      const askedNow = r === 'no-permission';
      /* 습관 알림을 켜면 매일 일기 알림도 같이 (A안) — 토스트는 '만들었어요' 다음에 */
      const tellDaily = (tm) => { if (tm) setTimeout(() => toast(t('일기 알림도 매일 {t}에 함께 켰어요. 설정에서 끌 수 있어요.', { t: i18n.fmtClock(tm) })), 1800); };
      if (r === 'no-permission' && h.reminders.length && native0().isNative()) {
        const NC = await import('../notifcard.js');
        perm = await NC.askPermission();
        analytics.design('habit:notif_ask:' + perm);
        if (perm === 'granted') r = await syncHabitReminders();
      }
      toast(isNew ? t('습관을 만들었어요.') : t('저장했어요.'));
      go('/habits', { replace: true });
      if (perm !== 'granted') {
        setTimeout(async () => {
          const NC = await import('../notifcard.js');
          if (await NC.guideToSettings()) {
            /* 설정에서 돌아오면 다시 건다 */
            const back = async () => { if (document.hidden) return; document.removeEventListener('visibilitychange', back); await syncHabitReminders().catch(() => {}); tellDaily(await dailyAlongWithHabit(true).catch(() => null)); };
            document.addEventListener('visibilitychange', back);
          } else toast(t('알림 권한이 없어 알림은 오지 않아요.'));   // 안내 창 글자를 덮지 않게, 닫았을 때만
        }, 600);
        return;
      }
      if (h.reminders.length && native0().isNative()) tellDaily(await dailyAlongWithHabit(askedNow).catch(() => null));
      /* 알림을 건 습관: 정시 권한이 없으면 바로, 아니면 처음 한 번만 점검 창을 띄운다 (예전에는 권한이 없으면 조용히 알림이 안 걸렸다) */
      if (h.reminders.length && native0().isNative()) {
        if (r === 'need-exact') setTimeout(() => openReminderCheck({ reason: 'exact' }), 500);
        else if (!(await store0().metaGet('hbRemindTip', false))) { await store0().metaSet('hbRemindTip', true); setTimeout(() => openReminderCheck({ reason: 'first' }), 500); }
      }
    }
    draw();
    root.append(form);
    return { title: isNew ? t('새 습관') : t('습관 고치기'), left: { icon: 'back', onClick: back } };
  },
};

/* ── 중요 알림 상자 (1.8.0) ─────────────────────── */
const SOUND_NAMES = { hk_bell: '맑은 종', hk_marimba: '마림바', hk_wind: '바람 풍경', hk_soft: '부드러운 딩동' };
function importantBox(h) {
  const box = el('div', { class: 'hb-imp' + (h.important ? ' on' : '') });
  const row = el('div', { class: 'hb-imp-row' });
  const txt = el('div', { class: 'hb-imp-t' }, `<b>${esc(t('중요 알림'))}</b><span>${esc(t('진동·무음일 때도 알람 소리로 알려요.'))}</span>`);
  const sw = el('div', { class: 'switch' + (h.important ? ' on' : ''), role: 'switch', 'aria-checked': String(!!h.important), tabindex: '0', 'aria-label': t('중요 알림') });
  row.append(txt, sw);
  const more = el('div', { class: 'hb-imp-more' });
  const warn = el('div', { class: 'hb-imp-warn', hidden: '' });
  const paintMore = () => {
    more.innerHTML = '';
    if (!h.important) return;
    if (!NATIVE.ALARM_SOUNDS.includes(h.sound)) h.sound = NATIVE.ALARM_SOUNDS[0];
    more.append(el('div', { class: 'hb-imp-lab' }, esc(t('알람 소리'))));
    const list = el('div', { class: 'hb-snd' });
    for (const id of NATIVE.ALARM_SOUNDS) {
      const b = el('button', { class: 'hb-snd-b' + (h.sound === id ? ' on' : ''), type: 'button', 'data-s': id }, `${icon('music')}<span>${esc(t(SOUND_NAMES[id]))}</span>`);
      b.addEventListener('click', () => {
        h.sound = id;
        list.querySelectorAll('.hb-snd-b').forEach((x) => x.classList.toggle('on', x.dataset.s === id));
        NATIVE.previewAlarm(id);
        haptic(6);
      });
      list.append(b);
    }
    more.append(list);
    const test = el('button', { class: 'btn btn-ghost btn-block hb-snd-test', type: 'button' }, esc(t('10초 뒤 이 소리로 시험')));
    test.addEventListener('click', async () => {
      NATIVE.stopAlarmPreview();
      const r = await NATIVE.testHabitReminder(10, h.sound, alarmTexts({ ...h, name: h.name || t('약 먹기') }));
      if (r === true) toast(t('10초 뒤에 알림이 와요. 화면을 끄고 기다려 보세요.'));
      else if (r === 'no-permission') toast(t('먼저 알림을 허용해 주세요.'));
      else openReminderCheck({ reason: 'exact' });
    });
    more.append(warn, test);
    NATIVE.alarmInfo().then((i) => {
      if (!i || !warn.isConnected) return;
      if (i.alarmVolume === 0) { warn.textContent = t('알람 음량이 0이에요. 휴대폰 음량에서 알람 음량을 올려 주세요.'); warn.hidden = false; }
    });
  };
  const toggle = () => {
    h.important = !h.important;
    sw.classList.toggle('on', h.important); sw.setAttribute('aria-checked', String(h.important));
    box.classList.toggle('on', h.important);
    if (!h.important) NATIVE.stopAlarmPreview();
    paintMore();
  };
  sw.addEventListener('click', toggle);
  sw.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } });
  box.append(row, more);
  paintMore();
  return box;
}

/* 'HH:MM' → { ap: '오전'·'PM'·'' (24시간 언어는 빈 값), hm: '8:30' } — 앱 언어 표기 그대로 나눈다 */
function clockParts(hhmm) {
  const [hh, mm] = String(hhmm || '').split(':').map(Number);
  if (!Number.isFinite(hh)) return { ap: '', hm: String(hhmm || '') };
  try {
    const parts = new Intl.DateTimeFormat(i18n.locale(), { hour: 'numeric', minute: '2-digit' }).formatToParts(new Date(2024, 0, 1, hh, mm || 0));
    const ap = parts.filter((p) => p.type === 'dayPeriod').map((p) => p.value).join('').trim();
    const hm = parts.filter((p) => p.type !== 'dayPeriod').map((p) => p.value).join('').trim();
    return { ap, hm };
  } catch { return { ap: '', hm: hhmm }; }
}