/* ===========================================================
   views/schedule.js — 스케줄표: 학교·학원처럼 다니는 곳 (2026-11-21)
     사용자: '습관에 있어야 할 게 아니라 학원이나 학교 스케줄표로 별도로', '알림에 일정·습관·스케줄표',
             '학생이 요구하는 내용들도 보완' (의견 71번 학생 메일 11/16·11/19)
     #/schedule
   ① 오늘 — 오늘 가는 곳 출석·결석·휴일 한 번에, 오늘 할 일 한 것/남은 것
   ② 이번 주 시간표 — 다니는 곳 × 월~일, 지난날·오늘은 눌러 바꾸고 앞날은 '휴일 미리 지정'
   ③ 진도 — '수학 20단원 중 7단원' 처럼 끝낸 것/남은 것
   ④ 보고서 — 이번 주/이번 달: 곳마다 출석·결석·휴일·출석률(지난 기간과 비교), 처음부터 합계, 진도·할 일, 최근 6달 출석률
   다니는 곳은 습관 저장소의 '출석 체크'(goal.kind 'attend')를 그대로 쓴다 — 출석 기록·알림·위젯이 이미 그 형식이라서.
   진도는 메타 'schoolProgress' 에 둔다: [{ id, name, total, done, hist:{ 'YYYY-MM-DD': 그날 끝낸 수 } }]
   =========================================================== */
import * as H from '../habits.js';
import * as HI from '../habiticons.js';
import * as C from '../habitcore.js';
import * as P from '../plans.js';
import * as plus from '../plus.js';
import * as analytics from '../analytics.js';
import * as STORE from '../store.js';
import { go, syncHabitReminders } from '../app.js';
import { el, esc, icon, toast, haptic, openSheet, closeSheet, confirmSheet, promptSheet, fmtDate } from '../ui.js';
import * as i18n from '../i18n.js';
import { t } from '../i18n.js';

const PKEY = 'schoolProgress';
/** 스케줄표를 쓰나 (2026-11-21 사용자: '설정에서 ON/OFF, 필요 없는 사람에게 메뉴가 많으면 혼란') — 기본 끔.
    2026-11-22 사용자: '배포할 때는 기본으로 꺼 놓았다가 옵션에서 켜는 걸로' — 출석을 만든 사람도 자동으로 켜지 않는다 (출석은 아직 배포된 적 없음) */
export function enabled() {
  return STORE.getSettings().scheduleOn === true;
}
let weekOff = 0;
let repMode = 'week';
let trendSel = 'all';   // 보고서 6달 막대에 보이는 곳 (2026-11-21)

async function loadProgress() { try { return (await STORE.metaGet(PKEY, [])) || []; } catch { return []; } }
async function saveProgress(list) { await STORE.metaSet(PKEY, list); }

/** 그날 상태: in 출석 · ab 결석 · ho 휴일 · '' 안 적음 */
function stateOf(h, k) {
  const v = h.log?.[k];
  if (v === 'absent') return 'ab';
  if (v === 'skip') return 'ho';
  if (typeof v === 'number' && v > 0) return 'in';
  return '';
}
const timeOf = (h) => (Array.isArray(h.reminders) && h.reminders.filter(Boolean)[0]) || '';
/** 짧은 달 이름 — 한·중·일은 '6월'처럼, 그 밖은 Jun·juin처럼 (2026-11-22 번역 점검: '6Monat'으로 보였다) */
function monShort(m) {
  if (['ko', 'ja', 'zh'].includes(i18n.current())) return `${m}${t('월')}`;
  try { return new Intl.DateTimeFormat(i18n.locale(), { month: 'short' }).format(new Date(2024, m - 1, 1)); } catch { return String(m); }
}
/** 세기 시작일 — 만든 날보다 앞선 날을 채워 넣었으면 그날부터 (2026-11-22 아이폰분석 담당 발견: 이번 주에는 잡히고 '처음부터'에는 빠졌다) */
function startOf(h) {
  const ks = Object.keys(h.log || {}).filter((k) => h.log[k] != null).sort();
  return h.start && ks[0] && ks[0] < h.start ? ks[0] : h.start;
}
function fmtDay(k) { const d = C.dateOf(k); return `${d.getMonth() + 1}.${d.getDate()}`; }

