/* ===========================================================
   analytics.js — 익명 사용 통계 (GameAnalytics 수집 API, REST v2)

   부르는 쪽은 이것만 알면 된다:
       analytics.design('entry:new')
       analytics.design('trial:day', 12)          // 값이 있는 이벤트
       analytics.ad('banner', 'home', 'offer')    // 광고 4단계
       analytics.business('plus:remove_ads', amountCents, 'KRW')

   ── 무엇을 보내는가 (개인정보처리방침 3-3 과 같아야 한다) ──────────
   · 이 앱이 처음 켜질 때 무작위로 만든 설치 ID (localStorage). 광고 ID·기기 고유번호 없음
   · 기종·제조사·안드로이드 버전·앱 버전
   · 세션 시작·길이, 연 화면 이름(home·write…), 새 글·고쳐 쓰기, 붙인 사진·스티커 '개수',
     일정 추가, 체험 며칠째, 플러스 안내·구매 버튼, 배너 광고 요청·노출·클릭·실패
   · 일기·제목·사진·일정 내용, 태그, 글자 수, 날짜는 **절대 보내지 않는다.**
     새 이벤트를 붙일 때도 이 원칙을 지킨다 — 숫자는 '개수'만.

   ── 언제 보내는가 ────────────────────────────────────────────────
   · Play 에서 받은 정식 앱(app.harukan.diary)에서만. 하루칸 DEV(…​.dev)·PC·웹은 보내지 않는다
     (개발 중 사용이 재방문율을 오염시키지 않게). PC 시험은 FORCE 를 잠깐 true 로.
   · 뒤로 가는 순간(visibilitychange → hidden)에는 새 요청을 시작하지 않는다.
     못 보낸 이벤트는 localStorage 에 적어 두고 돌아오거나 다음 실행에 보낸다
     (트럭러시 1.0.8 교훈).
   · 사진 고르기·구글 결제창·광고 클릭으로 잠깐(GRACE_MS 이내) 나갔다 오면 같은 세션이다.
     그때마다 세션을 끊으면 '재방문'이 부풀려진다(트럭러시 1.0.13 교훈).

   네트워크가 없거나 서버가 거절해도 앱에는 아무 영향이 없다. 모든 공개 함수는 예외를 삼킨다.
   =========================================================== */

import { isNative } from './native.js';

const GAME_KEY = '036a3733597295c6f3173a7080461386';      // GA 게임 ID 355702 (Harukan)
const SECRET_KEY = '5755292c7b554b3b4abc372659f04d6a52e1b8e3';
const BASE_URL = 'https://api.gameanalytics.com/v2/';
const RELEASE_ID = 'app.harukan.diary';
/** PC 에서 전송을 시험할 때만 true. 출시 판은 반드시 false */
const FORCE = false;
const SDK_VERSION = 'rest api v2';
const FLUSH_MS = 20000;
const MAX_QUEUE = 500;
const GRACE_MS = 45000;

const K_UID = 'ga.uid';
const K_NUM = 'ga.snum';
const K_PENDING = 'ga.pending';
const K_PAUSED = 'ga.paused';
const K_DAY = 'ga.day';
const K_ONCE = 'ga.once';

let enabled = false;
let readyToSend = false;
let sending = false;
let hidden = false;
let userId = '';
let sessionId = '';
let sessionNum = 0;
let sessionStart = 0;
let tsOffset = 0;
let build = '0';
let dev = { os: 'android 0', manufacturer: 'unknown', device: 'unknown' };
let queue = [];
let inflight = [];
let timer = null;
let early = [];         // init 이 끝나기 전에 들어온 이벤트 (부팅 첫 화면 등)
let starting = null;
let last = { init: 0, events: 0, sent: 0 };   // 시험 확인용 마지막 응답 코드

/* ── 저장 ──────────────────────────────────────── */
function lsGet(k, d = null) { try { const v = localStorage.getItem(k); return v == null ? d : v; } catch { return d; } }
function lsSet(k, v) { try { localStorage.setItem(k, v); } catch { /* 가득 참 등 */ } }
function lsDel(k) { try { localStorage.removeItem(k); } catch { /* 무시 */ } }
function lsJSON(k, d) { try { return JSON.parse(lsGet(k, '') || 'null') ?? d; } catch { return d; } }

