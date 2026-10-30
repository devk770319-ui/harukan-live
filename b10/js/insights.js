/* ===========================================================
   insights.js — 통계/패턴 엔진
   기존 앱들이 "기분 그래프" 하나로 끝내는 지점에서 한 걸음 더 간다.
   다만 과장하지 않는다: 표본 수(n)를 항상 함께 보여주고,
   상관은 인과가 아니라는 점을 화면에도 적어 둔다.
   =========================================================== */

import { todayKey, parseKey, weekStart, addDays, daysBetween, WD, moodQuadrant } from './ui.js';
import { topWords } from './nlp.js';
import { t } from './i18n.js';
import { allChips } from './prompts.js';
import { getSettings } from './store.js';

const DAY = 86400000;
const mean = (a) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);

/* ── 기분 시계열 ─────────────────────────────────── */
export function moodByDate(entries) {
  const m = new Map();
  for (const e of entries) {
    if (!e.mood) continue;
    if (!m.has(e.date)) m.set(e.date, []);
    m.get(e.date).push(e.mood.v);
  }
  return [...m.entries()].map(([date, vs]) => ({ date, v: mean(vs) })).sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** 최근 n일 구간의 일별 값 (없는 날은 null) */
export function recentSeries(entries, days = 60) {
  const byDate = new Map(moodByDate(entries).map((d) => [d.date, d.v]));
  const out = [];
  let k = addDays(todayKey(), -(days - 1));
  for (let i = 0; i < days; i++) {
    out.push({ date: k, v: byDate.has(k) ? byDate.get(k) : null });
    k = addDays(k, 1);
  }
  return out;
}

/** 결측을 건너뛰는 이동평균 */
export function smooth(series, win = 7) {
  return series.map((p, i) => {
    const from = Math.max(0, i - win + 1);
    const vals = series.slice(from, i + 1).map((x) => x.v).filter((v) => v != null);
    return { date: p.date, v: vals.length ? mean(vals) : null, raw: p.v };
  });
}

export function recentMoodAvg(entries, days = 14) {
  const cut = addDays(todayKey(), -days);
  const vs = entries.filter((e) => e.mood && e.date >= cut).map((e) => e.mood.v);
  return vs.length >= 2 ? mean(vs) : null;
}

/* ── 체크 칩 × 기분 ──────────────────────────────── */
/**
 * 칩이 달린 날과 안 달린 날의 평균 기분 차이.
 * 양쪽 다 n>=3 일 때만 보여준다.
 */
export function chipEffects(entries, { minN = 3 } = {}) {
  const withMood = entries.filter((e) => e.mood);
  if (withMood.length < 8) return [];
  const out = [];
  /* 기본 칩 + 내 칩 + 지난 일기에 붙어 있는 칩 (1.7.9) */
  const CHIPS_ALL = [...new Set([...allChips(getSettings()), ...withMood.flatMap((e) => e.chips || [])])];
  for (const chip of CHIPS_ALL) {
    const yes = withMood.filter((e) => (e.chips || []).includes(chip)).map((e) => e.mood.v);
    const no  = withMood.filter((e) => !(e.chips || []).includes(chip)).map((e) => e.mood.v);
    if (yes.length < minN || no.length < minN) continue;
    out.push({ chip, diff: mean(yes) - mean(no), nYes: yes.length, nNo: no.length, avgYes: mean(yes) });
  }
  return out.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
}

/* ── 요일별 ─────────────────────────────────────── */
export function weekdayMood(entries) {
  const buckets = Array.from({ length: 7 }, () => []);
  for (const e of entries) if (e.mood) buckets[parseKey(e.date).getDay()].push(e.mood.v);
  return buckets.map((vs, i) => ({ wd: WD[i], n: vs.length, v: vs.length ? mean(vs) : null }));
}

/** 요일별 기록 빈도 */
export function weekdayCount(entries) {
  const c = Array(7).fill(0);
  for (const e of entries) c[parseKey(e.date).getDay()]++;
  return c.map((n, i) => ({ wd: WD[i], n }));
}

/* ── 쓰는 시간대 ─────────────────────────────────── */
export function hourHistogram(entries) {
  const h = Array(24).fill(0);
  for (const e of entries) h[new Date(e.createdAt).getHours()]++;
  return h;
}

/* ── 주간 목표 / 꾸준함 ──────────────────────────── */
/**
 * 매일 스트릭은 쓰지 않는다. 하루 놓쳤다고 0으로 되돌리는 설계가
 * 사람을 가장 많이 이탈시키기 때문. 대신 "주 N회" 목표를 쓴다.
 */
export function weekProgress(entries, goal, ref = todayKey()) {
  const ws = weekStart(ref);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const filled = days.map((d) => entries.some((e) => e.date === d));
  const done = filled.filter(Boolean).length;
  return { weekStart: ws, days, filled, done, goal, met: done >= goal };
}

/** 목표를 채운 주가 몇 주 연속인가 (이번 주는 아직 진행 중이면 세지 않음) */
export function goalStreakWeeks(entries, goal, ref = todayKey()) {
  let ws = weekStart(ref);
  let streak = 0;
  const cur = weekProgress(entries, goal, ref);
  if (cur.met) streak++;
  for (let i = 0; i < 260; i++) {
    ws = addDays(ws, -7);
    const p = weekProgress(entries, goal, ws);
    if (p.met) streak++;
    else break;
  }
  return streak;
}

export function fillRate(entries, days = 30) {
  const cut = addDays(todayKey(), -(days - 1));
  const set = new Set(entries.filter((e) => e.date >= cut).map((e) => e.date));
  return { filled: set.size, days, pct: Math.round((set.size / days) * 100) };
}

/* ── 요약 ───────────────────────────────────────── */
export function summary(entries) {
  const dates = new Set(entries.map((e) => e.date));
  const chars = entries.reduce((s, e) => s + (e.wordCount || 0), 0);
  const first = entries.length ? entries.reduce((m, e) => (e.date < m ? e.date : m), entries[0].date) : null;
  return {
    count: entries.length,
    days: dates.size,
    chars,
    avgChars: entries.length ? Math.round(chars / entries.length) : 0,
    first,
    since: first ? daysBetween(first, todayKey()) + 1 : 0,
    photos: entries.reduce((s, e) => s + (e.photos?.length || 0), 0),
  };
}

export function tagRanking(entries, n = 20) {
  const m = new Map();
  for (const e of entries) for (const t of e.tags || []) m.set(t, (m.get(t) || 0) + 1);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([tag, count]) => ({ tag, count }));
}