/* ── 화면 ─────────────────────────────────────── */
export async function render(root) {
  await H.load();
  try { await P.loadAll(); } catch { /* */ }
  const today = H.today();
  analytics.design('schedule:open');
  /* 2026-11-21 사용자 '같은 항목이 2개씩': 처음 그리기와 저장 알림(subscribe)이 거의 동시에 돌면 둘 다 비운 뒤 기다렸다가 각각 붙였다.
     기다릴 것을 먼저 끝내고, 그사이 더 새로운 그리기가 시작됐으면 이번 것은 버린다 */
  let gen = 0;
  const draw = async () => {
    const my = ++gen;
    const prog = await loadProgress();
    if (my !== gen) return;
    root.innerHTML = '';
    root.append(segNav('schedule'));
    import('../newbadge.js').then((N) => N.used('attend')).catch(() => {});   // 출석관리 NEW 지우기 (패치 94)
  if (H.isLockedOut()) { root.append(el('div', { class: 'empty' }, esc(t('잠금을 풀면 보여요.')))); return; }
    const places = H.active().filter((x) => C.isAttend(x));
    const locked = !plus.canUseHabits(H.active());
    if (locked) root.append(lockCard());
    if (!places.length && !prog.length) { root.append(emptyCard()); return; }
    root.append(todayCard(places, today, { locked, onChange: draw }));
    if (places.length) root.append(weekCard(places, today, { locked, onChange: draw }));
    root.append(progressCard(prog, today, { locked, onChange: draw }));
    root.append(reportCard(places, prog, today, { onChange: draw }));
    root.append(addRow({ locked, onChange: draw }));
  };
  const un = H.subscribe(() => { if (location.hash.startsWith('#/schedule')) draw(); });
  await draw();
  render.teardown = () => { un(); };
  return {
    title: t('출석관리'),
    right: [{ icon: 'plus', label: t('추가'), onClick: () => addMenu({ onChange: draw }) }],
  };
}
export function teardown() { try { render.teardown?.(); } catch { /* */ } }

/** 위 전환: 일정 | 습관 | 스케줄표 */
export function segNav(cur) {
  const nav = el('div', { class: 'sc-seg' });
  const items = [['plans', t('일정'), '/plans'], ['habits', t('습관'), '/habits']];
  if (enabled() || cur === 'schedule') items.push(['schedule', t('출석관리'), '/schedule']);
  for (const [k, lab, to] of items) {
    const b = el('button', { class: 'sc-seg-b' + (k === cur ? ' on' : ''), type: 'button' }, esc(lab));
    if (k !== cur) b.addEventListener('click', () => { analytics.design('schedule:seg:' + k); go(to); });
    nav.append(b);
  }
  return nav;
}

function lockCard() {
  const c = el('div', { class: 'card sc-lock' });
  c.innerHTML = `<b>${esc(t('출석관리는 플러스 기능이에요'))}</b><span>${esc(t('기록은 그대로 남아 있어요. 플러스로 다시 쓸 수 있어요.'))}</span>`;
  const b = el('button', { class: 'btn btn-primary btn-sm', type: 'button' }, esc(t('플러스 보기')));
  b.addEventListener('click', () => go('/plus'));
  c.append(b);
  return c;
}

function emptyCard() {
  const c = el('div', { class: 'empty', style: 'margin-top:30px' });
  c.innerHTML = `<span class="empty-emoji">🏫</span><div class="empty-title">${esc(t('학교·학원 출석관리'))}</div>
    <div class="empty-sub">${esc(t('다니는 곳과 요일을 넣으면 출석·결석·휴일을 기록하고, 진도와 주간·월간 보고서를 한눈에 볼 수 있어요.'))}</div>`;
  const a = el('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:18px' }, `${icon('plus')}<span>${esc(t('다니는 곳 추가'))}</span>`);
  a.addEventListener('click', () => addPlace());
  const b = el('button', { class: 'btn btn-block', type: 'button', style: 'margin-top:8px' }, `${icon('book')}<span>${esc(t('진도 추가'))}</span>`);
  b.addEventListener('click', () => addProgress(null));
  const wrap = el('div'); wrap.append(c, a, b);
  return wrap;
}

function addPlace() {
  if (!plus.canAddHabit(H.active().length, H.active())) { analytics.design('schedule:locked:add'); go('/plus'); return; }
  analytics.design('schedule:place_add');
  go('/habit-edit?kind=attend');
}

function addMenu({ onChange }) {
  openSheet({ title: t('무엇을 추가할까요?'), items: [
    { label: t('다니는 곳 추가'), sub: t('학교·학원·운동처럼 요일마다 가는 곳'), icon: 'plus', onClick: () => addPlace() },
    { label: t('진도 추가'), sub: t('수학 20단원처럼 끝낸 것과 남은 것을 봐요'), icon: 'book', onClick: () => addProgress(onChange) },
    { label: t('휴일·방학 지정'), sub: t('쉬는 날을 미리 정하면 출석률에서 빠져요'), icon: 'sun', onClick: () => holidaySheet(onChange) },
  ] });
}

