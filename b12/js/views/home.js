/* ===========================================================
   views/home.js — 홈
   구성: 인사 → 오늘 쓰기 → 되새김(과거의 글) → 주간 목표 → 최근 글
   =========================================================== */

import * as store from '../store.js';
import * as NB from '../newbadge.js';
import * as wx from '../weather.js';
import { go } from '../app.js';
import * as notices from '../notices.js';
import {
  $, $$, el, icon, esc, toast, haptic, openSheet, infoButton,
  todayKey, fmtDate, relDay, moodColor, moodWord, parseKey, WD, summaryText, daysBetween,
} from '../ui.js';
import { buildRecalls } from '../recall.js';
import { t, monthTitle } from '../i18n.js';
import * as stickers from '../stickers.js';
import * as analytics from '../analytics.js';
import { weekProgress, goalStreakWeeks, recentMoodAvg } from '../insights.js';
import { pickPrompts } from '../prompts.js';

/* 오늘 쓰기 카드의 장식 선화 — 펼친 종이와 잎사귀. 아이콘(24 그리드)과 별개 규격이다. */
const CTA_ART = `<svg viewBox="0 0 120 140" aria-hidden="true">
  <rect x="13" y="14" width="72" height="98" rx="11"/>
  <path d="M29 42h40M29 58h40M29 74h24"/>
  <path d="M99 58c-15 4-23 15-25 30 17-2 26-12 25-30Z"/>
  <path d="M70 96c9-11 17-19 26-24"/>
</svg>`;

function greetWord() {
  const h = new Date().getHours();
  if (h < 5) return t('늦은 밤이네요');
  if (h < 11) return t('좋은 아침이에요');
  if (h < 14) return t('점심 무렵이에요');
  if (h < 18) return t('오후예요');
  if (h < 22) return t('저녁이에요');
  return t('하루가 저물어요');
}

