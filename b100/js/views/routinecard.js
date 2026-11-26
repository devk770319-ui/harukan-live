/* ===========================================================
   views/routinecard.js — 발견의 '이번 주 나의 생활' (2026-11-24 사용자: '발견에 할일과 습관, 출석 등을 함께 넣어줄 수 없을까? 보고 좋게')
   이번 주(월~일) 할 일·습관·출석을 한 카드에. 쓰는 기능만 보인다. 누르면 그 화면으로.
   숫자만 — 내용(할 일 제목·습관 이름 외)은 보이지 않는다.
   =========================================================== */
import { t } from '../i18n.js';
import { go } from '../app.js';
import { el, esc, icon, WD } from '../ui.js';
import * as NB from '../newbadge.js';

const pct = (a, b) => (b ? Math.round((a / b) * 100) : null);

/** 발견에 넣을 묶음. 보여줄 게 없으면 null */
export async function routineSection(sectionFn) {
  const [P, H, C, SCH] = await Promise.all([
    import('../plans.js'), import('../habits.js'), import('../habitcore.js'), import('./schedule.js'),
  ]);
  try { await H.load(); } catch { /* 잠겨 있으면 빈 목록 */ }
  try { if (!P.all().length) await P.loadAll(); } catch { /* */ }
  const today = H.today();
  const ws = C.weekStart(today);
  const days = Array.from({ length: 7 }, (_, i) => C.addDays(ws, i));
  const we = days[6];

  /* 할 일: 이번 주에 날짜가 있는 것 (반복은 저장된 회차만 — 끝낸 것은 저장돼 있다) */
  const plans = P.all().filter((p) => p.date && p.date >= ws && p.date <= we);
  const pDue = plans.filter((p) => p.date <= today);
  const pDone = pDue.filter((p) => p.done).length;
  const pLeft = P.occurrences(today, we).filter((p) => !p.done).length;

  /* 습관 (출석 제외) */
  const habits = H.active().filter((h) => !C.isAttend(h));
  let hOk = 0, hAll = 0, best = null;
  for (const h of habits) {
    const r = C.rateIn(h, ws, we, today);
    hOk += r.ok; hAll += r.all;
    const s = C.currentStreak(h, today);
    if (s >= 2 && (!best || s > best.n)) best = { name: h.name, n: s };
  }

  /* 출석 (출석관리를 켠 사람만) */
  const places = SCH.enabled() ? H.active().filter((h) => C.isAttend(h)) : [];
  let aIn = 0, aAb = 0;
  for (const h of places) { const s = C.attendStats(h, ws, today); aIn += s.present; aAb += s.absent; }

  const tiles = [];
  /* 2026-11-24 사용자 결정(제안 B): 할 일·습관 칸은 늘 보이고, 기록이 없으면 '시작하기' 칸 */
  if (plans.length || pLeft) tiles.push({ k: 'plan', ico: 'cal', label: t('할 일'), big: pDue.length ? `${pDone}/${pDue.length}` : '–', p: pct(pDone, pDue.length), sub: pLeft ? t('남은 할 일 {n}', { n: pLeft }) : t('이번 주 할 일 끝!'), to: '/plans' });
  else tiles.push({ k: 'plan', start: true, ico: 'cal', label: t('할 일'), sub: t('날짜와 알림을 정해 할 일을 넣어 보세요'), btn: t('＋ 할 일 추가'), to: '/plans' });
  if (habits.length) tiles.push({ k: 'habit', ico: 'check', label: t('습관'), big: hAll ? `${pct(hOk, hAll)}%` : '–', p: pct(hOk, hAll), sub: best ? t('{name} {n}일 연속', { name: best.name, n: best.n }) : t('이번 주 꾸준함'), to: '/habits' });
  else tiles.push({ k: 'habit', start: true, ico: 'check', label: t('습관'), sub: t('물 마시기처럼 반복하는 일을 넣어 보세요'), btn: t('＋ 습관 추가'), to: '/habits' });
  if (places.length) tiles.push({ k: 'attend', ico: 'book', label: t('출석관리'), big: aIn + aAb ? `${pct(aIn, aIn + aAb)}%` : '–', p: pct(aIn, aIn + aAb), sub: t('출석 {a} · 결석 {b}', { a: aIn, b: aAb }), to: '/schedule' });
  const used = tiles.filter((x) => !x.start);

  const sec = sectionFn(t('이번 주 나의 생활'), `${Number(ws.slice(5, 7))}.${Number(ws.slice(8))} – ${Number(we.slice(5, 7))}.${Number(we.slice(8))}`, 'check',
    t('할 일·습관·출석을 이번 주 월요일부터 모아 보여줘요. 칸을 누르면 그 화면으로 가요.'));
  sec.querySelector('.section-title span')?.insertAdjacentHTML('afterend', NB.pill('routine'));   // NEW (패치 96)
  const card = el('div', { class: 'card rt-card' });
  const row = el('div', { class: 'rt-tiles', style: `--n:${tiles.length}` });
  for (const tl of tiles) {
    const b = tl.start
      ? el('button', { class: 'rt-tile rt-start rt-' + tl.k, type: 'button' }, `<span class="rt-lab">${icon(tl.ico)}${esc(tl.label)}</span><span class="rt-sub">${esc(tl.sub)}</span><span class="rt-go">${esc(tl.btn)}</span>`)
      : el('button', { class: 'rt-tile rt-' + tl.k, type: 'button', style: `--p:${tl.p ?? 0}` },
      `<span class="rt-ring"><b>${esc(tl.big)}</b></span><span class="rt-lab">${icon(tl.ico)}${esc(tl.label)}</span><span class="rt-sub">${esc(tl.sub)}</span>`);
    b.addEventListener('click', () => { NB.used('routine'); go(tl.to); });
    row.append(b);
  }
  card.append(row);
  if (!used.length) { sec.append(card); return sec; }   // 아직 아무것도 안 쓰면 시작하기 칸만 (7일 줄 없음)

  /* 7일 줄: 요일마다 할 일 점 · 습관 고리 · 출석 표시 */
  const grid = el('div', { class: 'rt-week', style: `--rows:${used.length}` });
  grid.append(el('span', { class: 'rt-wl' }));
  for (const k of days) grid.append(el('span', { class: 'rt-dh' + (k === today ? ' today' : '') }, `<i>${esc(WD[C.dateOf(k).getDay()] ?? '')}</i><b>${Number(k.slice(8))}</b>`));
  for (const tl of used) {
    grid.append(el('span', { class: 'rt-wl' }, icon(tl.ico)));
    for (const k of days) {
      const fut = k > today;
      let cls = 'rt-c', html = '';
      if (tl.k === 'plan') {
        const ds = plans.filter((p) => p.date === k);
        const dn = ds.filter((p) => p.done).length;
        if (ds.length) { cls += dn === ds.length ? ' full' : fut ? ' plan' : dn ? ' part' : ' miss'; html = `<em>${ds.length > 1 ? ds.length : ''}</em>`; }
        else cls += ' none';
      } else if (tl.k === 'habit') {
        const due = habits.filter((h) => C.scheduledOn(h, k) && C.unitOf(h) === 'day' && !(h.start && k < h.start));
        const dn = due.filter((h) => C.dayDone(h, k)).length;
        if (due.length && !fut) { cls += ' ring'; html = `<i style="--p:${pct(dn, due.length)}"></i>`; } else cls += due.length ? ' plan' : ' none';
      } else {
        const due = places.filter((h) => C.scheduledOn(h, k) || h.log?.[k] != null);
        const ab = due.some((h) => C.isAbsent(h, k)), ho = due.some((h) => C.isSkip(h, k)), ok = due.some((h) => C.dayDone(h, k));
        if (!due.length) cls += ' none';
        else if (ab) { cls += ' ab'; html = '✕'; } else if (ok) { cls += ' in'; html = icon('check'); } else if (ho) { cls += ' ho'; html = '–'; } else cls += fut ? ' plan' : ' miss';
      }
      grid.append(el('span', { class: cls + (k === today ? ' today' : '') }, html));
    }
  }
  card.append(grid);
  sec.append(card);
  return sec;
}
