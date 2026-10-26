/* ===========================================================
   store.js — IndexedDB 저장소
   · 모든 데이터는 이 기기의 브라우저 안에만 있다. 서버 호출 0회.
   · 삭제는 항상 소프트 삭제 → 휴지통 30일 (실수로 지우고 복구 못 하는
     사고가 기존 앱들의 대표 불만이었다.)
   · 잠금이 켜져 있으면 본문/제목/태그/사진은 암호화되어 들어간다.
   =========================================================== */

import { encryptJSON, decryptJSON } from './crypto.js';
import { todayKey, moodWord } from './ui.js';
import { t } from './i18n.js';
import { KINDS as WX_KINDS } from './weather-icons.js';
import { remapIds as remapLayoutIds } from './photolayout.js';

const DB_NAME = 'harukan';
/* 2 — 일정(plans) 저장소 추가. 아래 upgrade 는 전부 "없으면 만든다" 라서
   쓰던 사람의 글·사진·설정은 그대로 두고 저장소만 하나 늘어난다. */
const DB_VER = 2;

let db = null;
let cryptoKey = null;              // 잠금이 켜져 있을 때만 non-null
let cache = null;                  // 복호화된 엔트리 배열 (최신순 아님, date 오름차순)
const listeners = new Set();

/* ── 열기 ────────────────────────────────────────── */
export function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const d = req.result;
      if (!d.objectStoreNames.contains('entries')) {
        const s = d.createObjectStore('entries', { keyPath: 'id' });
        s.createIndex('date', 'date');
        s.createIndex('updatedAt', 'updatedAt');
      }
      if (!d.objectStoreNames.contains('photos')) d.createObjectStore('photos', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('meta'))   d.createObjectStore('meta', { keyPath: 'k' });
      if (!d.objectStoreNames.contains('plans')) {
        const p = d.createObjectStore('plans', { keyPath: 'id' });
        p.createIndex('date', 'date');
      }
    };
    req.onsuccess = () => { db = req.result; resolve(db); };
    req.onerror = () => reject(req.error);
    // 다른 탭이 저장소를 붙잡고 있으면 open 이 영원히 응답하지 않는다.
    // 조용히 멈추는 대신 이유를 알려준다.
    req.onblocked = () => reject(new Error('다른 탭에서 하루칸이 열려 있어요. 그 탭을 닫고 새로고침해 주세요.'));
  });
}

function tx(stores, mode = 'readonly') {
  return db.transaction(stores, mode);
}
function reqP(r) {
  return new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
}

/* ── meta (설정) ─────────────────────────────────── */
export async function metaGet(k, dflt = null) {
  const v = await reqP(tx(['meta']).objectStore('meta').get(k));
  return v === undefined ? dflt : v.v;
}
export async function metaSet(k, v) {
  await reqP(tx(['meta'], 'readwrite').objectStore('meta').put({ k, v }));
  return v;
}
export async function metaDel(k) {
  await reqP(tx(['meta'], 'readwrite').objectStore('meta').delete(k));
}

/* ── 쓰기 화면의 임시 원고 (1.4.2) ──────────────────
   [완료]를 누르기 전까지는 글로 저장하지 않는다. 대신 쓰던 내용을 여기 하나만 적어 둔다
   (앱이 뒤로 가거나 꺼져도 남게). 목록·달력·검색에는 나오지 않는다.
   잠금이 켜져 있으면 글과 똑같이 암호화한다. */
const DRAFT_KEY = 'writeDraft';
export async function saveDraft(d) {
  // 잠금을 켜 두었는데 열쇠가 없으면(방금 잠금) 적지 않는다 — 일기가 암호 없이 남으면 안 된다
  if (!cryptoKey && (await metaGet('lock', null))) return;
  const v = cryptoKey ? { sec: await encryptJSON(cryptoKey, d) } : { d };
  await metaSet(DRAFT_KEY, v);
}
export async function loadDraft() {
  const v = await metaGet(DRAFT_KEY, null);
  if (!v) return null;
  if (v.sec) {
    if (!cryptoKey) return null;
    try { return await decryptJSON(cryptoKey, v.sec); } catch { return null; }
  }
  return v.d || null;
}
export async function clearDraft() { await metaDel(DRAFT_KEY); }

