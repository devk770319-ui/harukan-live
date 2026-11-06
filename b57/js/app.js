/* ===========================================================
   app.js — 부팅 · 라우팅 · 테마 · 잠금
   =========================================================== */

import * as store from './store.js';
import * as native from './native.js';
import * as ads from './ads.js';
import * as billing from './billing.js';
import * as plus from './plus.js';
import * as dualsub from './dualsub.js';   // 평생 구매 뒤 월 이용권 해지 안내 (2026-11-04)
import * as campaign from './campaign.js'; // 새 기능 안내 그림 알림 (1.8.1)
import * as i18n from './i18n.js';
import * as stickers from './stickers.js';
import * as analytics from './analytics.js';
import * as theme from './theme.js';
import { t } from './i18n.js';
import { $, $$, el, icon, esc, toast, closeSheet, closeTimePicker, todayKey, fmtDate,
         buildKeypad, setDots, PIN_LEN } from './ui.js';
import { deriveKey, checkVerifier, b64, randomBytes, ITER, ITER_LEGACY } from './crypto.js';

import * as HomeView from './views/home.js';
import * as WriteView from './views/write.js';
import * as CalendarView from './views/calendar.js';
import * as SearchView from './views/search.js';
import * as InsightsView from './views/insights.js';
import * as SettingsView from './views/settings.js';
import * as EntryView from './views/entry.js';
import * as TrashView from './views/trash.js';
import * as PasscodeView from './views/passcode.js';
import * as PlansView from './views/plans.js';
import * as HabitsView from './views/habits.js';
import * as DecorView from './views/decor.js';
import * as PlusView from './views/plusview.js';
import * as PdfView from './views/pdfexport.js';
import * as NoticesView from './views/notices.js';
import * as MapView from './views/map.js';
import * as FeedbackView from './views/feedback.js';
import * as BackupView from './views/backup.js';
import * as notices from './notices.js';
import * as caret from './caret.js';
import * as guide from './guide.js';
import * as permsetup from './permsetup.js';
import * as NB from './newbadge.js';
import * as ALARM from './alarmscreen.js';
import * as tabicons from './tabicons.js';
import * as LetterView from './views/letter.js';   // 친구에게 편지 보내기 (2026-11-03)

const ROUTES = {
  home: HomeView, write: WriteView, calendar: CalendarView, search: SearchView,
  insights: InsightsView, settings: SettingsView, entry: EntryView, trash: TrashView,
  passcode: PasscodeView, plans: PlansView, decor: DecorView, plus: PlusView, pdf: PdfView, notices: NoticesView,
  feedback: FeedbackView, map: MapView, backup: BackupView,   // 백업·복원 (2026-11-05)
  habits: HabitsView, habit: HabitsView.Detail, 'habit-edit': HabitsView.Edit,   // 습관 (2026-10-30)
  letter: LetterView, letters: LetterView.Box,   // 편지 (2026-11-03)
};

let current = null;              // { name, view, params }
let booted = false;

