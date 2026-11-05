/* ===========================================================
   plans.js — 일정 (앞으로 할 일)

   일기와 완전히 다른 기능이다. 일기는 "지난 일"을 적고, 일정은 "앞일"을
   적는다. 그래서 저장소도 화면도 따로 둔다. 섞이면 둘 다 흐려진다.

   · 저장은 이 기기 안에서 끝난다. 서버 호출 0회.
   · 잠금이 켜져 있으면 제목·메모·시각은 암호화된다 (일기와 같은 열쇠).
     날짜와 완료 여부만 평문이다 — 목록을 정렬하고 달력에 점을 찍으려면
     복호화 전에 알아야 하기 때문이다. 일기의 date 를 평문으로 두는 것과
     같은 이유다.
   =========================================================== */

import * as store from './store.js';
import { encryptJSON, decryptJSON } from './crypto.js';
import { todayKey } from './ui.js';

const SECRET_FIELDS = ['title', 'memo', 'time', 'repeat', 'remindMin'];

export const REPEATS = ['none', 'daily', 'weekly', 'monthly', 'yearly'];

let cache = null;
const listeners = new Set();

export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { cache = null; for (const fn of listeners) fn(); }

/* ── 레코드 변환 ─────────────────────────────────── */
async function toRecord(p) {
  const rec = {
    id: p.id,
    date: p.date,                 // 평문 (정렬·달력 표시용)
    done: !!p.done,               // 평문
    // 반복으로 생겨난 회차들을 하나로 묶는 표식. 뜻이 없는 난수라 평문이어도
    // 새어 나갈 내용이 없고, 복호화 전에도 "같은 반복인가"를 물을 수 있다.
    seriesId: p.seriesId || p.id,
    createdAt: p.createdAt,
    updatedAt: Date.now(),
  };
  const secret = {};
  for (const f of SECRET_FIELDS) secret[f] = p[f] ?? null;
  const key = store._key();
  if (key) rec.sec = await encryptJSON(key, secret);
  else Object.assign(rec, secret);
  return rec;
}

async function fromRecord(rec) {
  const p = {
    id: rec.id, date: rec.date, done: !!rec.done,
    seriesId: rec.seriesId || rec.id,      // 이 표식이 생기기 전에 만든 것은 자기 자신이 한 묶음
    createdAt: rec.createdAt, updatedAt: rec.updatedAt,
  };
  if (rec.sec) {
    const key = store._key();
    if (!key) return null;                    // 잠긴 상태 — 읽을 수 없다
    try {
      const secret = await decryptJSON(key, rec.sec);
      for (const f of SECRET_FIELDS) p[f] = secret[f] ?? null;
    } catch { return null; }
  } else {
    for (const f of SECRET_FIELDS) p[f] = rec[f] ?? null;
  }
  return p;
}

/* ── 읽기 ────────────────────────────────────────── */
export async function loadAll() {
  const recs = await store._reqP(store._tx(['plans']).objectStore('plans').getAll());
  const out = [];
  for (const r of recs) {
    const p = await fromRecord(r);
    if (p) out.push(p);
  }
  out.sort(cmp);
  cache = out;
  return cache;
}

/** 날짜 → 시각 순. 시각이 없는 일정(종일)은 그 날의 맨 앞에 온다. */
function cmp(a, b) {
  if (a.date !== b.date) return a.date < b.date ? -1 : 1;
  const at = a.time || '';
  const bt = b.time || '';
  if (at !== bt) return at < bt ? -1 : 1;
  return (a.createdAt || 0) - (b.createdAt || 0);
}

export function all() { return cache ?? []; }
export function byId(id) { return all().find((p) => p.id === id) || null; }
export function byDate(date) { return all().filter((p) => p.date === date); }
export function hasPlanOn(date) { return all().some((p) => p.date === date && !p.done); }

/** 오늘 이후(오늘 포함)의 안 끝난 일정 */
export function upcoming(from = todayKey()) {
  return all().filter((p) => p.date >= from && !p.done);
}
/** 지나갔는데 안 끝난 것 — 놓친 일정 */
export function overdue(from = todayKey()) {
  return all().filter((p) => p.date < from && !p.done);
}
export function doneList() {
  return all().filter((p) => p.done).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

/** 안 끝난 일정 수. 무료 한도는 이걸 기준으로 센다 — 끝낸 것은 세지 않는다. */
export function activeCount() { return all().filter((p) => !p.done).length; }

/* ── 쓰기 ────────────────────────────────────────── */
export function newPlan(date = todayKey()) {
  const id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id, seriesId: id,             // 혼자면 자기 자신이 한 묶음이다
    date, time: null, title: '', memo: '',
    repeat: 'none', remindMin: null, done: false,
    createdAt: Date.now(), updatedAt: Date.now(),
  };
}