/* ── 설정 ────────────────────────────────────────── */
export const DEFAULT_SETTINGS = {
  /* 1.7.6: 새 설치 기본값을 '밝게'로 (사용자 결정 2026-10-25 — 시스템을 따르면 어둡게 나와 예쁘지 않다).
     설정은 통째로 저장되므로 이미 쓰던 사람의 저장값('auto' 등)은 그대로 남는다. */
  theme: 'light',           // auto | light | dark
  /* 배경 꾸미기 (1.5.0, 플러스) — theme.js. 사진 자체는 meta 'bgPhoto' 에 따로 둔다 */
  bgTheme: 'none',          // none | sea | snow | summer | spring | autumn | night | photo
  bgPhotoDim: 25,           // 내 사진 위에 덮는 막의 진하기 (0~60, %)
  font: 'sans',             // sans | serif
  fontSize: 16,
  weeklyGoal: 4,            // 주 N회 — "매일"이 아니라서 하루 빠져도 무너지지 않는다
  reminderOn: false,
  reminderTime: '22:00',
  defaultMode: 'free',
  /* 달력 칸을 그날 사진으로 채우는 쪽을 기본으로 둔다. 기분 색은 예쁘지만
     무슨 뜻인지 배워야 읽히고, 사진은 배울 것이 없다. 사진이 없는 날은
     어차피 기분 색으로 떨어지므로 잃는 것도 없다. */
  calendarStyle: 'photo',   // photo | plain
  /* 처음 실행한 시각. 30일 무료 체험이 여기서부터 흐른다 (plus.js) */
  trialStartedAt: null,
  /* 1.6.3: 새로 설치한 사람 — 체험 없이 시작했다는 표시 (app.js syncTrial) */
  noTrial: false,
  /* 1.6.6: 배경 꾸미기 새 단장 — 설정의 NEW 표시(꾸미기 화면을 열면 끔)와 업데이트 안내(한 번만) */
  bgNewSeen: false,
  bgNoticeSeen: false,
  /* 1.6.7: 앱 평가 요청 (review.js) — 언제, 몇 번 물었나 */
  reviewAskedAt: null,
  reviewAskCount: 0,
  /* 1.6.7: 플러스 가격 구간. 처음 한 번 정하고 바꾸지 않는다 (app.js syncPriceTier)
     'legacy' = 가격 인상 전부터 쓰던 사람 → remove_ads(₩4,990) / 'new' = 그 뒤 설치 → plus_9900(₩9,900) */
  priceTier: null,
  /* 체험 동안 도달한 일정 최대 개수. 체험이 끝나도 이 아래로는 안 막는다 */
  planFloor: 0,
  askMood: true,
  autoTags: true,
  weatherAuto: false,       // 일기에 날씨 자동으로 붙이기 (1.7.2) — 처음 쓸 때 한 번 묻고, 켜면 위치 권한을 받는다
  weatherAsked: false,
  placeAuto: false,         // 일기 쓴 장소 기록 (1.7.8) — 켜면 정확한 위치 권한을 묻고, 새 일기에 그 자리 좌표·주소를 남긴다(폰 안에만)
  placeAsked: false,
  guideSeen: false,         // 첫 사용 가이드 4장을 봤다 (1.7.2)
  lastBackupAt: null,
  language: 'auto',         // auto | ko | en | ja | zh | es | pt | th | ar
};

let settings = { ...DEFAULT_SETTINGS };
export function getSettings() { return settings; }
export async function loadSettings() {
  settings = { ...DEFAULT_SETTINGS, ...(await metaGet('settings', {})) };
  return settings;
}
/**
 * @param {object} patch
 * @param {{silent?:boolean}} opts
 *   silent — 화면을 다시 그리지 않는다. 스스로 DOM 을 갱신하는 컨트롤
 *   (슬라이더·토글·세그먼트) 에서 쓴다. 그러지 않으면 드래그 도중에
 *   컨트롤이 통째로 다시 만들어져 조작이 튄다.
 */