function addRow({ locked, onChange }) {
  const w = el('div', { class: 'sc-add' });
  const a = el('button', { class: 'btn btn-primary btn-block', type: 'button' }, `${icon('plus')}<span>${esc(t('다니는 곳 추가'))}</span>`);
  a.addEventListener('click', () => addPlace());
  const row = el('div', { class: 'btn-row', style: 'margin-top:8px' });
  const b = el('button', { class: 'btn', type: 'button' }, esc(t('진도 추가')));
  b.addEventListener('click', () => (locked ? go('/plus') : addProgress(onChange)));
  const c = el('button', { class: 'btn', type: 'button' }, esc(t('휴일·방학 지정')));
  c.addEventListener('click', () => (locked ? go('/plus') : holidaySheet(onChange)));
  row.append(b, c);
  w.append(a, row);
  return w;
}

/** 카드 제목 옆 작은 [편집] 버튼 (2026-11-21) */
function editBtn(onClick) {
  const b = el('button', { class: 'sc-edit', type: 'button' }, `${icon('edit')}<span>${esc(t('편집'))}</span>`);
  b.addEventListener('click', (e) => { e.stopPropagation(); analytics.design('schedule:edit_btn'); onClick(); });
  return b;
}
/** 다니는 곳 고르기 → 고치기 */
function placesSheet() {
  const places = H.active().filter((x) => C.isAttend(x));
  openSheet({ title: t('다니는 곳 편집'), text: t('고칠 곳을 골라요. 요일·시간·이름을 바꾸거나 지울 수 있어요.'), items: [
    ...places.map((h) => ({ label: h.name, sub: weekdaysText(h) + (timeOf(h) ? ' · ' + timeOf(h) : ''), icon: 'edit', onClick: () => go(`/habit-edit?id=${h.id}`) })),
    { label: t('다니는 곳 추가'), icon: 'plus', onClick: () => addPlace() },
  ] });
}
/** 진도 고르기 → 고치기 */
function progressSheet(list, onChange) {
  openSheet({ title: t('진도 편집'), items: list.map((p) => ({ label: p.name, sub: t('{a} / {b} · 남은 것 {c}', { a: p.done, b: p.total, c: Math.max(0, p.total - p.done) }), icon: 'edit', onClick: () => setTimeout(() => editProgress(p, onChange), 250) })) });
}
function weekdaysText(h) {
  const w = i18n.weekdayShort(); const m = h.schedule?.mask || 0;
  return [1, 2, 3, 4, 5, 6, 0].filter((d, i) => m & (1 << i)).map((d) => w[d]).join('·');
}

/* ── ① 오늘 ─────────────────────────────────── */
function todayCard(places, today, { locked, onChange }) {
  const box = el('div', { class: 'card sc-today' });
  box.append(el('div', { class: 'hb-pt-h' }, `<b>${esc(t('오늘'))}</b><span>${esc(fmtDate(today, { year: false, weekday: true }))}</span>`));
  const due = places.filter((h) => C.scheduledOn(h, today));
  if (!due.length) box.append(el('div', { class: 'sc-none' }, esc(places.length ? t('오늘은 가는 곳이 없어요.') : t('다니는 곳을 추가하면 여기서 바로 출석을 적어요.'))));
  for (const h of due) {
    const st = stateOf(h, today);
    const r = el('div', { class: 'sc-tr', style: H.hcStyle(h) });
    r.innerHTML = `<span class="hb-mo-i">${HI.html(h.icon)}</span><span class="sc-tn"><b>${esc(h.name)}</b>${timeOf(h) ? `<small>${esc(timeOf(h))}</small>` : ''}</span>`;
    const btns = el('div', { class: 'sc-tb' });
    for (const [k, lab, v] of [['in', t('출석'), 1], ['ab', t('결석'), 'absent'], ['ho', t('휴일'), 'skip']]) {
      const b = el('button', { class: 'sc-st ' + k + (st === k ? ' on' : ''), type: 'button' }, esc(lab));
      b.addEventListener('click', async () => {
        if (locked) { go('/plus'); return; }
        haptic();
        await H.setLog(h.id, today, st === k ? null : v);
        analytics.design('schedule:today:' + k);
        syncHabitReminders(); onChange?.();
      });
      btns.append(b);
    }
    r.append(btns);
    box.append(r);
  }
  /* 오늘 할 일 (일정) — 한 것 / 남은 것 */
  const plans = P.byDate(today).filter((p) => p.date);
  const done = plans.filter((p) => p.done).length;
  const left = plans.filter((p) => !p.done);
  const tk = el('button', { class: 'sc-task', type: 'button' });
  tk.innerHTML = `<span class="sc-task-h">${icon('list')}<b>${esc(t('오늘 할 일'))}</b><em>${esc(plans.length ? t('{a}개 중 {b}개 했어요', { a: plans.length, b: done }) : t('없음'))}</em></span>`
    + (left.length ? `<span class="sc-task-l">${esc(t('남은 것'))}: ${left.slice(0, 3).map((p) => esc(p.title || t('일정'))).join(' · ')}${left.length > 3 ? ' …' : ''}</span>` : '');
  tk.addEventListener('click', () => go('/plans'));
  box.append(tk);
  return box;
}