/* ── 테마 ───────────────────────────────────────── */
const mq = window.matchMedia('(prefers-color-scheme: dark)');
export function applyTheme() {
  const s = store.getSettings();
  /* 별밤 배경은 그림 자체가 밤이라 늘 어둡게 그린다 (theme.js) */
  const dark = theme.forcesDark() || s.theme === 'dark' || (s.theme === 'auto' && mq.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
  document.documentElement.dataset.font = s.font;
  document.documentElement.style.setProperty('--fs', s.fontSize + 'px');
  import('./fonts.js').then((f) => f.apply()).catch(() => {});      // 일기 글씨체 (1.7.6)
  /* 배경 꾸미기 (1.5.0, 플러스). 내 사진은 복호화가 비동기라 기다리지 않는다 */
  theme.apply(dark).catch((e) => console.error('배경을 그리지 못했어요', e))
    /* 아래 탭 아이콘 모양(2026-11-04) — 배경이 정한 강조색을 읽어 색을 맞추므로 배경 다음에 */
    .then(() => tabicons.apply()).catch(() => {});
}
mq.addEventListener('change', () => { if (store.getSettings().theme === 'auto') applyTheme(); });

/* ── 라우팅 ─────────────────────────────────────── */
/* ── 화면 이동과 뒤로가기 (1.4.2) ──────────────────
   예전에는 탭을 옮길 때마다, 달력의 달을 넘길 때마다 기록이 쌓여서 뒤로가기가
   지나온 화면을 하나하나 되짚었다(사용자 신고). 이제는
   · 아래 탭(홈·달력·일정·발견·설정)과 검색은 '맨 위 화면'이다. 서로 옮겨도 기록이 쌓이지 않고,
     거기서 뒤로가기를 누르면 곧장 홈으로 간다. 홈에서 누르면 앱을 나간다.
   · 글 보기·쓰기·휴지통 같은 안쪽 화면은 뒤로가기로 들어온 화면에 한 칸씩 돌아간다.
   깊이는 history.state.d 에 적는다(0 = 맨 위 화면). */
const TOP = new Set(['home', 'calendar', 'plans', 'insights', 'settings', 'search']);
function depth() { return history.state?.d | 0; }

export function go(hash, { replace = false } = {}) {
  const h = '#' + hash.replace(/^#/, '');
  const name = (h.slice(2).split(/[/?]/)[0]) || 'home';
  if (TOP.has(name)) {
    // 맨 위 화면끼리는 바꿔 끼운다. 안쪽 화면에서 맨 위로 가면 기록을 처음으로 되돌린다
    history.replaceState({ d: 0 }, '', h);
  } else if (replace) {
    history.replaceState({ d: depth() }, '', h);
  } else {
    history.pushState({ d: depth() + 1 }, '', h);
  }
  /* 바로 그리지 않고 한 박자 뒤에 그린다. 화면을 그리는 도중에 다른 화면으로 보내는 경우
     (없는 글 → 홈 등) 그리던 것이 끝난 다음에 새 화면이 그려져야 한다 */
  setTimeout(route, 0);
}

/** 뒤로가기 (화면 왼쪽 위 ← 와 안드로이드 뒤로가기 버튼이 같이 쓴다) */
export async function back() {
  if (current?.view?.beforeLeave && !(await current.view.beforeLeave())) return;   // 쓰는 중이면 저장할지 묻는다
  const { name } = parseHash();
  if (depth() > 0) { history.back(); return; }
  if (name !== 'home') go('/home');
}

function parseHash() {
  const h = (location.hash || '#/home').slice(1);
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean);
  const name = parts[0] || 'home';
  const params = Object.fromEntries(new URLSearchParams(qs || ''));
  if (parts[1]) params.id = decodeURIComponent(parts[1]);
  return { name, params };
}

/* 화면 그리기는 한 번에 하나씩. 앞의 것이 끝나야 다음 것을 그린다 */
let routeQ = Promise.resolve();
function route() {
  routeQ = routeQ.then(doRoute, doRoute);
  return routeQ;
}
async function doRoute() {
  if (!booted) return;
  /* 다른 화면으로 옮기면 배경음악을 멈춘다 (2026-10-31 사용자 신고: 음악이 나오는 일기에서 + 로 쓰기에 들어가도 계속 나왔다).
     bgm.js 는 hashchange 에서 멈추는데, 앱 안 이동(go → pushState)은 hashchange 를 내지 않는다. 같은 화면을 다시 그릴 때는 두고 간다 */
  if (routedHash && routedHash !== location.hash) {
    import('./bgm.js').then((B) => B.stop()).catch(() => {});
    import('./songcard.js').then((S) => S.stopPreview()).catch(() => {});   // 노래 30초 미리 듣기도
  }
  routedHash = location.hash;
  closeSheet();
  try { window.__hkPhotoViewClose?.(); } catch { /* */ }   // 사진 크게 보기는 화면을 옮기면 닫는다
  const { name, params } = parseHash();
  const view = ROUTES[name] || ROUTES.home;

  // 이전 화면 정리 (쓰기 화면은 저장 플러시가 필요하다)
  if (current?.view?.teardown) { try { await current.view.teardown(); } catch (e) { console.error(e); } }

  const root = $('#view');
  root.innerHTML = '';
  window.scrollTo(0, 0);

  // 화면마다 강조 색조가 바뀐다 (css 의 html[data-area="…"] 블록).
  // 정의되지 않은 이름은 기본값(주황 = --accent)으로 떨어진다.
  document.documentElement.dataset.area = name;

  const chrome = (await view.render(root, params)) || {};
  current = { name, view, params };
  applyChrome(name, chrome);
  updateTabs(name);
  ads.onRoute(name);         // 홈·달력·발견에서만 배너가 뜬다
  try { window.__hkLiveRoute?.(ROUTES[name] ? name : 'home'); } catch { /* */ }   // 켜 둔 채 쓰는 사람도 패치를 받게 — 안전한 화면이면 받아 둔 묶음으로 바꾼다 (2026-11-05)
  analytics.design('screen:' + (ROUTES[name] ? name : 'home'));
  $('#topbar').classList.toggle('scrolled', false);
}

/** 화면 안에서 단계가 바뀔 때(편지 쓰기 → 보내기) 위쪽 줄만 바꾼다 */
export function setChrome(c) { applyChrome(current?.name || '', c || {}); }
function applyChrome(name, c) {
  $('#topTitle').textContent = c.title ?? t('하루칸');
  const left = $('#topLeft');
  left.innerHTML = '';
  left.className = 'icon-btn';
  left.onclick = null;
  if (c.left) {
    left.innerHTML = c.left.text ? c.left.text : icon(c.left.icon || 'back');
    if (c.left.text) left.classList.add('txt');
    left.setAttribute('aria-label', c.left.label || t('뒤로'));
    left.onclick = c.left.onClick || back;
  } else {
    left.classList.add('empty');
  }
  const right = $('#topRight');
  right.innerHTML = '';
  for (const a of c.right || []) {
    const b = el('button', { class: 'icon-btn' + (a.text ? ' txt' : ''), type: 'button', 'aria-label': a.label || '' });
    b.innerHTML = a.text ? a.text : icon(a.icon);
    // 화면 쪽에서 상태를 바꿔 끼울 수 있게 표식을 붙여둔다 (예: 보관 버튼의 켜짐/꺼짐)
    for (const [k, v] of Object.entries(a.data || {})) b.dataset[k] = v;
    if (a.build) a.build(b);
    b.addEventListener('click', a.onClick);
    right.append(b);
  }
  document.title = (c.title && c.title !== t('하루칸')) ? `${c.title} · ${t('하루칸')}` : t('하루칸 — 하루 한 칸');
}

function updateTabs(name) {
  const tabName = /^habit/.test(name) ? 'plans' : name;     // 습관은 일정 탭 아래에 있다
  for (const t of $$('.tab[data-tab]')) t.classList.toggle('on', t.dataset.tab === tabName);
  $('#tabbar').hidden = (name === 'write' || name === 'letter');   // 편지 쓰기도 아래 도구 줄을 쓴다
  NB.paintTabs();           // 아직 안 써 본 새 기능이 있는 탭에 NEW (1.7.8)
}

/* 뒤로가기(history.back)·주소의 # 이 바뀌면 화면을 다시 그린다. 같은 주소로 돌아온 경우에도
   popstate 는 오므로 그쪽을 쓰고, 이미 그린 주소에 대한 hashchange 는 건너뛴다 */
let routedHash = null;
window.addEventListener('popstate', () => route());
window.addEventListener('hashchange', () => { if (location.hash !== routedHash) route(); });

/* 스크롤 시 상단 구분선 */
window.addEventListener('scroll', () => {
  $('#topbar')?.classList.toggle('scrolled', window.scrollY > 4);
}, { passive: true });

/* ── 잠금 ───────────────────────────────────────── */
async function lockConfig() { return store.metaGet('lock', null); }

export async function enableLock(passphrase) {
  const prevCfg = await lockConfig();      // 비밀번호를 바꾸는 중이면 복구 코드 정보를 이어받는다
  const salt = b64(randomBytes(16));
  const key = await deriveKey(passphrase, salt, ITER);
  const { makeVerifier } = await import('./crypto.js');
  const verifier = await makeVerifier(key);
  // 기존 글과 일정을 전부 다시 저장하면서 암호화한다.
  // 일정은 열쇠를 걸기 전에 (아직 평문일 때) 읽어둔다.
  const plans = await import('./plans.js');
  const planList = await plans.loadAll();
  // 배경으로 고른 내 사진도 같은 열쇠로 다시 싼다 (바꾸기 전 열쇠로 먼저 읽어둔다)
  const bgPhoto = await theme.getPhoto();
  const habitList = await habitsBeforeRekey();   // 습관도 새 열쇠로 (2026-10-30)
  const oldKey = store._key();     // 비밀번호를 바꾸는 중이면 지금 열쇠, 처음 켜는 중이면 null
  store.setCryptoKey(key);
  for (const e of store.all().slice()) await store.put(e);
  await plans.rewriteAll(planList);
  // 일기 사진도 새 열쇠로 (1.5.0 수정 — 예전엔 사진만 빠져 있었다)
  await store.rekeyPhotos(oldKey, key);
  if (bgPhoto) await theme.savePhoto(bgPhoto);
  await habitsAfterRekey(habitList);
  // 반복 횟수를 같이 적어둔다 — 나중에 값을 올려도 예전 잠금이 열린다
  const next = { salt, verifier, iter: ITER };
  /* 복구 코드가 있으면 새 비밀번호를 공개키로 다시 잠가 둔다 — 같은 코드를 계속 쓴다 (2026-10-30) */
  if (prevCfg?.rec) {
    try { const { recoveryRewrap } = await import('./crypto.js'); next.rec = await recoveryRewrap(prevCfg.rec, passphrase); }
    catch (e) { console.error('복구 코드 다시 잠그기', e); }
  }
  await store.metaSet('lock', next);
  await store.metaSet('pinFails', 0);
  await store.metaSet('pinLockUntil', 0);

  // 비밀번호가 바뀌면 보안 저장소에 넣어둔 옛 비밀번호는 못 쓴다 — 반드시 폐기한다.
  // 다만 쓰고 계셨다면 조용히 꺼버리지 않고, 새 비밀번호로 다시 등록해 준다.
  // (예전엔 그냥 껐다. 비밀번호를 바꾸면 지문이 사라진 것처럼 보였다.)
  const hadBio = await store.metaGet('bio', false);
  await native.bioForget();
  await store.metaSet('bio', false);
  if (hadBio && (await native.bioAvailable()).ok) {
    try {
      await native.bioEnroll(passphrase);
      await store.metaSet('bio', true);
    } catch { /* 사용자가 취소하면 그냥 꺼진 채로 둔다 */ }
  }
}

export async function disableLock() {
  // 잠금을 끄기 전에 일정을 먼저 읽어둔다 — 열쇠를 버린 뒤에는 못 읽는다
  const plans = await import('./plans.js');
  const planList = await plans.loadAll();
  const bgPhoto = await theme.getPhoto();
  const habitList = await habitsBeforeRekey();
  const oldKey = store._key();
  store.setCryptoKey(null);
  for (const e of store.all().slice()) await store.put(e);
  await plans.rewriteAll(planList);
  // 일기 사진을 풀어서 두지 않으면, 열쇠를 버린 뒤에는 영영 못 연다 (1.5.0 수정)
  await store.rekeyPhotos(oldKey, null);
  if (bgPhoto) await theme.savePhoto(bgPhoto);
  await habitsAfterRekey(habitList);
  await store.metaDel('lock');
}

/* index.html 에 박혀 있는 고정 문구들 — 언어가 정해진 뒤 채운다 */
function applyStaticText() {
  $('#lockSub').textContent = t('숫자 네 자리를 넣어주세요');
  $('#lockForgot').textContent = t('비밀번호를 잊으셨나요?');
  const hint = document.querySelector('.lock-hint');
  if (hint) hint.textContent = t('일기는 이 기기 안에만 있어요.');
  for (const [k, v] of Object.entries({ home: '홈', calendar: '달력', plans: '알림', insights: '발견', settings: '설정' })) {
    const lab = document.querySelector(`.tab[data-tab="${k}"] .tab-label`);
    if (lab) lab.textContent = t(v);
  }
  $('#tabWrite')?.setAttribute('aria-label', t('오늘 쓰기'));
  $('#tabbar')?.setAttribute('aria-label', t('주요 메뉴'));
  $('#pinDots')?.setAttribute('aria-label', t('입력한 자리 수'));
}

/* 설정에서 언어를 바꾸면 부른다 — 저장은 설정 화면이 하고, 여기선 적용만 */
export async function applyLanguage(setting) {
  await i18n.apply(setting);
  applyStaticText();
  import('./fonts.js').then((f) => f.apply()).catch(() => {});      // 언어가 바뀌면 그 언어 글꼴로
  import('./stickers.js').then((m) => m.prepareCaptions(true)).catch(() => {});   // 위로 스티커 문구도 새 언어로
  if (booted) await route();
}

function showLock(sub) {
  ads.onLock(true);          // 잠금 화면에는 광고를 두지 않는다
  const ls = $('#lockscreen');
  ls.hidden = false;
  $('#app').hidden = true;
  if (sub) $('#lockSub').textContent = sub;
  const pad = $('#keypad');
  if (!pad.children.length) pad.append(...buildKeypad(pinKey).childNodes);
  pinReset();
  tickWait();
  setupBiometric();
}

/* ── 지문으로 열기 ─────────────────────────────── */
async function unlockWithKey(key) {
  store.setCryptoKey(key);
  /* 다른 앱에 갔다 와서 다시 잠갔던 것을 여는 길 (2026-11-01) — 부팅은 다시 하지 않는다.
     보던 화면(쓰던 글 포함)이 그대로 남아 있으므로 그 화면 그대로 보여준다. '지금 잠그기'는 홈으로 */
  if (booted) {
    $('#lockErr').textContent = '';
    $('#lockscreen').hidden = true;
    $('#app').hidden = false;
    ads.onLock(false);
    if (!relockKeepView) { try { await store.loadAll(); } catch (e) { console.error(e); } await route(); }
    relockKeepView = false;
    /* 잠긴 동안 홈 화면 위젯에서 누른 습관 체크를 이제 넣는다 (1.8.4) */
    import('./widget.js').then((W) => W.applyActions().then(() => W.sync(300))).catch(() => {});
    return;
  }
  await store.loadAll();
  $('#lockErr').textContent = '';
  $('#lockscreen').hidden = true;
  $('#app').hidden = false;
  await finishBoot();
}

let bioBroken = false;     // 지문 사본이 깨진 걸 알아챘다 → 비밀번호로 열면 다시 저장 (1.7.5)

async function attemptBiometric(auto = false) {
  const cfg = await lockConfig();
  if (!cfg) return;
  const r = await native.bioUnlockEx();
  if (r.why === 'broken') {
    /* 지문은 맞았는데 비밀번호 사본을 못 꺼냈다 — 앱을 다시 깔아 자동 백업으로 사본만 돌아온 경우.
       예전엔 아무 말 없이 비밀번호 칸으로 돌아가 '지문이 안 된다'고 느꼈다. 이번에 비밀번호로 열면 다시 맞춘다 */
    bioBroken = true;
    $('#lockErr').textContent = t('지문 정보를 다시 맞춰야 해요. 이번 한 번만 비밀번호로 열면 다음부터 지문으로 열려요.');
    analytics.design('bio:broken');
    return;
  }
  const pass = r.pass;
  if (!pass) return;                       // 취소·실패 → 비밀번호 입력으로
  /* ⚠ 비밀번호를 저장할 때의 반복 횟수(cfg.iter)로 열어야 한다 (1.7.0 수정, 사용자 신고 '지문 로그인이 안 돼').
     예전엔 지문 경로만 기본값(옛 25만 회)으로 열어서, 강화된 잠금(60만 회)을 쓰는 사람은
     매번 '비밀번호가 다르다'로 판정돼 지문 열기가 저절로 꺼졌다. 숫자 입력 경로(pinKey)와 같게 맞춘다. */
  const key = await deriveKey(pass, cfg.salt, cfg.iter || ITER_LEGACY);
  if (!(await checkVerifier(key, cfg.verifier))) {
    // 비밀번호를 바꾼 뒤 지문 정보가 옛것으로 남은 경우
    $('#lockErr').textContent = t('지문에 저장된 비밀번호가 지금 것과 달라요. 비밀번호로 열어주세요.');
    await native.bioForget();
    await store.metaSet('bio', false);
    $('#lockBio').hidden = true;
    return;
  }
  await unlockWithKey(key);
}

async function setupBiometric() {
  const btn = $('#lockBio');
  if (!btn) return;
  btn.hidden = true;
  if (!native.isNative()) return;
  if (!(await store.metaGet('bio', false))) return;
  if (!(await native.bioAvailable()).ok) return;

  btn.innerHTML = icon('finger') + `<span>${t('지문으로 열기')}</span>`;
  btn.hidden = false;
  btn.onclick = () => attemptBiometric();
  // 잠금 화면에 들어오면 한 번은 알아서 물어본다 — 업데이트가 다 끝난 뒤에 (autoBiometric)
  autoBiometric();
}

/* 2026-10-30 사용자 신고: 업데이트를 받는 동안 지문 창이 뜨고, 받고 나서 앱이 다시 열리면 또 떴다.
   내려받기 업데이트(liveupdate)와 Play 업데이트 확인이 끝날 때까지 기다렸다가, 잠금 화면이 그대로 보이고
   업데이트 안내·내려받기 화면이 없을 때만 한 번 묻는다. 지문 버튼은 그동안에도 직접 누를 수 있다 */
let bootGate = null;
let liveSettled = Promise.resolve();
let autoBioRunning = false;
async function autoBiometric() {
  if (autoBioRunning) return;
  autoBioRunning = true;
  try {
    /* 평소엔 서버 확인이 금방 끝난다. 2026-10-31 재신고(패치 13을 받는 동안 또 지문 창): 느린 망에서 2.5초가 먼저 지나
       지문 창이 뜬 사례로 보고, 서버 확인(최대 5+8초)이 끝날 때까지 14초까지 기다린다. 그동안 지문 버튼은 직접 누를 수 있다 */
    if (bootGate) await Promise.race([bootGate, new Promise((r) => setTimeout(r, 14000))]);
    await new Promise((r) => setTimeout(r, 350));
    /* 내려받기 화면이 떠 있으면 끝날 때까지 — 새 묶음으로 바꾸면 앱이 다시 열리고 거기서 한 번만 묻는다 */
    if (document.querySelector('.live-ov')) { await liveSettled; await new Promise((r) => setTimeout(r, 400)); }
    if ($('#lockscreen').hidden || updateWallUp() || document.querySelector('.live-ov') || document.hidden) return;
    window.__hkBioAsked = true;
    if (window.__hkLiveRunning) analytics.design('bio:auto:liveRunning');   // 받는 중에 물었다 (원인 추적용)
    attemptBiometric(true);
  } finally { autoBioRunning = false; }
}

/* ── 숫자 잠금 입력 ────────────────────────────── */
let pin = '';
let verifying = false;
let waitTimer = null;

function pinReset() { pin = ''; setDots($('#pinDots'), 0); }

function setKeysEnabled(on) {
  for (const k of $$('#keypad .key')) k.disabled = !on;
}

/** 대기 시간이 남아 있으면 키를 잠그고 남은 초를 보여준다 */
async function tickWait() {
  clearTimeout(waitTimer);
  const until = await store.metaGet('pinLockUntil', 0);
  const left = Math.ceil((until - Date.now()) / 1000);
  if (left <= 0) { setKeysEnabled(true); $('#lockErr').textContent = ''; return false; }
  setKeysEnabled(false);
  $('#lockErr').textContent = t('너무 여러 번 틀렸어요. {n}초 뒤에 다시 시도할 수 있어요.', { n: left });
  waitTimer = setTimeout(tickWait, 1000);
  return true;
}

async function pinKey(k) {
  if (verifying) return;
  if (await tickWait()) return;
  const errEl = $('#lockErr');
  if (k === 'back') { pin = pin.slice(0, -1); setDots($('#pinDots'), pin.length); errEl.textContent = ''; return; }
  if (pin.length >= PIN_LEN) return;
  pin += k;
  errEl.textContent = '';
  setDots($('#pinDots'), pin.length);
  if (pin.length === PIN_LEN) await verifyPin();
}

async function verifyPin() {
  const cfg = await lockConfig();
  const errEl = $('#lockErr');
  verifying = true;
  errEl.textContent = t('확인 중…');
  const key = await deriveKey(pin, cfg.salt, cfg.iter || ITER_LEGACY);
  const ok = await checkVerifier(key, cfg.verifier);
  verifying = false;

  if (!ok) {
    const fails = (await store.metaGet('pinFails', 0)) + 1;
    await store.metaSet('pinFails', fails);
    setDots($('#pinDots'), PIN_LEN, { shake: true });
    if (fails >= 5) {
      // 5번째부터 기다리게 한다: 5초 → 10 → 20 → 40 … 최대 5분
      const wait = Math.min(300, 5 * Math.pow(2, fails - 5));
      await store.metaSet('pinLockUntil', Date.now() + wait * 1000);
      setTimeout(() => { pinReset(); tickWait(); }, 420);
    } else {
      errEl.textContent = fails >= 3 ? t('비밀번호가 맞지 않아요. ({n}번째)', { n: fails }) : t('비밀번호가 맞지 않아요.');
      setTimeout(pinReset, 420);
    }
    return;
  }

  await store.metaSet('pinFails', 0);
  await store.metaSet('pinLockUntil', 0);
  const typed = pin;
  pinReset();
  await unlockWithKey(key);
  if (bioBroken) repairBio(typed); else offerBioAgain(typed).then(() => offerRecoveryOnce(typed));
}

/** 깨진 지문 사본을 방금 맞게 넣은 비밀번호로 다시 저장한다 (지문 창을 다시 띄우지 않는다) */
async function repairBio(pass) {
  bioBroken = false;
  try {
    await native.bioForget();
    await native.bioSave(pass);
    await store.metaSet('bio', true);
    analytics.design('bio:repaired');
    toast(t('다음부터 다시 지문으로 열 수 있어요.'));
  } catch (e) { console.error('지문 다시 맞추기', e); analytics.design('bio:repair_fail'); }
}

/* 지문 열기 다시 켜기 권유 (1.7.0, 한 번만).
   1.6.9 까지는 지문 경로가 강화된 잠금을 옛 반복 횟수로 열다 실패해 지문 열기를 저절로 꺼 버렸다.
   그렇게 꺼진 사람이 설정을 뒤지지 않아도 되게, 비밀번호로 연 직후 한 번 물어본다.
   방금 맞게 넣은 비밀번호를 그대로 등록에 쓴다 (다시 묻지 않는다). */
async function offerBioAgain(pass) {
  try {
    if (!native.isNative()) return;
    if (await store.metaGet('bio', false)) return;
    if (await store.metaGet('bioOffer170', false)) return;
    if (!(await native.bioAvailable()).ok) return;
    await store.metaSet('bioOffer170', true);
    await new Promise((r) => setTimeout(r, 900));
    if (document.getElementById('sheetRoot')?.childElementCount) return;
    const { confirmSheet } = await import('./ui.js');
    const yes = await confirmSheet({
      title: t('지문으로 열기를 켤까요?'),
      text: t('다음부터 비밀번호 대신 지문으로 빠르게 열 수 있어요. 비밀번호는 그대로 남습니다.'),
      ok: t('지문 켜기'),
    });
    analytics.design('bio:offer170:' + (yes ? 'yes' : 'no'));
    if (!yes) return;
    await native.bioEnroll(pass);
    await store.metaSet('bio', true);
    toast(t('이제 지문으로 열 수 있어요.'));
  } catch { /* 취소하면 꺼진 채로 둔다 — 설정에서 언제든 켤 수 있다 */ }
}

export function lockNow() {
  relockKeepView = false;
  store.setCryptoKey(null);
  theme.forgetPhotoCache();       // 배경 사진도 푼 채로 들고 있지 않는다 — 풀린 뒤 다시 연다
  location.hash = '#/home';
  showLock(t('암호를 입력해 일기를 여세요.'));
}

/* ── 다른 앱에 갔다 오면 다시 잠근다 (2026-11-01 사용자 신고: 다른 앱을 쓰다 돌아오면 풀려 있다) ──
   · 잠금(비밀번호)을 켠 사람만. 열려 있는 동안(열쇠가 있을 때) 숨겨진 시각을 적고, 돌아왔을 때 따진다
   · 숨길 때가 아니라 돌아올 때 잠근다 — 숨길 때는 쓰기 화면이 원고를 저장한다(열쇠가 필요하다)
   · 설정 '자동 잠금': 바로(기본) / 1분 / 5분
     바로 = 0.8초 넘게 떠나 있으면 잠근다 (2026-11-05 사용자: '바로로 해 놨는데 바로 안 잠긴다' — 예전에는 5초 안 전환을 봐줘서
     잠깐 다른 앱을 보고 오면 그대로 열려 있었다). 0.8초는 시스템 창이 잠깐 덮을 때의 깜박임만 거른다
   · 숨김 시각은 visibilitychange 와 Capacitor App pause 둘 다에서 적고, 돌아온 판정은 visibilitychange · App resume · focus 에서 한다
   · 앱이 일부러 보낸 길(사진 고르기·파일 저장·공유·결제·설정 화면·스토어·노래 링크·지문 창·권한 창)은 잠그지 않는다 → window.__hkOutAt
   · 보던 화면을 그대로 두고 덮기만 한다 — 열면 쓰던 글 그대로 */
const RELOCK_TOL = 800;                  // '바로' 일 때의 유예 (2026-11-05: 5초 → 0.8초)
let hiddenAt = 0;
let relockKeepView = false;
export function relockAfterSec() { return Math.max(0, +store.getSettings().lockAfter || 0); }
/** 숨겨질 때 — 열려 있는 동안에만 시각을 적는다. 이미 적혀 있으면(두 경로가 같은 외출을 두 번 알릴 때) 첫 시각을 둔다 */
function relockMarkHidden() {
  if (hiddenAt) return;
  if (booted && $('#lockscreen').hidden && store.hasCryptoKey()) hiddenAt = Date.now();
}
/** 돌아왔을 때 — 떠나 있던 시간이 설정값을 넘으면 잠근다 */
function relockCheck() {
  const at = hiddenAt; hiddenAt = 0;
  const outAt = window.__hkOutAt || 0; window.__hkOutAt = 0;   // 돌아올 때마다 지운다 — 남아서 다음 외출을 봐주지 않게
  if (!at || !booted || !$('#lockscreen').hidden || !store.hasCryptoKey()) return;
  /* 앱이 바깥 화면을 띄운 직후(15초 안)에 숨겨졌으면 그 길로 간 것 — 잠그지 않는다 */
  if (outAt && at - outAt > -1000 && at - outAt < 15000) { analytics.design('lock:relock_skip_out'); return; }
  if (document.querySelector('.live-ov') || window.__hkLiveRunning) return;   // 업데이트 받는 중
  const away = Date.now() - at;
  if (away < Math.max(RELOCK_TOL, relockAfterSec() * 1000)) return;
  relockNow();
}
function relockNow() {
  relockKeepView = true;
  $('#app').hidden = true;                 // 글이 비치지 않게 먼저 덮는다
  store.setCryptoKey(null);
  theme.forgetPhotoCache();
  analytics.design('lock:relock');
  showLock(t('암호를 입력해 일기를 여세요.'));
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'hidden') relockMarkHidden();
  else relockCheck();
});
/* 안드로이드에서 visibilitychange 가 늦거나 빠질 때를 대비 (2026-11-05): 앱 자체의 pause/resume 도 본다 */
try {
  const CA = window.Capacitor?.Plugins?.App;
  if (CA?.addListener) {
    CA.addListener('pause', () => relockMarkHidden());
    CA.addListener('resume', () => { if (document.visibilityState !== 'hidden') relockCheck(); });
  }
} catch { /* 웹 */ }
window.addEventListener('focus', () => { if (document.visibilityState !== 'hidden') relockCheck(); });