export async function saveSettings(patch, { silent = false } = {}) {
  settings = { ...settings, ...patch };
  await metaSet('settings', settings);
  if (!silent) emit();
  return settings;
}

/* ── 잠금 ────────────────────────────────────────── */
export function setCryptoKey(k) {
  cryptoKey = k;
  photoCache.clear();          // 잠기거나 열릴 때 복호화 상태가 바뀐다
}
export function hasCryptoKey() { return !!cryptoKey; }

/* ── plans.js 가 같은 DB 연결과 같은 열쇠를 쓰도록 내준다 ──
   일정도 일기와 똑같이 잠금이 켜져 있으면 암호화된다. 저장소만 다를 뿐
   "이 기기 밖으로 나가지 않는다"는 약속은 하나다. */
export function _tx(stores, mode = 'readonly') { return tx(stores, mode); }
export function _reqP(r) { return reqP(r); }
export function _key() { return cryptoKey; }

/* stickers 도 본문처럼 잠금을 켜면 암호화한다. 무엇을 붙였는지(케이크·하트)도 그날의 기록이다. */
/* weather(1.7.2): 그날 날씨와 동네 이름 — 어디에 있었는지도 기록이라 함께 암호화한다 */
const SECRET_FIELDS = ['title', 'body', 'tags', 'chips', 'mood', 'mode', 'guided', 'stickers', 'weather', 'photoLayout', 'collages', 'place'];   // place: 일기 쓴 곳 좌표·주소 (1.7.8)   // photoLayout: 사진 자리·크기, collages: 사진 묶음 (1.7.5)

async function toRecord(e) {
  const rec = {
    id: e.id, date: e.date, createdAt: e.createdAt, updatedAt: e.updatedAt,
    deletedAt: e.deletedAt ?? null, lastReadAt: e.lastReadAt ?? null,
    bookmarkedAt: e.bookmarkedAt ?? null,
    wordCount: e.wordCount ?? 0, photos: e.photos ?? [],
    /* 묻어둔 글이 열리는 날. 평문으로 둔다 — 잠금을 풀기 전에도
       "이 글은 아직 묻혀 있다"를 알아야 목록에서 빼놓을 수 있다.
       date 를 평문으로 두는 것과 같은 이유다. */
    sealedUntil: e.sealedUntil ?? null,
    openedAt: e.openedAt ?? null,        // 실제로 열어본 시각
  };
  if (e.demo) rec.demo = true;            // 예시 데이터 표시 (지울 때 구분용)
  const secret = {};
  for (const f of SECRET_FIELDS) secret[f] = e[f];
  if (cryptoKey) rec.sec = await encryptJSON(cryptoKey, secret);
  else Object.assign(rec, secret);
  return rec;
}

async function fromRecord(rec) {
  if (!rec.sec) return { ...rec };
  if (!cryptoKey) throw new Error('locked');
  const secret = await decryptJSON(cryptoKey, rec.sec);
  const { sec, ...rest } = rec;
  return { ...rest, ...secret };
}

/* ── 캐시 & 구독 ─────────────────────────────────── */
export function subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { for (const fn of listeners) { try { fn(); } catch (err) { console.error(err); } } }

export async function loadAll() {
  const raw = await reqP(tx(['entries']).objectStore('entries').getAll());
  const out = [];
  for (const r of raw) out.push(await fromRecord(r));
  out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  cache = out;
  return cache;
}
export function all() { return cache ?? []; }
/**
 * 아직 열릴 날이 오지 않은 글인가.
 * 묻어둔 글은 본인도 못 읽는다 — 그게 묻어두는 이유다.
 */
export function isSealed(e, today = todayKey()) {
  return !!e.sealedUntil && e.sealedUntil > today;
}

/** 살아있는 글 (휴지통·묻어둔 글 제외), 최신순.
    여기 한 곳에서 빼면 홈·달력·찾기·발견·통계가 한꺼번에 따라온다. */