export async function put(p, { silent = false } = {}) {
  const rec = await toRecord(p);
  await store._reqP(store._tx(['plans'], 'readwrite').objectStore('plans').put(rec));
  if (!silent) emit(); else cache = null;
  return p.id;
}

export async function remove(id) {
  await store._reqP(store._tx(['plans'], 'readwrite').objectStore('plans').delete(id));
  emit();
}

/** 같은 반복에서 나온 회차들 (자기 자신 포함) */
export function series(seriesId) {
  return all().filter((p) => (p.seriesId || p.id) === seriesId);
}

/** 반복 전체 지우기. 지운 개수를 돌려준다. */
export async function removeSeries(seriesId) {
  const ids = series(seriesId).map((p) => p.id);
  if (!ids.length) return 0;
  // IndexedDB 트랜잭션은 await 사이에 저절로 닫힌다 — 요청을 한 번에 밀어넣는다
  const tx = store._tx(['plans'], 'readwrite');
  const os = tx.objectStore('plans');
  for (const id of ids) os.delete(id);
  await new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  emit();
  return ids.length;
}

const isRepeat = (p) => !!(p && p.repeat && p.repeat !== 'none');

/** 반복 회차를 from 날짜(포함) 이후의 첫 회차로. 이미 from 이후면 그대로 */
export function firstOnOrAfter(dateKey, repeat, from) {
  let d = dateKey, guard = 0;
  while (d < from && guard++ < 4000) d = nextDate(d, repeat);
  return d;
}

/**
 * 반복 할 일 넘기기 (2026-11-01 사용자: "매일을 고르면 체크 안 해도 매일 나와야").
 * · 체크하지 않고 날이 지난 반복 할 일은 '놓친 일정'에 쌓지 않고 오늘(이후 첫 회차)로 옮긴다
 * · 저장되는 안 끝난 회차는 묶음당 늘 1개 — 무료 한도(activeCount)에서 반복 하나는 1개로 센다
 * 앱을 열 때·다시 볼 때·자정에 부른다. 바뀐 게 있으면 true
 */
export async function rollover(today = todayKey()) {
  const list = await loadAll();
  const changed = [];
  const drop = [];
  const openBySeries = new Map();
  for (const p of list) {
    if (p.done || !isRepeat(p)) continue;
    if (p.date < today) { p.date = firstOnOrAfter(p.date, p.repeat, today); changed.push(p); }
    const sid = p.seriesId || p.id;
    const prev = openBySeries.get(sid);
    if (!prev) { openBySeries.set(sid, p); continue; }
    /* 한 묶음에 안 끝난 회차가 둘 이상(예전 데이터) — 이른 것 하나만 남긴다 */
    const keep = prev.date <= p.date ? prev : p;
    const lose = keep === prev ? p : prev;
    openBySeries.set(sid, keep); drop.push(lose.id);
  }
  const dropSet = new Set(drop);
  const toPut = changed.filter((p) => !dropSet.has(p.id));
  if (!toPut.length && !drop.length) return false;
  for (const p of toPut) await put(p, { silent: true });
  if (drop.length) {
    const tx = store._tx(['plans'], 'readwrite'); const os = tx.objectStore('plans');
    for (const id of drop) os.delete(id);
    await new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
  }
  emit();
  await loadAll();
  return true;
}