/* ── 화면 캡처 막기 — 항상 켬 (사용자 2026-11-05: 사용자가 켜고 끄는 게 아니라 앱 기본 기능)
   네이티브 Secure 플러그인(1.8.1+)이 있을 때만. 켤 때 한 번, 돌아온 뒤 한 번 더 걸어 둔다(예전 설정으로 꺼져 있던 폰도 켜진다).
   네이티브 쪽도 기본값이 켬이라 웹이 뜨기 전부터 막히고, 이건 플러그인이 있는데 꺼져 있던 경우를 맞추는 보험이다. ── */
let secureForced = false;
async function forceSecure() {
  if (!native.secureAvailable()) return;
  const ok = await native.secureSet(true);
  if (ok && !secureForced) { secureForced = true; analytics.design('secure:capture:forced'); }
}
let secureResumed = false;
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || secureResumed) return;
  secureResumed = true; forceSecure();
});

/* ── 비밀번호를 잊었을 때 ─────────────────────────
   암호가 없으면 복호화가 불가능하다. 그래서 "복구"는 없다.
   대신 지우기 전에 암호화된 원본을 zip 으로 통째로 빼준다.
   나중에 암호가 기억나면 그 파일로 되돌릴 수 있다.
   ------------------------------------------------ */
async function forgotPasscode() {
  const { openSheet } = await import('./ui.js');
  const hasRec = !!(await lockConfig())?.rec;
  openSheet({
    title: t('비밀번호를 잊으셨나요?'),
    text: hasRec
      ? t('만들어 둔 복구 코드로 열고 비밀번호를 새로 정할 수 있어요.')
      : t('비밀번호 없이는 일기를 열 수 없습니다. 암호화를 푸는 열쇠가 비밀번호 자체이기 때문에, 앱에도 복구 방법이 없어요. 지우기 전에 지금 상태를 파일로 빼둘 수는 있습니다.'),
    items: [
      ...(hasRec ? [{
        label: t('복구 코드로 열기'),
        sub: t('잠금을 켤 때 만들어 둔 16자리 코드'),
        icon: 'lock',
        onClick: () => recoverWithCode(),
      }] : []),
      {
        label: t('백업 받고 초기화하기'),
        sub: t('암호화된 원본을 zip 으로 저장한 뒤 앱을 비웁니다'),
        icon: 'down',
        onClick: () => resetWithBackup(),
      },
      {
        label: t('백업 없이 바로 초기화'),
        sub: t('지금 데이터는 완전히 사라집니다'),
        icon: 'trash',
        danger: true,
        onClick: () => resetWithBackup({ skipBackup: true }),
      },
    ],
  });
}

/* 복구 코드로 열기 (2026-10-30) — 비밀번호를 되찾아 열고, 곧바로 새 비밀번호를 정하게 한다 */
async function recoverWithCode() {
  const rec = await import('./recovery.js');
  const pass = await rec.openWithCode();
  if (!pass) return;
  const cfg = await lockConfig();
  const key = await deriveKey(pass, cfg.salt, cfg.iter || ITER_LEGACY);
  if (!(await checkVerifier(key, cfg.verifier))) { toast(t('복구 코드가 맞지 않아요.')); return; }
  await store.metaSet('pinFails', 0);
  await store.metaSet('pinLockUntil', 0);
  await unlockWithKey(key);
  toast(t('복구 코드로 열었어요. 새 비밀번호를 정해 주세요.'));
  go('/passcode?m=reset');
}

/* 복구 코드 권하기 (2026-10-30, 한 번만) — 비밀번호로 맞게 연 직후, 방금 넣은 비밀번호로 바로 만든다 */
async function offerRecoveryOnce(pass) {
  try {
    const cfg = await lockConfig();
    if (!cfg || cfg.rec) return;
    if (await store.metaGet('recOffer', false)) return;
    await new Promise((r) => setTimeout(r, 1200));
    if (document.getElementById('sheetRoot')?.childElementCount) return;      // 다른 창이 떠 있으면 다음에
    await store.metaSet('recOffer', true);
    const { confirmSheet } = await import('./ui.js');
    const yes = await confirmSheet({
      title: t('복구 코드를 만들어 둘까요?'),
      text: t('비밀번호를 잊으면 지금은 일기를 열 방법이 없어요. 복구 코드를 만들어 두면 그 코드로 열고 비밀번호를 새로 정할 수 있어요.'),
      ok: t('만들기'),
    });
    analytics.design('recovery:offer:' + (yes ? 'yes' : 'no'));
    if (yes) await (await import('./recovery.js')).createFlow(pass);
  } catch (e) { console.error('복구 코드 권하기', e); }
}