export async function render(root) {
  const today = todayKey();
  const entries = store.live();
  const s = store.getSettings();
  const todays = store.byDate(today);

  /* ── 인사 ─────────────────────────────────── */
  const greet = el('div', { class: 'greet' });
  greet.innerHTML =
    `<div class="greet-date">${esc(fmtDate(today, { weekday: true }))}</div>
     <div class="greet-title">${esc(greetWord())}</div>`;
  root.append(greet);

  /* ── 알림을 허용해 주세요 (1.7.9) — 매일 알림이 실제로 꺼져 있을 때만. 그리는 동안 기다리지 않게 자리만 잡아 둔다 */
  {
    const slot = el('div', { class: 'notif-slot' });
    root.append(slot);
    import('../notifcard.js').then(async (m) => { const c = await m.card(); if (c && slot.isConnected) slot.append(c); }).catch(() => {});
  }

  /* ── 저장하지 않은 일기 (1.4.6) ──
     자동 저장은 하지 않는다(사용자 결정). 대신 홈 버튼·앱 전환으로 나가 임시 원고로만 남은 글이
     있으면 맨 위에 알려 이어 쓰게 한다. 원고는 하나뿐이다 (store.saveDraft) */
  try {
    const dr = await store.loadDraft();
    const de = dr?.entry;
    const has = de && ((de.body || '').trim() || (de.title || '').trim() || de.photos?.length || de.mood || de.chips?.length || de.stickers?.length
      || (de.guided?.answers || []).some((a) => (a || '').trim()));
    if (has) {
      const card = el('button', { class: 'draft-card', type: 'button' });
      const sum = (de.title || de.body || (de.guided?.answers || []).join(' ') || '').trim().replace(/\s+/g, ' ').slice(0, 60);
      card.innerHTML =
        `<div class="draft-top">${icon('edit')}<span>${esc(t('저장하지 않은 일기가 있어요'))}</span></div>
         <div class="draft-sub">${esc(fmtDate(de.date, { weekday: true }))}${sum ? ' · ' + esc(sum) : ''}</div>
         <div class="draft-go">${esc(t('이어 쓰기'))}${icon('chev')}</div>`;
      card.addEventListener('click', () => {
        analytics.design('write:draft_card');
        go(dr.key.startsWith('id:') ? `/write?id=${dr.key.slice(3)}&resume=1` : `/write?d=${dr.key.slice(4)}&resume=1`);
      });
      root.append(card);
    }
  } catch (e) { console.error('임시 원고 카드', e); }

  /* ── 오늘 쓰기 / 오늘 쓴 글 ───────────────── */
  if (todays.length === 0) {
    const daysSinceLast = entries.length
      ? Math.max(0, Math.round((parseKey(today) - parseKey(entries[0].date)) / 86400000))
      : null;
    const prompt = pickPrompts({
      dateKey: today,
      daysSinceLast,
      recentMoodAvg: recentMoodAvg(entries),
      nth: entries.length + 1,
    })[0];

    const cta = el('button', { class: 'today-cta', type: 'button' });
    cta.innerHTML =
      `<div class="today-cta-art" aria-hidden="true">${CTA_ART}</div>
       <div class="today-cta-label">${t('오늘의 한 칸')}</div>
       <div class="today-cta-title">${esc(prompt)}</div>
       <div class="today-cta-bottom">
         <div class="today-cta-foot">${icon('edit')}<span>${t('한 줄이면 충분해요')}</span></div>
         <span class="today-cta-go">${icon('chev')}</span>
       </div>`;
    cta.addEventListener('click', () => go(`/write?d=${today}`));
    root.append(cta);
  } else {
    for (const e of todays) {
      const done = el('button', { class: 'today-done', type: 'button' });
      done.innerHTML =
        `<div class="today-done-top">${icon('check')}<span>${todays.length > 1 ? t('오늘 {n}번째 한 칸을 채웠어요', { n: todays.indexOf(e) + 1 }) : t('오늘 한 칸을 채웠어요')}</span></div>
         <div class="today-done-row">
           <div class="today-done-excerpt">${esc(summaryText(e))}</div>
         </div>`;
      if (e.photos?.length) {
        const img = el('img', { class: 'today-done-thumb', alt: '', loading: 'lazy' });
        done.querySelector('.today-done-row').prepend(img);
        store.fillImage(img, e.photos[0], () => img.remove());
      }
      /* 스티커를 붙였으면 맨 위 하나를 카드 모서리에 얹는다. 자리까지 옮기면 카드가 지저분해진다 */
      const top = stickers.topSticker(e);
      if (top) {
        done.classList.add('has-stk');
        done.append(el('img', { class: 'today-stk', src: stickers.src(top.s), alt: '', draggable: 'false' }));
      }
      done.addEventListener('click', () => go(`/entry/${e.id}`));
      root.append(done);
    }
    const more = el('button', { class: 'btn btn-ghost btn-block', type: 'button', style: 'margin-top:8px' },
      icon('plus') + `<span>${t('오늘 한 편 더 쓰기')}</span>`);
    more.addEventListener('click', () => go(`/write?d=${today}`));
    root.append(more);
  }

  /* ── 열린 글 ───────────────────────────────
     묻어둔 글이 열리는 날은 그 사람이 몇 년 전에 정한 날이다. 잊고 있다가
     마주치는 게 전부인 기능이라, 열린 날 화면 맨 위에서 먼저 말을 건다.
     한 번 펼치면(openedAt) 사라진다. */
  for (const e of store.justOpened()) {
    const card = el('button', { class: 'card open-card', type: 'button' });
    const 묻은날 = fmtDate(e.date, { year: true });
    card.innerHTML =
      `<div class="open-top">${icon('unlock')}<span>${t('묻어둔 글이 열렸어요')}</span></div>
       <div class="open-when">${esc(t('{d}의 내가 오늘의 나에게', { d: 묻은날 }))}</div>
       <div class="open-go">${esc(t('펼쳐보기'))}${icon('chev')}</div>`;
    card.addEventListener('click', () => go(`/entry/${e.id}`));
    root.append(card);
  }

  /* ── 묻어둔 글 ─────────────────────────────
     내용은 한 글자도 보여주지 않는다. 언제 열리는지만 알린다. */
  const sealed = store.sealedList();
  if (sealed.length) {
    const next = sealed[0];
    const row = el('button', { class: 'card sealed-card', type: 'button' });
    row.innerHTML =
      `<div class="sealed-l">${icon('lock')}
         <div>
           <div class="sealed-t">${esc(t('미래의 나에게'))}</div>
           <div class="sealed-s">${esc(t('묻어둔 글 {n}개', { n: sealed.length }))}</div>
         </div>
       </div>
       <div class="sealed-r">
         <div class="sealed-d">${esc(t('{n}일 남음', { n: daysBetween(today, next.sealedUntil).toLocaleString() }))}</div>
         <div class="sealed-s">${esc(fmtDate(next.sealedUntil, { year: true }))}</div>
       </div>`;
    row.addEventListener('click', () => openSheet({
      title: t('미래의 나에게'),
      text: t('정한 날까지는 쓴 사람도 못 봅니다. 그날이 되면 홈에서 알려드려요.'),
      items: [{ label: t('새로 묻어두기'), sub: t('1년 뒤 오늘 열려요. 그날까지는 나도 못 봐요.'), icon: 'edit', onClick: () => go('/write?capsule=1') },
        ...sealed.map((s) => ({
        label: fmtDate(s.sealedUntil, { year: true }),
        sub: t('{n}일 남음 · {d}에 씀', {
          n: daysBetween(today, s.sealedUntil).toLocaleString(),
          d: fmtDate(s.date, { year: true }),
        }),
        icon: 'lock',
      }))],
    }));
    root.append(row);
  } else if (store.realLive().length) {
    /* 묻어두기(타임캡슐)는 글쓰기 ⋮ 메뉴 안에만 있어 아무도 몰랐다 (2026-10-24 사용자 지적).
       글을 한 편이라도 쓴 사람에게 홈에서 바로 권한다. 누르면 미래의 나에게 쓰는 화면으로 */
    const inv = el('button', { class: 'card sealed-card capsule-invite', type: 'button' });
    inv.innerHTML =
      `<div class="sealed-l">${icon('lock')}
         <div>
           <div class="sealed-t">${esc(t('미래의 나에게 편지 쓰기'))}${NB.pill('capsule')}</div>
           <div class="sealed-s">${esc(t('1년 뒤 오늘 열려요. 그날까지는 나도 못 봐요.'))}</div>
         </div>
       </div>
       <div class="sealed-r">${icon('chev')}</div>`;
    inv.addEventListener('click', () => { analytics.design('capsule:invite_tap'); go('/write?capsule=1'); });
    root.append(inv);
  }

  /* ── 되새김 ───────────────────────────────── */
  const recalls = buildRecalls(entries, today);
  if (recalls.length) {
    const sec = el('div', { class: 'section' });
    const rhead = el('div', { class: 'section-head' },
      `<div class="section-title" style="color:var(--hue-red-2)">${icon('rewind')}<span>${t('되새김')}</span></div>
       <div class="section-more" style="color:var(--hue-red-2)">${t('{n}장', { n: recalls.length })}</div>`);
    rhead.querySelector('.section-title').append(infoButton(t('되새김'),
      t('예전에 쓴 글 중에서 오늘 다시 읽어볼 만한 것을 꺼내 놓는 자리예요. 한 달 전·반년 전·1년 전처럼 날짜가 맞아떨어지는 글과, 직접 보관해 둔 글을 골라 옵니다. 새로 쓰지 않아도 쌓인 글이 말을 걸게 하려는 자리예요.')));
    sec.append(rhead);
    for (const r of recalls) {
      /* 카드 안에 보관 버튼이 들어가므로 카드 자체는 버튼이 될 수 없다
         (버튼 안의 버튼은 안 된다). 대신 투명한 덮개 버튼을 깔아 카드 전체를 누를 수 있게 한다. */
      const c = el('div', { class: 'card recall' });
      c.innerHTML =
        `<div class="recall-kicker">${icon(r.kind === 'bookmark' ? 'bookmark' : 'rewind')}<span>${esc(r.label)}</span></div>
         <div class="recall-date">${esc(fmtDate(r.entry.date, { year: true }))} · ${esc(relDay(r.entry.date))}</div>
         <div class="recall-body">${esc(r.excerpt)}</div>
         <div class="recall-foot">${esc(r.reason)}</div>`;
      const open = el('button', { class: 'recall-open', type: 'button' },
        `<span class="sr-only">${esc(r.label)}</span>`);
      open.addEventListener('click', () => go(`/entry/${r.entry.id}`));
      c.append(open, bookmarkButton(r.entry));
      sec.append(c);
    }
    root.append(sec);
  }

  /* ── 보관함 ───────────────────────────────── */
  /* 직접 표시해 둔 글. 표시했는데 다시 찾아갈 길이 없으면 표시가 의미를 잃는다. */
  const marks = store.bookmarked();
  if (marks.length) {
    const sec = el('div', { class: 'section' });
    const head = el('div', { class: 'section-head' },
      `<div class="section-title" style="color:var(--hue-amber-2)">${icon('bookmark')}<span>${t('보관함')}</span></div>`);
    if (marks.length > 3) {
      const all = el('button', { class: 'section-more', type: 'button', style: 'color:var(--hue-amber-2)' },
        t('{n}편 전체 보기', { n: marks.length }));
      all.addEventListener('click', () => go('/search?b=1'));
      head.append(all);
    }
    sec.append(head);
    const list = el('div', { class: 'elist' });
    for (const e of marks.slice(0, 3)) list.append(entryItem(e));
    sec.append(list);
    root.append(sec);
  }

  /* ── 주간 목표 ────────────────────────────── */
  /* 예시 데이터가 목표를 대신 채워주면 안 되니 통계용 목록으로 센다 */
  const stats = store.statsEntries();
  const wp = weekProgress(stats, s.weeklyGoal, today);
  const streak = goalStreakWeeks(stats, s.weeklyGoal, today);
  const sec2 = el('div', { class: 'section' });
  sec2.append(el('div', { class: 'section-head' },
    `<div class="section-title">${icon('cal')}<span>${t('이번 주')}</span></div>`));

  const pctDone = Math.min(1, wp.done / wp.goal);
  const C = 2 * Math.PI * 26;
  const goalTitle = t('주 {n}회 목표', { n: wp.goal });
  const card = el('button', { class: 'card weekgoal-card', type: 'button', 'aria-label': goalTitle });
  const dots = wp.days.map((d, i) => {
    const cls = 'weekdot' + (wp.filled[i] ? ' on' : '') + (d === today ? ' today' : '');
    return `<div class="${cls}" title="${esc(d)}"></div>`;
  }).join('');
  const sub = wp.met
    ? (streak > 1 ? t('목표 달성! {n}주 연속이에요.', { n: streak }) : t('이번 주 목표를 채웠어요.'))
    : t('{n}번만 더 쓰면 이번 주 목표예요. 하루쯤 건너뛰어도 괜찮아요.', { n: wp.goal - wp.done });
  card.innerHTML =
    `<span class="info-mark" aria-hidden="true">${icon('info')}</span>
     <div class="weekgoal">
       <div class="ring">
         <svg viewBox="0 0 64 64">
           <circle class="bg" cx="32" cy="32" r="26"/>
           <circle class="fg" cx="32" cy="32" r="26"
             stroke-dasharray="${C.toFixed(1)}" stroke-dashoffset="${(C * (1 - pctDone)).toFixed(1)}"/>
         </svg>
         <div class="ring-num">${wp.done}/${wp.goal}</div>
       </div>
       <div class="weekgoal-body">
         <div class="weekgoal-title">${goalTitle}</div>
         <div class="weekgoal-sub">${esc(sub)}</div>
         <div class="weekdots">${dots}</div>
       </div>
     </div>`;
  // 숫자만 던지지 않는다 — 무엇을 어떻게 센 값인지 말해준다.
  // 아래에서 올라오는 시트는 배너 광고에 가리므로 가운데 팝업을 쓴다.
  card.addEventListener('click', () => openSheet({
    title: goalTitle,
    text: t('이번 주에 일기를 쓴 날이 며칠인지 세요. 하루에 여러 편을 써도 하루로 세요. 아래 점 일곱 개는 월요일부터 일요일까지고, 채워진 점이 쓴 날이에요. 매일 쓰라고 다그치지 않으려고 주 단위로 셉니다 — 하루쯤 건너뛰어도 목표는 무너지지 않아요. 설정 → 쓰기 → 주간 목표에서 주 1~7회로 바꿀 수 있어요.'),
    center: true,
  }));
  sec2.append(card);
  root.append(sec2);

  /* ── 최근 글 ──────────────────────────────── */
  const recent = entries.filter((e) => e.date !== today).slice(0, 12);
  if (recent.length) {
    const sec3 = el('div', { class: 'section' });
    const head3 = el('div', { class: 'section-head' },
      `<div class="section-title">${icon('book')}<span>${t('지난 글')}</span></div>`);
    if (entries.length > 1) {
      const all = el('button', { class: 'section-more', type: 'button' }, t('전체 보기'));
      all.addEventListener('click', () => go('/search'));
      head3.append(all);
    }
    sec3.append(head3);
    const list = el('div', { class: 'elist' });
    let lastMonth = today.slice(0, 7);
    for (const e of recent) {
      const m = e.date.slice(0, 7);
      if (m !== lastMonth) {
        lastMonth = m;
        list.append(el('div', { class: 'month-label', style: 'margin:10px 4px 2px' },
          monthTitle(Number(m.slice(0, 4)), Number(m.slice(5)))));
      }
      list.append(entryItem(e));
    }
    sec3.append(list);
    root.append(sec3);   // '전체 보기'는 섹션 헤더 오른쪽으로 옮겼다
  } else if (entries.length === 0) {
    root.append(el('div', { class: 'empty', style: 'margin-top:24px' },
      `<span class="empty-emoji">🌱</span>
       <div class="empty-title">${t('아직 첫 칸이 비어 있어요')}</div>
       <div class="empty-sub">${t('잘 써야 한다는 부담은 내려놓으세요.')}<br>
       ${t('“피곤하다” 한 마디로 시작해도 충분합니다.')}<br>
       ${t('칸이 몇 개 쌓이면 앱이 당신의 리듬을 찾아드릴게요.')}</div>`));
  }

  return {
    title: t('하루칸'),
    right: [
      { icon: 'search', label: t('검색'), onClick: () => go('/search') },
      /* 종 아이콘 = 공지사항 (1.7.0). 안 읽은 업데이트 소식이 있으면 빨간 점 */
      { icon: 'bell', label: t('공지사항'), onClick: () => go('/notices'),
        build: (b) => { if (notices.hasUnread()) b.append(el('span', { class: 'dot-badge', 'aria-hidden': 'true' })); } },
    ],
  };
}

