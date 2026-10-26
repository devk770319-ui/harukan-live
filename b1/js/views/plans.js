/* ===========================================================
   views/plans.js — 일정

   일기 화면과 일부러 다르게 만든다.
   · 일기: 지난 일을 "쓰는" 곳. 길게 쓰고, 지우기 어렵고, 통계가 붙는다.
   · 일정: 앞일을 "체크하는" 곳. 짧게 넣고, 끝내면 체크하고, 지나가면 사라진다.
   그래서 여기엔 기분도 사진도 없고, 대신 체크박스와 알림이 있다.
   =========================================================== */

import * as plans from '../plans.js';
import * as plus from '../plus.js';
import * as analytics from '../analytics.js';
import * as store from '../store.js';
import * as native from '../native.js';
import { t, monthLabel, monthTitle, fmtClock } from '../i18n.js';
import { go } from '../app.js';
import {
  el, icon, esc, toast, haptic, openSheet, confirmSheet, autogrow,
  fmtDate, parseKey, todayKey, addDays, WD, timeInput, tapToPick,
} from '../ui.js';

const REPEAT_LABEL = {
  none: '반복 안 함', daily: '매일', weekly: '매주', monthly: '매달', yearly: '매년',
};
const REMIND_CHOICES = [
  { v: null, k: '알림 없음' },
  { v: 0,    k: '정각에' },
  { v: 10,   k: '10분 전' },
  { v: 30,   k: '30분 전' },
  { v: 60,   k: '1시간 전' },
  { v: 1440, k: '하루 전' },
];

/* 한 쪽에 보여줄 개수. 몇 해를 쓰면 끝낸 일정만 수백 개가 된다 —
   전부 그리면 화면이 느려지고, 무엇보다 위로 올라갈 수가 없다. */
const PER_PAGE = 20;

/* 어느 탭을 보고 있는지는 화면을 다시 그려도 유지한다. 체크 하나 할 때마다
   '앞으로'로 튕겨 나가면 놓친 일정을 정리할 수가 없다.
   기본은 '앞으로' — 일정 화면을 여는 대부분의 이유가 앞일을 보려는 것이다. */
let tab = 'soon';        // soon | late | done
let page = 0;

