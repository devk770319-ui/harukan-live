/* ──────────────────────────────────────────────────────────────
   liveupdate.js — 내려받기 업데이트 (1.7.8, 사용자 요청 2026-10-25)

   화면·기능 스크립트·스티커 같은 앱 안 내용이 바뀌면 Play 업데이트 없이 내려받는다.
   (네이티브 코드·권한·결제는 Play 업데이트로만 — LiveUpdatePlugin.java 참고)

   흐름
    1. 켜질 때 ready() — "이 묶음은 제대로 떴다" (안 부르면 25초 뒤 앱에 든 묶음으로 되돌아간다)
    2. 받아 두고 아직 안 바꾼 새 묶음이 있으면 켜지는 순간 조용히 바꾼다 (안내 화면 없음, 2026-11-06)
    3. 서버의 manifest.json 을 본다 → 더 새 묶음이고 이 앱(네이티브)이 받을 수 있는 것이면
       새로 설치해 처음 켜고(체험 시작 전) 쓰는 중이 아니면: 내려받기 화면(그림 + 진행 막대)을 띄우고 받은 뒤 바로 바꾼다
       이미 쓰던 사람은: 조용히 받아 두고 다음에 켤 때 바꾼다 (2026-11-06 사용자 '받아 놨다가 다음에 켤 때, 신규 사용자는 다운로드')
       · '다음에 켤 때' = 앱을 새로 켜거나, 다른 앱에 30분 넘게 갔다 돌아올 때. 쓰는 도중(화면 옮김)에는 바꾸지 않는다
    4. 인터넷이 없거나 서버가 답이 없으면 아무것도 안 한다 — 앱은 그대로 켜진다

   서버 (GitHub Pages)
     manifest.json  { build, minNative, path: "b3/", size }
     b3/live.json   { build, minNative, files: [{ p, h(sha256), s }] }
     b3/...         www 파일들
   만드는 도구: harukan-native/tools/live-build.mjs
   ────────────────────────────────────────────────────────────── */
import { t } from './i18n.js';
import * as analytics from './analytics.js';
import * as store from './store.js';

export const MANIFEST_URL = 'https://devk770319-ui.github.io/harukan-live/manifest.json';
/* 내려받기 화면으로 받는 경우: 켜진 뒤 아직 아무것도 누르지 않았거나(느린 폰도) 켜진 지 4초 안.
   이미 뭔가 하고 있으면 끊지 않고 조용히 받아 둔다. 30초가 지나면 항상 조용히 */
const T0 = Date.now();
let touched = false;
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { touched = true; }, { capture: true, passive: true, once: true });
function foregroundOk() {
  const age = Date.now() - T0;
  /* 잠금 화면에서 지문 창을 이미 띄웠으면 덮지 않는다 — 조용히 받아 두고 다음에 켤 때 바꾼다 (2026-10-30) */
  return age < 30000 && (!touched || age < 4000) && !busy() && !window.__hkBioAsked;
}

function P() { return window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.LiveUpdate : null; }
/** 새로 설치해 처음 켠 사람 (체험 시작 시각이 아직 없다 — app.js syncTrial 이 첫 화면 전에 적는다) */
function isNewUser() { try { return !store.getSettings().trialStartedAt; } catch { return false; } }
export function available() { return !!P(); }

function manifestUrl() {
  try { return localStorage.getItem('hk.liveUrl') || MANIFEST_URL; } catch { return MANIFEST_URL; }
}

async function fetchJson(url, timeout = 6000) {
  const sep = url.includes('?') ? '&' : '?';
  const r = await P().fetchJson({ url: url + sep + 't=' + Date.now(), timeout });
  return { text: r.text, json: JSON.parse(r.text) };
}

/** 쓰는 중이면 화면을 덮지 않는다 */
function busy() {
  if (location.hash.startsWith('#/write')) return true;
  const sr = document.getElementById('sheetRoot');
  return !!(sr && sr.childElementCount);
}

/* ── 내려받기 화면 ─────────────────────────────── */
let ov = null;
function fmtMB(b) { return (b / 1048576).toFixed(b >= 10485760 ? 0 : 1) + 'MB'; }

