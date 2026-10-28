/* ===========================================================
   ads.js — 배너 광고 (AdMob)
   · 홈·달력·발견 화면에서만 띄운다.
     쓰기·잠금·글 보기 화면에는 절대 띄우지 않는다 — 일기 쓰고 읽는
     순간을 광고가 방해하면 이 앱의 존재 이유가 무너진다.
   · 배너는 화면 맨 아래(탭바 밑)에 붙고, 탭바와 내용은 그만큼 올라간다.
   · '하루칸 플러스'를 구매하면 adFree 메타가 켜지고 이 모듈은 잠든다.
   · 웹 브라우저에서는 아무것도 하지 않는다.
   =========================================================== */

import * as store from './store.js';
import { isNative } from './native.js';
import * as analytics from './analytics.js';

/* 실제 광고 단위. AndroidManifest.xml 의 APPLICATION_ID 와 짝이다 —
   한쪽만 바꾸면 광고가 안 나오는데 오류도 안 떠서 찾기 어렵다.
   앱 ID: ca-app-pub-2225959721715281~9622260568 */
const AD_UNIT_BANNER = 'ca-app-pub-2225959721715281/5048590736';

/* 개발용 기기. 여기 적힌 기기에는 실제 광고 대신 테스트 광고가 나온다.
   자기 앱의 진짜 광고를 누르면 '무효 트래픽'으로 AdMob 계정이 정지될 수 있다.

   ⚠ 이 해시는 앱마다 다르다. 다른 앱에서 쓰던 값을 가져다 쓰면 안 먹는다.
     (트럭러시 값 48E5EC7D… 을 넣었더니 하루칸에서는 통하지 않았다.)
   값을 얻는 법: 앱을 실행하고 logcat 에서 아래 줄을 찾는다.
     I Ads: Use RequestConfiguration.Builder().setTestDeviceIds(Arrays.asList("여기")) …
   기기를 바꾸거나 앱을 새로 만들면 다시 확인할 것. */
const TEST_DEVICES = ['E156941724EF540240C26F9B251417A6'];   // 갤럭시 S25 (SM-S931N) · 하루칸
/* 광고를 띄우는 화면.
   기준은 "일기를 쓰는 중인가" 하나다. 쓰기(write)와 잠금 화면에는 넣지 않는다.
   글을 쓰는 순간을 광고가 방해하면 이 앱을 쓸 이유가 없어지고, 키보드 바로
   윗줄은 오타로 누르기 가장 쉬운 자리라 실수 클릭 위험도 가장 크다.

   글 읽기(entry)는 넣는다 — 키보드를 쓰지 않아 실수 클릭 위험이 없고,
   지난 글을 읽는 동안은 오래 머문다.
   설정도 넣는다 — 플러스를 권하는 줄과 같은 화면에 배너가 떠 있어야
   무엇을 없애려고 돈을 내는지 눈으로 보인다. */
const SHOW_ON = new Set(['home', 'calendar', 'insights', 'plans', 'settings', 'entry']);

let ready = false;        // initialize 까지 끝났나
let shown = false;        // showBanner 를 한 번이라도 불렀나
let visible = false;      // 지금 화면에 보이나
let adFree = false;
let route = '';
let locked = true;
let walled = false;       // 업데이트 안내 화면이 덮고 있나 (그 위에 배너가 뜨면 안 된다)
/* 업데이트가 필요한지 아직 모른다. 옛 버전에서 체험이 끝난 사용자가 앱을 켜면 배너를 먼저
   요청했다가 0.3초 뒤 업데이트 안내가 덮어 숨겼다 → 노출 없는 요청만 남았다 (2026-10-15 확인).
   답을 들을 때까지(최대 5초) 띄우지 않는다. */
let updKnown = false;
let typing = false;       // 입력칸에 커서가 있나 (키보드가 올라와 있다)
let lastH = 0;            // 마지막으로 확인된 배너 높이 (다시 띄울 때 여백 복원용)
let busy = Promise.resolve();   // show/hide 가 겹치지 않게 줄 세운다