export function live() {
  const today = todayKey();
  return all().filter((e) => !e.deletedAt && !isSealed(e, today)).slice().reverse();
}

/** 묻어둔 글 — 열리는 날이 가까운 순. 내용은 쓰지 않는다 */
export function sealedList() {
  const today = todayKey();
  return all().filter((e) => !e.deletedAt && isSealed(e, today))
    .sort((a, b) => (a.sealedUntil < b.sealedUntil ? -1 : 1));
}

/** 열렸는데 아직 안 읽은 글 (열린 지 오래된 것도 계속 알린다) */
export function justOpened() {
  const today = todayKey();
  return all().filter((e) => !e.deletedAt && e.sealedUntil && e.sealedUntil <= today && !e.openedAt)
    .sort((a, b) => (a.sealedUntil < b.sealedUntil ? -1 : 1));
}
/** 통계용 글 목록.
    직접 쓴 글이 하나라도 있으면 예시(demo) 데이터는 뺀다 —
    예시가 섞이면 "토요일에 28편" 같은 가짜 리듬이 나온다.
    글이 예시뿐이면 그대로 쓴다 (둘러보기의 목적이 통계 미리보기니까). */
/** 내보내기용 글 목록 — live() 에서 예시(둘러보기) 글을 뻀다 (PDF·마크다운) */
export function realLive() { return live().filter((e) => !e.demo); }

export function statsEntries() {
  const alive = live();
  const real = alive.filter((e) => !e.demo);
  return real.length ? real : alive;
}

export function trashed() {
  return all().filter((e) => e.deletedAt).sort((a, b) => b.deletedAt - a.deletedAt);
}
export function byId(id) { return all().find((e) => e.id === id) || null; }
export function byDate(date) { return live().filter((e) => e.date === date); }
export function hasEntryOn(date) { return live().some((e) => e.date === date); }

/* ── 쓰기 ────────────────────────────────────────── */
export function newEntry(date = todayKey(), mode = settings.defaultMode) {
  const now = Date.now();
  return {
    id: 'e_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 8),
    date, createdAt: now, updatedAt: now, deletedAt: null, lastReadAt: null,
    bookmarkedAt: null, sealedUntil: null, openedAt: null,
    title: '', body: '', mode, mood: null, tags: [], chips: [], photos: [],
    guided: null, wordCount: 0, stickers: [],
  };
}

export function countWords(body) {
  const t = (body || '').trim();
  if (!t) return 0;
  return t.replace(/\s+/g, '').length;    // 한글은 글자 수가 더 직관적
}

/**
 * @param {object} entry
 * @param {{silent?:boolean, touch?:boolean}} opts
 *   silent — 구독자에게 알리지 않는다 (화면을 다시 그리지 않는다)
 *   touch  — updatedAt 을 갱신한다. 읽기 기록처럼 "고친 게 아닌" 저장은 false.
 */
export async function put(entry, { silent = false, touch = true } = {}) {
  if (touch) entry.updatedAt = Date.now();
  entry.wordCount = countWords(entry.body) + countWords(entry.title);
  const rec = await toRecord(entry);
  await reqP(tx(['entries'], 'readwrite').objectStore('entries').put(rec));
  const i = cache.findIndex((e) => e.id === entry.id);
  if (i >= 0) cache[i] = { ...entry }; else {
    cache.push({ ...entry });
    cache.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt));
  }
  if (!silent) emit();
  return entry;
}

/* ── 보관(북마크) ────────────────────────────────
   다시 읽고 싶은 글에 표시를 남긴다.
   · 고친 게 아니므로 updatedAt 은 건드리지 않는다 (touch:false).
   · 기본이 silent 다 — 화면을 통째로 다시 그리면 목록 중간에서 눌렀을 때
     스크롤이 맨 위로 튄다. 누른 버튼만 각 화면에서 직접 바꾼다.
   · 남는 건 시각뿐이라 본문과 달리 암호화 대상이 아니다 (lastReadAt 과 같은 급). */