function showOverlay(applying = false) {
  if (ov) return ov;
  decide();
  ov = document.createElement('div');
  ov.className = 'live-ov';
  ov.setAttribute('role', 'dialog');
  ov.setAttribute('aria-modal', 'true');
  ov.innerHTML = `
    <div class="live-in">
      <img class="live-art" src="img/live/loading.webp" alt="" draggable="false">
      <h2 class="live-title"></h2>
      <p class="live-sub"></p>
      <div class="live-bar" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></div>
      <div class="live-num"><span class="live-pct">0%</span><span class="live-size"></span></div>
    </div>`;
  ov.querySelector('.live-title').textContent = t('새로운 기능을 추가 중이에요');
  ov.querySelector('.live-sub').textContent = applying ? t('거의 다 됐어요. 곧 시작해요.') : t('잠시만 기다려 주세요. 다 받으면 바로 시작해요.');
  document.body.appendChild(ov);
  for (const id of ['app', 'lockscreen', 'sheetRoot']) document.getElementById(id)?.setAttribute('inert', '');
  requestAnimationFrame(() => ov?.classList.add('on'));
  if (applying) setProgress(1, 1);
  return ov;
}

function setProgress(done, total) {
  if (!ov) return;
  const f = total > 0 ? Math.min(1, done / total) : 0;
  const pct = Math.round(f * 100);
  ov.querySelector('.live-bar i').style.width = pct + '%';
  ov.querySelector('.live-bar').setAttribute('aria-valuenow', String(pct));
  ov.querySelector('.live-pct').textContent = pct + '%';
  ov.querySelector('.live-size').textContent = total > 1024 ? `${fmtMB(Math.min(done, total))} / ${fmtMB(total)}` : '';
}

function hideOverlay() {
  if (!ov) return;
  for (const id of ['app', 'lockscreen', 'sheetRoot']) document.getElementById(id)?.removeAttribute('inert');
  const o = ov; ov = null;
  o.classList.remove('on');
  setTimeout(() => o.remove(), 250);
}

/* ── 본체 ─────────────────────────────────────── */
let running = false;
/* 잠금 화면의 지문 창은 이 판단이 끝난 뒤에 띄운다 (2026-10-30 사용자 신고: 업데이트를 받는 동안 지문 창이 떠서 겹치고,
   받고 나서 다시 열리면 또 뜬다). 새 묶음으로 바꾸러 가면(apply) 끝내 풀지 않는다 — 다시 열린 앱이 한 번만 묻는다 */