/* ── 보관(북마크) 버튼 ─────────────────────────
   화면을 다시 그리지 않고 눌린 버튼만 바꾼다 (목록 중간에서 눌러도 스크롤이 안 튄다).
   같은 글의 버튼이 화면에 여러 개 떠 있을 수 있어 id 로 모두 맞춰준다. */
export function bookmarkButton(entry, { cls = 'bm-btn' } = {}) {
  const b = el('button', { class: cls, type: 'button', 'data-bm-id': entry.id });
  paintBookmark(b, !!entry.bookmarkedAt);
  b.addEventListener('click', async (ev) => {
    ev.stopPropagation();
    const on = await store.toggleBookmark(entry.id);
    haptic();
    syncBookmark(entry.id, on);
    toast(on ? t('보관함에 넣었어요.') : t('보관을 해제했어요.'));
  });
  return b;
}

export function paintBookmark(btn, on) {
  btn.classList.toggle('bm-on', on);
  btn.setAttribute('aria-pressed', on ? 'true' : 'false');
  btn.setAttribute('aria-label', on ? t('보관 해제') : t('보관함에 넣기'));
  btn.innerHTML = icon('bookmark');
}

export function syncBookmark(id, on) {
  for (const b of $$(`[data-bm-id="${CSS.escape(id)}"]`)) paintBookmark(b, on);
}

