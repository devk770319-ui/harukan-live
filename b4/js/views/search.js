/* ===========================================================
   views/search.js — 검색 / 전체 보기
   · 초성 검색 지원: "ㅇㄷ" → "운동"
   · #태그 검색
   · 기분·사진·기간 필터
   =========================================================== */

import * as store from '../store.js';
import { go } from '../app.js';
import {
  el, icon, esc, todayKey, addDays, moodColor, moodWord, parseKey, WD, moodQuadrant, summaryText,
} from '../ui.js';
import { matches, highlightExcerpt, isChoseongQuery } from '../hangul.js';
import { tagRanking } from '../insights.js';
import { t, monthTitle } from '../i18n.js';

const state = { q: '', period: 'all', mood: 'all', only: null, tag: null };

export async function render(root, params) {
  if (params.q != null) {
    /* URLSearchParams 가 이미 풀어놨다. 여기서 또 풀면 '%' 가 든 말에서 터진다 */
    const q = params.q;
    if (q.startsWith('#')) { state.tag = q.slice(1); state.q = ''; }
    else state.q = q;
  }
  /* 홈의 '보관함 전체 보기'에서 들어온 경우 */
  if (params.b === '1') { state.only = 'bookmark'; state.q = ''; state.tag = null; state.period = 'all'; }

  /* ── 검색창 ───────────────────────────────── */
  const bar = el('div', { class: 'searchbar' });
  bar.innerHTML = icon('search');
  const input = el('input', {
    type: 'search', placeholder: t('내용, 제목, 태그 · 초성도 돼요 (ㅇㄷ)'),
    value: state.q, 'aria-label': t('검색어'), enterkeyhint: 'search',
  });
  const clear = el('button', { class: 'search-clear', type: 'button', 'aria-label': t('지우기') }, '✕');
  clear.hidden = !state.q;
  bar.append(input, clear);
  root.append(bar);

  /* ── 필터 ─────────────────────────────────── */
  const filters = el('div', { class: 'filter-row' });
  root.append(filters);

  const results = el('div');
  const count = el('div', { class: 'search-count' });
  root.append(count, results);

  const tagSec = el('div');
  root.append(tagSec);

  function buildFilters() {
    filters.innerHTML = '';
    const add = (label, active, onClick) => {
      const b = el('button', { class: 'chip' + (active ? ' on' : ''), type: 'button' }, label);
      b.addEventListener('click', () => { onClick(); buildFilters(); run(); });
      filters.append(b);
    };
    if (state.tag) add(`#${esc(state.tag)} ✕`, true, () => { state.tag = null; });
    add(t('전체 기간'), state.period === 'all', () => (state.period = 'all'));
    add(t('최근 30일'), state.period === '30', () => (state.period = state.period === '30' ? 'all' : '30'));
    add(t('올해'), state.period === 'year', () => (state.period = state.period === 'year' ? 'all' : 'year'));
    for (const q of ['활기', '평온', '긴장', '침체']) {
      add(t(q), state.mood === q, () => (state.mood = state.mood === q ? 'all' : q));
    }
    add(t('보관함'), state.only === 'bookmark', () => (state.only = state.only === 'bookmark' ? null : 'bookmark'));
    add(t('사진 있는 글'), state.only === 'photo', () => (state.only = state.only === 'photo' ? null : 'photo'));
  }

  function filtered() {
    let list = store.live();
    if (state.period === '30') { const cut = addDays(todayKey(), -30); list = list.filter((e) => e.date >= cut); }
    if (state.period === 'year') { const y = todayKey().slice(0, 4); list = list.filter((e) => e.date.startsWith(y)); }
    if (state.mood !== 'all') list = list.filter((e) => moodQuadrant(e.mood) === state.mood);
    if (state.only === 'photo') list = list.filter((e) => e.photos?.length);
    if (state.only === 'bookmark') list = list.filter((e) => e.bookmarkedAt);
    if (state.tag) list = list.filter((e) => (e.tags || []).includes(state.tag));

    const q = state.q.trim();
    if (q) {
      if (q.startsWith('#')) {
        const t = q.slice(1);
        list = list.filter((e) => (e.tags || []).some((x) => matches(x, t)));
      } else {
        list = list.filter((e) =>
          matches(e.body || '', q) || matches(e.title || '', q) ||
          (e.tags || []).some((t) => matches(t, q)) ||
          (e.chips || []).some((c) => matches(c, q)));
      }
    }
    return list;
  }

  function run() {
    const list = filtered();
    const q = state.q.trim();
    results.innerHTML = '';
    clear.hidden = !state.q;

    count.textContent = list.length
      ? `${t('{n}편', { n: list.length })}${q ? ` · “${q}”` : ''}${isChoseongQuery(q) ? ' ' + t('(초성 검색)') : ''}`
      : '';

    if (!list.length) {
      results.append(el('div', { class: 'empty' },
        q || state.tag || state.mood !== 'all' || state.only
          ? `<span class="empty-emoji">🔍</span>
             <div class="empty-title">${t('찾는 글이 없어요')}</div>
             <div class="empty-sub">${t('조건을 줄이거나 초성으로 다시 찾아보세요.')}</div>`
          : `<span class="empty-emoji">📖</span>
             <div class="empty-title">${t('아직 글이 없어요')}</div>
             <div class="empty-sub">${t('첫 글을 쓰고 나면 여기에서 다시 찾을 수 있어요.')}</div>`));
      renderTags();
      return;
    }

    // 월별로 묶어서 보여준다. 한 번에 50편씩 (몇 년 치가 쌓여도 화면이 무겁지 않게)
    let shown = 0;
    const wrap = el('div');
    let lastMonth = '';
    const more = el('button', { class: 'btn btn-ghost btn-block', type: 'button', style: 'margin-top:12px' });
    const page = () => {
      const next = list.slice(shown, shown + 50);
      for (const e of next) {
        const m = e.date.slice(0, 7);
        if (m !== lastMonth) {
          lastMonth = m;
          wrap.append(el('div', { class: 'month-label' }, monthTitle(Number(m.slice(0, 4)), Number(m.slice(5)))));
        }
        wrap.append(resultItem(e, q));
      }
      shown += next.length;
      more.hidden = shown >= list.length;
      more.textContent = t('{n}편 더 보기', { n: list.length - shown });
    };
    more.addEventListener('click', page);
    page();
    results.append(wrap, more);
    renderTags();
  }

  function renderTags() {
    tagSec.innerHTML = '';
    if (state.q || state.tag) return;
    const tags = tagRanking(store.live(), 18);
    if (!tags.length) return;
    const sec = el('div', { class: 'section' });
    sec.append(el('div', { class: 'section-head' }, `<div class="section-title">${t('태그')}</div>`));
    const row = el('div', { class: 'chip-row' });
    for (const t of tags) {
      const b = el('button', { class: 'chip', type: 'button' }, `#${esc(t.tag)} <span class="muted">${t.count}</span>`);
      b.addEventListener('click', () => { state.tag = t.tag; buildFilters(); run(); window.scrollTo(0, 0); });
      row.append(b);
    }
    sec.append(row);
    tagSec.append(sec);
  }

  let timer = null;
  input.addEventListener('input', () => {
    state.q = input.value;
    clearTimeout(timer);
    timer = setTimeout(run, 120);
  });
  clear.addEventListener('click', () => { state.q = ''; input.value = ''; input.focus(); run(); });

  buildFilters();
  run();
  if (!state.q && !state.tag) setTimeout(() => input.focus(), 100);

  return { title: t('찾기') };
}