export async function toggleDone(id) {
  const p = byId(id);
  if (!p) return null;
  const today = todayKey();
  if (!p.done && isRepeat(p)) {
    /* 반복 할 일을 끝냄: 지난 날짜로 남아 있던 것이면 오늘 회차로 끝낸다 (오후에 늦게 눌러도 오늘 한 일).
       다음 회차는 늘 그 다음 — 지난 날짜로 생기는 일이 없다. 묶음에 이미 안 끝난 회차가 있으면 새로 만들지 않는다 */
    if (p.date < today) p.date = firstOnOrAfter(p.date, p.repeat, today);
    p.done = true;
    const sid = p.seriesId || p.id;
    const otherOpen = all().some((q) => q.id !== p.id && !q.done && (q.seriesId || q.id) === sid);
    if (!otherOpen) {
      const next = {
        ...p, id: newPlan().id, seriesId: sid,
        date: nextDate(p.date, p.repeat), done: false, createdAt: Date.now(),
      };
      await put(next, { silent: true });
    }
    await put(p);
    return p;
  }
  if (p.done && isRepeat(p)) {
    /* 끝냄을 되돌림: 끝낼 때 생긴 다음 회차(안 끝난 것)를 지우고 이것을 다시 안 끝난 회차로 — 같은 날 둘이 생기지 않게 */
    const sid = p.seriesId || p.id;
    const tx = store._tx(['plans'], 'readwrite'); const os = tx.objectStore('plans');
    let n = 0;
    for (const q of all()) if (q.id !== p.id && !q.done && (q.seriesId || q.id) === sid) { os.delete(q.id); n++; }
    if (n) await new Promise((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    p.done = false;
    if (p.date < today) p.date = firstOnOrAfter(p.date, p.repeat, today);
    await put(p);
    return p;
  }
  p.done = !p.done;
  await put(p);
  return p;
}

/**
 * from~to(포함) 사이의 일정 — 저장된 것 + 반복 할 일의 앞으로 회차(가상, 저장 안 함·한도에 안 셈).
 * 가상 회차는 { ...원본, date, virtual: true } — 고치기는 byId(id) 로 원본을 연다
 */
export function occurrences(from, to, list = all()) {
  const out = list.filter((p) => p.date >= from && p.date <= to);
  for (const p of list) {
    if (p.done || !isRepeat(p)) continue;
    let d = nextDate(p.date, p.repeat), guard = 0;
    while (d <= to && guard++ < 800) {
      if (d >= from) out.push({ ...p, date: d, virtual: true });
      d = nextDate(d, p.repeat);
    }
  }
  return out.sort(cmp);
}

/** 반복 주기만큼 뒤의 날짜. 월/년은 말일 넘침을 그 달의 마지막 날로 눌러 담는다. */
export function nextDate(dateKey, repeat) {
  const [y, m, d] = dateKey.split('-').map(Number);
  if (repeat === 'daily')  return shift(y, m, d + 1);
  if (repeat === 'weekly') return shift(y, m, d + 7);
  if (repeat === 'monthly') return clamp(y, m + 1, d);
  if (repeat === 'yearly')  return clamp(y + 1, m, d);
  return dateKey;
}
function shift(y, m, d) {
  const dt = new Date(y, m - 1, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}
function clamp(y, m, d) {
  const yy = y + Math.floor((m - 1) / 12);
  const mm = ((m - 1) % 12 + 12) % 12 + 1;
  const last = new Date(yy, mm, 0).getDate();      // 31일에 2월이 오면 28/29 로
  return `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

/**
 * 잠금을 켜고 끌 때 기존 일정을 다시 저장한다 (암호화 상태를 맞춘다).
 * 반드시 열쇠를 바꾸기 "전에" loadAll() 로 읽어둔 목록을 넘겨야 한다.
 * 잠금을 끄는 순간엔 이미 열쇠가 없어서 다시 읽을 수 없기 때문이다.
 */
export async function rewriteAll(list = all()) {
  const snapshot = list.slice();
  for (const p of snapshot) await put(p, { silent: true });
  emit();
}

/** 일정이 있는 날짜 집합 — 달력에 표시할 때 쓴다 */
export function datesWithPlans() {
  const s = new Set();
  for (const p of all()) if (!p.done) s.add(p.date);
  return s;
}

/** 알림 시각 (Date). 시각이 없거나 알림을 안 걸었으면 null */
/** 알림을 걸 회차들: 안 끝난 일정 + 반복 할 일의 앞으로 days 일 안 회차 (체크와 상관없이) */
export function reminderOccurrences(days = 21, today = todayKey()) {
  const [y, m, d] = today.split('-').map(Number);
  const end = shift(y, m, d + days);
  const far = upcoming(today).filter((p) => p.date > end);
  return [...occurrences(today, end).filter((p) => !p.done), ...far];
}

export function remindAt(p) {
  if (!p.time || p.remindMin == null || p.done) return null;
  const [y, m, d] = p.date.split('-').map(Number);
  const [hh, mm] = p.time.split(':').map(Number);
  const at = new Date(y, m - 1, d, hh, mm, 0, 0);
  at.setMinutes(at.getMinutes() - p.remindMin);
  return at;
}

/* 일정마다 다른 색 (2026-11-01 사용자) — 저장하지 않고 묶음(seriesId)으로 정한다. 같은 일정(반복 포함)은 늘 같은 색.
   일정 달력·메인 달력·날짜 창이 모두 이 색을 쓴다 */
export const PLAN_COLORS = ['#efcf8f', '#f3b48f', '#eda3b3', '#bfaee6', '#9fc6ec', '#9fd5b8', '#c9d58f', '#f0a7d6'];
export function planColor(p) {
  const k = String(p?.seriesId || p?.id || ''); let h = 0;
  for (let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  return PLAN_COLORS[h % PLAN_COLORS.length];
}