async function resetWithBackup({ skipBackup = false } = {}) {
  const { confirmSheet, promptSheet, toast } = await import('./ui.js');

  if (!skipBackup) {
    try {
      const raw = await store.exportRaw();
      const { makeZip } = await import('./zip.js');
      const stamp = todayKey();
      const readme =
        '하루칸 백업 (암호화됨)\r\n'
        + '======================\r\n\r\n'
        + `만든 날짜: ${new Date().toLocaleString('ko-KR')}\r\n`
        + `글: ${raw.entries.length}편 / 사진: ${raw.photos.length}장\r\n`
        + `암호화 여부: ${raw.encrypted ? '예' : '아니오'}\r\n\r\n`
        + '이 파일 안의 harukan-raw.json 은 암호화된 상태 그대로입니다.\r\n'
        + '설정했던 비밀번호가 있어야만 내용을 볼 수 있습니다.\r\n\r\n'
        + '[ 되돌리는 방법 ]\r\n'
        + '1. 이 zip 의 압축을 풉니다.\r\n'
        + '2. 하루칸 > 설정 > 내 데이터 > 백업 파일 가져오기 를 누릅니다.\r\n'
        + '3. 압축 안에 있던 harukan-raw.json 을 고릅니다.\r\n'
        + '   (zip 파일 자체가 아니라, 그 안의 .json 파일이어야 합니다)\r\n'
        + '4. 되돌린 뒤에는 그때 쓰던 비밀번호로 열립니다.\r\n\r\n'
        + '비밀번호를 끝내 기억하지 못하면 이 파일은 열 수 없습니다.\r\n';
      const blob = makeZip([
        { name: 'harukan-raw.json', data: JSON.stringify(raw) },
        { name: '읽어주세요.txt', data: readme },
      ], new Date());

      /* 파일이 진짜 저장됐는지 확인한 뒤에만 다음으로 넘어간다.
         여기서 "받으셨죠?" 하고 지워버리면 되돌릴 방법이 없어진다. */
      const backup = await import('./backup.js');
      const zipName = `harukan-backup-encrypted-${stamp}.zip`;
      const res = await backup.saveFile(zipName, blob, 'application/zip');
      if (res.where === 'native') {
        const sent = await confirmSheet({
          title: t('백업 파일을 만들었어요.'),
          text: t('문서 폴더에 “{name}” 으로 저장했습니다. 지우기 전에 다른 곳으로 옮겨두세요.', { name: res.path || zipName }),
          ok: t('다른 앱으로 보내기'),
        });
        if (sent) await backup.shareFile(res.uri, t('하루칸 백업'));
      }
      const ok = await confirmSheet({
        title: t('백업 파일을 받으셨나요?'),
        text: t('{n}편을 저장했습니다. 파일이 있는 것을 눈으로 확인한 뒤에 계속하세요. 이 다음 단계는 되돌릴 수 없습니다.', { n: raw.entries.length }),
        ok: t('확인했어요, 계속'),
      });
      if (!ok) return;
    } catch (e) {
      console.error(e);
      const go2 = await confirmSheet({
        title: t('백업에 실패했어요'),
        text: t('파일을 만들지 못했습니다. 백업 없이 초기화할까요? 지금 데이터는 완전히 사라집니다.'),
        ok: t('백업 없이 초기화'), danger: true,
      });
      if (!go2) return;
    }
  }

  const typed = await promptSheet({
    title: t('정말 초기화할까요?'),
    text: t('글·사진·설정·비밀번호가 전부 사라집니다. 되돌릴 수 없습니다. 확인을 위해 “{단어}”라고 입력해 주세요.', { 단어: t('초기화') }),
    placeholder: t('초기화'), ok: t('초기화'),
  });
  /* 대소문자는 가리지 않는다 ('REDEFINIR' 를 'Redefinir' 로 쳐도 된다) */
  if ((typed || '').trim().toLocaleLowerCase() !== t('초기화').toLocaleLowerCase()) { toast(t('취소했어요.')); return; }

  try { await (await import('./widget.js')).clear(); } catch { /* */ }   // 홈 화면 위젯에 남은 내용도 (1.8.4)
  await store.wipeEverything();
  location.hash = '#/home';
  location.reload();
}

/* ── 리마인더 ────────────────────────────────────
   네이티브(APK): 시스템에 예약 → 앱이 꺼져 있어도 온다.
   웹(PWA):       앱이 열려 있는 동안만 동작한다. 이건 브라우저의 한계다.
   ------------------------------------------------ */
let reminderTimer = null;

/**
 * 첫 실행에 딱 한 번, 알림을 켤지 물어본다.
 *
 * 안드로이드 권한 창을 맨몸으로 띄우지 않는다. 무엇에 쓰는지 모르는 채 뜨는
 * 권한 창은 대부분 거절당하고, 한 번 거절하면 다시 물을 수도 없다.
 * 먼저 무엇을 해주는지 한 줄로 말하고, "받겠다"고 한 사람에게만 창을 띄운다.
 *
 * 순서: 안내 → 알림 권한(시스템 창) → 예약 → (필요하면) 알람 및 리마인더 안내
 */
async function offerReminderOnce() {
  if (!native.isNative()) return;
  if (await store.metaGet('reminderAsked', false)) return;
  if (store.getSettings().reminderOn) { await store.metaSet('reminderAsked', true); return; }

  const { confirmSheet, toast: say } = await import('./ui.js');
  const time = store.reminderTimeOf();

  // 홈 화면이 먼저 그려진 뒤에 띄운다 — 켜자마자 창부터 뜨면 무슨 앱인지도 모른다
  await new Promise((r) => setTimeout(r, 1200));
  await store.metaSet('reminderAsked', true);      // 물어본 사실은 결과와 무관하게 남긴다

  const yes = await confirmSheet({
    title: t('매일 한 번 알려드릴까요?'),
    text: t('{v}에 오늘 칸이 비어 있으면 살짝 알려드려요. 광고 알림은 보내지 않습니다. 나중에 설정에서 언제든 끄고 켤 수 있어요.', { v: i18n.fmtClock(time) }),
    ok: t('알림 받기'),
  });
  if (!yes) return;

  // requestNotifyPermission 은 문자열이 아니라 true/false 를 돌려준다
  if (!(await native.requestNotifyPermission())) {
    say(t('알림이 꺼져 있어요. 설정에서 켤 수 있습니다.'));
    return;
  }
  await store.saveSettings({ reminderOn: true }, { silent: true });
  const r = await scheduleReminder();
  if (r === 'need-exact') await askExactAlarm();
  else say(t('알림을 켰어요.'));
}

/**
 * "알람 및 리마인더" 권한을 켜달라고 부탁한다.
 * 안드로이드 14+ 는 이 권한을 기본으로 주지 않는다. 플러그인에 그냥 맡기면
 * 아무 설명 없이 시스템 설정 화면으로 튕겨나가므로, 먼저 왜 필요한지 말한다.
 * 일기 알림과 일정 알림이 같은 안내를 쓴다.
 */
export async function askExactAlarm() {
  const { confirmSheet } = await import('./ui.js');
  const ok = await confirmSheet({
    title: t('한 가지만 더 허용해주세요'),
    text: t('안드로이드는 정해진 시각에 울리는 알림에 “알람 및 리마인더” 권한을 따로 요구해요. 다음 화면에서 켜주시면 됩니다. 배터리나 데이터를 더 쓰지는 않아요.'),
    ok: t('설정 열기'),
  });
  if (!ok) { toast(t('나중에 설정에서 다시 켤 수 있어요.')); return false; }
  await native.openExactAlarmSetting();
  return true;
}

/**
 * 묻어둔 글이 열리는 날에 알림을 건다.
 *
 * 이 기능은 "잊고 있다가 마주치는 것"이 전부다. 3년 뒤에 앱을 안 열고
 * 있으면 그날을 놓치므로, 알림이 없으면 기능이 절반만 동작한다.
 *
 * 아침 9시에 보낸다 — 저녁 알림(기본 22시)과 겹치지 않고, 하루를
 * 시작하며 받는 편이 지난 나를 만나기에 낫다.
 * 알림에는 내용을 한 글자도 싣지 않는다. 언제 쓴 글인지만 말한다.
 */
export async function syncSealedReminders() {
  if (!native.isNative()) return false;
  const items = store.sealedList().map((e) => {
    const [y, m, d] = e.sealedUntil.split('-').map(Number);
    return {
      id: e.id,
      at: new Date(y, m - 1, d, 9, 0, 0, 0),
      body: t('{d}의 내가 오늘의 나에게', { d: fmtDate(e.date, { year: true }) }),
    };
  });
  try { return await native.refreshSealedReminders(items); }
  catch (e) { console.error(e); return false; }
}

/* ── 업데이트 (강제) ────────────────────────────────
   Play 에 새 버전이 있으면 업데이트해야만 계속 쓸 수 있다. 이유는 native.js.

   언제 묻나: 앱을 열 때, 그리고 다시 앞으로 올 때마다 (10분에 한 번까지).
   며칠씩 켜두고 쓰는 사람도 있어서 여는 순간만으로는 부족하다.

   어떻게 막나: 잠금 화면보다 위에 안내 화면(#updateWall)을 덮고, 구글의
   즉시 업데이트 창을 곧바로 띄운다. 사용자가 그 창을 뒤로가기로 닫으면
   안내 화면이 남는다. 거기엔 '업데이트' 와 'Play 스토어에서 열기' 뿐이고
   뒤로가기는 앱을 닫는다. "나중에" 는 없다.

   일기 내용은 그대로다. 쓰기 화면은 앱이 가려지는 순간 저장한다. */
const UPD_RECHECK_MS = 10 * 60 * 1000;
let updChecking = null;
let updCheckedAt = 0;

function updateWallUp() { return !$('#updateWall').hidden; }

function showUpdateWall() {
  const w = $('#updateWall');
  $('#updTitle').textContent = t('새 버전이 나왔어요');
  $('#updBody').textContent = t('업데이트해야 계속 쓸 수 있어요.');
  $('#updGo').textContent = t('업데이트');
  $('#updStore').textContent = t('Play 스토어에서 열기');
  $('#updHint').textContent = t('일기는 이 기기에 그대로 남아 있어요. 업데이트해도 지워지지 않아요.');
  if (!w.hidden) return;
  closeSheet();                 // 열려 있던 시트가 안내 화면 위로 비치지 않게
  w.hidden = false;
  document.documentElement.classList.add('update-required');
  ads.onUpdateWall(true);
  // 뒤쪽은 눌리지도, 초점이 가지도 않게
  for (const id of ['app', 'lockscreen', 'sheetRoot']) document.getElementById(id)?.setAttribute('inert', '');
  $('#updGo').focus();
}

function hideUpdateWall() {
  const wasUp = updateWallUp();
  $('#updateWall').hidden = true;
  if (wasUp && !$('#lockscreen').hidden) setTimeout(() => autoBiometric(), 0);   // 안내가 걷히면 그때 지문을 묻는다
  document.documentElement.classList.remove('update-required');
  ads.onUpdateWall(false);
  for (const id of ['app', 'lockscreen', 'sheetRoot']) document.getElementById(id)?.removeAttribute('inert');
}

/** 구글 업데이트 창을 띄운다. 안 되면 Play 스토어 페이지로 보낸다. */
async function runUpdateFlow() {
  const btn = $('#updGo');
  btn.disabled = true;
  try {
    const r = await native.runUpdate();
    if (r === 'none') {           // 그새 업데이트가 끝났거나 Play 가 거둬들였다
      await enforceUpdate({ force: true });
      return;
    }
    if (r === 'fail' && !(await native.openStore())) {
      toast(t('업데이트를 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.'));
    }
    /* 'canceled' 면 아무것도 안 한다. 안내 화면이 그대로 남아 있다. */
  } finally {
    btn.disabled = false;
  }
}