/* 검색어 하이라이트가 들어간 결과 항목 */
function resultItem(e, q) {
  const d = parseKey(e.date);
  const b = el('button', { class: 'eitem', type: 'button' });
  const body = (e.body || '').replace(/\s+/g, ' ').trim();
  const ex = q && !q.startsWith('#') && body
    ? highlightExcerpt(body, q, 55)
    : esc(summaryText(e, 120, { title: false }));   // 제목은 위에 따로 나온다

  const meta = [];
  if (e.mood) meta.push(`<span class="mood-dot" style="background:${moodColor(e.mood)}" title="${esc(moodWord(e.mood))}"></span>`);
  for (const t of (e.tags || []).slice(0, 3)) meta.push(`<span class="tag">${esc(t)}</span>`);

  b.innerHTML =
    `<div class="eitem-day">
       <div class="eitem-dnum">${d.getDate()}</div>
       <div class="eitem-dwk">${WD[d.getDay()]}</div>
     </div>
     <div class="eitem-main">
       ${e.title ? `<div class="eitem-title">${q ? highlightExcerpt(e.title, q, 40) : esc(e.title)}</div>` : ''}
       ${ex ? `<div class="eitem-ex">${ex}</div>` : ''}
       ${meta.length ? `<div class="eitem-meta">${meta.join('')}</div>` : ''}
     </div>`;
  b.addEventListener('click', () => go(`/entry/${e.id}`));
  return b;
}