let settle; const settledP = new Promise((r) => { settle = r; });
let decide; const decidedP = new Promise((r) => { decide = r; });
settledP.then(() => decide());
/** 다 끝났다 (새 묶음으로 바꾸러 가면 풀리지 않는다) */
export function settled() { return P() ? settledP : Promise.resolve(); }
/** 내려받기 화면을 띄울지 말지 정했다 */
export function decided() { return P() ? decidedP : Promise.resolve(); }
let applying = false;
let newUser = false;
/** opts.newUser: app.js 가 체험 시각을 적기 전에 본 값 (없으면 지금 설정으로 판단) */
export async function start(opts = {}) {
  newUser = typeof opts.newUser === 'boolean' ? opts.newUser : isNewUser();
  const L = P();
  if (!L) { settle(); return; }
  if (running) return;
  running = true; window.__hkLiveRunning = true;
  try {
    try { await L.ready(); } catch {}
    const info = await L.info();
    /* 되돌림 표시는 네이티브가 다음 되돌림이나 reset 까지 계속 들고 있다. 예전에는 켤 때마다 'live:rolledBack' 을 보내서
       어제 되돌린 사람(b59)이 오늘 켤 때마다 다시 세였다 (2026-11-07 광고분석: 10시 이후 84명 188회).
       → 새 표시일 때만, 어느 묶음을 되돌렸는지와 지금 묶음 번호를 붙여 한 번. 지금 돌고 있는 묶음은 하루 한 번 따로 알린다 */
    try {
      if (info.rolledBack && localStorage.getItem('hk.rbSeen') !== info.rolledBack) {
        localStorage.setItem('hk.rbSeen', info.rolledBack);
        analytics.design(`live:rolledBack:${info.rolledBack}:cur${info.current}`);
      }
      const dk = new Date().toDateString();
      if (localStorage.getItem('hk.curDay') !== dk) { localStorage.setItem('hk.curDay', dk); analytics.design(`live:cur:${info.current}:n${info.native || 0}`); }
    } catch { /* */ }

    /* 2. 받아 둔 새 묶음 → 지금 바꾼다 */
    const tapped = window.__hkTapAt && Date.now() - window.__hkTapAt < 15000;   // 알림을 눌러 막 들어왔으면 이번엔 안 바꾼다
    if (info.staged > info.current && info.stagedPath && !busy() && !tapped) {
      /* 조용히 (2026-11-06 사용자: '받아 놨다가 다음에 켤 때 적용') — 안내 화면 없이 켜지는 순간 바로 바꾼다 */
      analytics.design('live:applyStaged');
      applying = true;                                  // apply 가 돌아오기 전에 웹뷰가 닫힐 수 있다 — 먼저 적는다
      try { analytics.persist(); } catch { /* */ }
      await L.apply({ path: info.stagedPath });         // 웹뷰가 새 묶음으로 다시 열린다
      return;
    }

    if (info.staged > info.current && info.stagedPath) staged = { build: info.staged, path: info.stagedPath };   // 쓰는 중이라 못 바꾼 것 — 안전할 때 바꾼다

    /* 3. 서버 확인 */
    const t3 = await findNew(info);
    if (!t3) return;
    const { build, dir, live } = t3;

    /* 내려받기 화면은 새로 설치한 사람의 첫 실행에서만 (2026-11-06 사용자: '신규 사용자는 다운로드 받게').
       이미 쓰던 사람은 조용히 받아 두고 다음에 켤 때 바꾼다 */
    const fg = foregroundOk() && newUser;
    if (fg) showOverlay(false);
    else settle();       // 조용히 받아 두는 경우 — 잠금 화면은 기다릴 것 없다
    const sub = await L.addListener('progress', (e) => setProgress(e.done, e.total));
    analytics.design(fg ? 'live:download' : 'live:downloadBg');
    let res;
    try {
      res = await L.download({ base: dir, live: live.text });
    } finally {
      try { sub?.remove?.(); } catch {}
    }
    if (fg && !busy()) {
      setProgress(1, 1);
      await new Promise((r) => setTimeout(r, 400));
      applying = true;
      /* 기록을 먼저 적어 둔다 — apply 뒤에 보내면 웹뷰가 곧바로 다시 열려 자주 사라졌다 (2026-11-07 광고분석: 신규 download 91 중 applied 25) */
      analytics.design('live:applied');
      try { analytics.persist(); } catch { /* */ }
      await L.apply({ path: res.path });
    } else {
      staged = { build, path: res.path };   // 다음 안전한 때(훑어보는 화면으로 옮길 때·돌아올 때) 또는 다음에 켤 때 바꾼다
      hideOverlay();
    }
  } catch (e) {
    applying = false;
    console.warn('[live]', e);
    analytics.design('live:fail');
    hideOverlay();
  } finally {
    running = false; window.__hkLiveRunning = false;
    if (!applying) settle();
    armResume();
  }
}

/** 서버에 이 앱이 받을 수 있는 더 새 묶음이 있으면 { build, dir, live } (없거나 인터넷이 안 되면 null) */
async function findNew(info) {
  const url = manifestUrl();
  const base = url.slice(0, url.lastIndexOf('/') + 1);
  let m;
  try { m = (await fetchJson(url, 5000)).json; } catch { return null; }      // 인터넷 없음 등 — 조용히
  try { localStorage.setItem(K_CHECK, String(Date.now())); } catch { /* */ }
  const build = +m.build || 0;
  if (build <= Math.max(info.current, info.staged || 0, staged?.build || 0)) return null;
  if (info.rolledBack === `b${build}`) return null;      // 이 묶음은 화면이 안 떠서 되돌렸다 — 고친 새 번호가 올 때까지 받지 않는다
  if ((+m.minNative || 0) > info.native) { analytics.design('live:needStore'); return null; }   // 이 앱으로는 못 받는 묶음
  const dir = base + String(m.path || `b${build}/`).replace(/^\/+/, '');
  const live = await fetchJson(dir + 'live.json', 8000);
  if ((+live.json.build || 0) !== build) return null;
  return { build, dir, live };
}