/**
 * 업데이트가 필요한지 보고, 필요하면 막는다.
 * @param force 10분 간격을 무시하고 바로 묻는다
 */
async function enforceUpdate({ force = false } = {}) {
  if (!native.isNative()) return;
  if (updChecking) return updChecking;
  if (!force && !updateWallUp() && Date.now() - updCheckedAt < UPD_RECHECK_MS) return;

  updChecking = (async () => {
    updCheckedAt = Date.now();
    const wasUp = updateWallUp();
    const info = await native.requiredUpdate();
    /* 막아야 하면 안내 화면을 먼저 덮고, 그다음에 배너를 허락한다 (ads.js updKnown) */
    if (info.state === 'required') showUpdateWall();
    ads.onUpdateKnown();

    if (info.state === 'none') { if (wasUp) hideUpdateWall(); return; }
    if (info.state !== 'required') {
      /* 물어보지 못함: 떠 있으면 두고, 없으면 막지 않는다.
         답을 못 들었으니 10분을 기다리지 않고 다음에 앞으로 올 때 바로 다시 묻는다. */
      updCheckedAt = 0;
      return;
    }

    showUpdateWall();
    /* 처음 막는 순간, 그리고 받다가 끊긴 업데이트는 구글 창을 바로 띄운다.
       이미 안내 화면을 본 사람에게 창을 매번 다시 들이밀지는 않는다.
       '업데이트' 한 번이면 되니까. */
    if (!wasUp || info.inProgress) await runUpdateFlow();
  })().catch((e) => console.error(e)).finally(() => { updChecking = null; ads.onUpdateKnown(); });
  return updChecking;
}

function wireUpdateWall() {
  $('#updGo').addEventListener('click', () => runUpdateFlow());
  $('#updStore').addEventListener('click', async () => {
    if (!(await native.openStore())) toast(t('업데이트를 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.'));
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') enforceUpdate();
  });
}
/**
 * 30일 무료 체험 시계를 맞춘다.
 *
 * 처음 연 순간을 기록하고, 그 시각부터 30일 동안 광고와 일정 한도를 비워둔다.
 * 시작 시각이 없으면 지금으로 잡는다 — 이 앱을 이미 쓰던 분에게도 오늘부터
 * 30일이 주어진다. 쓰던 사람에게서 갑자기 무언가를 뺏지 않기 위해서다.
 */
export async function syncTrial() {
  const s = store.getSettings();
  /* 1.6.8 (2026-10-19 사용자 결정): 새로 설치한 사람에게도 30일 무료 체험을 준다.
     (1.6.3~1.6.7 은 새 사용자에게 체험을 주지 않고 noTrial 을 적었다. 그때 설치한 사람도
      이 버전을 처음 켜는 날부터 30일을 받는다 — noTrial 은 기록으로만 남는다.)
     이미 체험 시각(trialStartedAt)이 있으면 그 30일을 그대로 쓴다 (다시 주지 않는다).
     ⚠ 플러스 가격 구간(syncPriceTier)은 이보다 먼저 정해져 있어야 한다 — 여기서
       trialStartedAt 을 적으면 새 사용자도 '기존 사용자'처럼 보이기 때문이다 (finishBoot 순서). */
  if (!s.trialStartedAt) {
    const kind = s.noTrial ? 'no_trial_user' : store.all().length > 0 ? 'legacy' : 'new_user';
    await store.saveSettings({ trialStartedAt: Date.now() }, { silent: true });
    analytics.design('trial:start:' + kind);
  }
  ads.setTrial(plus.inTrial());
}

/**
 * 체험 동안 도달한 일정 최대 개수를 기억한다.
 * 체험이 끝난 뒤 이미 넣어둔 일정이 한도에 걸려 인질이 되지 않게 하려는 것이다.
 * 체험이 끝나면 더 올리지 않으므로 그 시점의 개수에서 멈춘다.
 */
export async function bumpPlanFloor(activeCount) {
  if (!plus.inTrial()) return;
  const s = store.getSettings();
  if (activeCount > (s.planFloor || 0)) {
    await store.saveSettings({ planFloor: activeCount }, { silent: true });
  }
}

/** 습관 알림을 켤 때 매일 일기 알림도 같이 (2026-10-31 사용자 결정 A안, 광고분석 세션 전달).
    설정에서 직접 끈 사람은 두고, 시각은 지금 규칙(reminderTimeOf) 그대로. 켰으면 그 시각('HH:MM'), 아니면 null.
    justGranted: 방금 권한을 받았다 — 켜져 있었어도 권한이 없어 안 오던 알림을 이제 건다 */
export async function dailyAlongWithHabit(justGranted = false) {
  if (!native.isNative()) return null;
  const s = store.getSettings();
  if (s.reminderOffByUser) return null;
  if ((await native.notifyPermission()) !== 'granted') return null;
  if (s.reminderOn && !justGranted) return null;          // 이미 켜져 오던 알림 — 할 일 없음
  if (!s.reminderOn) await store.saveSettings({ reminderOn: true }, { silent: true });
  try { await scheduleReminder(); } catch { /* 무시 */ }
  analytics.design('notif:daily:on_via_habit');
  return store.reminderTimeOf(store.getSettings());
}

export async function scheduleReminder() {
  clearTimeout(reminderTimer);
  const s = store.getSettings();
  import('./nudge.js').then((m) => m.refresh()).catch(() => {});   // 쉬어 간 날 알림 (1.7.6) — 매일 알림을 켜면 꺼진다

  if (native.isNative()) {
    if (!s.reminderOn) { await native.cancelDailyReminders(); return true; }
    // 'need-exact' 이면 호출한 쪽에서 사용자에게 설명해야 한다
    /* 1.7.9 패치 (사용자 지시 2026-10-30): 시각은 일기를 쓰는 시각에(직접 고르지 않았으면), 앞쪽 2개 알림은 최근 일기 한 줄로 */
    let rc = null;
    try { const nu = await import('./nudge.js'); rc = await nu.recallLine(); if (rc) rc.body = (at) => nu.recallBody(rc, at); } catch { rc = null; }
    return native.refreshDailyReminders(store.reminderTimeOf(s), (d) => store.hasEntryOn(d),
      rc ? (n, at) => (n < 2 ? { body: rc.body(at) } : null) : null);
  }

  if (!s.reminderOn || (await native.notifyPermission()) !== 'granted') return false;
  const [hh, mm] = store.reminderTimeOf(s).split(':').map(Number);
  const now = new Date();
  const at = new Date(now);
  at.setHours(hh, mm, 0, 0);
  if (at <= now) at.setDate(at.getDate() + 1);
  reminderTimer = setTimeout(() => {
    if (!store.hasEntryOn(todayKey())) {
      try {
        new Notification(t('하루칸'), { body: t('오늘 한 칸, 한 줄이면 충분해요.'), icon: 'icons/icon-192.png', tag: 'harukan-daily' });
      } catch { /* 지원 안 함 */ }
    }
    scheduleReminder();
  }, Math.min(at - now, 2 ** 31 - 1));
  return true;
}

/* 앱으로 돌아올 때마다 알림 예약을 다시 맞춘다.
   · 권한 설정 화면에 다녀온 직후를 잡아준다
   · 2주치만 깔아두므로 주기적으로 채워 넣어야 한다
   · 오늘 글을 쓴 뒤라면 오늘 알림이 빠진다 */
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && booted && store.getSettings().reminderOn) {
    scheduleReminder();
  } else if (document.visibilityState === 'visible' && booted) {
    import('./nudge.js').then((m) => m.refresh()).catch(() => {});
  }
});

/* 하루 한 번: 어떤 등급으로 쓰는지, 체험이면 며칠째인지 (익명 통계 — analytics.js) */
function dailyStats() {
  analytics.daily(async () => {
    const out = [];
    if (plus.isPlus()) out.push(['tier:plus']);
    else if (plus.inTrial()) {
      const start = store.getSettings().trialStartedAt || Date.now();
      out.push(['tier:trial'], ['trial:day', Math.floor((Date.now() - start) / 86400000) + 1]);
    } else out.push(['tier:free']);
    try { out.push(...(await notifCountStats())); } catch { /* 개수는 못 세도 등급은 보낸다 */ }
    return out;
  });
}

/* 1인당 알림 개수 (하루 한 번, 숫자만 — 이름·내용은 보내지 않는다. 2026-11-01 사용자 지시, 광고분석 세션 전달)
   habit:stat:count 진행 중 습관 수 · habit:stat:alarms 습관 알림 시각 총개수 · habit:stat:important 중요 알림 켠 습관 수
   plan:stat:alarms 알림을 건 남은 일정 수(저장된 것만, 반복의 앞날 회차는 세지 않는다) · notif:daily:state:on|off 매일 일기 알림(권한까지) */
export async function notifCountStats() {
  const out = [];
  const today = todayKey();
  try {
    const H = await import('./habits.js');
    await H.load();
    const list = H.active().filter((h) => !h.end || h.end >= today);
    const times = (h) => (Array.isArray(h.reminders) ? h.reminders.filter(Boolean).length : 0);
    out.push(['habit:stat:count', list.length]);
    out.push(['habit:stat:alarms', list.reduce((n, h) => n + times(h), 0)]);
    out.push(['habit:stat:important', list.filter((h) => h.important && times(h) > 0).length]);
  } catch { /* 습관을 못 읽으면 뺀다 */ }
  try {
    const plans = await import('./plans.js');
    await plans.loadAll();
    out.push(['plan:stat:alarms', plans.all().filter((p) => !p.done && p.remindMin != null && p.date >= today).length]);
  } catch { /* */ }
  try {
    const on = !!store.getSettings().reminderOn && (await native.notifyPermission()) === 'granted';
    out.push([on ? 'notif:daily:state:on' : 'notif:daily:state:off']);
  } catch { /* */ }
  return out;
}
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && booted) dailyStats();
});

/* ── 부팅 ───────────────────────────────────────── */
/* 플러스 가격 구간 (1.6.7) — 처음 한 번 정하고 바꾸지 않는다.
   이 버전 전에 앱을 쓰던 사람은 설정에 체험 시작일(trialStartedAt)이나 '체험 없이 시작'(noTrial)
   기록이 이미 있다 (1.6.3 부터는 첫 실행 때 둘 중 하나를 꼭 적는다). 일기가 있어도 기존 사용자다.
   셋 다 없으면 이 버전으로 처음 설치한 사람이다 → 새 가격.
   판단을 저장해 두므로, 나중에 체험이 끝나거나 일기를 다 지워도 바뀌지 않는다. */
/** 백업을 가져온 뒤 — 되돌아온 가격 구간·체험 기간을 다시 켜지 않아도 바로 적용한다 (2026-10-30) */
export async function afterRestore() {
  syncPriceTier();
  ads.setTrial(plus.inTrial());
  await scheduleReminder().catch(() => {});
}

function syncPriceTier() {
  const s = store.getSettings();
  let tier = s.priceTier;
  if (tier !== 'legacy' && tier !== 'new' && tier !== 'v3') {
    /* 2026-11-04: 자료 없는 새 설치는 'v3'(plus_lifetime). 1.6.7~ 설치한 사람은 이미 'new' 가 적혀 있어 그대로(plus_9900) */
    tier = (s.trialStartedAt || s.noTrial || store.all().length > 0) ? 'legacy' : 'v3';
    store.saveSettings({ priceTier: tier }, { silent: true }).catch(() => {});
  }
  billing.setPlusTier(tier);
}

/* 업데이트 안내 (1.7.0~) — 공지사항(notices.js)의 최신 공지를 업데이트 후 처음 켤 때 한 번 창으로 보여준다.
   새로 설치한 사람(일기·체험 기록이 없던 사람)에겐 띄우지 않고 읽은 것으로 적는다 — 고친 버그 목록은 의미가 없다.
   다른 창(지문 다시 켜기 권유 등)이 떠 있으면 닫힐 때까지 기다렸다가 띄운다(최대 30초, 못 띄우면 다음 실행 때).
   1.6.6 의 배경 안내는 이 공지에 들어 있으므로 따로 띄우지 않는다(bgNoticeSeen 도 함께 적는다). */
