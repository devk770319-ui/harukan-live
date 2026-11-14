/* ===========================================================
   recall.js — 되새김 엔진
   이 앱의 핵심 차별점. 일기의 진짜 가치는 "쓴 것"이 아니라
   "다시 읽는 것"에서 나오는데, 대부분의 앱은 쓰고 나면 끝이다.
   여기서는 매일 홈 화면에 "지금 당신에게 의미 있을 과거의 글"을 꺼내온다.
   무작위가 아니라 근거가 있는 선택이다.
   =========================================================== */

import { todayKey, parseKey, daysBetween, relDay } from './ui.js';
import { seedFrom, rngFrom } from './prompts.js';
import { t, relYears } from './i18n.js';

const DAY = 86400000;

function excerptOf(e, n = 150) {
  const s = (e.body || e.title || '').replace(/\s+/g, ' ').trim();
  return s.length > n ? s.slice(0, n) + '…' : s;
}

/**
 * @param {Array} entries  살아있는 글 (최신순)
 * @param {string} today
 * @returns {Array<{kind,label,entry,reason}>}
 */
export function buildRecalls(entries, today = todayKey()) {
  const pool = entries.filter((e) => e.date !== today && (e.body || '').trim().length > 10);
  if (!pool.length) return [];

  const td = parseKey(today);
  const out = [];
  const used = new Set();
  const push = (kind, label, entry, reason) => {
    if (!entry || used.has(entry.id)) return;
    used.add(entry.id);
    out.push({ kind, label, entry, reason, excerpt: excerptOf(entry) });
  };

  /* 1. N년 전 오늘 — 가장 강력한 카드 */
  const mmdd = today.slice(5);
  const anniversaries = pool
    .filter((e) => e.date.slice(5) === mmdd)
    .sort((a, b) => (a.date < b.date ? 1 : -1));
  if (anniversaries.length) {
    const e = anniversaries[0];
    const yrs = td.getFullYear() - parseKey(e.date).getFullYear();
    push('anniv', t('{n}년 전 오늘', { n: yrs }), e, t('같은 날짜에 쓴 글'));
  }

  /* 2. 딱 떨어지는 날짜들 — 한 달 전 / 100일 전 / 반년 전 */
  for (const [n, label] of [[30, t('한 달 전')], [100, t('100일 전')], [182, t('반년 전')]]) {
    const target = new Date(td.getTime() - n * DAY);
    const key = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}-${String(target.getDate()).padStart(2, '0')}`;
    const e = pool.find((x) => x.date === key);
    if (e) { push('milestone', label, e, t('{n}일 전에 쓴 글', { n })); break; }
  }

  /* 3. 보관해 둔 글 — 사람이 직접 표시한 것이니 근거가 가장 확실하다.
        다만 매일 같은 카드가 나오면 표시의 의미가 닳는다. 최근에 읽은 건 뺀다. */
  const marked = pool.filter((e) =>
    e.bookmarkedAt && (!e.lastReadAt || Date.now() - e.lastReadAt > 21 * DAY));
  if (marked.length) {
    const rnd = rngFrom(seedFrom(today + 'mark'));
    push('bookmark', t('보관해 둔 글'), marked[Math.floor(rnd() * marked.length)],
      t('다시 읽으려고 표시해 둔 글'));
  }

  /* 4. 비슷한 기분이었던 날 — 오늘 글이 있으면 그 기분 기준 */
  const todayEntry = entries.find((e) => e.date === today && e.mood);
  const ref = todayEntry?.mood ?? null;
  if (ref) {
    const cands = pool
      .filter((e) => e.mood && daysBetween(e.date, today) > 45)
      .map((e) => ({ e, d: Math.hypot(e.mood.v - ref.v, e.mood.e - ref.e) }))
      .sort((a, b) => a.d - b.d);
    if (cands.length && cands[0].d < 0.28) {
      push('mood', t('비슷한 마음이었던 날'), cands[0].e, t('오늘과 기분 좌표가 가장 가까운 과거의 글'));
    }
  }

  /* 5. 이맘때의 나 — 같은 달, 다른 해 */
  const mm = today.slice(5, 7);
  const sameMonth = pool.filter((e) => e.date.slice(5, 7) === mm && daysBetween(e.date, today) > 200);
  if (sameMonth.length) {
    const rnd = rngFrom(seedFrom(today + 'season'));
    const e = sameMonth[Math.floor(rnd() * sameMonth.length)];
    const yrs = td.getFullYear() - parseKey(e.date).getFullYear();
    push('season', t('{전}{m}월의 나', { 전: yrs > 0 ? t('{n}년 전 ', { n: yrs }) : '', m: Number(mm) }), e, t('같은 계절에 쓴 글'));
  }

  /* 6. 오래 잊고 있던 글 */
  const forgotten = pool.filter((e) =>
    daysBetween(e.date, today) > 60 &&
    (!e.lastReadAt || Date.now() - e.lastReadAt > 120 * DAY) &&
    (e.body || '').length > 80);
  if (forgotten.length) {
    const rnd = rngFrom(seedFrom(today + 'forgot'));
    push('forgotten', t('잊고 있던 글'), forgotten[Math.floor(rnd() * forgotten.length)],
      t('오래 다시 읽지 않은 글'));
  }

  /* 7. 요즘 자주 쓰는 주제 — 예전엔 어땠나 */
  const recentTags = new Map();
  for (const e of entries.slice(0, 12)) for (const t of e.tags || []) recentTags.set(t, (recentTags.get(t) || 0) + 1);
  const hot = [...recentTags.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  if (hot) {
    const older = pool.filter((e) => (e.tags || []).includes(hot) && daysBetween(e.date, today) > 40);
    if (older.length) push('topic', t('‘{tag}’ 이야기, 그때는', { tag: hot }), older[0], t('요즘 자주 쓰는 주제의 예전 글'));
  }

  /* 하루에 최대 2장. 매일 순서가 조금씩 바뀐다. */
  const rnd = rngFrom(seedFrom(today + 'order'));
  const priority = { anniv: 0, bookmark: 1, milestone: 2, mood: 3, topic: 4, season: 5, forgotten: 6 };
  return out
    .sort((a, b) => (priority[a.kind] - priority[b.kind]) + (rnd() - 0.5) * 0.9)
    .slice(0, 2)
    .map((r) => ({ ...r, rel: relDay(r.entry.date) }));
}
