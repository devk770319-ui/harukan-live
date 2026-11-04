/* ===========================================================
   dualsub.js — 월 이용권을 쓰다가 평생 이용권을 산 사람에게 '월 이용권 해지' 안내 (2026-11-04 사용자:
   "평생 이용권으로 바꾼 직후 월 이용권 해지하러 가기 창 … 사용자에게 바로 인지할 수 있는 가이드를 제공해야 해")

   구글 정기 결제는 앱이 대신 해지할 수 없다. 평생을 사도 월 이용권은 계속 자동 결제되므로
   · 평생 구매가 확인된 직후 가운데 창: '평생 이용권이 켜졌어요' + 언제 얼마가 결제되는지(강조) + 해지 3단계 + [지금 해지하러 가기]
   · 해지 전까지: 앱을 열 때 하루 한 번 같은 창, 플러스 화면 맨 위·설정 플러스 줄 아래에 경고 카드
   · 자동 갱신이 꺼지면(Play 영수증 autoRenewing=false) 또는 월 이용권이 끝나면 전부 저절로 사라진다
   글 쓰는 화면·잠금·알람·다른 창 위에는 띄우지 않고 비켜 줄 때까지 기다린다 (체험 끝 안내와 같은 방식).
   분석: plus:dualsub:shown / :go / :later / :resolved
   =========================================================== */
import * as store from './store.js';
import * as billing from './billing.js';
import * as plus from './plus.js';
import * as analytics from './analytics.js';
import { t } from './i18n.js';

const K_PENDING = 'dualSubPending';
const K_DAY = 'dualSubShownDay';

let changeCb = null;
/** 상태가 바뀌면(경고가 생기거나 사라지면) 부른다 — app.js 가 화면을 다시 그린다 */
export function onChange(fn) { changeCb = fn; }

/** 평생 이용권이 있는데 월 이용권이 아직 자동 갱신 중인가 (자동 갱신 여부를 모르면 '갱신 중'으로 본다) */
export function pending() {
  return plus.isLifetime() && billing.monthlyRenewState() === 'renewing';
}

function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Play 스토어의 하루칸 월 이용권 페이지로 */
export function openManage(from = 'sheet') {
  analytics.design('plus:dualsub:go' + (from === 'sheet' ? '' : ':' + from));
  try { window.__hkOutAt = Date.now(); } catch { /* */ }   // 일부러 나가는 길 — 돌아와도 다시 잠그지 않는다
  window.open(plus.MONTHLY_MANAGE_URL, '_blank');
}

/**
 * 상태 확인. 해결됐으면 표시를 지우고 :resolved, 아직이면 (오늘 아직 안 보였거나 force 면) 창을 띄운다.
 * 여러 곳에서 불려도 창은 하나만 (마지막 부름 기준으로 한 번)
 */
let timer = null, wantForce = false, showing = false;
export function check({ force = false } = {}) {
  wantForce = wantForce || force;
  clearTimeout(timer);
  timer = setTimeout(() => run(0), force ? 1200 : 1800);
}
async function run(tries) {
  const now = pending();
  const was = !!(await store.metaGet(K_PENDING, false));
  if (now !== was) {
    await store.metaSet(K_PENDING, now);
    if (!now) analytics.design('plus:dualsub:resolved');
    try { changeCb?.(); } catch { /* */ }
  }
  if (!now) { wantForce = false; return; }
  if (showing) return;
  if (!wantForce && (await store.metaGet(K_DAY, '')) === dayKey()) return;
  const busy = document.hidden || document.querySelector('#lockscreen')?.hidden === false
    || document.querySelector('#sheetRoot .sheet, .live-ov, .tp-root, .ob-root, .ps-root, .alarm-root') || location.hash.startsWith('#/write');
  if (busy) { if (tries < 20) timer = setTimeout(() => run(tries + 1), 3000); return; }
  wantForce = false;
  await store.metaSet(K_DAY, dayKey());
  await openGuide('auto');
}