/* ── 리스트 아이템 (다른 화면에서도 재사용) ───── */
export function entryItem(e) {
  const d = parseKey(e.date);
  const b = el('button', { class: 'eitem', type: 'button' });
  const excerpt = summaryText(e, 0, { title: false });   // 제목은 아래에서 따로 보여준다
  const meta = [];
  if (e.bookmarkedAt) meta.push(`<span class="eitem-bm" title="${t('보관한 글')}">${icon('bookmark')}</span>`);
  if (e.weather?.k) meta.push(`<span class="wx-mini">${wx.wxSvg(e.weather.k, 22)}${esc(wx.nameOf(e.weather.k))}</span>`);
  if (e.mood) meta.push(`<span class="mood-dot" style="background:${moodColor(e.mood)}" title="${esc(moodWord(e.mood))}"></span>`);
  for (const tg of (e.tags || []).slice(0, 2)) meta.push(`<span class="tag">${esc(tg)}</span>`);
  if (e.wordCount) meta.push(`<span class="eitem-wc">${t('{n}자', { n: e.wordCount })}</span>`);

  b.innerHTML =
    `<div class="eitem-day">
       <div class="eitem-dnum">${d.getDate()}</div>
       <div class="eitem-dwk">${WD[d.getDay()]}</div>
     </div>
     <div class="eitem-main">
       ${e.title ? `<div class="eitem-title">${esc(e.title)}</div>` : ''}
       ${excerpt ? `<div class="eitem-ex">${esc(excerpt)}</div>` : ''}
       ${meta.length ? `<div class="eitem-meta">${meta.join('')}</div>` : ''}
     </div>`;

  if (e.photos?.length) {
    const img = el('img', { class: 'eitem-thumb', alt: '', loading: 'lazy' });
    b.append(img);
    store.fillImage(img, e.photos[0]);
  }
  b.addEventListener('click', () => go(`/entry/${e.id}`));
  return b;
}