/* ── ② 이번 주 시간표 ───────────────────────── */
function weekCard(places, today, { locked, onChange }) {
  const box = el('div', { class: 'card sc-week' });
  const ws = C.addDays(C.weekStart(today), weekOff * 7);
  const days = []; for (let i = 0; i < 7; i++) days.push(C.addDays(ws, i));
  const head = el('div', { class: 'hb-pt-h' });
  head.innerHTML = `<b>${esc(weekOff === 0 ? t('이번 주 시간표') : weekOff < 0 ? t('지난 시간표') : t('다음 시간표'))}</b>`;
  head.classList.add('sc-wh');
  head.append(editBtn(() => placesSheet()));   // 수정 버튼 — 제목 줄 오른쪽 (2026-11-21 사용자: 날짜가 두 줄로 흐트러지지 않게)
  const nav = el('span', { class: 'sc-wnav' });
  const pv = el('button', { class: 'icon-btn', type: 'button', 'aria-label': '‹' }, icon('back'));
  const nx = el('button', { class: 'icon-btn', type: 'button', 'aria-label': '›' }, icon('chev'));
  pv.addEventListener('click', () => { weekOff -= 1; box.replaceWith(weekCard(places, today, { locked, onChange })); });
  nx.addEventListener('click', () => { if (weekOff < 4) { weekOff += 1; box.replaceWith(weekCard(places, today, { locked, onChange })); } });
  nav.append(pv, el('span', {}, `${fmtDay(days[0])} – ${fmtDay(days[6])}`), nx);
  box.append(head, nav);   // 날짜 이동은 제목 아래 따로 한 줄 (2026-11-21)
  let wd = i18n.weekdayShort();
  /* 아랍어처럼 요일 줄임말이 길면 한 글자 형식으로 — 7칸 표가 넘쳤다 (2026-11-22 번역 점검) */
  if (wd.some((x) => String(x).length > 4)) { try { const f = new Intl.DateTimeFormat(i18n.locale(), { weekday: 'narrow' }); wd = [0, 1, 2, 3, 4, 5, 6].map((i) => f.format(new Date(2024, 0, 7 + i))); } catch { /* 그대로 */ } }
  const g = el('div', { class: 'sc-grid' });
  g.append(el('span'));
  for (const k of days) {
    const d = C.dateOf(k);
    g.append(el('span', { class: 'sc-dh' + (k === today ? ' today' : '') + (d.getDay() === 0 ? ' sun' : '') }, `<i>${esc(wd[d.getDay()])}</i><b>${d.getDate()}</b>`));
  }
  for (const h of places) {
    const nm = el('button', { class: 'sc-pn', type: 'button', style: H.hcStyle(h) }, `<span class="hb-mx-i">${HI.html(h.icon)}</span><span class="sc-pn-t"><b>${esc(h.name)}</b>${timeOf(h) ? `<small>${esc(timeOf(h))}</small>` : ''}</span>`);
    nm.addEventListener('click', () => go(`/habit-edit?id=${h.id}`));
    g.append(nm);
    for (const k of days) {
      const on = C.scheduledOn(h, k) || stateOf(h, k);
      const before = h.start && k < h.start && !stateOf(h, k);
      const fut = k > today;
      const st = stateOf(h, k);
      const c = el('button', { class: 'sc-c ' + (on && !before ? (st || (fut ? 'fut' : 'todo')) : 'off') + (k === today ? ' today' : ''), type: 'button', 'aria-label': `${h.name} ${k}` });
      c.innerHTML = st === 'in' ? icon('check') : st === 'ab' ? '✕' : st === 'ho' ? '–' : '';
      if (!on || before) { c.disabled = true; g.append(c); continue; }
      let lp = null;
      c.addEventListener('click', async () => {
        if (lp === 'fired') { lp = null; return; }
        if (locked) { go('/plus'); return; }
        haptic();
        if (fut) {   /* 앞날: 휴일만 미리 정하고 풀 수 있다 */
          await H.setLog(h.id, k, st === 'ho' ? null : 'skip');
          toast(st === 'ho' ? t('휴일을 풀었어요.') : t('휴일로 미리 정했어요.'));
          analytics.design('schedule:holiday_ahead');
        } else {
          await H.tap(h.id, k);
          analytics.design('schedule:week_tap');
        }
        syncHabitReminders(); onChange?.();
      });
      if (!fut) {
        c.addEventListener('pointerdown', () => { if (locked) return; lp = setTimeout(() => { lp = 'fired'; dayMenu(h, k, onChange); }, 520); });
        for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) c.addEventListener(ev, () => { if (lp && lp !== 'fired') { clearTimeout(lp); lp = null; } });
      }
      g.append(c);
    }
  }
  box.append(g);
  box.append(el('div', { class: 'hb-legend' }, `<span><i class="sc-dot in"></i>${esc(t('출석'))}</span><span><i class="sc-dot ab"></i>${esc(t('결석'))}</span><span><i class="sc-dot ho"></i>${esc(t('휴일'))}</span>`));
  box.append(el('div', { class: 'hb-hint', style: 'text-align:center' }, esc(t('누를 때마다 출석 → 결석 → 휴일. 앞으로 올 날은 누르면 휴일로 미리 정해져요.'))));
  return box;
}