export async function setBookmark(id, on, { silent = true } = {}) {
  const e = byId(id);
  if (!e) return null;
  e.bookmarkedAt = on ? Date.now() : null;
  await put(e, { silent, touch: false });
  return e.bookmarkedAt;
}
export async function toggleBookmark(id) {
  const e = byId(id);
  if (!e) return false;
  return (await setBookmark(id, !e.bookmarkedAt)) != null;
}
export function isBookmarked(id) { return !!byId(id)?.bookmarkedAt; }

/** 보관한 글 — 최근에 표시한 순 */
export function bookmarked() {
  return all()
    .filter((e) => !e.deletedAt && e.bookmarkedAt)
    .sort((a, b) => b.bookmarkedAt - a.bookmarkedAt);
}

/** 소프트 삭제 → 휴지통 */
export async function softDelete(id) {
  const e = byId(id);
  if (!e) return;
  e.deletedAt = Date.now();
  await put(e);
}

/**
 * 묻어둔 글을 처음 열어본 순간을 남긴다.
 * touch:false 인 것은 '읽은 것'이지 '고친 것'이 아니기 때문이다 —
 * updatedAt 을 건드리면 되새김이 방금 쓴 글로 착각한다.
 */
export async function markOpened(id) {
  const e = byId(id);
  if (!e || e.openedAt) return;
  e.openedAt = Date.now();
  await put(e, { touch: false });
}
export async function restore(id) {
  const e = byId(id);
  if (!e) return;
  e.deletedAt = null;
  await put(e);
}
/** 완전 삭제 (휴지통에서만) */
export async function hardDelete(id) {
  const e = byId(id);
  if (e?.photos?.length) for (const pid of e.photos) await deletePhoto(pid);
  await reqP(tx(['entries'], 'readwrite').objectStore('entries').delete(id));
  cache = cache.filter((x) => x.id !== id);
  emit();
}

/** 30일 지난 휴지통 자동 비우기 */
export async function purgeOldTrash(days = 30) {
  const limit = Date.now() - days * 86400000;
  const old = trashed().filter((e) => e.deletedAt < limit);
  for (const e of old) await hardDelete(e.id);
  return old.length;
}

/**
 * 글을 열었다고 표시한다 ('되새김'이 오래 안 본 글을 골라낼 때 쓴다).
 *
 * 조용히(silent) 저장해야 한다. 여기서 emit 하면
 *   글 보기 렌더 → markRead → emit → 화면 다시 그리기 → markRead → …
 * 무한 루프가 돌고, 사진이 매번 새로 로드되면서 눈에 띄게 깜박인다.
 * 읽는 건 '고치는' 게 아니므로 updatedAt 도 건드리지 않는다.
 */
export async function markRead(id) {
  const e = byId(id);
  if (!e || e.deletedAt) return;
  if (e.lastReadAt && Date.now() - e.lastReadAt < 60_000) return;   // 방금 읽었으면 다시 쓰지 않는다
  e.lastReadAt = Date.now();
  await put(e, { silent: true, touch: false });
}

/* ── 사진 ────────────────────────────────────────── */
/**
 * 이미 읽어둔 사진은 메모리에 들고 있는다.
 * 화면이 다시 그려질 때 src 를 곧바로 넣을 수 있어야 이미지가 깜박이지 않는다
 * (비동기로 채우면 매 렌더마다 빈 <img> 가 한 프레임 보인다).
 */
const photoCache = new Map();
const PHOTO_CACHE_MAX = 40;

function cachePhoto(id, dataUrl) {
  if (photoCache.has(id)) photoCache.delete(id);       // 최근 것을 뒤로 보낸다
  photoCache.set(id, dataUrl);
  while (photoCache.size > PHOTO_CACHE_MAX) {
    photoCache.delete(photoCache.keys().next().value);
  }
}

/** 캐시에 있으면 즉시 반환, 없으면 null (그 뒤 getPhoto 로 비동기 로드) */
export function getPhotoSync(id) {
  return photoCache.get(id) ?? null;
}