/* ── 앱을 켜 둔 채로 쓰는 사람도 받게 (2026-11-05 사용자: '앱이 계속 실행돼 있으면 패치를 못 받잖아') ──
   안드로이드는 앱을 닫아도 뒤에 살아 있어 '새로 켜기'가 드물다.
   · 확인: 앱으로 돌아올 때·화면을 옮길 때 서버를 본다 (한 시간에 한 번, 인터넷 없으면 건너뜀) → 새 묶음은 조용히 받아 둔다
   · 바꾸기: 안전한 때만 — 다른 앱에 1분 넘게 갔다 돌아왔거나, 훑어보는 화면(홈·달력·발견·일정·설정·글 보기…)으로 옮길 때.
     쓰기·고치기·창·입력 중·결제 중·알람 화면·잠금 화면에서는 바꾸지 않는다. 바꾸면 앱이 다시 열린다(잠금을 쓰면 잠금 화면부터).
   · 바꾼 묶음은 새 화면이 ready() 를 불러야 확정 — 25초 안에 안 부르면 네이티브가 되돌린다 (예전 그대로) */
const K_CHECK = 'hk.liveCheckAt';
const CHECK_EVERY = 3600e3;
/* 다른 앱에 이만큼 넘게 가 있다 돌아오면 '다시 켠 것'으로 보고 받아 둔 묶음으로 바꾼다 (2026-11-06 사용자: 다음에 켤 때 적용 — 1분에서 30분으로) */
const AWAY_MIN = 30 * 60e3;
const SAFE_ROUTES = new Set(['home', 'calendar', 'insights', 'plans', 'settings', 'entry', 'habits', 'habit', 'notices', 'search', 'trash', 'map']);
let staged = null;            // { build, path } 받아 두고 아직 안 바꾼 묶음
let route = '';               // 마지막으로 다 그린 화면 (app.js doRoute 가 알려 줌)
let armed = false, hiddenAt = 0, bgRunning = false, applyFailed = 0;
const skipLogged = new Set();
function lastCheck() { try { return +localStorage.getItem(K_CHECK) || 0; } catch { return 0; } }

/** 지금 바꿔도 되는가 — 안 되면 그 이유 */
function hashRoute() { return ((location.hash || '#/home').slice(1).split('?')[0].split('/').filter(Boolean)[0]) || 'home'; }
export function unsafeReason({ lockOk = false } = {}) {
  const name = hashRoute();
  if (!SAFE_ROUTES.has(name) || (route && route !== name)) return 'route';   // 그리는 중(주소만 바뀜)이면 기다린다
  const sr = document.getElementById('sheetRoot');
  if (sr && sr.childElementCount) return 'sheet';
  if (document.querySelector('.tp-root, .ob-root, .alarm-root, .live-ov')) return 'overlay';
  const uw = document.getElementById('updateWall');
  if (uw && !uw.hidden) return 'overlay';
  const ls = document.getElementById('lockscreen');
  /* 앱 잠금을 쓰는 사람: 다시 열리면 비밀번호를 또 넣어야 한다 — 잠금 화면이 막 다시 걸렸을 때(돌아옴)만 바꾼다.
     그러면 다시 열린 앱의 잠금 화면 한 번만 보게 된다. 잠금을 푼 채로는 바꾸지 않는다 */
  if (ls && !ls.hidden) { if (!lockOk || [...ls.querySelectorAll('input')].some((i) => i.value)) return 'lock'; }
  else { try { if (store.hasCryptoKey()) return 'lockuser'; } catch { /* */ } }
  const ae = document.activeElement;
  if (ae && (ae.tagName === 'TEXTAREA' || ae.tagName === 'INPUT' || ae.isContentEditable)) return 'typing';
  try { const o = JSON.parse(localStorage.getItem('hk.ordering') || 'null'); if (o && Date.now() - o.at < 30 * 60000) return 'purchase'; } catch { /* */ }
  if (document.hidden) return 'hidden';
  return '';
}