function dayMenu(h, k, onChange) {
  const set = (v) => async () => { await H.setLog(h.id, k, v); syncHabitReminders(); onChange?.(); };
  openSheet({ title: `${h.name} · ${fmtDay(k)}`, items: [
    { label: t('출석'), icon: 'check', onClick: set(1) },
    { label: t('결석'), icon: 'close', onClick: set('absent') },
    { label: t('휴일'), icon: 'sun', onClick: set('skip') },
    { label: t('지우기'), icon: 'trash', onClick: set(null) },
  ] });
}

/* 휴일·방학: 기간을 고르면 그 사이 수업 날을 모두 휴일로 (이미 출석·결석을 적은 날은 그대로) */
function holidaySheet(onChange) {
  const places = H.active().filter((x) => C.isAttend(x));
  if (!places.length) { toast(t('먼저 다니는 곳을 추가해 주세요.')); return; }
  const today = H.today();
  const box = el('div', { class: 'sc-hol' });
  const pick = new Set(places.map((h) => h.id));
  const chips = el('div', { class: 'chip-row' });
  for (const h of places) {
    const c = el('button', { class: 'chip on', type: 'button' }, esc(h.name));
    c.addEventListener('click', () => { if (pick.has(h.id)) pick.delete(h.id); else pick.add(h.id); c.classList.toggle('on', pick.has(h.id)); });
    chips.append(c);
  }
  /* 2026-11-21 사용자 버그 신고 '요가를 오늘 휴일로 찍었는데 뒤 날짜가 모두 휴일': 기본 기간이 오늘~6일 뒤였다 → 기본은 오늘 하루.
     기간은 칩으로 바로 고르고, 어느 날이 바뀌는지 버튼을 누르기 전에 보여 준다 */
  const from = el('input', { type: 'date', class: 'sc-date', value: today });
  const to = el('input', { type: 'date', class: 'sc-date', value: today });
  const quick = el('div', { class: 'chip-row', style: 'margin-top:12px' });
  for (const [lab, a, b] of [[t('오늘만'), today, today], [t('내일만'), C.addDays(today, 1), C.addDays(today, 1)], [t('다음 7일'), today, C.addDays(today, 6)]]) {
    const q = el('button', { class: 'chip', type: 'button' }, esc(lab));
    q.addEventListener('click', () => { from.value = a; to.value = b; paint(); });
    quick.append(q);
  }
  const row = el('div', { class: 'sc-dates' });
  row.append(el('label', {}, esc(t('시작'))), from, el('label', {}, esc(t('끝'))), to);
  const prev = el('div', { class: 'sc-hol-prev' });
  const go1 = el('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:12px' }, esc(t('휴일로 지정')));
  const targets = () => {
    let a = from.value, b = to.value; if (!a || !b) return [];
    if (b < a) [a, b] = [b, a];
    if (C.diffDays(a, b) > 366) return null;
    const out = [];
    for (const h of places) { if (!pick.has(h.id)) continue; for (let k = a; k <= b; k = C.addDays(k, 1)) if (!stateOf(h, k) && C.scheduledOn(h, k)) out.push([h, k]); }
    return out;
  };
  const paint = () => {
    const tg = targets();
    if (tg == null) { prev.textContent = t('1년 안으로 골라 주세요.'); go1.disabled = true; return; }
    go1.disabled = !tg.length;
    go1.textContent = tg.length ? t('휴일로 지정 ({n}일)', { n: tg.length }) : t('휴일로 지정');
    prev.textContent = tg.length ? tg.slice(0, 6).map(([h, k]) => `${h.name} ${fmtDay(k)}`).join(' · ') + (tg.length > 6 ? ' …' : '') : t('이 기간에는 휴일로 바꿀 수업 날이 없어요.');
  };
  from.addEventListener('change', paint); to.addEventListener('change', paint);
  chips.addEventListener('click', () => setTimeout(paint, 0));
  const un = el('button', { class: 'btn btn-ghost btn-block', type: 'button' }, esc(t('이 기간 휴일 풀기')));
  const run = async (clear) => {
    let a = from.value, b = to.value;
    if (!a || !b) return;
    if (b < a) [a, b] = [b, a];
    if (C.diffDays(a, b) > 366) { toast(t('1년 안으로 골라 주세요.')); return; }
    let n = 0;
    for (const h of places) {
      if (!pick.has(h.id)) continue;
      for (let k = a; k <= b; k = C.addDays(k, 1)) {
        const st = stateOf(h, k);
        if (clear) { if (st === 'ho') { await H.setLog(h.id, k, null); n++; } }
        else if (!st && C.scheduledOn(h, k)) { await H.setLog(h.id, k, 'skip'); n++; }
      }
    }
    closeSheet();
    analytics.design(clear ? 'schedule:holiday_clear' : 'schedule:holiday_range', n);
    toast(clear ? t('휴일 {n}일을 풀었어요.', { n }) : t('수업 날 {n}일을 휴일로 정했어요.', { n }));
    syncHabitReminders(); onChange?.();
  };
  go1.addEventListener('click', () => run(false));
  un.addEventListener('click', () => run(true));
  box.append(el('div', { class: 'sc-hol-t' }, esc(t('어디를 쉬나요?'))), chips, quick, row, prev, go1, un);
  paint();
  openSheet({ title: t('휴일·방학 지정'), text: t('고른 기간의 수업 날이 휴일이 되고 출석률에서 빠져요.'), content: box });
}