export async function render(root, params = {}) {
  await plans.loadAll();

  // 보기 방식은 기억한다 — 달력을 좋아하는 사람은 매번 달력으로 열리는 게 맞다
  const mode = params.v || localStorage.getItem('planView') || 'list';
  localStorage.setItem('planView', mode);

  root.append(viewToggle(mode, params));
  if (mode === 'month') return renderMonth(root, params);

  const late = plans.overdue();
  const soon = plans.upcoming();
  const done = plans.doneList();

  if (!late.length && !soon.length && !done.length) {
    root.append(el('div', { class: 'empty', style: 'margin-top:46px' },
      `<span class="empty-emoji">🗓️</span>
       <div class="empty-title">${t('아직 일정이 없어요')}</div>
       <div class="empty-sub">${t('앞으로 할 일을 여기에 적어두세요.')}<br>
       ${t('일기와는 따로 관리돼요.')}</div>`));
    root.append(addButton());
    return chrome();
  }

  root.append(tabRow({ soon: soon.length, late: late.length, done: done.length }));

  const list = tab === 'late' ? late : tab === 'done' ? done : soon;

  /* 마지막 쪽의 일정을 끝내면 그 쪽이 통째로 사라진다. 빈 쪽에 남겨두지 않는다. */
  const pages = Math.max(1, Math.ceil(list.length / PER_PAGE));
  if (page >= pages) page = pages - 1;
  const shown = list.slice(page * PER_PAGE, (page + 1) * PER_PAGE);

  const body = el('div', { class: 'plan-section' });
  if (!shown.length) {
    body.append(el('div', { class: 'empty', style: 'margin-top:30px' },
      `<div class="empty-sub">${
        tab === 'late' ? t('놓친 일정이 없어요. 잘하고 계세요.')
        : tab === 'done' ? t('아직 끝낸 일정이 없어요.')
        : t('앞으로 잡힌 일정이 없어요.')}</div>`));
  } else if (tab === 'soon') {
    /* 앞으로는 날짜별로 묶는다 — 같은 날 할 일이 붙어 있어야 하루가 보인다 */
    const groups = new Map();
    for (const p of shown) {
      if (!groups.has(p.date)) groups.set(p.date, []);
      groups.get(p.date).push(p);
    }
    for (const [date, group] of groups) {
      body.append(el('div', { class: 'plan-day' }, esc(dayLabel(date))));
      const c = el('div', { class: 'card plan-card' });
      for (const p of group) c.append(row(p));
      body.append(c);
    }
  } else {
    const c = el('div', { class: 'card plan-card' });
    for (const p of shown) c.append(row(p, tab === 'late' ? { late: true } : { done: true }));
    body.append(c);
  }
  root.append(body);

  const pgr = pager(pages, list.length);
  if (pgr) root.append(pgr);

  root.append(addButton());
  return chrome();

  /* ── 조각들 ─────────────────────────────────── */
  function chrome() {
    return {
      title: t('일정'),
      right: [
        { icon: 'share', label: t('캘린더로 내보내기'), onClick: exportAll },
        { icon: 'plus', label: t('일정 추가'), onClick: () => edit(null, refresh) },
      ],
    };
  }

  function refresh() {
    // 화면을 다시 그린다 (라우터를 거치지 않고 이 화면만)
    const view = document.getElementById('view');
    view.innerHTML = '';
    render(view, params);
    syncReminders();
  }

  /* 이름 옆에 개수를 붙인다. 놓친 일정이 탭 뒤로 숨었기 때문에, 숫자라도
     눈에 띄지 않으면 지나간 일이 조용히 묻힌다 — 그 숫자만 붉게 둔다. */
  function tabRow({ soon: ns, late: nl, done: nd }) {
    const r = el('div', { class: 'segmented plan-tabs' });
    for (const [k, label, n] of [
      ['soon', t('앞으로'), ns],
      ['late', t('놓친 일정'), nl],
      ['done', t('끝낸 일정'), nd],
    ]) {
      const b = el('button', {
        class: (tab === k ? 'on' : '') + (k === 'late' && n ? ' alert' : ''),
        type: 'button', 'aria-pressed': String(tab === k),
      }, `<span>${esc(label)}</span>${n ? `<span class="plan-tab-n">${n}</span>` : ''}`);
      b.addEventListener('click', () => {
        if (tab === k) return;
        tab = k;
        page = 0;
        haptic();
        refresh();
      });
      r.append(b);
    }
    return r;
  }

  /** 쪽 넘기기. 한 쪽에 다 들어가면 아무것도 그리지 않는다. */
  function pager(pages, total) {
    if (pages <= 1) return null;
    const r = el('div', { class: 'pager' });
    const step = (delta, ic, label) => {
      const b = el('button', { class: 'icon-btn', type: 'button', 'aria-label': label }, icon(ic));
      b.disabled = delta < 0 ? page === 0 : page >= pages - 1;
      b.addEventListener('click', () => {
        page += delta;
        refresh();
        window.scrollTo(0, 0);      // 다음 쪽인데 목록 한가운데서 시작하면 읽을 자리를 잃는다
      });
      return b;
    };
    const from = page * PER_PAGE + 1;
    const to = Math.min(total, (page + 1) * PER_PAGE);
    r.append(
      step(-1, 'chevL', t('이전 쪽')),
      el('div', { class: 'pager-n' }, t('{from}–{to} / {n}', { from, to, n: total })),
      step(1, 'chev', t('다음 쪽')),
    );
    return r;
  }

  function addButton() {
    const wrap = el('div');
    const b = el('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:18px' },
      icon('plus') + `<span>${t('일정 추가')}</span>`);
    b.addEventListener('click', () => edit(null, refresh));
    wrap.append(b);

    /* 남은 개수를 미리 알린다. 다 쓰고 나서야 막히면 그건 함정이다.
       여유 있을 때는 굳이 세지 않는다 — 2개 이하로 남았을 때만 말한다. */
    const left = plus.plansLeft(plans.activeCount());
    if (left !== null && left <= 2) {
      wrap.append(el('div', { class: 'note', style: 'text-align:center;margin-top:8px' },
        left > 0
          ? t('무료로 {n}개 더 넣을 수 있어요. 끝낸 일정은 세지 않아요.', { n: left })
          : t('무료 한도를 다 썼어요. 하나를 끝내면 다시 넣을 수 있어요.')));
    }
    return wrap;
  }

  function row(p, { late = false, done = false } = {}) {
    const r = el('div', { class: 'plan-row' + (done ? ' is-done' : '') + (late ? ' is-late' : '') });

    const check = el('button', {
      class: 'plan-check' + (p.done ? ' on' : ''), type: 'button',
      'aria-label': p.done ? t('안 끝냄으로 되돌리기') : t('끝냄으로 표시'),
    }, p.done ? icon('check') : '');
    check.addEventListener('click', async () => {
      haptic();
      await plans.toggleDone(p.id);
      refresh();
    });

    const main = el('button', { class: 'plan-main', type: 'button' });
    const when = p.time
      ? fmtClock(p.time)
      : (late || done ? fmtDate(p.date, { year: false, weekday: false }) : t('종일'));
    main.innerHTML =
      `<div class="plan-title">${esc(p.title || t('(제목 없음)'))}</div>
       <div class="plan-meta">
         <span class="plan-when">${esc(when)}</span>
         ${late ? `<span class="plan-badge">${esc(fmtDate(p.date, { year: false, weekday: false }))}</span>` : ''}
         ${p.repeat && p.repeat !== 'none' ? `<span class="plan-badge">${esc(t(REPEAT_LABEL[p.repeat]))}</span>` : ''}
         ${p.remindMin != null && p.time ? `<span class="plan-badge">${icon('bell')}</span>` : ''}
       </div>
       ${p.memo ? `<div class="plan-memo">${esc(p.memo)}</div>` : ''}`;
    main.addEventListener('click', () => edit(p, refresh));

    /* 목록에서 바로 손댈 수 있어야 한다 — 지우려고 편집 시트까지 들어가는 건 멀다 */
    const more = el('button', { class: 'plan-more', type: 'button', 'aria-label': t('더 보기') }, icon('dots'));
    more.addEventListener('click', (e) => {
      e.stopPropagation();
      openSheet({
        title: p.title || t('(제목 없음)'),
        items: [
          { label: t('고치기'), icon: 'edit', onClick: () => edit(p, refresh) },
          { label: p.done ? t('안 끝냄으로 되돌리기') : t('끝냄으로 표시'),
            icon: p.done ? 'undo' : 'check',
            onClick: async () => { await plans.toggleDone(p.id); refresh(); } },
          { label: t('지우기'), icon: 'trash', danger: true, onClick: () => remove(p, refresh) },
        ],
      });
    });

    r.append(check, main, more);
    return r;
  }

}