/* ── 키보드가 올라오면 배너를 감춘다 ─────────────
   안드로이드는 키보드가 뜨면 화면을 줄인다. 배너는 화면 맨 아래에 붙어 있으므로
   키보드 바로 위까지 따라 올라온다. 거기는 오타로 누르기 가장 쉬운 자리다.
   AdMob 은 실수 클릭을 유발하는 배치를 금지하고, 그런 클릭이 쌓이면
   '무효 트래픽'으로 계정이 정지될 수 있다. 수익보다 잃는 게 크다.

   키보드 자체를 감지하지 않고 "입력칸에 커서가 있는가"를 본다.
   화면 크기로 재는 방법은 기기·회전·전체화면 설정에 따라 흔들리는데,
   포커스는 그런 것에 흔들리지 않고 의도와도 정확히 맞는다. */
function isTextField(node) {
  if (!node) return false;
  if (node.isContentEditable) return true;
  if (node.tagName === 'TEXTAREA') return true;
  if (node.tagName !== 'INPUT') return false;
  /* 시간·날짜·선택 칸은 키보드가 아니라 고르기 창이 뜬다 (1.6.9). 배너를 숨기면 화면이 56px 출렁여
     누른 칸이 손가락 아래에서 빠져나간다 — 그러면 고르기 창이 안 열릴 수 있다 */
  const type = (node.getAttribute('type') || 'text').toLowerCase();
  return !['time', 'date', 'datetime-local', 'month', 'week', 'checkbox', 'radio', 'range', 'color', 'file', 'button', 'submit'].includes(type);
}

function watchKeyboard() {
  document.addEventListener('focusin', (e) => {
    if (!isTextField(e.target) || typing) return;
    typing = true;
    sync();
  });
  document.addEventListener('focusout', () => {
    // 다음 입력칸으로 옮겨가는 중일 수 있다. 한 박자 뒤에 실제 상태를 본다 —
    // 안 그러면 칸을 옮길 때마다 배너가 깜빡인다.
    setTimeout(() => {
      const now = isTextField(document.activeElement);
      if (now === typing) return;
      typing = now;
      sync();
    }, 150);
  });
}

function AdMob() { return window.Capacitor?.Plugins?.AdMob || null; }

function setPad(px) {
  const h = Math.max(0, Math.round(px));
  document.documentElement.style.setProperty('--ad-h', `${h}px`);
  // 배너가 떠 있는 동안 탭바는 배너 위에 앉는다 — 제스처 바 몫의 여백은 css 에서 접는다
  document.documentElement.classList.toggle('has-ad', h > 0);
}

/** 제스처 바 높이 (css px = dp). env() 는 계산된 값으로 못 읽어서 실측한다. */
function safeBottom() {
  const p = document.createElement('div');
  p.style.cssText = 'position:fixed;left:-9999px;bottom:0;width:1px;height:env(safe-area-inset-bottom,0px);';
  document.body.append(p);
  const h = p.getBoundingClientRect().height;
  p.remove();
  return Math.round(h);
}

/* 체험 중에는 배너를 아예 띄우지 않는다.
   plus.js 를 정적으로 가져오면 ads → plus → ads 로 import 가 맞물리므로
   app.js 가 setTrial 로 알려준다.

   ⚠ 첫 값은 null(아직 모름)이다. false 로 두면 안 된다.
     예전에는 false 로 시작했는데, 앱을 켤 때 AdMob 초기화가 app.js 의
     syncTrial() 보다 먼저 끝나면 "체험 아님"으로 읽혀 showBanner(광고 요청)가
     나가고, 곧바로 setTrial(true) 가 숨겼다. 화면에는 안 보였지만 AdMob 에는
     요청만 쌓였다 (2026-10-11 하루칸 배너: 요청 6 · 일치율 100% · 노출 0).
     모르는 동안에는 띄우지 않는 쪽이 맞다. */
let trial = null;