/* ── ③ 진도 ─────────────────────────────────── */
function progressCard(list, today, { locked, onChange }) {
  const box = el('div', { class: 'card sc-prog' });
  const ph = el('div', { class: 'hb-pt-h' }, `<b>${esc(t('진도'))}</b><span>${esc(t('끝낸 것 / 전체'))}</span>`);
  if (list.length) ph.querySelector('b').after(editBtn(() => (locked ? go('/plus') : progressSheet(list, onChange))));
  box.append(ph);
  if (!list.length) {
    const b = el('button', { class: 'sc-none sc-link', type: 'button' }, esc(t('+ 수학 20단원처럼 진도를 넣어 보세요')));
    b.addEventListener('click', () => (locked ? go('/plus') : addProgress(onChange)));
    box.append(b);
    return box;
  }
  for (const p of list) {
    const pct = p.total ? Math.round(p.done / p.total * 100) : 0;
    const r = el('div', { class: 'sc-pr' });
    const nm = el('button', { class: 'sc-pr-n', type: 'button' }, `<b>${esc(p.name)}</b><small>${esc(t('{a} / {b} · 남은 것 {c}', { a: p.done, b: p.total, c: Math.max(0, p.total - p.done) }))}</small>`);
    nm.addEventListener('click', () => (locked ? go('/plus') : editProgress(p, onChange)));
    const bar = el('div', { class: 'sc-bar' }, `<i style="width:${pct}%"></i>`);
    const minus = el('button', { class: 'sc-pm', type: 'button', 'aria-label': '-1' }, '−');
    const plusB = el('button', { class: 'sc-pm plus', type: 'button', 'aria-label': '+1' }, '+');
    const bump = (d) => async () => {
      if (locked) { go('/plus'); return; }
      const all = await loadProgress(); const q = all.find((x) => x.id === p.id); if (!q) return;
      const nv = Math.max(0, Math.min(q.total, q.done + d)); if (nv === q.done) return;
      q.hist ||= {}; q.hist[today] = (q.hist[today] || 0) + (nv - q.done); if (!q.hist[today]) delete q.hist[today];
      q.done = nv; haptic(); await saveProgress(all);
      analytics.design('schedule:progress:' + (d > 0 ? 'up' : 'down'));
      if (nv === q.total && d > 0) toast(t('{n} 진도를 다 끝냈어요!', { n: q.name }));
      onChange?.();
    };
    minus.addEventListener('click', bump(-1)); plusB.addEventListener('click', bump(1));
    const right = el('div', { class: 'sc-pr-r' }); right.append(el('b', { class: 'sc-pct' }, pct + '%'), minus, plusB);
    const top = el('div', { class: 'sc-pr-top' }); top.append(nm, right);
    r.append(top, bar);
    box.append(r);
  }
  return box;
}

