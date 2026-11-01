/* ===========================================================
   habits.js — 습관 저장 (2026-10-30, 사용자 지시: 하루칸 안의 습관 트래커)
   · DB 버전을 올리지 않는다(되돌리기 안전): meta 저장소의 'habits' 한 칸에 통째로 둔다.
     잠금이 꺼져 있으면 배열 그대로, 켜져 있으면 { enc:{iv,ct} } (일기와 같은 열쇠).
   · 원본(raw) 백업은 meta 를 통째로 담으므로 자동으로 들어간다. 일반 백업은 store.exportJSON 이 넣는다.
   · 계산 규칙은 habitcore.js.
   =========================================================== */
import * as store from './store.js';
import { encryptJSON, decryptJSON } from './crypto.js';
import * as C from './habitcore.js';

const KEY = 'habits';
let cache = null;
let locked = false;          // 암호화돼 있는데 열쇠가 없어서 못 읽음
const listeners = new Set();
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) { try { fn(); } catch (e) { console.error(e); } } }

export const COLORS = ['#c2703d', '#d0555f', '#d98b2b', '#5f9a52', '#3f8f8a', '#4f78b8', '#7a5fb0', '#9a6b4f'];
export const EMOJIS = ['💧', '💊', '🏃', '📚', '🧘', '🚶', '🥗', '😴', '☕', '🚭', '🦷', '🧒', '🙏', '✍️', '🎵', '💪'];

/* ── 읽기·쓰기 ───────────────────────────────── */
export async function load() {
  const raw = await store.metaGet(KEY, null);
  locked = false;
  if (!raw) cache = [];
  else if (Array.isArray(raw)) cache = raw;
  else if (raw.enc) {
    const key = store._key();
    if (!key) { cache = []; locked = true; }
    else { try { cache = await decryptJSON(key, raw.enc); } catch { cache = []; locked = true; } }
  } else cache = [];
  for (const h of cache) h.log ||= {};
  return cache;
}
export function all() { return (cache || []).slice().sort((a, b) => (a.order ?? 0) - (b.order ?? 0)); }
export function active() { return all().filter((h) => !h.archived); }
export function byId(id) { return (cache || []).find((h) => h.id === id) || null; }
export function isLockedOut() { return locked; }

async function save(list = cache || []) {
  if (locked) throw new Error('잠긴 습관은 저장할 수 없어요');
  const key = store._key();
  await store.metaSet(KEY, key ? { enc: await encryptJSON(key, list) } : list);
  cache = list;
}
/** 잠금을 켜고 끌 때 — 열쇠가 바뀌기 전에 읽어 둔 목록을 새 열쇠 상태로 다시 저장한다 (app.js) */
export async function rewrite(list) { locked = false; await save(list); }

export function newHabit() {
  const id = `h_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id, name: '', icon: '💧', color: COLORS[0],
    goal: { kind: 'check' }, schedule: { kind: 'daily' },
    start: C.keyOf(new Date()), end: null, reminders: [], memo: '',
    order: (cache || []).length, archived: false, createdAt: Date.now(), log: {},
  };
}

export async function put(h) {
  if (!cache) await load();
  const list = cache.filter((x) => x.id !== h.id);
  list.push(h);
  await save(list);
  emit();
  return h.id;
}
export async function remove(id) {
  if (!cache) await load();
  await save(cache.filter((h) => h.id !== id));
  emit();
}

/** 기록 바꾸기. v = 숫자 | 'skip' | null(지우기) */
export async function setLog(id, day, v) {
  const h = byId(id);
  if (!h) return;
  h.log ||= {};
  if (v == null || v === 0) delete h.log[day]; else h.log[day] = v;
  await save(cache);
  emit();
}

/** 한 번 누르기: 체크는 켜기/끄기, 하루 N회·줄이기는 +1 */
export async function tap(id, day) {
  const h = byId(id);
  if (!h) return;
  const v = C.valueOn(h, day);
  const g = h.goal?.kind || 'check';
  if (g === 'check') return setLog(id, day, v >= 1 ? null : 1);
  if (g === 'quantity') return setLog(id, day, v + (h.goal.step || 1));
  return setLog(id, day, v + 1);
}

/* ── 백업 ─────────────────────────────────────── */
export function exportList() { return locked ? [] : all().map((h) => ({ ...h, log: { ...h.log } })); }
/** 백업에서 합치기: 같은 id 면 기록을 합친다(날짜별로 백업 쪽이 없을 때만 채움), 없으면 추가 */
export async function importList(list) {
  if (!Array.isArray(list) || !list.length || locked) return 0;
  if (!cache) await load();
  const out = cache.slice();
  let added = 0;
  for (const h of list) {
    if (!h?.id) continue;
    const mine = out.find((x) => x.id === h.id);
    if (mine) { mine.log = { ...(h.log || {}), ...(mine.log || {}) }; }
    else { out.push({ ...h, log: { ...(h.log || {}) } }); added++; }
  }
  await save(out);
  emit();
  return added;
}

/* ── 오늘 보기 ───────────────────────────────── */
export function today() { return C.keyOf(new Date()); }
/** 오늘 해야 하는 것 / 해당 없는 것 */
export function split(day = today()) {
  const due = [], off = [];
  for (const h of active()) (C.dueOn(h, day) ? due : off).push(h);
  return { due, off };
}