async function tryApply(why, opt = {}) {
  const L = P();
  if (!L || !staged || applying || running || bgRunning) return false;
  if (applyFailed === staged.build) return false;      // 한 번 실패한 묶음은 이번 실행에서 다시 안 해 본다 (다음에 켤 때 다시)
  const r = unsafeReason(opt);
  if (r) {
    if (!skipLogged.has(r)) { skipLogged.add(r); analytics.design('live:apply_skipped:' + r); }
    return false;
  }
  /* 알림을 눌러 막 들어왔으면 바꾸지 않는다 — 바꾸면 웹뷰가 다시 열려 알림이 연 화면(일기 쓰기)과 기록이 사라진다 (2026-11-06) */
  if (window.__hkTapAt && Date.now() - window.__hkTapAt < 15000) { if (!skipLogged.has('tap')) { skipLogged.add('tap'); analytics.design('live:apply_skipped:tap'); } return false; }
  const s = staged;
  applying = true;
  try {
    try { analytics.persist(); } catch { /* */ }
    analytics.design('live:safe_apply:' + why);   // 안내 화면 없이 (2026-11-06)
    await L.apply({ path: s.path });                      // 웹뷰가 새 묶음으로 다시 열린다
    return true;
  } catch (e) {
    console.warn('[live] apply', e);
    applyFailed = s.build; applying = false;
    analytics.design('live:apply_fail');
    hideOverlay();
    return false;
  }
}

/** 한 시간에 한 번 서버를 보고, 새 묶음이면 조용히 받아 둔다 */
async function bgCheck(why) {
  const L = P();
  if (!L || running || bgRunning || applying) return;
  if (Date.now() - lastCheck() < CHECK_EVERY) return;
  if (navigator.onLine === false) return;
  bgRunning = true;
  try {
    analytics.design('live:resume_check');
    const info = await L.info();
    const n = await findNew(info);
    if (!n) return;
    const res = await L.download({ base: n.dir, live: n.live.text });
    staged = { build: n.build, path: res.path };
    analytics.design('live:resume_stage');
  } catch (e) {
    console.warn('[live] bg', e);
  } finally {
    bgRunning = false;
  }
  /* 받은 뒤 지금이 안전하면(훑어보는 화면에 가만히) 바로는 안 바꾼다 — 다음 이동·돌아옴에서 */
}

function armResume() {
  if (armed || !P()) return;
  armed = true;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { hiddenAt = Date.now(); return; }
    const away = hiddenAt ? Date.now() - hiddenAt : 0; hiddenAt = 0;
    /* 1분 넘게 다녀왔으면 바로 판단한다 — 잠금이 다시 걸렸으면 지문 창(0.35초 뒤)보다 먼저 덮어야 지문을 두 번 묻지 않는다.
       (잠금 다시 걸기는 app.js 의 같은 이벤트에서 먼저 돈다) */
    /* 잠금 화면이 다시 걸렸을 때만 바로 바꾼다(지문 창보다 먼저). 그 밖에는 알림 누름이 먼저 도착할 수 있게 조금 기다린다 (2026-11-06) */
    const lsNow = document.getElementById('lockscreen');
    if (staged && away >= AWAY_MIN && lsNow && !lsNow.hidden && !unsafeReason({ lockOk: true })) { tryApply('resume', { lockOk: true }); return; }
    setTimeout(async () => {
      if (staged && away >= AWAY_MIN) { if (await tryApply('resume')) return; }   // 이때는 지문 창이 떴을 수 있어 잠금 화면 위에서는 안 바꾼다
      bgCheck('resume');
    }, 1500);
  });
  window.__hkLiveRoute = (name) => {
    route = name || 'home';
    /* 쓰는 도중(화면을 옮길 때)에는 바꾸지 않는다 — 다음에 켤 때 (2026-11-06 사용자) */
    bgCheck('route');
  };
}

/** 시험용 */
export function _state() { return { staged, route, armed, applying, applyFailed, lastCheck: lastCheck() }; }

/** 설정·문의용: 지금 쓰는 내용 묶음 번호 */
export async function currentBuild() {
  try { return (await P()?.info())?.current || 0; } catch { return 0; }
}