async function addProgress(onChange) {
  const name = await promptSheet({ title: t('진도 추가'), text: t('과목이나 책 이름'), placeholder: t('예: 수학'), ok: t('다음') });
  if (!name || !name.trim()) return;
  const totalS = await promptSheet({ title: name.trim(), text: t('전체 단원(장) 수'), placeholder: '20', type: 'number', ok: t('추가') });
  const total = Math.max(1, Math.min(999, parseInt(totalS, 10) || 0));
  if (!totalS || !total) return;
  const all = await loadProgress();
  all.push({ id: 'pg_' + Date.now().toString(36), name: name.trim().slice(0, 30), total, done: 0, hist: {}, createdAt: Date.now() });
  await saveProgress(all);
  analytics.design('schedule:progress_add', total);
  onChange?.();
}

function editProgress(p, onChange) {
  openSheet({ title: p.name, items: [
    { label: t('끝낸 수 직접 넣기'), icon: 'edit', onClick: async () => {
      const v = await promptSheet({ title: p.name, text: t('끝낸 단원 수 (전체 {n})', { n: p.total }), value: String(p.done), type: 'number' });
      if (v == null) return;
      const all = await loadProgress(); const q = all.find((x) => x.id === p.id); if (!q) return;
      const nv = Math.max(0, Math.min(q.total, parseInt(v, 10) || 0));
      const today = H.today(); q.hist ||= {}; q.hist[today] = (q.hist[today] || 0) + (nv - q.done); q.done = nv;
      await saveProgress(all); onChange?.();
    } },
    { label: t('전체 수 바꾸기'), icon: 'book', onClick: async () => {
      const v = await promptSheet({ title: p.name, text: t('전체 단원(장) 수'), value: String(p.total), type: 'number' });
      if (v == null) return;
      const all = await loadProgress(); const q = all.find((x) => x.id === p.id); if (!q) return;
      q.total = Math.max(1, Math.min(999, parseInt(v, 10) || q.total)); q.done = Math.min(q.done, q.total);
      await saveProgress(all); onChange?.();
    } },
    { label: t('이름 바꾸기'), icon: 'edit', onClick: async () => {
      const v = await promptSheet({ title: t('이름 바꾸기'), value: p.name });
      if (!v || !v.trim()) return;
      const all = await loadProgress(); const q = all.find((x) => x.id === p.id); if (!q) return;
      q.name = v.trim().slice(0, 30); await saveProgress(all); onChange?.();
    } },
    { label: t('지우기'), icon: 'trash', danger: true, onClick: async () => {
      if (!(await confirmSheet({ title: t('이 진도를 지울까요?'), text: p.name, ok: t('지우기'), danger: true }))) return;
      const all = (await loadProgress()).filter((x) => x.id !== p.id); await saveProgress(all); onChange?.();
    } },
  ] });
}

