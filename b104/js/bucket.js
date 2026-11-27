/* ===========================================================
   bucket.js — 버킷리스트·디데이 저장 (2026-11-27, 서버 없이 폰 안에만)
   · 한 목록에 두 가지: kind 'goal'(버킷리스트 — 이루면 체크) · kind 'day'(디데이 — 날짜까지/부터 며칠)
   · 저장: store.meta 'bucket' = [{ id, kind, title, date?, yearly?, done?, doneAt?, createdAt }]
   · 백업 파일에 같이 들어간다(store.exportJSON 'bucket'), 복원은 id 로 합친다(이미 있는 건 그대로)
   =========================================================== */
import * as store from './store.js';

let list = null;
const MAX_TITLE = 60;

export async function load() {
  if (list) return list;
  try { const v = await store.metaGet('bucket', []); list = Array.isArray(v) ? v.filter(ok) : []; } catch { list = []; }
  return list;
}
function ok(x) { return x && typeof x.id === 'string' && (x.kind === 'goal' || x.kind === 'day') && typeof x.title === 'string'; }
const save = () => store.metaSet('bucket', list);
const newId = () => 'b_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_TITLE);
const validDate = (d) => (typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d) && !isNaN(new Date(d + 'T00:00:00')) ? d : null);

export function all() { return (list || []).slice(); }
export function goals() { return all().filter((x) => x.kind === 'goal'); }
export function days() { return all().filter((x) => x.kind === 'day'); }

export async function add(kind, title, { date = null, yearly = false } = {}) {
  await load();
  const tt = clean(title);
  if (!tt || (kind !== 'goal' && kind !== 'day')) return null;
  const d = validDate(date);
  if (kind === 'day' && !d) return null;          // 디데이는 날짜가 있어야 한다
  const it = { id: newId(), kind, title: tt, createdAt: Date.now() };
  if (d) it.date = d;
  if (kind === 'day' && yearly) it.yearly = true;
  if (kind === 'goal') it.done = false;
  list.push(it);
  await save();
  return it;
}
export async function update(id, patch) {
  await load();
  const it = list.find((x) => x.id === id);
  if (!it) return null;
  if ('title' in patch) { const tt = clean(patch.title); if (tt) it.title = tt; }
  if ('date' in patch) { const d = validDate(patch.date); if (d) it.date = d; else if (it.kind === 'goal') delete it.date; }
  if ('yearly' in patch && it.kind === 'day') { if (patch.yearly) it.yearly = true; else delete it.yearly; }
  if ('done' in patch && it.kind === 'goal') { it.done = !!patch.done; if (it.done) it.doneAt = Date.now(); else delete it.doneAt; }
  await save();
  return it;
}
export async function remove(id) {
  await load();
  const n = list.length;
  list = list.filter((x) => x.id !== id);
  if (list.length !== n) await save();
}

/* ── 며칠 ── */
const dayNum = (key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
export function todayStr(now = new Date()) { return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`; }
/** 매년 반복이면 오늘이거나 다음에 오는 그 날짜 (2월 29일은 평년엔 2월 28일) */
export function nextYearly(date, today = todayStr()) {
  const [, m, d] = date.split('-').map(Number);
  const ty = +today.slice(0, 4);
  for (const y of [ty, ty + 1]) {
    const last = new Date(y, m, 0).getDate();
    const k = `${y}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
    if (k >= today) return k;
  }
  return date;
}
/** { left } : 앞으로 며칠(0=오늘) / { since } : 지난 지 며칠(그날 1일째면 since 0) */
export function countOf(it, today = todayStr()) {
  if (!it.date) return null;
  const target = it.kind === 'day' && it.yearly ? nextYearly(it.date, today) : it.date;
  const diff = dayNum(target) - dayNum(today);
  return diff >= 0 ? { left: diff, target } : { since: -diff, target };
}
/** 'D-12' · 'D-DAY' · 'D+30' */
export function dLabel(it, today = todayStr()) {
  const c = countOf(it, today);
  if (!c) return '';
  if ('left' in c) return c.left === 0 ? 'D-DAY' : 'D-' + c.left;
  return 'D+' + c.since;
}

/* ── 백업 ── */
export async function exportList() { await load(); return all(); }
export async function importList(arr) {
  await load();
  let n = 0;
  for (const x of Array.isArray(arr) ? arr : []) {
    if (!ok(x) || list.some((y) => y.id === x.id)) continue;
    const it = { id: x.id, kind: x.kind, title: clean(x.title) || '—', createdAt: +x.createdAt || Date.now() };
    const d = validDate(x.date); if (d) it.date = d;
    if (it.kind === 'day' && !it.date) continue;
    if (it.kind === 'day' && x.yearly) it.yearly = true;
    if (it.kind === 'goal') { it.done = !!x.done; if (it.done && x.doneAt) it.doneAt = +x.doneAt; }
    list.push(it); n++;
  }
  if (n) await save();
  return n;
}

/* 시험용 */
export function _reset() { list = null; }