export function words(entries, n = 24) {
  return topWords(entries.map((e) => `${e.title || ''} ${e.body || ''}`), n);
}

export function quadrantMix(entries) {
  const m = new Map();
  for (const e of entries) {
    const q = moodQuadrant(e.mood);
    if (q) m.set(q, (m.get(q) || 0) + 1);
  }
  const total = [...m.values()].reduce((a, b) => a + b, 0);
  return [...m.entries()].sort((a, b) => b[1] - a[1]).map(([name, n]) => ({ name, n, pct: Math.round(n / total * 100) }));
}

/* ── 한 줄 요약 문장 만들기 ──────────────────────── */
const pct = (x) => `${x > 0 ? '+' : ''}${(x * 50).toFixed(0)}`;   // -1..1 → -50..50 점

/**
 * 발견 화면 상단에 띄울 문장. 데이터가 적으면 정직하게 그렇게 말한다.
 * @returns {{text:string, html:string}}
 */
export function headline(entries) {
  const n = entries.length;
  if (n < 3) {
    return { html: t('아직 글이 <b>{n}편</b>이에요. 서너 편만 더 쌓이면 여기에서 나에 대한 패턴을 찾아드릴게요.', { n }) };
  }
  const cands = [];

  const eff = chipEffects(entries);
  if (eff.length && Math.abs(eff[0].diff) > 0.12) {
    const e = eff[0];
    const dir = e.diff > 0 ? t('더 좋았어요') : t('더 낮았어요');
    cands.push({
      w: 100 + Math.abs(e.diff) * 60 + Math.min(e.nYes, 12),
      html: t('<b>‘{chip}’</b>인 날의 기분이 그렇지 않은 날보다 <b>{n}점</b> {dir}. <span class="muted">(그런 날 {d}일 기준)</span>', { chip: t(e.chip), n: Math.abs(e.diff * 50).toFixed(0), dir, d: e.nYes }),
    });
  }

  const wd = weekdayMood(entries).filter((d) => d.n >= 3);
  if (wd.length >= 4) {
    const best = wd.reduce((a, b) => (b.v > a.v ? b : a));
    const worst = wd.reduce((a, b) => (b.v < a.v ? b : a));
    if (best.v - worst.v > 0.25) {
      cands.push({
        w: 70 + (best.v - worst.v) * 40,
        html: t('<b>{w1}</b>의 기분이 가장 낮고 <b>{w2}</b>이 가장 높아요. 반복되는 리듬일 수 있어요.', { w1: worst.wd, w2: best.wd }),
      });
    }
  }

  const s60 = smooth(recentSeries(entries, 42), 7).filter((p) => p.v != null);
  if (s60.length >= 10) {
    const half = Math.floor(s60.length / 2);
    const d = mean(s60.slice(half).map((p) => p.v)) - mean(s60.slice(0, half).map((p) => p.v));
    if (Math.abs(d) > 0.15) {
      cands.push({
        w: 80 + Math.abs(d) * 50,
        html: t('최근 6주 동안 기분이 <b>{방향} 흐름</b>이에요 ({p}점).', { 방향: d > 0 ? t('올라가는') : t('내려가는'), p: pct(d) }),
      });
    }
  }

  const wr = words(entries, 3);
  if (wr.length && wr[0].count >= 4) {
    cands.push({
      w: 45 + wr[0].count,
      html: t('요즘 가장 자주 적은 말은 <b>‘{w}’</b>예요. {n}번 나왔어요.', { w: wr[0].word, n: wr[0].count }),
    });
  }

  const fr = fillRate(entries, 30);
  cands.push({ w: 30, html: t('최근 30일 중 <b>{n}일</b>을 기록했어요. 채움률 {p}%.', { n: fr.filled, p: fr.pct }) });

  const sum = summary(entries);
  cands.push({ w: 25, html: t('첫 글부터 <b>{d}일</b>째, 모두 <b>{n}편</b> · <b>{c}자</b>를 썼어요.', { d: sum.since, n: sum.count, c: sum.chars.toLocaleString() }) });

  cands.sort((a, b) => b.w - a.w);
  return { html: cands[0].html };
}