/* ── ④ 보고서 ──────────────────────────────── */
function rangeOf(mode, today, back = 0) {
  if (mode === 'week') { const a = C.addDays(C.weekStart(today), -7 * back); return [a, C.addDays(a, 6)]; }
  const d = C.dateOf(C.monthStart(today)); d.setMonth(d.getMonth() - back);
  const a = C.keyOf(d); return [a, C.monthEndOf(a)];
}
function reportCard(places, prog, today, { onChange }) {
  const box = el('div', { class: 'card sc-rep' });
  const head = el('div', { class: 'hb-mx-h' });
  head.append(el('b', {}, esc(t('보고서'))));
  const seg = el('div', { class: 'hb-mx-seg' });
  for (const [k, lab] of [['week', t('이번 주')], ['month', t('이번 달')]]) {
    const b = el('button', { class: 'hb-mx-sb' + (repMode === k ? ' on' : ''), type: 'button' }, esc(lab));
    b.addEventListener('click', () => { if (repMode === k) return; repMode = k; analytics.design('schedule:report:' + k); box.replaceWith(reportCard(places, prog, today, { onChange })); });
    seg.append(b);
  }
  head.append(seg); box.append(head);
  const [a, b] = rangeOf(repMode, today, 0);
  const end = b > today ? today : b;
  const [pa, pb] = rangeOf(repMode, today, 1);
  /* 다니는 곳마다 */
  for (const h of places) {
    const s = C.attendStats(h, a, end), s0 = C.attendStats(h, pa, pb);
    const all = C.attendStats(h, startOf(h) || C.addDays(today, -365), today);
    const pct = s.rate == null ? null : Math.round(s.rate * 100);
    const diff = s.rate != null && s0.rate != null ? Math.round((s.rate - s0.rate) * 100) : null;
    const r = el('div', { class: 'sc-rr' + (trendSel === h.id ? ' on' : ''), style: H.hcStyle(h), role: 'button' });
    r.addEventListener('click', () => { trendSel = trendSel === h.id ? 'all' : h.id; analytics.design('schedule:trend_sel'); box.replaceWith(reportCard(places, prog, today, { onChange })); });
    r.innerHTML = `<span class="hb-mo-i">${HI.html(h.icon)}</span>
      <span class="sc-rr-m"><b>${esc(h.name)}</b>
        <small>${esc(t('출석 {a} · 결석 {b} · 휴일 {c}', { a: s.present, b: s.absent, c: s.holiday }))}</small>
        <small class="sc-rr-all">${esc(t('처음부터 출석 {a} · 결석 {b}', { a: all.present, b: all.absent }))}</small></span>
      <span class="sc-rr-p"><b>${pct == null ? '–' : pct + '%'}</b>${diff == null || diff === 0 ? '' : `<em class="${diff > 0 ? 'up' : 'down'}">${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}%p</em>`}</span>`;
    box.append(r);
  }
  /* 진도·할 일 */
  const progDone = prog.reduce((n, p) => n + Object.entries(p.hist || {}).filter(([k]) => k >= a && k <= end).reduce((m, [, v]) => m + (v || 0), 0), 0);
  const plans = P.all().filter((p) => p.date && p.date >= a && p.date <= end);
  const pdone = plans.filter((p) => p.done).length;
  const sum = el('div', { class: 'sc-sum' });
  sum.innerHTML = `<div><b>${progDone > 0 ? '+' + progDone : progDone}</b><span>${esc(t('끝낸 단원'))}</span></div>
    <div><b>${pdone}/${plans.length}</b><span>${esc(t('한 할 일'))}</span></div>
    <div><b>${plans.length - pdone}</b><span>${esc(t('남은 할 일'))}</span></div>`;
  box.append(sum);
  /* 향상: 최근 6달 출석률 (2026-11-21 사용자: '곳마다 6달 출석률이 나와야 하지 않냐, 한 번에 다 나오게')
     ① 곳별 표 — 줄 = 다니는 곳, 칸 = 최근 6달 출석률 (한 번에 다), 맨 아래 '전체'
     ② 막대 — 위 칩([전체][요가]…)이나 보고서의 곳 줄을 누르면 그곳 6달로 */
  if (places.length) {
    const d0 = C.dateOf(C.monthStart(today));
    const months = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(d0); d.setMonth(d.getMonth() - i); const ma = C.keyOf(d); months.push({ m: d.getMonth() + 1, a: ma, b: C.monthEndOf(ma) > today ? today : C.monthEndOf(ma) }); }
    const rateOf = (list, mo) => { let p = 0, ab = 0; for (const h of list) { const st0 = startOf(h); if (st0 && mo.b < st0) continue; const st = C.attendStats(h, mo.a, mo.b); p += st.present; ab += st.absent; } return p + ab ? Math.round(p / (p + ab) * 100) : null; };
    if (!places.some((h) => h.id === trendSel)) trendSel = 'all';
    box.append(el('div', { class: 'sc-tt' }, esc(t('최근 6달 출석률'))));
    /* ① 표 */
    const tb = el('div', { class: 'sc-mt', style: `--n:${months.length}` });
    tb.append(el('span'));
    for (const mo of months) tb.append(el('span', { class: 'sc-mt-h' }, esc(monShort(mo.m))));
    const rowOf = (label, list, id) => {
      const nm = el('button', { class: 'sc-mt-n' + (trendSel === id ? ' on' : ''), type: 'button' }, esc(label));
      nm.addEventListener('click', () => { trendSel = id; analytics.design('schedule:trend_sel'); box.replaceWith(reportCard(places, prog, today, { onChange })); });
      tb.append(nm);
      for (const mo of months) {
        const r = rateOf(list, mo);
        const tone = r == null ? 'none' : r >= 90 ? 'hi' : r >= 70 ? 'mid' : 'lo';
        tb.append(el('span', { class: 'sc-mt-c ' + tone + (trendSel === id ? ' on' : '') }, r == null ? '–' : r + '%'));
      }
    };
    for (const h of places) rowOf(h.name, [h], h.id);
    if (places.length > 1) rowOf(t('전체'), places, 'all');
    box.append(tb);
    /* ② 막대 — 고른 곳 */
    const selList = trendSel === 'all' ? places : places.filter((h) => h.id === trendSel);
    const selName = trendSel === 'all' ? t('전체') : selList[0]?.name || '';
    box.append(el('div', { class: 'sc-tsel' }, esc(t('{n} 출석률 변화', { n: selName }))));
    const bars = el('div', { class: 'sc-trend' });
    for (const mo of months) {
      const rate = rateOf(selList, mo);
      bars.append(el('div', { class: 'sc-tb-c' }, `<span class="sc-tb-v">${rate == null ? '' : rate + '%'}</span><span class="sc-tb-t"><i style="height:${rate == null ? 2 : Math.max(4, rate)}%"></i></span><span class="sc-tb-m">${esc(monShort(mo.m))}</span>`));
    }
    box.append(bars);
  }
  return box;
}
