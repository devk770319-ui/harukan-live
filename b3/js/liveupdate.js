/* ──────────────────────────────────────────────────────────────
   liveupdate.js — 내려받기 업데이트 (1.7.8, 사용자 요청 2026-10-25)

   화면·기능 스크립트·스티커 같은 앱 안 내용이 바뀌면 Play 업데이트 없이 내려받는다.
   (네이티브 코드·권한·결제는 Play 업데이트로만 — LiveUpdatePlugin.java 참고)

   흐름
    1. 켜질 때 ready() — "이 묶음은 제대로 떴다" (안 부르면 25초 뒤 앱에 든 묶음으로 되돌아간다)
    2. 받아 두고 아직 안 바꾼 새 묶음이 있으면 바로 바꾼다 (화면: '새로운 기능을 추가 중이에요' 100%)
    3. 서버의 manifest.json 을 본다 → 더 새 묶음이고 이 앱(네이티브)이 받을 수 있는 것이면
       켜진 지 얼마 안 됐고 쓰는 중이 아니면: 내려받기 화면(그림 + 진행 막대)을 띄우고 받은 뒤 바로 바꾼다
       그 밖에는: 조용히 받아 두고 다음에 켤 때 바꾼다 (쓰던 일기를 끊지 않는다)
    4. 인터넷이 없거나 서버가 답이 없으면 아무것도 안 한다 — 앱은 그대로 켜진다

   서버 (GitHub Pages)
     manifest.json  { build, minNative, path: "b3/", size }
     b3/live.json   { build, minNative, files: [{ p, h(sha256), s }] }
     b3/...         www 파일들
   만드는 도구: harukan-native/tools/live-build.mjs
   ────────────────────────────────────────────────────────────── */
import { t } from './i18n.js';
import * as analytics from './analytics.js';

export const MANIFEST_URL = 'https://devk770319-ui.github.io/harukan-live/manifest.json';
/* 내려받기 화면으로 받는 경우: 켜진 뒤 아직 아무것도 누르지 않았거나(느린 폰도) 켜진 지 4초 안.
   이미 뭔가 하고 있으면 끊지 않고 조용히 받아 둔다. 30초가 지나면 항상 조용히 */
const T0 = Date.now();
let touched = false;
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => { touched = true; }, { capture: true, passive: true, once: true });
function foregroundOk() {
  const age = Date.now() - T0;
  return age < 30000 && (!touched || age < 4000) && !busy();
}

function P() { return window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.LiveUpdate : null; }
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
  ov.querySelector('.live-size').textContent = total > 0 ? `${fmtMB(Math.min(done, total))} / ${fmtMB(total)}` : '';
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
export async function start() {
  const L = P();
  if (!L || running) return;
  running = true;
  try {
    try { await L.ready(); } catch {}
    const info = await L.info();
    if (info.rolledBack) analytics.design('live:rolledBack');

    /* 2. 받아 둔 새 묶음 → 지금 바꾼다 */
    if (info.staged > info.current && info.stagedPath && !busy()) {
      showOverlay(true);
      analytics.design('live:applyStaged');
      await new Promise((r) => setTimeout(r, 600));    // 화면이 한 번은 보이게
      await L.apply({ path: info.stagedPath });         // 웹뷰가 새 묶음으로 다시 열린다
      return;
    }

    /* 3. 서버 확인 */
    const url = manifestUrl();
    const base = url.slice(0, url.lastIndexOf('/') + 1);
    let m;
    try { m = (await fetchJson(url, 5000)).json; } catch { return; }      // 인터넷 없음 등 — 조용히
    const build = +m.build || 0;
    if (build <= Math.max(info.current, info.staged || 0)) return;
    if (info.rolledBack === `b${build}`) return;      // 이 묶음은 화면이 안 떠서 되돌렸다 — 고친 새 번호가 올 때까지 받지 않는다
    if ((+m.minNative || 0) > info.native) { analytics.design('live:needStore'); return; }   // 이 앱으로는 못 받는 묶음
    const dir = base + String(m.path || `b${build}/`).replace(/^\/+/, '');
    const live = await fetchJson(dir + 'live.json', 8000);
    if ((+live.json.build || 0) !== build) return;

    const fg = foregroundOk();
    if (fg) showOverlay(false);
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
      await L.apply({ path: res.path });
      analytics.design('live:applied');
    } else {
      hideOverlay();      // 다음에 켤 때 바꾼다
    }
  } catch (e) {
    console.warn('[live]', e);
    analytics.design('live:fail');
    hideOverlay();
  } finally {
    running = false;
  }
}

/** 설정·문의용: 지금 쓰는 내용 묶음 번호 */
export async function currentBuild() {
  try { return (await P()?.info())?.current || 0; } catch { return 0; }
}