/* ── 목록 / 달력 전환 ────────────────────────────── */
function viewToggle(mode, params) {
  const row = el('div', { class: 'segmented plan-seg' });
  for (const [v, label] of [['list', t('목록')], ['month', t('달력')]]) {
    const b = el('button', { class: mode === v ? 'on' : '', type: 'button' }, esc(label));
    b.addEventListener('click', () => {
      if (v === mode) return;
      localStorage.setItem('planView', v);
      go(v === 'month' ? `/plans?v=month&m=${params.m || todayKey().slice(0, 7)}` : '/plans?v=list');
    });
    row.append(b);
  }
  return row;
}

/* ── 달력 보기 ───────────────────────────────────
   한 달을 한눈에. 일기 달력과 같은 격자를 쓰되, 칸을 채우는 것이
   기분 색이 아니라 그날의 일정 개수다. 끝낸 것은 흐리게. */
async function renderMonth(root, params) {
  const today = todayKey();
  const cur = params.m || today.slice(0, 7);
  const [Y, M] = cur.split('-').map(Number);

  const byDate = new Map();
  for (const p of await plans.loadAll()) {
    if (!byDate.has(p.date)) byDate.set(p.date, []);
    byDate.get(p.date).push(p);
  }

  /* 월 이동 */
  const head = el('div', { class: 'cal-head' });
  const nav = (delta, ic, label) => {
    const b = el('button', { class: 'icon-btn', type: 'button', 'aria-label': label }, icon(ic));
    b.addEventListener('click', () => {
      const d = new Date(Y, M - 1 + delta, 1);
      go(`/plans?v=month&m=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return b;
  };
  head.append(nav(-1, 'chevL', t('이전 달')));
  const title = el('div', { class: 'cal-title' }, monthTitle(Y, M));
  title.addEventListener('click', () => go(`/plans?v=month&m=${today.slice(0, 7)}`));
  head.append(title, nav(1, 'chev', t('다음 달')));
  root.append(head);

  /* 격자 */
  const grid = el('div', { class: 'cal-grid plan-grid' });
  WD.forEach((w, i) => grid.append(el('div', { class: 'cal-wd' + (i === 0 ? ' sun' : '') }, w)));
  const first = new Date(Y, M - 1, 1);
  const daysInMonth = new Date(Y, M, 0).getDate();
  for (let i = 0; i < first.getDay(); i++) grid.append(el('div', { class: 'cal-cell blank' }));

  let monthOpen = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${Y}-${String(M).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const list = byDate.get(key) || [];
    const open = list.filter((p) => !p.done);
    monthOpen += open.length;

    const c = el('button', { class: 'cal-cell plan-cell', type: 'button' },
      `<span class="plan-cell-d">${d}</span>`);
    if (list.length) {
      c.classList.add('has');
      if (open.length) {
        c.append(el('span', { class: 'plan-cell-n' }, String(open.length)));
        if (key < today) c.classList.add('plan-late');
      } else {
        c.classList.add('all-done');
        c.append(el('span', { class: 'plan-cell-n done' }, icon('check')));
      }
      c.setAttribute('aria-label', `${d}, ${t('{n}개', { n: list.length })}`);
    }
    if (key === today) c.classList.add('today');

    c.addEventListener('click', async () => {
      if (!list.length) { edit(null, () => go(`/plans?v=month&m=${cur}`), { date: key }); return; }
      const { openDay } = await import('./calendar.js');
      openDay(key, store.byDate(key), list);
    });
    grid.append(c);
  }
  root.append(grid);

  /* 그 달 요약 */
  const monthAll = [...byDate.entries()].filter(([k]) => k.startsWith(cur)).flatMap(([, v]) => v);
  root.append(el('div', { class: 'note', style: 'text-align:center;margin-top:12px' },
    monthAll.length
      ? t('{m}월 일정 {n}개 · 남은 것 {o}개', { m: monthLabel(M), n: monthAll.length, o: monthOpen })
      : t('{m}월엔 아직 일정이 없어요. 날짜를 눌러 넣어보세요.', { m: monthLabel(M) })));

  return {
    title: t('일정'),
    right: [
      { icon: 'share', label: t('캘린더로 내보내기'), onClick: () => exportAll() },
      { icon: 'plus', label: t('일정 추가'), onClick: () => edit(null, () => go(`/plans?v=month&m=${cur}`)) },
    ],
  };
}

/**
 * 일정 지우기. 반복으로 여러 회차가 생겼으면 "이것만"인지 "전부"인지 반드시 묻는다 —
 * 매주 반복을 지우려다 지난 기록까지 통째로 날리는 일이 없어야 한다.
 * @param p 지울 일정
 * @param onDone 지운 뒤 부를 것
 */
export async function remove(p, onDone) {
  const sid = p.seriesId || p.id;
  const kin = plans.series(sid);

  if (kin.length <= 1) {
    const ok = await confirmSheet({
      title: t('이 일정을 지울까요?'), text: t('일정은 휴지통을 거치지 않아요.'),
      ok: t('지우기'), danger: true,
    });
    if (!ok) return;
    await plans.remove(p.id);
    toast(t('지웠어요.'));
    onDone?.();
    return;
  }

  // 반복이면 범위를 고르게 한다. 개수를 밝혀서 무엇이 사라지는지 알고 누르게 한다.
  openSheet({
    title: t('반복되는 일정이에요'),
    // 제목 뒤에 조사를 붙이면 받침에 따라 은/는이 갈린다. 붙이지 않는 문장으로 쓴다.
    text: t('“{title}” — {n}번 반복으로 만들어진 일정이에요. 어디까지 지울까요?',
      { title: p.title || t('(제목 없음)'), n: kin.length }),
    items: [
      {
        label: t('이 일정만 지우기'),
        sub: t('나머지 {n}개는 그대로 둡니다', { n: kin.length - 1 }),
        icon: 'trash',
        onClick: async () => {
          await plans.remove(p.id);
          toast(t('이 일정만 지웠어요.'));
          onDone?.();
        },
      },
      {
        label: t('반복 전체 지우기'),
        sub: t('끝낸 것까지 {n}개가 모두 사라집니다', { n: kin.length }),
        icon: 'trash',
        danger: true,
        onClick: async () => {
          const ok = await confirmSheet({
            title: t('반복 {n}개를 모두 지울까요?', { n: kin.length }),
            text: t('되돌릴 수 없어요. 일정은 휴지통을 거치지 않습니다.'),
            ok: t('모두 지우기'), danger: true,
          });
          if (!ok) return;
          const n = await plans.removeSeries(sid);
          toast(t('{n}개를 지웠어요.', { n }));
          onDone?.();
        },
      },
    ],
  });
}

/**
 * 무료 한도에 닿았을 때. 막아세우는 대신 "지금 뭘 할 수 있는지"를 먼저 말한다 —
 * 끝낸 일정은 개수에 안 들어가므로, 하나 체크하면 바로 더 넣을 수 있다.
 */
function upsell() {
  analytics.design('plan:limit');
  const p = plus.price();
  const items = [];

  /* 결제까지 가는 길을 짧게 둔다. 설정 화면으로 보내면 두 단계가 더 붙고,
     그 사이에 대부분 마음이 식는다. 가격도 여기서 바로 보여준다 —
     스토어에서 받아온 값이라 나라마다 그 나라 통화로 뜬다. */
  if (plus.canBuy()) {
    items.push({
      label: p ? t('{p}으로 제한 없이 쓰기', { p }) : t('제한 없이 쓰기'),
      sub: t('배너 광고도 함께 사라져요. 한 번만 사면 됩니다.'),
      icon: 'heart',
      onClick: async () => {
        const r = await plus.buy('plan_limit');
        const msg = plus.buyErrorText(r);
        if (msg) toast(msg);
        // 성공하면 구글 결제창이 뜨고, 완료는 app.js 의 onOwned 가 받는다
      },
    });
  }
  items.push({
    label: t('무엇이 달라지나요?'),
    icon: 'chev',
    onClick: () => plus.showInfo('plan_limit'),      // 설정으로 보내지 않는다 — 그 자리에서 답한다
  });

  openSheet({
    center: true,
    title: t('일정을 {n}개까지 무료로 쓸 수 있어요', { n: plus.planCeiling() }),
    text: t('끝낸 일정은 개수에 들어가지 않아요. 하나 체크하면 바로 더 넣을 수 있습니다.'),
    items,
  });
}

/** 앞으로·놓친 일정을 .ics 로 (목록/달력 양쪽에서 쓴다) */
export async function exportAll() {
  const list = [...plans.overdue(), ...plans.upcoming()];
  if (!list.length) { toast(t('내보낼 일정이 없어요.')); return; }
  const [{ build }, backup] = await Promise.all([import('../ics.js'), import('../backup.js')]);
  const name = `harukan-plans-${todayKey()}.ics`;
  try {
    const res = await backup.saveFile(name, build(list), 'text/calendar');
    if (res.where === 'native') {
      const ok = await confirmSheet({
        title: t('{n}개를 내보냈어요.', { n: list.length }),
        text: t('캘린더 앱으로 보내면 구글·삼성·애플 캘린더 어디서든 열립니다.'),
        ok: t('캘린더 앱으로 보내기'),
      });
      if (ok) await backup.shareFile(res.uri, t('하루칸 일정'));
    } else {
      toast(t('{n}개를 내보냈어요.', { n: list.length }));
    }
  } catch (e) {
    console.error(e);
    toast(t('파일을 저장하지 못했어요. 저장 공간을 확인해 주세요.'));
  }
}

/* ── 날짜 이름 ───────────────────────────────────── */
function dayLabel(date) {
  const today = todayKey();
  if (date === today) return t('오늘');
  if (date === addDays(today, 1)) return t('내일');
  const d = parseKey(date);
  return `${fmtDate(date, { year: false, weekday: false })} (${WD[d.getDay()]})`;
}

/* 예전에는 '놓친 일정 / 앞으로 / 끝낸 일정'을 세 덩어리로 쌓아 보여줬다.
   탭이 그 자리를 대신하면서 머리말이 필요 없어졌다 — section() 은 지웠다. */

/* ── 추가 / 고치기 ───────────────────────────────── */
/**
 * @param existing 고칠 일정. 새로 만들 때는 null.
 * @param onDone   저장·삭제 뒤에 부를 것
 * @param date     새로 만들 때 미리 채워둘 날짜 (달력에서 그 날을 눌러 들어온 경우)
 */
export function edit(existing, onDone, { date: presetDate = null } = {}) {
  // 새로 넣을 때만 한도를 본다. 이미 있는 것을 고치거나 지우는 건 언제나 자유다 —
  // 한도에 걸린 사람이 자기 일정을 정리조차 못 하면 그건 인질이지 한도가 아니다.
  if (!existing && !plus.canAddPlan(plans.activeCount())) { upsell(); return; }
  const p = existing ? { ...existing } : plans.newPlan(presetDate || todayKey());
  const box = el('div', { class: 'plan-edit' });

  const title = el('input', {
    class: 'lock-input', type: 'text', placeholder: t('무엇을 하나요?'),
    value: p.title || '', style: 'text-align:start', autocomplete: 'off',
  });
  const date = tapToPick(el('input', { class: 'lock-input', type: 'date', value: p.date, style: 'text-align:start' }));
  /* 시각 칸: 앱 언어 표기로 보여 준다 (ui.js timeInput). 비우면 '종일' */
  const tf = timeInput(p.time || '', { faceClass: 'lock-input', faceStyle: 'display:flex;align-items:center;text-align:start', empty: t('종일'), block: true });
  const time = tf.input;
  // 메모는 쓴 만큼 보여야 한다 — 스크롤 대신 상자가 늘어난다
  const memo = el('textarea', { class: 'lock-input plan-memo-input', rows: '3', placeholder: t('메모 (선택)') });
  memo.value = p.memo || '';
  memo.addEventListener('input', () => autogrow(memo));

  const field = (label, node) => {
    const f = el('div', { class: 'plan-field' });
    f.append(el('label', { class: 'plan-label' }, esc(label)), node);
    return f;
  };

  /* 반복 */
  const repeatRow = el('div', { class: 'chip-row' });
  for (const v of plans.REPEATS) {
    const b = el('button', { class: 'chip' + (p.repeat === v ? ' on' : ''), type: 'button' },
      `<span>${esc(t(REPEAT_LABEL[v]))}</span>`);
    b.addEventListener('click', () => {
      p.repeat = v;
      for (const o of repeatRow.children) o.classList.remove('on');
      b.classList.add('on');
    });
    repeatRow.append(b);
  }

  /* 알림 — 시각이 있어야 의미가 있다 */
  const remindRow = el('div', { class: 'chip-row' });
  const paintRemind = () => {
    remindRow.innerHTML = '';
    const on = !!time.value;
    for (const c of REMIND_CHOICES) {
      const b = el('button', {
        class: 'chip' + (p.remindMin === c.v ? ' on' : ''), type: 'button',
        ...(on ? {} : { disabled: 'disabled' }),
      }, `<span>${esc(t(c.k))}</span>`);
      b.addEventListener('click', () => {
        p.remindMin = c.v;
        for (const o of remindRow.children) o.classList.remove('on');
        b.classList.add('on');
      });
      remindRow.append(b);
    }
    if (!on) remindRow.append(el('div', { class: 'note', style: 'margin-top:6px' },
      t('시각을 정하면 알림을 걸 수 있어요.')));
  };
  time.addEventListener('change', paintRemind);
  paintRemind();

  box.append(
    field(t('할 일'), title),
    field(t('날짜'), date),
    field(t('시각 (선택)'), tf.wrap),
    field(t('반복'), repeatRow),
    field(t('알림'), remindRow),
    field(t('메모'), memo),
  );

  const btns = el('div', { class: 'btn-row', style: 'margin-top:16px' });
  const cancel = el('button', { class: 'btn', type: 'button' }, t('취소'));
  const save = el('button', { class: 'btn btn-primary', type: 'button' }, t('저장'));
  btns.append(cancel, save);

  if (existing) {
    const del = el('button', { class: 'btn btn-danger btn-block', type: 'button', style: 'margin-top:8px' },
      icon('trash') + `<span>${t('이 일정 지우기')}</span>`);
    del.addEventListener('click', () => {
      // 시트를 먼저 닫는다 — 지울지 묻는 창이 편집 시트 위에 겹치면 어느 쪽을 닫는지 헷갈린다
      close();
      setTimeout(() => remove(p, onDone), 230);
    });
    box.append(btns, del);
  } else {
    box.append(btns);
  }

  const close = openSheet({ title: existing ? t('일정 고치기') : t('새 일정'), content: box });
  cancel.addEventListener('click', () => close());
  // 고치기로 열었으면 이미 적힌 메모가 전부 보이도록 처음부터 늘려둔다
  requestAnimationFrame(() => autogrow(memo, true));
  setTimeout(() => title.focus(), 80);

  save.addEventListener('click', async () => {
    if (!title.value.trim()) { toast(t('할 일을 적어주세요.')); title.focus(); return; }
    if (!date.value) { toast(t('날짜를 골라주세요.')); return; }
    p.title = title.value.trim();
    p.date = date.value;
    p.time = time.value || null;
    p.memo = memo.value.trim();
    if (!p.time) p.remindMin = null;          // 시각 없이 알림만 남는 상태를 막는다
    const wantsAlarm = p.time && p.remindMin != null;
    await plans.put(p);
    if (!existing) { analytics.design('plan:add'); analytics.once('funnel:first_plan'); }
    close();
    toast(existing ? t('고쳤어요.') : t('일정을 넣었어요.'));
    onDone?.();
    /* 알림을 켠 그 순간에만 권한을 묻는다. 사용자가 방금 "30분 전"을 고른 참이라
       왜 물어보는지 안다. 앱을 켤 때마다 묻는 것과는 전혀 다르다. */
    if (wantsAlarm) await syncReminders({ ask: true });
  });
}

/**
 * 알림을 지금 상태에 맞게 다시 건다.
 * @param ask 권한이 없을 때 사용자에게 물어볼지. 사용자가 방금 알림을 켠 경우에만 true —
 *            앱을 켤 때마다 물으면 설명 없이 시스템 설정 화면으로 튕기는 것과 다를 게 없다.
 */
export async function syncReminders({ ask = false } = {}) {
  if (!native.isNative()) return;
  // 저장 직후에는 캐시가 비워져 있다. 여기서 직접 읽어야 목록이 비어 보이지 않는다.
  await plans.loadAll();
  const items = [];
  for (const p of plans.upcoming()) {
    const at = plans.remindAt(p);
    if (at) items.push({ id: p.id, title: p.title || t('일정'), body: p.memo || t('곧 시작해요.'), at });
  }
  try {
    const r = await native.refreshPlanReminders(items);
    if (r === 'need-exact' && ask) {
      const { askExactAlarm } = await import('../app.js');
      // 권한 화면을 다녀오면 다시 걸어본다 (이번엔 묻지 않는다)
      if (await askExactAlarm()) setTimeout(() => syncReminders(), 800);
    }
  } catch (e) { console.error(e); }
}