function showUpdateNotice() {
  if (!notices.hasUnread()) return;
  const s = store.getSettings();
  if (s.priceTier === 'new' && !s.bgNoticeSeen && store.all().filter((e) => !e.demo).length === 0 && !(s.trialStartedAt && Date.now() - s.trialStartedAt > 86400000)) {
    notices.markRead().catch(() => {});
    store.saveSettings({ bgNoticeSeen: true }, { silent: true }).catch(() => {});
    return;
  }
  const t0 = Date.now();
  const tryShow = async () => {
    const root = document.getElementById('sheetRoot');
    const busy = (root && root.childElementCount) || !document.getElementById('lockscreen')?.hidden || location.hash.startsWith('#/write');
    if (busy) { if (Date.now() - t0 < 30000) setTimeout(tryShow, 1500); return; }
    const n = notices.latest();
    await notices.markRead();
    await store.saveSettings({ bgNoticeSeen: true }, { silent: true });
    if (current?.name === 'home') route();           // 종 아이콘의 빨간 점 끄기
    analytics.design('notice:popup:' + n.id);
    const { openSheet, el: mk, esc: e2, closeSheet: close } = await import('./ui.js');
    const box = mk('div');
    box.innerHTML = '<ul class="notice-items pop">' + notices.itemsOf(n).map((x) => '<li>' + e2(x) + '</li>').join('') + '</ul>';
    const row = mk('div', { class: 'btn-row', style: 'margin-top:6px' });
    const more = mk('button', { class: 'btn', type: 'button' }, e2(t('공지사항 보기')));
    const ok = mk('button', { class: 'btn btn-primary', type: 'button' }, e2(t('확인')));
    more.addEventListener('click', () => { close(); analytics.design('notice:popup_more'); go('/notices'); });
    ok.addEventListener('click', () => close());
    row.append(more, ok);
    /* 의견 보내기 버튼이 붙는 공지 (1.7.4) */
    if (n.action === 'feedback') {
      const fbBtn = mk('button', { class: 'btn btn-primary', type: 'button', style: 'width:100%;margin-top:10px' }, e2(t('의견 보내기')));
      fbBtn.addEventListener('click', () => { close(); analytics.design('notice:popup_feedback'); go('/feedback'); });
      ok.className = 'btn';
      box.append(fbBtn);
    }
    box.append(row);
    openSheet({ title: notices.titleOf(n), content: box });
  };
  setTimeout(tryShow, 1200);
}

/* (1.6.6 배경 안내 — 1.7.0 부터 쓰지 않는다. 공지사항이 대신한다) */
// eslint-disable-next-line no-unused-vars
function showBgNotice() {
  const s = store.getSettings();
  if (s.bgNoticeSeen) return;
  // 새로 설치한 사람: 1.6.3~1.6.7 은 noTrial, 1.6.8~ 은 priceTier 'new' 로 알아본다 (이제 체험은 모두 받는다)
  if (s.noTrial || s.priceTier === 'new') { store.saveSettings({ bgNoticeSeen: true }, { silent: true }).catch(() => {}); return; }
  setTimeout(async () => {
    const root = document.getElementById('sheetRoot');
    if ((root && root.childElementCount) || !document.getElementById('lockscreen')?.hidden) return;
    await store.saveSettings({ bgNoticeSeen: true }, { silent: true });
    analytics.design('notice:bg166:view');
    const { confirmSheet } = await import('./ui.js');
    const go2 = await confirmSheet({
      title: t('배경 꾸미기가 새로워졌어요'),
      text: t('배경 이미지 설정이 업그레이드되어 지금 서비스되고 있어요. 꽃·보석으로 꾸민 미니멀 배경 10종과 내 사진 배경을 만나 보세요.'),
      ok: t('배경 보러 가기'),
    });
    analytics.design('notice:bg166:' + (go2 ? 'go' : 'close'));
    if (go2) go('/decor');
  }, 1200);
}