export async function putPhoto(dataUrl) {
  const id = 'p_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  const payload = cryptoKey ? { id, sec: await encryptJSON(cryptoKey, dataUrl) } : { id, d: dataUrl };
  await reqP(tx(['photos'], 'readwrite').objectStore('photos').put(payload));
  cachePhoto(id, dataUrl);
  return id;
}

export async function getPhoto(id) {
  if (photoCache.has(id)) return photoCache.get(id);
  const r = await reqP(tx(['photos']).objectStore('photos').get(id));
  if (!r) return null;
  let d;
  if (r.sec) {
    if (!cryptoKey) return null;
    try { d = await decryptJSON(cryptoKey, r.sec); } catch { return null; }
  } else {
    d = r.d;
  }
  if (d) cachePhoto(id, d);
  return d;
}

/**
 * 사진 저장소를 새 열쇠로 다시 싼다 (1.5.0 버그 수정).
 * 잠금을 켜고 끄고 비밀번호를 바꿀 때 글과 일정은 다시 저장하면서 암호화를 맞추는데,
 * 사진은 그대로 두고 있었다. 그래서
 *   · 잠금을 켜기 전에 넣은 사진은 잠금을 켜도 평문으로 남았고
 *   · 잠금 중에 넣은 사진은 잠금을 끄면(또는 비밀번호를 바꾸면) 열쇠가 사라져 영영 못 열었다.
 * 한 장씩 읽어 풀고 다시 싼다 — 전부 메모리에 올리면 사진이 많은 사람은 멈춘다.
 * @param {CryptoKey|null} oldKey 지금까지의 열쇠 (잠금이 꺼져 있었으면 null)
 * @param {CryptoKey|null} newKey 앞으로의 열쇠 (잠금을 끄면 null)
 * @returns {Promise<{done:number, failed:number}>}
 */
export async function rekeyPhotos(oldKey, newKey) {
  const ids = await reqP(tx(['photos']).objectStore('photos').getAllKeys());
  let done = 0, failed = 0;
  for (const id of ids) {
    const r = await reqP(tx(['photos']).objectStore('photos').get(id));
    if (!r) continue;
    let d = null;
    if (r.sec) {
      /* 열쇠가 없거나 다른 열쇠로 싼 것(이미 망가진 사진)은 건드리지 않는다 — 더 망치지 않게 */
      if (!oldKey) { failed++; continue; }
      try { d = await decryptJSON(oldKey, r.sec); } catch { failed++; continue; }
    } else {
      d = r.d;
    }
    if (!d) continue;
    const payload = newKey ? { id, sec: await encryptJSON(newKey, d) } : { id, d };
    await reqP(tx(['photos'], 'readwrite').objectStore('photos').put(payload));
    done++;
  }
  photoCache.clear();
  return { done, failed };
}

export async function deletePhoto(id) {
  photoCache.delete(id);
  await reqP(tx(['photos'], 'readwrite').objectStore('photos').delete(id));
}

/**
 * <img> 에 사진을 채운다. 캐시에 있으면 같은 프레임에 넣어 깜박임을 없앤다.
 * @param {HTMLImageElement} img
 * @param {string} id
 * @param {() => void} [onMissing] 사진을 못 찾았을 때
 */
export function fillImage(img, id, onMissing) {
  const cached = getPhotoSync(id);
  if (cached) { img.src = cached; return; }
  getPhoto(id).then((d) => { if (d) img.src = d; else onMissing?.(); });
}

/**
 * 파일 → 리사이즈된 JPEG dataURL.
 * 1.4.2: 예전에는 원본 전체를 글자(dataURL)로 읽은 뒤 다시 그림으로 풀었다. 1천만 화소 사진이면
 * 메모리를 크게 써서 가끔 실패했다. 이제는 그림으로 바로 푼다(createImageBitmap, 사진 방향 반영).
 * 안 되면 파일 주소(objectURL)로, 그래도 안 되면 예전 방식으로 한 번 더 해 본다.
 */