/** app.js 가 체험 상태를 알려준다. 체험이 아님이 확인되거나 체험이 끝나면 그 자리에서 배너가 붙는다. */
export function setTrial(v) {
  const was = trial;
  trial = !!v;
  if (trial) {
    if (was !== true) { visible = false; setPad(0); queue(hide); }
  } else if (was !== false) {
    sync();                           // 체험이 방금 끝났거나, 체험 대상이 아님이 방금 확인됐다
  }
}

/* show/hide 는 반드시 한 줄로 세운다. 줄 밖에서 hide 를 부르면
   아직 진행 중인 show 와 순서가 뒤엉킨다. */
function queue(fn) {
  busy = busy.then(fn).catch((e) => console.error('광고', e));
}

/* 네이티브 호출은 안 끝날 수도 있다(앱이 백그라운드로 내려갈 때 등). 하나가 매달리면
   줄 전체가 멈춰서 숨기기·여백 되돌리기가 영영 안 일어난다 — 길어도 6초만 기다린다 */
function bridge(p, ms = 6000) {
  return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('ad-bridge-timeout')), ms))]);
}

export async function init() {
  const ad = AdMob();
  if (!isNative() || !ad) return;
  adFree = await store.metaGet('adFree', false);
  if (adFree) return;

  try {
    // 배너 크기는 기기마다 다르다(적응형). 실제로 잡힌 높이만큼 화면을 밀어올린다.
    // 플러그인은 dp 로 보내고, WebView 에서 dp = css px 라 그대로 쓴다.
    /* 여백은 플러그인이 알려주는 '실제 배너 크기'로만 정한다 (1.6.5).
       크기 0 은 배너가 없다는 뜻이다 — 숨김·제거·로드 실패 때 플러그인이 0 을 보낸다. */
    ad.addListener('bannerAdSizeChanged', (s) => {
      const h = s?.height || 0;
      if (h) lastH = h;
      setPad(visible ? h : 0);
    });
    /* 광고 4단계 (익명 통계): offer = 배너를 띄우려 함(show), done = 노출, click = 눌러서 열림, fail = 못 받음.
       어느 화면이었는지(route)를 자리 이름으로 붙인다 */
    /* 로드 실패 — 플러그인은 이때 배너를 통째로 부수고 없앤다(처음 로드든 60초마다의 새로고침이든).
       예전엔 그걸 모르고 다음에 resumeBanner(할 게 없어 아무 일도 안 함)를 부른 뒤 기억해 둔 높이로
       여백을 되살렸다 → 배너는 없는데 아래 메뉴만 떠 있었다 (1.6.4 사용자 신고, 실기기 재현).
       이제는 '배너 없음'으로 적어 두고, 다음에 보여줄 때 새로 만든다. */
    ad.addListener('bannerAdFailedToLoad', () => {
      shown = false; lastH = 0; setPad(0);
      analytics.ad('banner', route, 'fail');
      if (visible) { visible = false; setTimeout(sync, 60000); }   // 1분 뒤 다시 시도 (바로 재요청하면 실패가 쌓인다)
    });
    ad.addListener('bannerAdImpression', () => analytics.ad('banner', route, 'done'));
    ad.addListener('bannerAdOpened', () => analytics.ad('banner', route, 'click'));
    /* 등록한 기기에만 테스트 광고를 내보낸다. 그 외 사용자에게는 실제 광고가 나간다.
       initializeForTesting 을 켜야 testingDevices 목록이 실제로 적용된다. */
    await ad.initialize({ testingDevices: TEST_DEVICES, initializeForTesting: true });
    ready = true;
    setTimeout(onUpdateKnown, 5000);    // 업데이트 확인이 답을 못 받아도 5초 뒤에는 띄운다
    watchKeyboard();
    sync();
  } catch (e) {
    console.error('광고 초기화 실패', e);
  }
}