/* 파일(문자열)에서 다시 읽은 이벤트의 정수 칸이 실수로 바뀌면 GA 가 묶음 전체를 400 으로 거절한다.
   JSON.parse 는 2 를 2 로 돌려주지만, 혹시 섞여 들어온 소수(2.0000001 같은 것)를 정수로 되돌린다 */
const INT_FIELDS = ['v', 'client_ts', 'session_num', 'length', 'attempt_num', 'score', 'amount', 'transaction_num'];
function fixInts(ev) {
  for (const k of INT_FIELDS) if (typeof ev[k] === 'number') ev[k] = Math.round(ev[k]);
  return ev;
}

function savePending() {
  const all = [...inflight, ...queue].slice(-MAX_QUEUE);
  if (all.length) lsSet(K_PENDING, JSON.stringify(all)); else lsDel(K_PENDING);
}
function loadPending() {
  const arr = lsJSON(K_PENDING, []);
  lsDel(K_PENDING);
  if (Array.isArray(arr)) queue = arr.filter((e) => e && typeof e === 'object').map(fixInts).concat(queue);
}

/* ── 기기 정보 ─────────────────────────────────── */
function clean(s) { return String(s || '').trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_\-.]/g, '').slice(0, 64) || 'unknown'; }

const MAKERS = [
  [/^sm-|^gt-|^shv-|^galaxy/i, 'samsung'], [/^pixel/i, 'google'], [/^(lm-|lg-)/i, 'lge'],
  [/^(cph|rmx)/i, 'oppo'], [/^(m2|2\d{3}|redmi|mi |poco)/i, 'xiaomi'], [/^(v2|vivo)/i, 'vivo'],
  [/^(in20|kb20|le21|ne22|cph2|oneplus|gm19|hd19)/i, 'oneplus'], [/^moto|^xt\d/i, 'motorola'],
  [/^(sov|xq-|so-)/i, 'sony'],
];
async function readDevice() {
  let model = '', osv = '';
  try {
    const hi = await navigator.userAgentData?.getHighEntropyValues?.(['model', 'platformVersion']);
    if (hi) { model = hi.model || ''; osv = (hi.platformVersion || '').split('.')[0]; }
  } catch { /* 지원 안 함 */ }
  const ua = navigator.userAgent || '';
  const m = ua.match(/Android\s+([\d.]+)(?:;\s*([^;)]+?))?(?:\s+Build\/|\)|;)/i);
  if (m) { if (!osv) osv = m[1].split('.')[0]; if (!model && m[2] && m[2] !== 'K' && m[2] !== 'wv') model = m[2]; }
  const maker = (MAKERS.find(([re]) => re.test(model)) || [null, 'unknown'])[1];
  dev = { os: 'android ' + (osv || '0'), manufacturer: maker, device: clean(model || 'unknown') };
}

