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
import { go, back, syncHabitReminders } from '../app.js';
import { el, esc, icon, toast, haptic, openSheet, closeSheet, confirmSheet, promptSheet, timeInput } from '../ui.js';
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
export function habitRow(h, day, { onChange } = {}) {
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
  btn.addEventListener('pointerdown', () => { lp = setTimeout(() => { lp = 'fired'; dayMenu(h, day, onChange); }, 520); });
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
    for (const h of due) list.append(habitRow(h, day, { onChange: draw }));
    root.append(list);
    if (off.length) {
      const d = el('details', { class: 'hb-off' });
      d.append(el('summary', {}, esc(t('오늘은 해당 없음 ({n})', { n: off.length }))));
      const l2 = el('div', { class: 'hb-list' });
      for (const h of off) l2.append(habitRow(h, day, { onChange: draw }));
      d.append(l2);
      root.append(d);
    }
    root.append(addBtn());
  };
  const un = H.subscribe(() => { if (location.hash.startsWith('#/habits')) draw(); });
  draw();
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
  const bat = await native.batteryUnrestricted();     // true·false, 이 앱 버전에서 못 읽으면 null
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
  row(bat, t('배터리 절전에서 빼기'), bat === true ? t("'제한 없음'으로 되어 있어요. 절전 중에도 알림이 와요.") : bat === null ? t('이 버전에서는 상태를 확인할 수 없어요. 아래 방법대로 설정했다면 그대로 두세요.')
      : t("앱 정보 › 배터리에서 '제한 없음'을 골라 주세요. 삼성은 설정 › 배터리 › 백그라운드 사용 한도에서 하루칸이 '절전 상태 앱'이나 '깊은 절전 앱'에 있으면 빼 주세요."),
    bat === true ? null : t('앱 설정 열기'), async () => { closeSheet(); reopenOnReturn(); try { await (await import('../weather.js')).openSettings('app'); } catch { toast(t('설정을 열지 못했어요.')); } });
  const test = el('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:14px' }, esc(t('1분 뒤 시험 알림 받기')));
  test.addEventListener('click', async () => {
    const r = await native.testHabitReminder(60);
    if (r === true) { closeSheet(); toast(t('1분 뒤에 알림이 와요. 화면을 끄고 기다려 보세요.')); }
    else if (r === 'need-exact') toast(t("먼저 '알람 및 리마인더'를 켜 주세요."));
    else if (r === 'no-permission') toast(t('먼저 알림을 허용해 주세요.'));
    else toast(t('앱에서만 쓸 수 있어요.'));
  });
  box.append(test);
  analytics.design('habit:remindcheck:' + (reason || 'open'));
  openSheet({
    title: t('알림이 제때 오게 하기'),
    text: reason === 'exact' ? t("지금은 '알람 및 리마인더' 권한이 꺼져 있어서 습관 알림을 걸지 못했어요.") : t('약 먹기처럼 시간이 중요한 알림은 아래 세 가지를 확인해 주세요.'),
    content: box,
  });
}

/** 무료는 3개까지 — 넘으면 플러스 안내 */
export async function startAdd() {
  await H.load();
  const n = H.active().length;
  if (!plus.canAddHabit(n)) {
    analytics.design('habit:limit');
    const yes = await confirmSheet({
      title: t('습관은 무료로 {n}개까지예요', { n: plus.habitCeiling() }),
      text: t('하루칸 플러스는 습관을 개수 제한 없이 만들 수 있어요. 지금 있는 습관은 그대로 써요.'),
      ok: t('플러스 보기'),
    });
    if (yes) plus.showInfo('habit_limit');
    return;
  }
  go('/habit-edit');
}

/* ── 예시 ─────────────────────────────────────── */
export function templates() {
  return [
    { name: t('물 마시기'), icon: '💧', color: '#4f78b8', goal: { kind: 'count', target: 8 }, schedule: { kind: 'daily' }, reminders: ['10:00', '15:00'] },
    { name: t('약 먹기'), icon: '💊', color: '#d0555f', goal: { kind: 'count', target: 2 }, schedule: { kind: 'daily' }, reminders: ['08:30', '20:30'] },
    { name: t('아이 데리러 가기'), icon: '🧒', color: '#d98b2b', goal: { kind: 'check' }, schedule: { kind: 'weekdays', mask: 0b11111 }, reminders: ['15:30'] },
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
          if ((h.goal?.kind || 'check') === 'check' && !C.isSkip(h, k)) { await H.tap(h.id, k); draw(); syncHabitReminders(); }
          else dayMenu(h, k, draw);
        });
        b.addEventListener('contextmenu', (e) => { e.preventDefault(); dayMenu(h, k, draw); });
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
    return { title: t('습관'), left: { icon: 'back', onClick: back }, right: [{ icon: 'edit', label: t('고치기'), onClick: () => go(`/habit-edit?id=${encodeURIComponent(h.id)}`) }] };
  },
};

/* ── 만들기·고치기 ─────────────────────────────── */
export const Edit = {
  async render(root, params) {
    await H.load();
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
      (h.reminders || []).forEach((tm, i) => {
        const r = el('div', { class: 'hb-rem' });
        const ti = timeInput(tm);
        ti.input.addEventListener('change', () => { h.reminders[i] = ti.input.value; });
        ti.input.addEventListener('input', () => { h.reminders[i] = ti.input.value; });
        const x = el('button', { class: 'icon-btn', type: 'button', 'aria-label': t('지우기') }, icon('close'));
        x.addEventListener('click', () => { h.reminders.splice(i, 1); draw(); });
        r.append(ti.wrap, x); rl.append(r);
      });
      const addR = el('button', { class: 'btn btn-ghost', type: 'button' }, `${icon('plus')}<span>${esc(t('알림 시간 추가'))}</span>`);
      addR.addEventListener('click', () => { h.reminders = [...(h.reminders || []), '09:00']; draw(); });
      rl.append(addR);
      form.append(rl);
      form.append(el('div', { class: 'hb-hint' }, esc(t('그날 이미 다 했으면 알림을 보내지 않아요.'))));
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
      const r = await syncHabitReminders({ ask: !!h.reminders.length });
      if (r === 'no-permission' && h.reminders.length) toast(t('알림 권한이 없어 알림은 오지 않아요.'));
      toast(isNew ? t('습관을 만들었어요.') : t('저장했어요.'));
      go('/habits', { replace: true });
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