export async function fileToDataUrl(file, max = 1600, quality = 0.82) {
  const draw = (src, w, h) => {
    const scale = Math.min(1, max / Math.max(w, h));
    const cw = Math.max(1, Math.round(w * scale)), ch = Math.max(1, Math.round(h * scale));
    const c = document.createElement('canvas');
    c.width = cw; c.height = ch;
    c.getContext('2d').drawImage(src, 0, 0, cw, ch);
    const out = c.toDataURL('image/jpeg', quality);
    c.width = c.height = 0;                       // 캔버스 메모리를 바로 돌려준다
    if (!out || out.length < 100) throw new Error('빈 그림');
    return out;
  };
  const loadImg = (url) => new Promise((res, rej) => {
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => rej(new Error('이미지를 읽지 못했습니다'));
    im.src = url;
  });
  if (window.createImageBitmap) {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      try { return draw(bmp, bmp.width, bmp.height); } finally { bmp.close?.(); }
    } catch { /* 다음 방법으로 */ }
  }
  const url = URL.createObjectURL(file);
  try {
    const im = await loadImg(url);
    return draw(im, im.naturalWidth, im.naturalHeight);
  } catch { /* 다음 방법으로 */ } finally { URL.revokeObjectURL(url); }
  const dataUrl = await new Promise((res, rej) => {
    const fr = new FileReader();
    fr.onerror = () => rej(fr.error || new Error('파일을 읽지 못했습니다'));
    fr.onload = () => res(fr.result);
    fr.readAsDataURL(file);
  });
  const im = await loadImg(dataUrl);
  return draw(im, im.naturalWidth, im.naturalHeight);
}

/* ── 백업 / 복원 ─────────────────────────────────── */
export async function exportJSON({ includePhotos = true } = {}) {
  /* 예시(둘러보기) 글은 백업에 넣지 않는다 (1.6.5). 복원하면 가짜 일기가 진짜처럼 섞인다 */
  const entries = all().filter((e) => !e.demo).map((e) => ({ ...e }));
  const photos = {};
  if (includePhotos) {
    for (const e of entries) for (const pid of e.photos || []) {
      const d = await getPhoto(pid);
      if (d) photos[pid] = d;
    }
  } else {
    for (const e of entries) { e.photos = []; delete e.photoLayout; delete e.collages; }
  }
  return {
    app: 'harukan', version: 1, exportedAt: new Date().toISOString(),
    settings, entries, photos,
  };
}

export async function importJSON(data, { mode = 'merge' } = {}) {
  if (!data || data.app !== 'harukan') throw new Error('하루칸 백업 파일이 아닙니다.');
  /* 원본(raw) 백업은 암호화된 레코드라 생김새가 다르다. 여기로 들어오면
     제목·본문이 빈 채로 다시 암호화돼서 전부 백지가 된다. 반드시 막는다. */
  if (data.kind === 'raw') throw new Error('원본 백업 파일입니다. 원본 되돌리기로 복원하세요.');
  if (data.kind === 'backup-enc') throw new Error('암호화된 백업입니다. 암호를 입력해 열어야 합니다.');
  if (mode === 'replace') {
    for (const e of all().slice()) await hardDelete(e.id);
  }
  /* 1.7.4: 사진은 실제로 들어갈 글의 것만 저장한다. 예전에는 같은 백업을 두 번 합치면
     글은 건너뛰어도 사진은 전부 다시 저장돼서, 어느 글에도 안 붙은 사진이 저장 공간을 차지했다 */
  const toAdd = (data.entries || []).filter((raw) => !(mode === 'merge' && byId(raw.id)));
  const skipped = (data.entries || []).length - toAdd.length;
  const idMap = {};
  for (const raw of toAdd) for (const pid of raw.photos || []) {
    const d = data.photos?.[pid];
    if (d && !idMap[pid]) idMap[pid] = await putPhoto(d);
  }
  let added = 0;
  for (const raw of toAdd) {
    const e = { ...newEntry(raw.date), ...raw };
    e.photos = (raw.photos || []).map((p) => idMap[p]).filter(Boolean);
    /* 사진 자리·크기(1.7.5)도 새 사진 id 로 옮긴다 */
    const lay = remapLayoutIds(raw.photoLayout, idMap);
    if (lay) e.photoLayout = lay; else delete e.photoLayout;
    await put(e);
    added++;
  }
  if (data.settings) await saveSettings({ ...data.settings, lastBackupAt: settings.lastBackupAt });
  await metaSet('lastImportAt', Date.now());
  return { added, skipped };
}

