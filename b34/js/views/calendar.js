/* ===========================================================
   views/calendar.js — 달력 · 모자이크

   달력은 일기와 일정이 만나는 한 장이다.
     · 지난 칸은 일기가 채운다 (기분 색)
     · 앞으로 올 칸은 일정이 채운다 (아래쪽 점)
     · 오늘은 둘 다 있을 수 있다
   달력을 두 개 만들지 않는 이유가 이것이다. 날짜는 하나뿐인데 달력이
   둘이면, 어느 쪽을 봐야 하는지 매번 생각해야 한다.

   "월별 모아보기가 없다"는 불만이 잦아서, 달력에서 그 달의 글
   목록까지 한 화면에 붙였다. 빈 날을 누르면 그 날짜로 바로 쓰기.
   =========================================================== */

import * as store from '../store.js';
import * as plans from '../plans.js';
import * as plus from '../plus.js';
import { t, monthLabel, monthTitle, fmtClock } from '../i18n.js';
import { go } from '../app.js';
import {
  el, icon, esc, openSheet, infoButton, todayKey, parseKey, addDays, moodColor, moodWord, WD, fmtDate,
} from '../ui.js';
import { entryItem } from './home.js';
import { fillRate, summary } from '../insights.js';

export async function render(root, params) {
  const today = todayKey();
  const cur = params.m || today.slice(0, 7);           // 'YYYY-MM'
  const [Y, M] = cur.split('-').map(Number);
  const entries = store.live();

  // loadAll() 이 돌려준 목록을 그대로 쓴다. all() 은 캐시를 보는데, 그 사이
  // 다른 곳에서 일정을 건드리면 캐시가 비워져 빈 목록이 나올 수 있다.
  await plans.loadAll();
  await plans.rollover();
  /* 반복 할 일은 앞으로의 회차마다 점을 찍는다 (저장 안 하는 가상 회차, 2026-11-01) */
  const planList = plans.occurrences(`${cur}-01`, `${cur}-31`);
  const planByDate = new Map();
  for (const p of planList) {
    if (!planByDate.has(p.date)) planByDate.set(p.date, []);
    planByDate.get(p.date).push(p);
  }

  const byDate = new Map();
  for (const e of entries) {
    if (!byDate.has(e.date)) byDate.set(e.date, []);
    byDate.get(e.date).push(e);
  }

  /* ── 월 이동 ──────────────────────────────── */
  const head = el('div', { class: 'cal-head' });
  const mkNav = (delta, ic, label) => {
    const b = el('button', { class: 'icon-btn', type: 'button', 'aria-label': label }, icon(ic));
    b.addEventListener('click', () => {
      const d = new Date(Y, M - 1 + delta, 1);
      go(`/calendar?m=${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    });
    return b;
  };
  head.append(mkNav(-1, 'chevL', t('이전 달')));
  const title = el('div', { class: 'cal-title' }, monthTitle(Y, M));
  title.addEventListener('click', () => go(`/calendar?m=${today.slice(0, 7)}`));
  head.append(title, mkNav(1, 'chev', t('다음 달')));
  root.append(head);

  /* ── 달력 그리드 ──────────────────────────── */
  const grid = el('div', { class: 'cal-grid' });
  WD.forEach((w, i) => grid.append(el('div', { class: 'cal-wd' + (i === 0 ? ' sun' : '') }, w)));

  const first = new Date(Y, M - 1, 1);
  const daysInMonth = new Date(Y, M, 0).getDate();
  for (let i = 0; i < first.getDay(); i++) grid.append(el('div', { class: 'cal-cell blank' }));

  /* 사진으로 채울지는 설정에서 고른다. 사진이 없는 날은 어느 쪽이든 기분 색이다 —
     빈 칸만 잔뜩인 달력은 "사진 달력"이 아니라 그냥 망가진 달력으로 보인다. */
  const photoMode = store.getSettings().calendarStyle === 'photo' && plus.canPhotoCalendar();

  const maxChars = Math.max(200, ...entries.map((e) => e.wordCount || 0));
  for (let d = 1; d <= daysInMonth; d++) {
    const key = `${Y}-${String(M).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const list = byDate.get(key) || [];
    const c = el('button', { class: 'cal-cell', type: 'button' }, String(d));
    if (list.length) {
      c.classList.add('has');
      const withMood = list.find((x) => x.mood);
      const chars = list.reduce((s, x) => s + (x.wordCount || 0), 0);
      const strength = 0.42 + Math.min(1, chars / maxChars) * 0.58;
      /* 칸 전체(opacity)를 흐리게 하면 날짜 숫자까지 흐려져 안 보였다(2026-11-01 사용자 의견, tr) → 색 바탕만 흐리게 */
      c.style.setProperty('--mood', withMood ? moodColor(withMood.mood) : 'var(--muted-2)');
      c.style.setProperty('--mood-a', strength.toFixed(2));
      c.setAttribute('aria-label', `${d}, ${list.length}${withMood ? ', ' + moodWord(withMood.mood) : ''}`);

      const pid = photoMode ? list.flatMap((x) => x.photos || [])[0] : null;
      if (pid) {
        /* 숫자를 사진 위에 얹어야 해서 글자를 span 으로 다시 감싼다.
           기분 색은 사진 밑에 그대로 남겨둔다 — 사진이 늦게 뜨는 동안 칸이 비지 않는다. */
        c.textContent = '';
        c.classList.add('has-photo');
        c.style.setProperty('--mood-a', '1');    // 사진을 흐리게 만들지 않는다
        const img = el('img', { class: 'cal-photo', alt: '', decoding: 'async' });
        // 사진이 사라진 경우(백업 복원 실패 등) 원래 기분 색 칸으로 되돌린다
        store.fillImage(img, pid, () => {
          c.classList.remove('has-photo');
          img.remove();
          c.style.setProperty('--mood-a', strength.toFixed(2));
        });
        c.append(img, el('span', { class: 'cal-dnum' }, String(d)));
      } else if (list.some((x) => x.photos?.length)) {
        c.append(el('span', { class: 'photo-flag' }));
      }
    } else if (key > today) {
      c.classList.add('future');               // 다가올 날: 바탕만 옅게, 숫자는 읽히게
    }
    if (key === today) c.classList.add('today');

    /* 일정 표시 — 칸 아래쪽에 점을 찍는다. 기분 색을 덮지 않으려고
       색이 아니라 점을 쓴다. 안 끝난 것만 센다. */
    const dayPlans = planByDate.get(key) || [];
    const openPlans = dayPlans.filter((p) => !p.done);
    if (openPlans.length) {
      /* 일정은 그 일정의 색 막대로 (일정 달력과 같은 색) — 기분 색 칸과 섞이지 않게 칸 아래쪽에 얇게 (2026-11-01) */
      const dots = el('span', { class: 'cal-plans' });
      for (const p of openPlans.slice(0, 3)) dots.append(el('i', { style: `--bar:${plans.planColor(p)}` }));
      c.append(dots);
      c.classList.add('has-plan');
      if (key < today) c.classList.add('plan-late');     // 지났는데 안 끝난 것
    }

    c.addEventListener('click', () => {
      // 일기 한 편뿐이고 일정이 없으면 예전처럼 곧장 글로 간다 (빠른 길을 지킨다)
      if (list.length === 1 && !dayPlans.length) { go(`/entry/${list[0].id}`); return; }
      if (!list.length && !dayPlans.length && key <= today) { go(`/write?d=${key}`); return; }
      openDay(key, list, dayPlans);
    });
    grid.append(c);
  }
  root.append(grid);
  /* 무엇이 일기고 무엇이 일정인지 (2026-11-01 사용자: 일기와 일정을 나누어 보이게) */
  {
    const mE = entries.filter((e) => e.date.startsWith(cur)).length;
    const mP = new Set(planList.filter((p) => p.date.startsWith(cur) && !p.done).map((p) => p.seriesId || p.id)).size;   // 반복 할 일은 하나로 센다
    root.append(el('div', { class: 'cal-legend' },
      `<span class="lg"><i class="lg-diary"></i>${esc(t('일기'))} <b>${mE}</b></span><span class="lg"><i class="lg-plan"></i>${esc(t('일정'))} <b>${mP}</b></span>`));
  }

  /* ── 그 달 통계 ───────────────────────────── */
  const monthEntries = entries.filter((e) => e.date.startsWith(cur));
  const monthDays = new Set(monthEntries.map((e) => e.date)).size;
  const moods = monthEntries.filter((e) => e.mood).map((e) => e.mood.v);
  const avg = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null;
  const stats = el('div', { class: 'cal-stats' });
  // 숫자만 두면 무엇을 센 값인지 알 길이 없다. 눌러서 설명이 나오게 하고,
  // 누를 수 있다는 표시(물음표)를 반드시 같이 단다.
  const tile = (ico, num, label, desc) => {
    const b = el('button', { class: 'stat', type: 'button' },
      `<span class="info-mark" aria-hidden="true">${icon('info')}</span>
       <div class="stat-top ico-amber">${icon(ico)}<span class="stat-num">${num}</span></div>
       <div class="stat-label">${esc(label)}</div>`);
    b.addEventListener('click', () => openSheet({ title: label, text: desc, center: true }));
    return b;
  };
  stats.append(
    tile('cal', monthDays, t('기록한 날'),
      t('이 달에 일기를 한 편이라도 쓴 날의 수예요. 하루에 여러 편을 써도 하루로 세요.')),
    tile('fileTxt', monthEntries.reduce((s, e) => s + (e.wordCount || 0), 0).toLocaleString(), t('글자'),
      t('이 달에 쓴 모든 글의 글자 수를 더한 값이에요. 공백은 빼고 세요.')),
    tile('mood', avg == null ? '–' : (avg >= 0 ? '+' : '') + (avg * 50).toFixed(0), t('평균 기분'),
      t('이 달에 기분을 남긴 글들의 평균이에요. -50이 가장 불쾌, +50이 가장 유쾌, 0이 보통입니다. 기분을 안 남긴 글은 빼고 셉니다.')),
  );
  root.append(stats);

  /* ── 1년 모자이크 ─────────────────────────── */
  const sec = el('div', { class: 'section' });
  const yhead = el('div', { class: 'section-head' },
    `<div class="section-title">${icon('cal')}<span>${t('지난 1년')}</span></div>
     <div class="section-more">${t('{n}일', { n: fillRate(entries, 365).filled })}</div>`);
  yhead.querySelector('.section-title').append(infoButton(t('지난 1년'),
    t('최근 1년을 하루 한 칸으로 그린 그림이에요. 칸 하나가 하루고, 세로 한 줄이 한 주입니다. 색은 그날 남긴 기분, 진하기는 그날 쓴 글자 수예요. 빈칸은 쓰지 않은 날이고요. 오른쪽 숫자는 그중 기록한 날의 수입니다.')));
  sec.append(yhead);
  const map = el('div', { class: 'yearmap' });
  const inner = el('div', { class: 'yearmap-inner' });

  // 오늘이 속한 주의 토요일까지 채우기 → 열이 깔끔하게 떨어진다
  let end = today;
  while (parseKey(end).getDay() !== 6) end = addDays(end, 1);
  const start = addDays(end, -370);
  for (let k = start; k <= end; k = addDays(k, 1)) {
    const list = byDate.get(k) || [];
    const cell = el('div', { class: 'ymcell', title: `${k}${list.length ? ` · ${t('{n}편', { n: list.length })}` : ''}` });
    if (list.length) {
      const wm = list.find((x) => x.mood);
      cell.style.background = wm ? moodColor(wm.mood) : 'var(--muted-2)';
      const chars = list.reduce((s, x) => s + (x.wordCount || 0), 0);
      cell.style.opacity = (0.45 + Math.min(1, chars / maxChars) * 0.55).toFixed(2);
    }
    if (k > today) cell.style.visibility = 'hidden';
    if (k === today) cell.style.boxShadow = 'inset 0 0 0 1.6px var(--ink)';
    if (list.length) cell.addEventListener('click', () => go(`/entry/${list[0].id}`));
    inner.append(cell);
  }
  map.append(inner);
  sec.append(map);
  /* 최근(오늘) 쪽이 보이게 끝까지 굴려 둔다 (1.7.2). 예전에는 1년 전 쪽에서 시작해서
     글을 쓴 날이 화면 밖에 있었고, 처음 쓰는 사람에게는 빈 칸만 보였다(폰 점검). 오른쪽→왼쪽 글에서는 반대 끝 */
  const toRecent = () => {
    if (!map.isConnected) return false;
    map.scrollLeft = getComputedStyle(map).direction === 'rtl' ? -map.scrollWidth : map.scrollWidth;
    return true;
  };
  requestAnimationFrame(() => { if (!toRecent()) setTimeout(toRecent, 120); });
  sec.append(el('div', { class: 'ymlegend' },
    `<span>${t('힘든 날')}</span>
     <span class="ymcell" style="background:hsl(14 64% 56%)"></span>
     <span class="ymcell" style="background:hsl(66 46% 58%)"></span>
     <span class="ymcell" style="background:hsl(150 58% 52%)"></span>
     <span>${t('좋은 날')}</span>`));
  sec.append(el('div', { class: 'note' }, t('칸의 색은 그날의 기분, 진하기는 쓴 양이에요. 빈 날을 눌러 지난 날짜를 채워 넣을 수도 있어요.')));
  root.append(sec);

  /* ── 그 달의 글 목록 ──────────────────────── */
  if (monthEntries.length) {
    const sec2 = el('div', { class: 'section' });
    sec2.append(el('div', { class: 'section-head' },
      `<div class="section-title">${icon('book')}<span>${t('{m}월의 글', { m: monthLabel(M) })}</span></div><div class="section-more">${t('{n}편', { n: monthEntries.length })}</div>`));
    const list = el('div', { class: 'elist' });
    for (const e of monthEntries) list.append(entryItem(e));
    sec2.append(list);
    root.append(sec2);
  } else {
    root.append(el('div', { class: 'empty' },
      `<div class="empty-title">${esc(t('{m}월엔 아직 글이 없어요', { m: monthLabel(M) }))}</div>
       <div class="empty-sub">${esc(t('달력에서 날짜를 눌러 그 날의 일기를 채워 넣을 수 있어요.'))}</div>`));
  }

  const sum = summary(entries);
  root.append(el('div', { class: 'note', style: 'text-align:center;margin-top:24px' },
    sum.first ? t('첫 글 {d} · 모두 {n}편', { d: fmtDate(sum.first, { year: true, weekday: false }), n: sum.count }) : ''));

  return { title: t('달력'), right: [{ icon: 'search', label: t('검색'), onClick: () => go('/search') }] };
}

/**
 * 하루를 눌렀을 때 — 그 날의 일기와 일정을 한 시트에 같이 보여준다.
 * 이게 두 기능이 만나는 지점이다. 같은 날짜인데 목록이 둘로 갈리면
 * "그날 무슨 일이 있었나"를 두 군데서 찾아봐야 한다.
 */
const REPEAT_WORD = { daily: '매일', weekly: '매주', monthly: '매달', yearly: '매년' };
export function openDay(key, entries, dayPlans, { plansOnly = false, back = '/plans' } = {}) {
  /* 2026-11-01 사용자: 일정 달력에서는 일정만, 메인 달력에서는 일기와 일정을 나누어 보이게 */
  const today = todayKey();
  const box = el('div', { class: 'day-sheet' });
  let close = () => {};
  const section = (label, n) => el('div', { class: 'ds-head' }, `<span>${esc(label)}</span>${n ? `<b>${n}</b>` : ''}`);

  if (!plansOnly) {
    box.append(section(t('일기'), entries.length));
    if (!entries.length) box.append(el('div', { class: 'ds-empty' }, esc(t('이 날 쓴 일기가 없어요'))));
    for (const e of entries) {
      const row = el('button', { class: 'ds-row ds-entry', type: 'button' });
      row.append(el('i', { class: 'ds-mood', style: `background:${e.mood ? moodColor(e.mood) : 'var(--line-2)'}` }));
      row.append(el('span', { class: 'ds-main' }, `<span class="ds-title">${esc(e.title || (e.body || '').split('\n')[0].slice(0, 30) || t('(내용 없음)'))}</span><span class="ds-sub">${esc(t('{n}자', { n: e.wordCount || 0 }))}</span>`));
      const pid = e.photos?.[0];
      if (pid) { const img = el('img', { class: 'ds-thumb', alt: '', decoding: 'async' }); store.fillImage(img, pid, () => img.remove()); row.append(img); }
      row.addEventListener('click', () => { close(); go(`/entry/${e.id}`); });
      box.append(row);
    }
  }

  const open = dayPlans.filter((p) => !p.done);
  const done = dayPlans.filter((p) => p.done);
  box.append(section(t('일정'), dayPlans.length));
  if (!dayPlans.length) box.append(el('div', { class: 'ds-empty' }, esc(t('이 날 일정이 없어요'))));
  for (const p of [...open, ...done]) {
    const row = el('button', { class: 'ds-row ds-plan' + (p.done ? ' done' : ''), type: 'button' });
    row.append(el('i', { class: 'ds-bar', style: `background:${plans.planColor(p)}` }));
    const rep = REPEAT_WORD[p.repeat] ? `<em class="ds-badge">${esc(t(REPEAT_WORD[p.repeat]))}</em>` : '';
    row.append(el('span', { class: 'ds-main' }, `<span class="ds-title">${esc(p.title || t('(제목 없음)'))}${rep}</span><span class="ds-sub">${esc([p.time ? fmtClock(p.time) : t('종일'), p.memo ? p.memo.split('\n')[0] : ''].filter(Boolean).join(' · '))}</span>`));
    if (p.done) row.append(el('span', { class: 'ds-check' }, icon('check')));
    row.addEventListener('click', async () => {
      close();
      const view = await import('./plans.js');
      /* 앞으로의 반복 회차(가상)를 누르면 원래 할 일을 고친다 */
      view.edit(p.virtual ? (plans.byId(p.id) || p) : p, () => go(back));
    });
    box.append(row);
  }

  const btns = el('div', { class: 'ds-btns' });
  if (!plansOnly && key <= today) {
    const w = el('button', { class: 'btn', type: 'button' }, `${icon('edit')}<span>${esc(t('이 날 일기 쓰기'))}</span>`);
    w.addEventListener('click', () => { close(); go(`/write?d=${key}`); });
    btns.append(w);
  }
  const ad = el('button', { class: 'btn' + (plansOnly ? ' btn-primary' : ''), type: 'button' }, `${icon('plus')}<span>${esc(t('이 날 일정 넣기'))}</span>`);
  ad.addEventListener('click', async () => { close(); const view = await import('./plans.js'); view.edit(null, () => go(back), { date: key }); });
  btns.append(ad);
  box.append(btns);

  close = openSheet({ title: fmtDate(key, { year: true }), content: box });
}