/** 해지 안내 창 (경고 카드의 [해지하러 가기]도 이 창을 연다) */
export async function openGuide(from = 'auto') {
  const { el, esc, icon, openSheet, closeSheet } = await import('./ui.js');
  showing = true;
  analytics.design('plus:dualsub:shown' + (from === 'auto' ? '' : ':' + from));
  const mp = plus.monthlyPrice();
  const next = await plus.monthlyNextCharge();
  const warn = next && mp ? t('월 이용권은 자동으로 해지되지 않아요. 지금 해지하지 않으면 {d}에 {p}이 결제돼요.', { d: plus.fmtDay(next), p: mp })
    : mp ? t('월 이용권은 자동으로 해지되지 않아요. 지금 해지해야 다음 달 {p}이 결제되지 않아요.', { p: mp })
      : t('월 이용권은 자동으로 해지되지 않아요. 지금 해지해야 다음 달에 결제되지 않아요.');
  const box = el('div', { class: 'dsub-guide' });
  const step = (n, txt) => `<li class="dsub-step"><span class="dsub-num">${n}</span><span class="dsub-tx">${esc(txt)}</span></li>`;
  box.innerHTML =
    `<div class="dsub-warn">${icon('info')}<span>${esc(warn)}</span></div>`
    + `<div class="dsub-sub">${esc(t('해지는 1분이면 돼요'))}</div>`
    + `<ol class="dsub-steps">`
    + step(1, t('아래 [지금 해지하러 가기]를 눌러요'))
    + step(2, t("Play 스토어에서 '하루칸 플러스 월 이용권'이 보이면 눌러요"))
    + step(3, t("'정기 결제 취소'를 눌러요"))
    + `</ol>`
    + `<div class="dsub-note">${esc(t('해지해도 손해 없어요. 평생 이용권으로 플러스를 계속 써요.'))}</div>`;
  let chose = false;
  const goBtn = el('button', { class: 'btn btn-primary btn-block dsub-go', type: 'button' }, esc(t('지금 해지하러 가기')));
  const later = el('button', { class: 'btn btn-ghost btn-block dsub-later', type: 'button' }, esc(t('나중에 할게요')));
  goBtn.addEventListener('click', () => { chose = true; closeSheet(); openManage(from === 'auto' ? 'sheet' : from); });
  later.addEventListener('click', () => { chose = true; analytics.design('plus:dualsub:later'); closeSheet(); });
  box.append(goBtn, later);
  openSheet({ center: true, title: t('평생 이용권이 켜졌어요'), content: box,
    onClose: () => { showing = false; setTimeout(() => { if (!chose) analytics.design('plus:dualsub:later'); }, 0); } });
}

/** 플러스 화면 맨 위·설정에 붙이는 경고 카드. 해당 없으면 null */
export async function card(from = 'plus') {
  if (!pending()) return null;
  const { el, esc, icon } = await import('./ui.js');
  const c = el('div', { class: 'dsub-card' });
  c.innerHTML = `<div class="dsub-card-t">${icon('info')}<span>${esc(t('월 이용권이 아직 해지되지 않았어요'))}</span></div>`
    + `<div class="dsub-card-s">${esc(t('평생 이용권이 있어 월 이용권은 필요 없어요. 해지하지 않으면 매달 결제돼요.'))}</div>`;
  const b = el('button', { class: 'btn btn-primary btn-block', type: 'button' }, esc(t('해지하러 가기')));
  b.addEventListener('click', () => openGuide(from));
  c.append(b);
  return c;
}

/** 앱으로 돌아왔을 때: Play 스토어에서 해지하고 왔을 수 있으니 보유 내역을 다시 받아 확인 */
export async function onResume() {
  if (!(await store.metaGet(K_PENDING, false))) return;
  await billing.refresh();
  check();
}