export function toMarkdown(entries) {
  const lines = ['# ' + t('하루칸 일기'), ''];
  const sorted = entries.slice().sort((a, b) => (a.date < b.date ? -1 : 1));
  for (const e of sorted) {
    lines.push(`## ${e.date}${e.title ? ' — ' + e.title : ''}`);
    const meta = [];
    if (e.mood) meta.push(`${t('{기분} 하루', { 기분: moodWord(e.mood) })} (${t('기분')} ${(e.mood.v * 50).toFixed(0)} · ${t('에너지')} ${(e.mood.e * 50).toFixed(0)})`);
    if (e.weather?.k) meta.push(e.weather.k.split('>').map((k) => t(WX_KINDS[k] || k)).join(' → ') + (e.weather.place ? ` (${e.weather.place})` : ''));
    if (e.chips?.length) meta.push(e.chips.map((c) => t(c)).join(', '));
    if (meta.length) lines.push(`> ${meta.join(' · ')}`);
    lines.push('', e.body || '', '');
    if (e.tags?.length) lines.push(e.tags.map((t) => '#' + t).join(' '), '');
    lines.push('---', '');
  }
  return lines.join('\n');
}

/* ── 원본 그대로 내보내기 / 되돌리기 ───────────────
   암호를 잊어 복호화가 불가능할 때 쓴다. 복호화하지 않고 레코드를
   있는 그대로 퍼낸다. 잠금 정보(salt·verifier)까지 담아야
   나중에 암호가 기억났을 때 되돌릴 수 있다.
   ------------------------------------------------ */
export async function exportRaw() {
  const t = tx(['entries', 'photos', 'meta', 'plans']);
  const entries = await reqP(t.objectStore('entries').getAll());
  const photos = await reqP(t.objectStore('photos').getAll());
  const meta = await reqP(t.objectStore('meta').getAll());
  const plans = await reqP(t.objectStore('plans').getAll());
  return {
    app: 'harukan', kind: 'raw', version: 1,
    exportedAt: new Date().toISOString(),
    encrypted: entries.some((e) => !!e.sec),
    entries, photos, meta, plans,
  };
}

export async function importRaw(data) {
  if (!data || data.app !== 'harukan' || data.kind !== 'raw') {
    throw new Error('하루칸 원본 백업 파일이 아닙니다.');
  }
  const t = tx(['entries', 'photos', 'meta', 'plans'], 'readwrite');
  for (const e of data.entries || []) await reqP(t.objectStore('entries').put(e));
  for (const p of data.photos || []) await reqP(t.objectStore('photos').put(p));
  for (const m of data.meta || []) await reqP(t.objectStore('meta').put(m));
  // 일정은 나중에 생긴 저장소라, 그 전에 만든 백업에는 없다
  for (const p of data.plans || []) await reqP(t.objectStore('plans').put(p));
  return { entries: (data.entries || []).length, photos: (data.photos || []).length };
}

/** 글·사진·일정·설정·잠금까지 전부 지운다 */
export async function wipeEverything() {
  const t = tx(['entries', 'photos', 'meta', 'plans'], 'readwrite');
  await reqP(t.objectStore('entries').clear());
  await reqP(t.objectStore('photos').clear());
  await reqP(t.objectStore('meta').clear());
  await reqP(t.objectStore('plans').clear());
  cache = [];
  photoCache.clear();
  cryptoKey = null;
  settings = { ...DEFAULT_SETTINGS };
  emit();
}

/* ── 저장소 사용량 ───────────────────────────────── */
export async function usage() {
  try {
    const est = await navigator.storage?.estimate?.();
    return est ? { used: est.usage, quota: est.quota } : null;
  } catch { return null; }
}
