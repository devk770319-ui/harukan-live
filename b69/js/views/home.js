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
import { t, monthTitle, locale } from '../i18n.js';
import * as stickers from '../stickers.js';
import * as analytics from '../analytics.js';
import { weekProgress, goalStreakWeeks, recentMoodAvg } from '../insights.js';
import { pickPrompts } from '../prompts.js';

/* 새 버전 묻는 창 (2026-11-10 사용자: "업그레이드 여부를 묻게 해서, 그 창에 '업그레이드하면 이제부터 걸음수가 기록이 돼요',
   업그레이드할지 취소할지 묻는")
   · Play 중요도 1~3 새 버전이 있을 때, 같은 버전(versionCode)에 한 번만. 취소해도 홈 위 작은 띠는 남는다
   · 걸음 수가 든 앱(58~)으로 올라갈 때만 걸음 문구, 그 밖엔 일반 문구
   · 잠금 화면·다른 창(공지 등)·습관 알람이 떠 있으면 비켜 줄 때까지(최대 30초) 기다린다 */
const STEPS_FROM_VC = 58;
let askBusy = false;
async function askUpdateOnce(N, u) {
  const key = 'hk.updAsk:' + u.vc;
  try { if (localStorage.getItem(key) || askBusy) return; } catch { return; }
  askBusy = true;
  try {
    const t0 = Date.now();
    const busy = () => !!document.querySelector('#sheetRoot .sheet') || document.getElementById('lockscreen')?.hidden === false
      || document.documentElement.classList.contains('alarm-open') || !location.hash.match(/^(#\/home)?$/) && location.hash !== '';
    while (busy() && Date.now() - t0 < 30000) await new Promise((r) => setTimeout(r, 1000));
    if (busy()) return;
    let cur = 0; try { cur = +(await window.Capacitor?.Plugins?.App?.getInfo?.())?.build || 0; } catch { /* */ }
    const steps = u.vc >= STEPS_FROM_VC && cur > 0 && cur < STEPS_FROM_VC;
    try { localStorage.setItem(key, String(Date.now())); } catch { /* */ }
    analytics.design('update:ask:shown' + (steps ? ':steps' : ''));
    const { confirmSheet, toast } = await import('../ui.js');
    const go = await confirmSheet({
      title: t('새 버전이 나왔어요'),
      text: steps ? t('업데이트하면 이제부터 걸음 수가 기록돼요.') : t('업데이트하면 새 기능과 고친 점을 바로 쓸 수 있어요.'),
      ok: t('업데이트'),
    });
    analytics.design('update:ask:' + (go ? 'ok' : 'cancel'));
    if (!go) return;
    const r = await N.runUpdate();
    if (r === 'fail' && !(await N.openStore())) toast(t('업데이트를 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.'));
  } finally { askBusy = false; }
}

/* 도움말(⋮) 메뉴 — 시안 승인·다국어 번역 뒤 true 로 (2026-11-08, 1.8.5 출시에서는 숨김) */
const HELP_MENU = false;

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
  /* 새 버전 안내 띠 (2026-11-08 사용자) — Play 중요도 1~3 새 버전이 있을 때만. 닫으면 같은 버전은 3일 동안 안 띄운다 */
  {
    const uslot = el('div', { class: 'upd-slot' });
    root.append(uslot);
    import('../native.js').then(async (N) => {
      const u = await N.optionalUpdate();
      if (!u || !uslot.isConnected) return;
      askUpdateOnce(N, u);   // 새 버전마다 한 번 '업데이트할까요?' 창 (2026-11-10)
      let hide = null; try { hide = JSON.parse(localStorage.getItem('hk.updBarHide') || 'null'); } catch { /* */ }
      if (hide && hide.vc === u.vc && Date.now() < hide.until) return;
      const bar = el('div', { class: 'card upd-bar', style: 'display:flex;align-items:center;gap:10px;padding:12px 12px 12px 16px;margin:0 0 12px' });
      bar.innerHTML = `<span style="flex:1;font-weight:600;line-height:1.35">${esc(t('새 버전이 나왔어요'))}</span>`;
      const go1 = el('button', { class: 'btn btn-primary', type: 'button', style: 'flex:none;width:auto;padding:8px 16px;min-height:0' }, esc(t('업데이트')));
      const x = el('button', { type: 'button', 'aria-label': t('닫기'), style: 'flex:none;background:none;border:0;padding:6px 8px;font-size:20px;line-height:1;color:var(--muted,#999)' }, '×');
      go1.addEventListener('click', async () => {
        analytics.design('update:bar:tap');
        const r = await N.runUpdate();
        if (r === 'fail' && !(await N.openStore())) { const U = await import('../ui.js'); U.toast(t('업데이트를 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.')); }
      });
      x.addEventListener('click', () => {
        analytics.design('update:bar:close');
        try { localStorage.setItem('hk.updBarHide', JSON.stringify({ vc: u.vc, until: Date.now() + 3 * 86400000 })); } catch { /* */ }
        bar.remove();
      });
      bar.append(go1, x);
      uslot.append(bar);
      try { if (!sessionStorage.getItem('hk.updBarShown')) { sessionStorage.setItem('hk.updBarShown', '1'); analytics.design('update:bar:shown:p' + u.priority); } } catch { /* */ }
    }).catch(() => {});
  }
  /* 오늘 걸음 (1.8.5) — 켠 사람만, 자리만 잡고 기다리지 않는다 */
  {
    const sslot = el('div', { class: 'steps-slot' });
    greet.append(sslot);
    import('../steps.js').then(async (S) => {
      if (!S.isOn()) return;
      const n = await S.today();
      if (!n || !sslot.isConnected) return;   // 아직 0걸음(센서를 막 켰을 때 등)이면 안 보인다
      sslot.innerHTML = `<span class="steps-pill">${S.FOOT}<span>${esc(t('오늘 {n}걸음', { n: n.toLocaleString(locale()) }))}</span></span>`;
      S.sync().catch(() => {});
    }).catch(() => {});
  }

  /* ── 이번 주 정리 (2026-11-07): 설치 7일째, 일요일 저녁 — 자리만 잡고 기다리지 않는다 */
  {
    const wslot = el('div', { class: 'weekly-slot' });
    root.append(wslot);
    import('../streak.js').then(async (m) => { const c = await m.weeklyCard(); if (c && wslot.isConnected) wslot.append(c); }).catch(() => {});
  }

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
           <div class="today-done-excerpt">${esc(summaryText(e, 0, { lines: true }))}</div>
         </div>`;
      if (e.photos?.length) {
        const img = el('img', { class: 'today-done-thumb', alt: '', loading: 'lazy' });
        done.querySelector('.today-done-row').prepend(img);
        store.fillImage(img, e.photos[0], () => img.remove());
      }
      /* 카드 모서리에 스티커를 얹던 것은 뺐다 (2026-11-05 사용자: 목록에서 스티커가 글자를 가린다는 불편 신고) */

      done.addEventListener('click', () => go(`/entry/${e.id}`));
      root.append(done);
    }
    const more = el('button', { class: 'btn btn-ghost btn-block', type: 'button', style: 'margin-top:8px' },
      icon('plus') + `<span>${t('오늘 한 편 더 쓰기')}</span>`);
    more.addEventListener('click', () => go(`/write?d=${today}`));
    root.append(more);
  }

  /* ── 오늘의 습관 (2026-10-30) — 습관이 있을 때만. 한 번 눌러 체크 */
  try {
    const HB = await import('../habits.js');
    await HB.load();
    const { due } = HB.split();
    const PL = await import('../plus.js');
    if (due.length && PL.canUseHabits(HB.active())) {   // 체험이 끝나 못 쓰면 홈에서는 감춘다 (습관 화면에서는 보임) — 2026-11-01
      const HV = await import('./habits.js');
      const sec = el('div', { class: 'hb-home' });
      const head = el('button', { class: 'section-title hb-home-t', type: 'button' }, `<span>${esc(t('오늘의 습관'))}</span>`);
      head.addEventListener('click', () => go('/habits'));
      sec.append(head);
      const list = el('div', { class: 'hb-list' });
      const day = HB.today();
      const paint = () => { list.innerHTML = ''; for (const h of HB.split(day).due.slice(0, 4)) list.append(HV.habitRow(h, day, { onChange: paint })); };
      paint();
      sec.append(list);
      if (due.length > 4) { const m = el('button', { class: 'btn btn-ghost btn-block', type: 'button' }, esc(t('습관 모두 보기 ({n})', { n: due.length }))); m.addEventListener('click', () => go('/habits')); sec.append(m); }
      root.append(sec);
    }
  } catch (e) { console.error('홈 습관', e); }

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
  }

  /* ── 편지 쓰기 (2026-11-03 사용자: 일기 앱에 편지 버튼이 따로 여기저기 있으면 헷갈린다)
     '미래의 나에게'와 '친구에게'를 카드 하나로 묶고, 누르면 둘 중 고른다. ＋ 는 일기만 ── */
  {
    const lc = el('button', { class: 'card letter-card', type: 'button' });
    lc.innerHTML =
      `<div class="letter-card-ico">${icon('mail')}</div>
       <div class="letter-card-txt"><div class="letter-card-t">${esc(t('편지 쓰기'))}${NB.pill('letter')}</div>
         <div class="letter-card-s">${esc(t('미래의 나에게 · 친구에게'))}</div></div>
       <div class="letter-card-r">${icon('chev')}</div>`;
    lc.addEventListener('click', async () => {
      analytics.design('letter:home_card');
      const { openSheet } = await import('../ui.js');
      openSheet({
        center: true,
        title: t('편지 쓰기'),
        items: [
          { label: t('친구에게'), sub: t('예쁜 카드로 만들어 카톡·메시지로 보내요'), icon: 'mail', onClick: () => { analytics.design('letter:pick_friend'); go('/letter?new=1'); } },
          { label: t('미래의 나에게'), sub: t('1년 뒤 오늘 열려요. 그날까지는 나도 못 봐요.'), icon: 'lock', onClick: () => { analytics.design('capsule:invite_tap'); go('/write?capsule=1'); } },
          { label: t('보낸 편지함'), icon: 'chev', onClick: () => go('/letters') },
        ],
      });
    });
    root.append(lc);
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
      /* ⋮ 더보기 = 사용 설명서·자주 묻는 질문·고객센터 (2026-11-08) — 시안 승인·번역 전이라 아직 숨긴다(HELP_MENU). 패치로 켠다 */
      ...(HELP_MENU ? [{ icon: 'dots', label: t('더보기'), onClick: (ev) => { const btn = ev.currentTarget; import('./help.js').then((H) => H.openMenu(btn)); } }] : []),
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