/** 화면이 바뀔 때마다 app.js 가 불러준다 */
export function onRoute(name) { route = name; sync(); }
/** 잠금 화면이 뜨고 사라질 때 */
export function onLock(v) { locked = v; sync(); }
/** 업데이트 안내 화면이 뜨고 사라질 때. 배너는 네이티브 뷰라 웹 화면 위를 덮는다 */
export function onUpdateWall(v) { walled = v; sync(); }
/** 업데이트 확인이 끝났을 때 (필요하면 안내 화면을 먼저 띄운 뒤에) app.js 가 부른다 */
export function onUpdateKnown() { if (updKnown) return; updKnown = true; sync(); }

function sync() {
  if (!ready || adFree || trial !== false || !updKnown) return;   // 체험 중이거나, 체험·업데이트 여부를 아직 모르면 띄우지 않는다
  const want = !locked && !walled && !typing && SHOW_ON.has(route);
  if (want === visible) return;
  visible = want;
  // 연달아 화면을 넘겨도 브리지 호출이 순서대로 가게 한다
  queue(want ? show : hide);
}

async function show() {
  const ad = AdMob();
  if (!ad) return;
  analytics.ad('banner', route, 'offer');
  if (!shown) {
    shown = true;
    // 안드로이드 15+ 에서 플러그인이 제스처 바 높이만큼 배너를 위로 띄운다 (구글 지침).
    // 화면 맨 아래에 딱 붙이고 싶으므로 그만큼 음수 여백으로 상쇄한다.
    // 단 3버튼 내비게이션(≈48dp)은 진짜 버튼이 가려지므로 상쇄하지 않는다 — 제스처(≈24dp)만.
    const sb = safeBottom();
    await bridge(ad.showBanner({
      adId: AD_UNIT_BANNER,
      adSize: 'ADAPTIVE_BANNER',
      position: 'BOTTOM_CENTER',
      margin: sb > 0 && sb <= 36 ? -sb : 0,
      /* false 여야 실제 광고가 나간다. 개발 기기는 위 testingDevices 로 걸러진다 —
         여기를 true 로 두면 모든 사용자에게 테스트 광고가 나가고 수익이 0 이 된다. */
      isTesting: false,
    }));
  } else {
    /* resumeBanner 는 배너가 있을 때만 다시 보이고 실제 크기 이벤트를 보낸다 — 여백은 그 이벤트가 정한다.
       배너가 없으면(플러그인이 치웠으면) 아무 일도 안 하고 끝난다. 예전처럼 기억해 둔 높이를 돌려놓으면
       배너 없이 메뉴만 떠 있게 된다. */
    await bridge(ad.resumeBanner());
  }
}

async function hide() {
  const ad = AdMob();
  if (!ad) return;
  setPad(0);
  if (!shown) return;
  try { await bridge(ad.hideBanner()); }
  catch (e) {
    // "never shown" — 플러그인 쪽에서 이미 배너가 없어졌다. 다음에는 새로 만든다
    if (/never shown/i.test(e?.message || '')) shown = false;
    else throw e;
  }
}

/**
 * '광고 없이 쓰기' 구매가 완료되면 부른다 (Play 결제 붙일 때 연결).
 * 즉시 배너를 없애고 다시는 켜지 않는다.
 */
export async function setAdFree(v) {
  adFree = !!v;
  await store.metaSet('adFree', adFree);
  if (adFree) {
    visible = false;
    setPad(0);
    try { await AdMob()?.removeBanner(); } catch { /* 없으면 그만 */ }
  } else {
    sync();
  }
}

export function isAdFree() { return adFree; }

/* 부팅 맨 앞에서 플러스 여부만 먼저 읽는다 (1.5.0).
   init() 은 광고 플러그인을 기다리느라 늦게 끝나고 기다려 주지도 않는다. 그 사이 배경 꾸미기가
   '플러스 아님'으로 보고 기본 배경을 그렸다가 바뀌는 일을 막는다. */
export async function loadAdFree() {
  if (!adFree) adFree = !!(await store.metaGet('adFree', false));
  return adFree;
}