/* 홈 화면 위젯을 눌러 열린 횟수 (1.8.4) — 어느 화면으로 갔는지만 */
function widgetOpened(route) {
  const name = (String(route).replace(/^#?\//, '').split(/[/?]/)[0] || 'home').replace(/[^a-z_-]/gi, '');
  analytics.design('widget:open:' + name);
}

async function finishBoot() {
  booted = true;
  applyTheme();
  ads.onLock(false);
  /* 체험 여부를 첫 화면을 그리기 전에 정한다 (1.6.3) — 예전 사용자에게 체험을 주는 순간
     설정·플러스 화면이 가격을 먼저 보여주지 않게 */
  syncPriceTier();            // syncTrial 보다 먼저 — 새로 설치했는지를 syncTrial 이 기록하기 전에 본다
  await syncTrial();
  /* 예전 버전에서 고쳐 쓴 예시 글은 사용자 글로 돌린다 (1.6.6) — 백업에서 빠지지 않게.
     예시가 없으면 demo.js 를 불러오지도 않는다. 실패해도 부팅은 계속한다 */
  if (store.all().some((e) => e.demo)) {
    try {
      const n = await (await import('./demo.js')).adoptEdited();
      if (n) console.info(`고친 예시 글 ${n}편을 내 글로 돌렸습니다.`);
    } catch (e) { console.error('예시 글 정리', e); }
  }
  syncHabitReminders();      // 습관 알림 (2026-10-30) — 기다리지 않는다
  setTimeout(() => ALARM.check().catch(() => {}), 600);   // 알람이 울리는 중에 열었으면 알람 화면 (2026-11-01)
  await notices.load();       // 종 아이콘의 빨간 점을 첫 화면부터 맞게 그리려고 route 전에
  /* 그림 알림(새 기능 안내)을 눌러 열렸으면 그 화면으로 (1.8.1, campaign.js) */
  if (native.isNative()) {
    try { const cr = await campaign.takeRoute(); if (cr) location.hash = '#' + cr; } catch { /* */ }
    /* 홈 화면 위젯을 눌러 열렸으면 그 화면으로 (1.8.4) */
    /* 기다리지 않는다 — 느린 폰에서 네이티브 응답이 늦어도 첫 화면을 먼저 그린다. 오면 그때 그 화면으로 */
    import('./widget.js').then((W) => W.takeRoute()).then((wr) => { if (wr) { widgetOpened(wr); go(wr); } }).catch(() => {});
  }
  await route();
  /* 첫 사용 가이드 (1.7.2): 새로 설치한 사람에게만 한 번. 이미 쓰던 사람은 본 것으로 적어 둔다 */
  {
    const s0 = store.getSettings();
    if (!s0.guideSeen) {
      const fresh = s0.priceTier === 'new' && !store.all().some((e) => !e.demo) && !(s0.trialStartedAt && Date.now() - s0.trialStartedAt > 86400000);
      if (fresh) guide.show();
      else store.saveSettings({ guideSeen: true }, { silent: true }).catch(() => {});
    }
  }
  showUpdateNotice();
  trialEndNotice();   // 체험이 끝난 뒤 처음 열 때 한 번 (2026-11-03) — 다른 창이 있으면 비켜 줄 때까지 기다린다

  // 휴지통 자동 비우기
  const purged = await store.purgeOldTrash(30);
  if (purged) console.info(`휴지통에서 ${purged}편을 완전히 지웠습니다 (30일 경과).`);

  scheduleReminder();
  /* 홈 화면 위젯 (1.8.4): 위젯에서 누른 습관 체크를 넣고, 지금 상태를 위젯에 넘긴다. 네이티브가 없으면(1.8.3 이하) 아무것도 안 한다 */
  import('./widget.js').then((W) => W.init()).catch(() => {});
  /* 새 기능 안내 그림 알림 (1.8.1): 열린 횟수를 세고, 아직 안 건 캐페인을 건다. 기다리지 않는다 */
  if (native.isNative()) campaign.countOpen().then(() => campaign.schedulePending()).catch(() => {});
  caret.watchKeyboard();   // 키보드가 뜨면 아래 탭바를 숨긴다 (1.7.2)
  analytics.init().then(dailyStats)
    // 이미 쓰던 사람: 지금 편수까지의 '몇 번째 일기' 단계를 한 번에 보낸다 (milestones.js, 단계마다 1회)
    .then(() => import('./milestones.js')).then((m) => m.report()).catch(() => {});

  /* 일정 알림을 지금 상태에 맞게 다시 건다.
     앱을 열 때마다 맞춘다 — 예약은 기기가 꺼지거나 앱이 갱신되면 날아간다. */
  (async () => {
    try {
      const plans = await import('./plans.js');
      await plans.loadAll();
      await plans.rollover();          // 지난 반복 할 일은 오늘로 (2026-11-01)
      const { syncReminders } = await import('./views/plans.js');
      await syncReminders();
      planDayWatch();
      await syncSealedReminders();
      await bumpPlanFloor(plans.activeCount());
    } catch (e) { console.error(e); }
  })();

  // 알림을 탭해서 들어왔으면 곧장 해당 화면으로
  native.onNotificationTap((data) => {
    window.__hkTapAt = Date.now();                 // 이 직후에는 묶음을 바꾸지 않는다 (liveupdate, 2026-11-06)
    if (data?.plan) { go('/plans'); return; }     // 일정 알림
    /* 습관 알림·습관 시험 알림·습관 알람(3990~3999, 8000~8199)은 습관 화면으로 (2026-11-01 사용자 신고: 습관 알림을 눌렀는데 일기로 갔다) */
    const nid = +(data?._id ?? -1);
    if (data?.habit || data?.habitTest || (nid >= 3990 && nid <= 3999 && nid !== 3997) || (nid >= 8000 && nid < 8200)) { analytics.design('habit:notif_open'); go('/habits'); return; }
    if (data?.habitTrialEnd) { analytics.design('habit:trial_end_open'); go('/plus'); return; }   // 체험 끝 '습관 알림이 멈췄어요' (2026-11-01)
    if (data?.nudge) {                              // 쉬어 간 날 알림 (1.7.6) — 늘 새 글로
      import('./nudge.js').then((m) => m.opened(data.nudge, !!data.recall)).catch(() => {});
      go(`/write?d=${todayKey()}`);
      return;
    }
    // 묻어둔 글이 열린 알림 — 그 글로 곧장 간다. 열리는 날이 지났으므로 열린다.
    if (data?.sealed && store.byId(data.sealed)) { go(`/entry/${data.sealed}`); return; }
    if (data?.date) analytics.design('notif:daily:open' + (data.recall ? ':with_recall' : ''));   // 매일 알림을 눌러 들어옴 (1.7.9 패치)
    const t = todayKey();
    const e = store.byDate(t)[0];
    go(e ? `/write?id=${e.id}` : `/write?d=${t}`);
  });

  offerReminderOnce();
  /* 다른 앱에서 '공유 → 하루칸' 으로 들어온 노래 (1.7.9). 잠금을 푼 뒤마다 다시 부른다 */
  import('./sharein.js').then((m) => m.init()).catch(() => {});

  // 백업 권유 — 30일 넘게 백업이 없고 글이 20편 이상이면 한 번만
  const s = store.getSettings();
  if (store.live().length >= 20 &&
      (!s.lastBackupAt || Date.now() - s.lastBackupAt > 30 * 86400000) &&
      !sessionStorage.getItem('backupNagged')) {
    sessionStorage.setItem('backupNagged', '1');
    setTimeout(() => toast(t('백업한 지 오래됐어요. 설정에서 파일로 내려받아 두세요.'), {
      action: t('설정 열기'), onAction: () => go('/settings'), duration: 9000,
    }), 2500);
  }
}

async function boot() {
  try {
    await store.open();
  } catch (e) {
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif;line-height:1.7">' +
      esc(e.message || '저장소를 열 수 없습니다.') + '<br><br>' +
      '<span style="opacity:.7">시크릿 모드이거나 브라우저가 IndexedDB를 막고 있어도 이렇게 됩니다. ' +
      '일반 창에서 다시 열어주세요.</span></div>';
    return;
  }
  await store.loadSettings();
  await ads.loadAdFree();          // 플러스 여부를 첫 화면 전에 — 배경 꾸미기가 바로 입혀야 한다
  await plus.loadStickerPlus();    // 스티커 플러스 여부도 (1.6.0)
  /* 익명 사용 통계 — Play 정식 앱에서만 보낸다. 기다리지 않는다.
     체험 시작 시각이 이미 있으면 이 버전으로 업데이트한 기존 사용자다 */
  analytics.init({ existingUser: !!store.getSettings().trialStartedAt });
  applyTheme();
  // 잠금 화면 제목은 index.html 에 박혀 있다 — 언어가 바뀔 때마다 번역해 넣는다
  i18n.onChange(() => {
    const lt = document.querySelector('.lock-title');
    if (lt) lt.textContent = t('하루칸');
  });
  await i18n.apply(store.getSettings().language);   // 언어 사전을 먼저 — 첫 화면부터 그 언어로
  applyStaticText();
  wireUpdateWall();
  /* 내려받기 업데이트 (1.7.8) — 화면·스크립트·스티커는 Play 업데이트 없이 받는다. 기다리지 않는다 */
  let liveP = null;
  if (native.isNative()) {
    const lm = import('./liveupdate.js');
    liveP = lm.then((m) => { m.start(); return m.decided(); }).catch(() => {});
    liveSettled = lm.then((m) => m.settled()).catch(() => {});
  }
  const updP = enforceUpdate({ force: true });   // 기다리지 않는다. 답이 오면 그때 덮는다
  bootGate = Promise.all([liveP, updP]).catch(() => {});   // 잠금 화면의 지문 창은 이게 끝난 뒤에 (autoBiometric)
  ads.init();                // 네이티브에서만 동작, 실패해도 앱은 그대로
  if (native.isNative()) import('./autobackup.js').then((m) => m.init()).catch(() => {});   // 자동 백업 (2026-11-05)
  forceSecure();             // 화면 캡처 막기는 항상 켬 (1.8.1+, 사용자 2026-11-05: 선택이 아니라 기본 기능)

  /* 광고 제거 소유가 확인되면 (구매 직후든, 재설치 후든) 배너를 영구히 끈다 */
  billing.init({
    onOwned: async (id) => {
      /* 스티커 플러스 (1.6.0) — 하루칸 플러스와 따로 산다 */
      if (id === billing.PRODUCT_STICKER_PLUS) {
        if (plus.hasStickerPlus()) return;
        await plus.setStickerPlus(true);
        toast(t('이제 모든 스티커를 쓸 수 있어요. 고맙습니다.'));
        if (['settings', 'plus'].includes(parseHash().name)) route();
        return;
      }
      if (ads.isAdFree()) return;
      await ads.setAdFree(true);
      toast(t('이제 광고 없이, 일정도 제한 없이 쓸 수 있어요. 고맙습니다.'));
      applyTheme();                                     // 골라두었던 배경이 있으면 바로 입힌다
      if (['settings', 'plus', 'decor', 'pdf'].includes(parseHash().name)) route();   // 문구 갱신
      dualsub.check({ force: true });                   // 월 이용권을 쓰던 사람이면 바로 '월 이용권 해지' 안내 (2026-11-04)
    },
    /* 월 이용권 (2026-11-03): Play 보유 상태가 바뀌면 플러스를 켜고 끈다. 평생 이용권은 건드리지 않는다 */
    onSub: async (active) => {
      dualsub.check();                                  // 평생 + 월 자동 갱신이면 하루 한 번 안내, 해지됐으면 경고 지움
      if (!active && !ads.isSub()) return false;
      let extra = {};
      if (active && !ads.isSub()) { const o = await store.metaGet('plusSubOrder', null); if (o?.firstChargeAt) extra = { firstChargeAt: o.firstChargeAt, trialDays: o.trialDays || 0 }; }
      const changed = await ads.setSub(active, extra);
      if (!changed) return false;
      if (active && !ads.isAdFree()) toast(t('이제 광고 없이, 일정도 제한 없이 쓸 수 있어요. 고맙습니다.'));
      applyTheme();
      if (['settings', 'plus', 'decor', 'pdf', 'habits'].includes(parseHash().name)) route();
      syncHabitReminders();
      return true;
    },
  }).then(() => dualsub.check()).catch(() => {});
  dualsub.onChange(() => { if (['settings', 'plus'].includes(parseHash().name)) route(); });

  /* 안드로이드 뒤로가기 — 앱을 끄지 말고 화면을 되돌린다.
     시트가 열려 있으면 시트만 닫고, 홈(첫 화면)에서만 앱을 나간다. */
  native.onBackButton(() => {
    if (updateWallUp()) { native.exitApp(); return; }   // 업데이트 안내는 닫을 수 없다
    if (guide.handleBack()) return;                    // 첫 사용 가이드 (1.7.2)
    if (permsetup.handleBack()) return;                // 처음 권한 안내 (1.7.8)
    if (ALARM.handleBack()) return;                      // 중요 습관 알람 화면 = 알람 끄기 (2026-11-01)
    if (window.__hkPhotoViewBack?.()) return;            // 사진 크게 보기 (2026-11-06)
    if (closeTimePicker()) return;                      // 앱 시간 고르기 창 (2026-10-31)
    if (closeTabMenu()) return;                         // 일정 탭의 [일정|습관] 펼침 메뉴
    if (document.querySelector('#sheetRoot .sheet')) { closeSheet(); return; }
    if (stickers.collapseDrawer()) return;              // 열린 스티커 서랍은 먼저 내린다
    if (!$('#lockscreen').hidden) { native.exitApp(); return; }
    if (parseHash().name === 'home' && depth() === 0) { native.exitApp(); return; }
    back();
  });

  const cfg = await lockConfig();
  $('#lockForgot').addEventListener('click', forgotPasscode);
  // 하드웨어 키보드로도 입력되게 (데스크톱·태블릿 키보드)
  document.addEventListener('keydown', (e) => {
    if ($('#lockscreen').hidden) return;
    if (/^[0-9]$/.test(e.key)) { e.preventDefault(); pinKey(e.key); }
    else if (e.key === 'Backspace') { e.preventDefault(); pinKey('back'); }
  });

  if (cfg) {
    showLock();
    return;                      // 잠금 해제 후 finishBoot()
  }
  await store.loadAll();
  $('#app').hidden = false;
  await finishBoot();
}

/* 탭바 아이콘 채우기 — index.html 의 <span class="tab-ico" data-i="…"> 에 SVG 를 넣는다 */
for (const s of $$('.tab-ico')) s.innerHTML = icon(s.dataset.i);

/* 아래 탭: 눌러도 기록이 쌓이지 않게 go() 로 옮긴다 */
for (const a of $$('.tab[data-tab]')) {
  a.addEventListener('click', (e) => {
    e.preventDefault();
    if (a.dataset.tab === 'plans') { toggleTabMenu(a); return; }   // [일정|습관] 펼침 (2026-10-30)
    if (parseHash().name === a.dataset.tab && depth() === 0) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    leaveTo('/' + a.dataset.tab);
  });
}
/** 쓰는 중이면 먼저 물어본 뒤 옮긴다 */
async function leaveTo(hash) {
  if (current?.view?.beforeLeave && !(await current.view.beforeLeave())) return;
  go(hash);
}

/* 탭바 '쓰기' 버튼 */
/* 1.7.5 (사용자 요청 2026-10-24): 오늘 쓴 글이 있어도 늘 새 글을 연다.
   예전엔 오늘 글이 있으면 그 글을 고치는 화면으로 가서, 하루에 두 번째 일기를 쓸 길이 안 보였다.
   오늘 쓴 글을 고치려면 홈의 '오늘 쓴 글'이나 달력에서 연다. */
/* ＋ 는 일기만 (2026-11-03 사용자: 일기 앱에 편지 버튼이 같이 있으면 헷갈린다) — 편지는 홈 '편지 쓰기' 카드에서 */
$('#tabWrite').addEventListener('click', () => {
  analytics.design('write:tab_new');
  leaveTo(`/write?d=${todayKey()}`);
});

/* 데이터가 바뀌면 현재 화면을 새로 그린다 (쓰기 화면은 제외 — 커서가 튄다).
   대량 저장(예시 데이터 넣기, 백업 가져오기) 때 수백 번 다시 그리지 않도록 묶어서 처리. */
let redrawTimer = null;
store.subscribe(() => {
  if (!booted || current?.name === 'write') return;
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(route, 60);
});

/* 키보드 단축키 (데스크톱) */
document.addEventListener('keydown', (e) => {
  if (e.target.matches('input, textarea')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const map = { n: () => $('#tabWrite').click(), h: () => leaveTo('/home'), c: () => leaveTo('/calendar'),
                s: () => leaveTo('/search'), i: () => leaveTo('/insights'), '/': () => leaveTo('/search') };
  if (map[e.key]) { e.preventDefault(); map[e.key](); }
});

/* 서비스 워커 — 오프라인 지원 (웹에서만. 네이티브 앱은 자산이 이미 기기 안에 있다) */
if ('serviceWorker' in navigator && location.protocol !== 'file:' && !native.isNative()) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => { /* localhost/https 아니면 실패해도 앱은 동작 */ });
  });
}

boot();

/* 다른 모듈에서 쓰는 공용 헬퍼 */
export { store };

/* ══ 습관 (2026-10-30) ══════════════════════════════════ */

/* 잠금을 켜고 끌 때 — 열쇠가 바뀌기 전에 읽어 두었다가 새 열쇠 상태로 다시 저장한다 */
async function habitsBeforeRekey() {
  try { const H = await import('./habits.js'); await H.load(); return H.isLockedOut() ? null : H.all(); } catch { return null; }
}
async function habitsAfterRekey(list) {
  if (!list) return;
  try { const H = await import('./habits.js'); await H.rewrite(list); } catch (e) { console.error('습관 다시 저장', e); }
}

/**
 * 습관 알림을 앞으로 7일치 다시 건다. 그날 이미 다 한 습관은 오늘 알림을 빼고,
 * 잠금을 켠 사람에게는 이름을 숨긴다(설정 habitNameInNotif 를 켜면 보인다).
 */
/* 중요 습관 알람 문구 (2026-11-01 사용자: '하루칸에서 알려드립니다. 약 먹을 시간이에요') */
export function alarmTexts(h, showName = true) {
  const med = h && (h.icon === '💊' || /약|medic|pill|remédio|ilaç|薬|药/i.test(h.name || ''));
  return {
    title: t('하루칸에서 알려드립니다'),
    body: !showName ? t('습관 알림 시간이에요.') : (med ? t('약 먹을 시간이에요') : t('{n} 할 시간이에요.', { n: h.name })),
    icon: showName ? (h.icon || '⏰') : '⏰',
    stop: t('알람 끄기'), done: t('다 했어요'), chName: t('중요 습관 알림'),
  };
}
let habitSyncT = null;
export async function syncHabitReminders() {
  if (!native.isNative()) return false;
  clearTimeout(habitSyncT);
  try {
    const H = await import('./habits.js');
    const C = await import('./habitcore.js');
    await H.load();
    if (H.isLockedOut()) return false;
    /* 습관은 플러스 전용 (2026-11-01). 못 쓰게 된 사람은 습관 알림을 거두고, 말없이 끊기지 않게 한 번 알린다 */
    const withRem = H.active().filter((h) => h.reminders?.length);
    if (!plus.canUseHabits(H.active())) {
      await native.setHabitTrialEndNotice(null);
      const r0 = await native.refreshHabitReminders([]);
      if (withRem.length) habitLockedNotice();
      return r0 === false ? false : 'locked';
    }
    if (await store.metaGet('hbLockedShown', false)) await store.metaDel('hbLockedShown');   // 다시 쓸 수 있게 됨 — 다음에 또 잃으면 다시 알린다
    /* 체험 중(플러스 아님): 체험이 끝나는 순간까지만 걸고, 그 순간에 '멈췄어요'를 한 번 */
    const trialEnd = !plus.isPlus() && plus.inTrial() ? plus.trialEndsAt() : null;
    const lockedOn = !!(await lockConfig());
    const showName = !lockedOn || store.getSettings().habitNameInNotif === true;
    const items = [];
    const now = new Date();
    for (let d = 0; d < 7; d++) {
      const day = C.addDays(C.keyOf(now), d);
      for (const h of H.active()) {
        if (!h.reminders?.length || !C.dueOn(h, day) || C.isSkip(h, day)) continue;
        /* 2026-11-02 사용자 신고: 약 먹기 아침 알람은 울렸는데 저녁 8시 30분 알람은 소리도 알림도 없었다 — 아침에 [다 했어요]·체크로 오늘이 '했음'이 되자
           그날 남은 알림 시각을 모두 빼 버렸다. 알림 시각이 여러 개인 습관(아침·저녁 약)은 시각마다 따로 챙기는 것 → 오늘 했어도 남은 시각은 울린다.
           알림 시각이 하나뿐이면 예전처럼 했으면 안 울린다. 그만 받고 싶은 날은 '건너뛰기' */
        if (C.dayDone(h, day) && !(h.reminders.length > 1 && day === C.keyOf(now))) continue;
        if (C.unitOf(h) !== 'day' && C.periodState(h, day, C.keyOf(now)).state === 'ok') continue;   // 이번 주·달 목표를 채웠다
        for (const tm of h.reminders) {
          const [hh, mm] = tm.split(':').map(Number);
          const at = C.dateOf(day); at.setHours(hh, mm, 0, 0);
          if (trialEnd && at.getTime() >= trialEnd) continue;
          items.push({
            habit: h.id, at,
            title: showName ? `${h.icon || ''} ${h.name}`.trim() : t('하루칸'),
            body: showName ? t('{n} 할 시간이에요.', { n: h.name }) : t('습관 알림 시간이에요.'),
            channelId: h.important && native.alarmAvailable() ? native.alarmChannel(h.sound) : '',   // 중요 알림 (1.8.0)
            /* 중요 알림은 알람처럼 울리고 '하루칸에서 알려드립니다 · 약 먹을 시간이에요' 알림에 [알람 끄기][다 했어요] (2026-11-01) */
            alarm: h.important && native.alarmAvailable() ? alarmTexts(h, showName) : null,
          });
        }
      }
    }
    const r = await native.refreshHabitReminders(items);
    await native.setHabitTrialEndNotice(trialEnd && withRem.length ? new Date(trialEnd) : null, t('하루칸'), t('체험이 끝나 습관 알림이 멈췄어요. 플러스로 다시 켤 수 있어요.'));
    return r;
  } catch (e) { console.error('습관 알림', e); return false; }
}