/** 주간 리포트 문장들 */
export function weeklyReport(entries, ref = todayKey()) {
  const ws = weekStart(ref);
  const we = addDays(ws, 6);
  const week = entries.filter((e) => e.date >= ws && e.date <= we);
  if (!week.length) return null;
  const prevWs = addDays(ws, -7);
  const prev = entries.filter((e) => e.date >= prevWs && e.date < ws);

  const lines = [];
  lines.push(t('이번 주 {n}편, {c}자를 썼어요.', { n: week.length, c: week.reduce((s, e) => s + (e.wordCount || 0), 0).toLocaleString() }));

  const wm = week.filter((e) => e.mood).map((e) => e.mood.v);
  const pm = prev.filter((e) => e.mood).map((e) => e.mood.v);
  if (wm.length >= 2) {
    const avg = mean(wm);
    let s = t('평균 기분은 {p}점.', { p: (avg >= 0 ? '+' : '') + (avg * 50).toFixed(0) });
    if (pm.length >= 2) {
      const d = avg - mean(pm);
      s += ' ' + t('지난주보다 {p}점 {방향}.', { p: Math.abs(d * 50).toFixed(0), 방향: d >= 0 ? t('높아요') : t('낮아요') });
    }
    lines.push(s);
    const best = week.filter((e) => e.mood).reduce((a, b) => (b.mood.v > a.mood.v ? b : a));
    lines.push(t('가장 기분이 좋았던 날은 {m}월 {d}일이었어요.', { m: Number(best.date.slice(5, 7)), d: Number(best.date.slice(8)) }));
  }
  const tw = topWords(week.map((e) => e.body || ''), 3).map((w) => w.word);
  if (tw.length) lines.push(t('이번 주의 단어: {w}.', { w: tw.join(', ') }));
  return { from: ws, to: we, lines, count: week.length };
}