/* ── 서명 · 전송 ───────────────────────────────── */
let hmacKey = null;
async function sign(body) {
  if (!hmacKey) {
    hmacKey = await crypto.subtle.importKey('raw', new TextEncoder().encode(SECRET_KEY),
      { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  }
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', hmacKey, new TextEncoder().encode(body)));
  let s = '';
  for (const b of sig) s += String.fromCharCode(b);
  return btoa(s);
}

async function post(path, payload) {
  const body = JSON.stringify(payload);
  const res = await fetch(BASE_URL + GAME_KEY + path, {
    method: 'POST',
    headers: { Authorization: await sign(body), 'Content-Type': 'application/json' },
    body,
  });
  let data = null;
  try { data = await res.json(); } catch { /* 본문 없음 */ }
  return { status: res.status, data };
}

async function sendInit() {
  try {
    const r = await post('/init', { platform: 'android', os_version: dev.os, sdk_version: SDK_VERSION });
    last.init = r.status;
    if (r.status === 200 && r.data) {
      if (r.data.enabled === false) { enabled = false; queue = []; savePending(); return; }
      if (r.data.server_ts) tsOffset = Math.round(r.data.server_ts - Date.now() / 1000);
    }
  } catch { /* 그래도 보낸다 — 서버 시각 보정만 못 할 뿐 */ }
  readyToSend = true;
  flush();
}

async function flush() {
  if (!enabled || !readyToSend || sending || hidden || !queue.length) return;
  const batch = queue;
  queue = [];
  inflight = batch;
  sending = true;
  let status = 0;
  try { status = (await post('/events', batch)).status; } catch { status = 0; }
  last.events = status;
  if (status === 200) last.sent += batch.length;
  sending = false;
  inflight = [];
  // 네트워크 문제·5xx 는 다음에 다시. 400 은 형식 문제라 다시 보내도 같다 — 버린다
  if (status !== 200 && status !== 400) queue = batch.concat(queue).slice(-MAX_QUEUE);
  if (status === 400) console.warn('[analytics] 400 — 이벤트 형식 거절', batch.length);
  if (hidden) savePending();
}

/* ── 세션 ──────────────────────────────────────── */
function annotations() {
  return {
    v: 2,
    user_id: userId,
    client_ts: Math.round(Date.now() / 1000) + tsOffset,
    sdk_version: SDK_VERSION,
    os_version: dev.os,
    manufacturer: dev.manufacturer,
    device: dev.device,
    platform: 'android',
    session_id: sessionId,
    session_num: Math.max(sessionNum, 1),
    build,
  };
}

function push(ev) {
  if (!enabled) return;
  if (!sessionId && ev.category !== 'session_end') startSession();
  queue.push(fixInts({ ...annotations(), ...ev }));
  if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
}

function startSession() {
  if (sessionId) return;
  sessionId = crypto.randomUUID ? crypto.randomUUID() : uuid();
  sessionNum += 1;
  lsSet(K_NUM, String(sessionNum));
  sessionStart = Date.now();
  // 'user' 이벤트가 곧 세션 시작이다 — 재방문율이 여기서 계산된다
  queue.push(fixInts({ ...annotations(), category: 'user' }));
}

/** 끝난 세션의 session_end 를 만든다(보내지는 않는다) */
function endEvent(at = Date.now()) {
  if (!sessionId) return null;
  const length = Math.max(1, Math.round((at - sessionStart) / 1000));
  return fixInts({ ...annotations(), category: 'session_end', length });
}

function uuid() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map((x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/* 뒤로 갈 때: 네트워크는 건드리지 않고 '끝났을지도 모르는 세션'만 적어 둔다.
   GRACE_MS 안에 돌아오면 지우고 같은 세션을 이어 간다. */
function onHidden() {
  hidden = true;
  const end = endEvent();
  if (end) lsSet(K_PAUSED, JSON.stringify({ at: Date.now(), end }));
  savePending();
}
function onVisible() {
  hidden = false;
  const p = lsJSON(K_PAUSED, null);
  lsDel(K_PAUSED);
  if (p && Date.now() - p.at > GRACE_MS) {
    queue.push(fixInts(p.end));
    sessionId = '';
    startSession();
  }
  lsDel(K_PENDING);          // 메모리에 그대로 있다 — 다시 적은 것은 지운다
  flush();
}

/**
 * 하루에 한 번만 보낼 이벤트 (체험 며칠째, 어떤 등급으로 쓰는지).
 * app.js 가 체험·플러스 상태를 다 안 뒤(부팅 끝)와 앱으로 돌아올 때 부른다.
 * @param {() => Array<[string, number?]>} listFn
 */
export function daily(listFn) {
  if (!enabled) return;
  const d = new Date();
  const key = `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
  if (lsGet(K_DAY) === key) return;
  lsSet(K_DAY, key);
  try {
    for (const [id, value] of listFn() || []) design(id, value);
  } catch { /* 무시 */ }
}

/* ── 공개 API ──────────────────────────────────── */

/**
 * 부팅 때 한 번. 정식 앱이 아니면 아무것도 하지 않는다.
 * @param {{ existingUser?: boolean }} opts
 *   existingUser: 이미 글이 있는가 — 분석이 들어간 버전으로 업데이트한 기존 사용자 구분
 */
export function init(opts = {}) {
  if (starting) return starting;
  starting = (async () => {
    try {
      if (!(FORCE || isNative())) return;
      if (!window.crypto?.subtle || !window.fetch) return;
      let id = '';
      try {
        const info = await window.Capacitor?.Plugins?.App?.getInfo?.();
        id = info?.id || '';
        build = info?.version || build;
      } catch { /* 모름 */ }
      if (!FORCE && id !== RELEASE_ID) return;        // 하루칸 DEV 등은 보내지 않는다
      if (FORCE && build === '0') build = 'pc-test';
      enabled = true;
      await readDevice();
      userId = lsGet(K_UID, '');
      const firstRun = !userId;
      if (!userId) { userId = crypto.randomUUID ? crypto.randomUUID() : uuid(); lsSet(K_UID, userId); }
      sessionNum = parseInt(lsGet(K_NUM, '0'), 10) || 0;
      loadPending();
      // 지난번에 뒤로 간 채 꺼졌으면 그 세션의 끝을 지금 보낸다
      const p = lsJSON(K_PAUSED, null);
      lsDel(K_PAUSED);
      if (p?.end) queue.unshift(fixInts(p.end));
      startSession();
      if (firstRun) push({ category: 'design', event_id: opts.existingUser ? 'funnel:update_open' : 'funnel:first_open' });
      for (const ev of early) push(ev);
      early = [];
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'hidden') onHidden(); else onVisible();
      });
      timer = setInterval(flush, FLUSH_MS);
      sendInit();
    } catch (e) {
      enabled = false;
      console.warn('[analytics] 시작 실패', e);
    }
  })();
  return starting;
}

const ID_RE = /^[A-Za-z0-9 \-_.()!?]{1,64}(:[A-Za-z0-9 \-_.()!?]{1,64}){0,4}$/;

/** 자유 이벤트. 콜론으로 최대 5단계. value 는 숫자(개수·며칠째)만 */
export function design(eventId, value) {
  try {
    if (!ID_RE.test(eventId)) return;
    const ev = { category: 'design', event_id: eventId };
    if (typeof value === 'number' && Number.isFinite(value)) ev.value = value;
    if (!enabled) { if (early.length < 50) early.push(ev); return; }
    push(ev);
  } catch { /* 무시 */ }
}

/** 한 설치에서 딱 한 번만 (첫 글, 첫 사진 같은 첫 실행 흐름) */
export function once(eventId) {
  try {
    const done = lsJSON(K_ONCE, {});
    if (done[eventId]) return;
    if (!enabled && !(FORCE || isNative())) return;
    done[eventId] = 1;
    lsSet(K_ONCE, JSON.stringify(done));
    design(eventId);
  } catch { /* 무시 */ }
}

/** 광고 4단계 — ad:<kind>:<place>:<offer|click|done|fail> */
export function ad(kind, place, step) {
  design(`ad:${kind}:${String(place || 'none').replace(/[^A-Za-z0-9_]/g, '_')}:${step}`);
}

/** 결제 성공. amount 는 가장 작은 단위가 아니라 GA 규칙대로 '센트'(가격×100) */
export function business(itemId, amount, currency, cartType = 'plus') {
  try {
    if (!enabled || !/^[A-Z]{3}$/.test(currency || '') || !(amount > 0)) return;
    const n = (parseInt(lsGet('ga.txn', '0'), 10) || 0) + 1;
    lsSet('ga.txn', String(n));
    push({ category: 'business', event_id: `${cartType}:${itemId}`, amount: Math.round(amount), currency, transaction_num: n, cart_type: cartType });
  } catch { /* 무시 */ }
}

/** 시험용: 지금 켜져 있는가 */
export function isOn() { return enabled; }
/** 시험용: 마지막 응답 코드와 보낸 개수, 대기 중인 개수 */
export function stats() { return { on: enabled, ...last, queued: queue.length }; }