/* 앱을 켜 둔 채 체험이 끝날 때 (2026-11-02 점검에서 찾음): 배너 광고·배경·잠금 화면이 앱을 다시 켜야만 바뀌었다.
   돌아올 때와 1분마다 체험 상태를 보고, 바뀌었으면 그 자리에서 광고·배경·화면·습관 알림을 맞춘다 (쓰는 중인 글 화면은 다시 그리지 않는다) */
let trialWas = null;
function checkTrialEdge() {
  if (!booted) return;
  const now = plus.inTrial();
  if (trialWas === null || now === trialWas) { trialWas = now; return; }
  trialWas = now;
  analytics.design('trial:edge:' + (now ? 'on' : 'off'));
  ads.setTrial(now);
  try { applyTheme(); } catch { /* */ }
  if (!location.hash.startsWith('#/write')) Promise.resolve().then(() => route()).catch(() => {});
  syncHabitReminders();
  if (!now) trialEndNotice();   // 체험 끝 안내 (2026-11-03)
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') checkTrialEdge(); });
setInterval(checkTrialEdge, 60000);
/* 체험이 끝나 습관(알림)을 못 쓰게 된 걸 처음 열 때 한 번 알린다 — 다른 창·잠금 화면이 비켜 줄 때까지 잠깐 기다린다 */
let hbNoticeT = null;
function habitLockedNotice(tries = 0) {
  clearTimeout(hbNoticeT);
  hbNoticeT = setTimeout(async () => {
    if (await store.metaGet('hbLockedShown', false)) return;
    if (await trialEndDue()) { trialEndNotice(); return; }   // 체험 끝 안내가 습관 이야기까지 한 번에 한다 (2026-11-03)
    const busy = document.hidden || !$('#lockscreen').hidden || document.querySelector('#sheetRoot .sheet, .live-ov, .tp-root, .ob-root, .ps-root') || location.hash.startsWith('#/write');
    if (busy) { if (tries < 20) habitLockedNotice(tries + 1); return; }
    await store.metaSet('hbLockedShown', true);
    analytics.design('habit:trial_end_notice');
    const { confirmSheet } = await import('./ui.js');
    const yes = await confirmSheet({ title: t('습관 알림이 멈췄어요'), text: t('만들어 둔 습관과 기록은 그대로 있어요. 플러스를 사면 다시 체크하고 알림을 받을 수 있어요.'), ok: t('플러스 보기') });
    analytics.design('habit:locked:notice_' + (yes ? 'plus' : 'close'));
    if (yes) plus.goPlus('habit_trial_end');
  }, tries ? 3000 : 2500);
}
/* 30일 체험이 끝났을 때 한 번 (2026-11-03 월 이용권, 시안 mp_5_trialend):
   무엇이 무료로 남는지 · 자동 결제 없음 · [월 ○○로 계속 쓰기] [평생 ○○] [무료로 계속 쓰기].
   체험을 받았던 사람 중 플러스(평생·월)가 아닌 사람만. 글 쓰는 화면·잠금 화면·다른 창이 떠 있으면 비켜 줄 때까지 기다린다.
   습관이 잠겼으면 '습관이 멈췄어요' 안내를 따로 띄우지 않고 여기 한 줄로 합친다 */
async function trialEndDue() {
  if (!native.isNative() || plus.isPlus() || !plus.hadTrial() || plus.inTrial()) return false;
  return !(await store.metaGet('trialEndShown', false));
}
let teNoticeT = null;
export function trialEndNotice(tries = 0) {
  clearTimeout(teNoticeT);
  teNoticeT = setTimeout(async () => {
    if (!(await trialEndDue())) return;
    const busy = document.hidden || !$('#lockscreen').hidden || document.querySelector('#sheetRoot .sheet, .live-ov, .tp-root, .ob-root, .ps-root, .alarm-root') || location.hash.startsWith('#/write');
    if (busy) { if (tries < 20) trialEndNotice(tries + 1); return; }
    await store.metaSet('trialEndShown', true);
    let habitLine = '';
    try {
      const H = await import('./habits.js'); await H.load();
      const act = H.active();
      if (act.length && !plus.canUseHabits(act)) {
        habitLine = ' ' + t('만들어 둔 습관과 기록은 그대로 있어요. 습관 알림도 플러스로 다시 켤 수 있어요.');
        await store.metaSet('hbLockedShown', true);   // 습관 안내는 여기서 한 셈
      }
    } catch { /* 습관을 못 읽어도 안내는 띄운다 */ }
    analytics.design('plus:trialend:shown');
    const { openSheet } = await import('./ui.js');
    const mp = plus.monthlyPrice(), lp = plus.price();
    let chose = false;
    const pick = (k, fn) => () => { chose = true; analytics.design('plus:trialend:' + k); fn?.(); };
    openSheet({
      center: true,
      title: t('30일 무료 체험이 끝났어요'),
      text: t('일기·사진·기본 스티커 56종·잠금·백업 파일 만들기는 그대로 무료예요. 습관·배경 꾸미기·글자 상자 같은 플러스 기능은 이용권으로 계속 쓸 수 있어요. 자동으로 결제되지는 않아요.') + habitLine,
      items: [
        { label: mp ? t('월 {p}로 계속 쓰기', { p: mp }) : t('월 이용권으로 계속 쓰기'), sub: t('언제든 해지'), icon: 'heart', onClick: pick('monthly', () => plus.confirmMonthly('trial_end')) },
        { label: lp ? t('평생 {p}', { p: lp }) : t('평생 이용권'), sub: t('한 번만 결제'), icon: 'check', onClick: pick('lifetime', () => plus.buyLifetime('trial_end')) },
        { label: t('무료로 계속 쓰기'), icon: 'chev', onClick: pick('free') },
      ],
      onClose: () => setTimeout(() => { if (!chose) analytics.design('plus:trialend:close'); }, 0),   // 버튼을 누르면 창이 먼저 닫히고 그다음 고른 것이 불린다
    });
  }, tries ? 3000 : 2200);
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && booted) {
    /* 그림 알림(새 기능 안내)을 눌러 돌아왔으면 그 화면으로 (1.8.1) — 앱이 살아 있던 경우. 잠금이 걸려 있으면 푸는 순간 route 가 다시 그린다 */
    if (native.isNative()) campaign.takeRoute().then((cr) => { if (cr) go(cr); }).catch(() => {});
    /* 홈 화면 위젯을 눌러 돌아왔으면 그 화면으로 (1.8.4) */
    if (native.isNative()) import('./widget.js').then((W) => W.takeRoute()).then((wr) => { if (wr) { widgetOpened(wr); go(wr); } }).catch(() => {});
    ALARM.check().catch(() => {}); dualsub.onResume().catch(() => {}); clearTimeout(habitSyncT); habitSyncT = setTimeout(() => syncHabitReminders(), 1500); }
});

/* 일정 탭의 [일정|습관] 펼침 메뉴 — 동그라미 두 개가 '뽁' 하고 튀어 오른다 (사용자 지시 2026-10-30) */
let tabMenu = null;
export function closeTabMenu() {
  if (!tabMenu) return false;
  const m = tabMenu; tabMenu = null;
  m.classList.remove('on');
  setTimeout(() => m.remove(), 260);
  return true;
}
function toggleTabMenu(tabEl, itemsIn = null) {
  if (closeTabMenu()) return;
  const r = tabEl.getBoundingClientRect();
  const m = el('div', { class: 'tabmenu', role: 'menu' });
  const scrim = el('div', { class: 'tabmenu-scrim' });
  scrim.addEventListener('click', closeTabMenu);
  m.append(scrim);
  const cx = r.left + r.width / 2;
  const items = itemsIn || [
    { k: 'plans', ico: 'cal', label: t('일정'), dx: -46, go: '/plans' },
    { k: 'habits', ico: 'check', label: t('습관'), dx: 46, go: '/habits' },
  ];
  items.forEach((it, i) => {
    const b = el('button', { class: 'tabmenu-b tabmenu-' + it.k, type: 'button', role: 'menuitem', style: `left:${cx}px;bottom:${window.innerHeight - r.top + 14}px;--dx:${it.dx}px;--d:${i * 50}ms` },
      `<span class="tabmenu-c">${icon(it.ico)}</span><span class="tabmenu-l">${esc(it.label)}</span>`);
    if (it.k === 'habits') {
      if (!plus.canUseHabits()) { const pb = el('span', { class: 'plus-mini tabmenu-plus' }, 'PLUS'); b.append(pb); }   // 플러스 전용 (2026-11-01)
      else NB.corner(b, 'habit');   // 새 기능 NEW (패치 13 뒤, 사용자 지시 2026-10-31)
    }
    b.addEventListener('click', () => { closeTabMenu(); analytics.design('tabmenu:' + it.k); leaveTo(it.go); });
    m.append(b);
  });
  document.body.append(m);
  tabMenu = m;
  requestAnimationFrame(() => requestAnimationFrame(() => m.classList.add('on')));
}

/* 반복 할 일 넘기기 — 날짜가 바뀌면(자정·다시 열었을 때) 지난 회차를 오늘로 옮기고 알림을 다시 건다 (2026-11-01) */
let planDayKey = '';
let planDayTimer = 0;
function planDayWatch() {
  planDayKey = todayKey();
  const check = async () => {
    const k = todayKey();
    if (k === planDayKey) return;
    planDayKey = k;
    try {
      const plans = await import('./plans.js');
      const changed = await plans.rollover();
      const { syncReminders } = await import('./views/plans.js');
      await syncReminders();
      if (changed && current && /^(plans|calendar)$/.test(current.name || '')) go(location.hash.slice(1) || '/home', { replace: true });
    } catch (e) { console.error(e); }
  };
  const arm = () => {
    clearTimeout(planDayTimer);
    const n = new Date(); const next = new Date(n.getFullYear(), n.getMonth(), n.getDate() + 1, 0, 0, 5);
    planDayTimer = setTimeout(() => { check().finally(arm); }, Math.min(next - n, 2 ** 31 - 1));
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { check(); arm(); } });
  arm();
}