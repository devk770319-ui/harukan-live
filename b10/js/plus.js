/* ===========================================================
   plus.js — 하루칸 플러스 (한 번 구매)

   담는 것: 배너 광고 제거 + 일정 무제한.

   왜 "잠금"이 아니라 "한도"인가:
   써보지 않은 기능은 사고 싶어지지 않는다. 광고 제거가 팔리는 이유는
   사용자가 광고를 매일 느끼기 때문이다. 일정도 같아야 한다 — 먼저 쓰게 하고,
   편하다고 느낀 뒤에 한도를 만나야 결제가 자연스럽다.
   탭을 잠가버리면 (1) 안 써봤으니 가치를 모르고 (2) 무료 사용자가
   그 화면에 못 들어오니 광고 자리도 같이 사라진다.

   ⚠ 저장 키가 아직 'adFree' 인 것은 역사적 이유다. 광고 제거만 팔던 시절의
     이름이라, 이미 구매한 분들의 권한을 그대로 살리려고 바꾸지 않았다.
     Play 콘솔의 상품 ID(remove_ads) 도 같은 이유로 그대로 둔다.
     이름만 바꾸면 이미 사신 분들의 구매가 인식되지 않는다.
   =========================================================== */

import * as ads from './ads.js';
import * as store from './store.js';
import * as billing from './billing.js';
import { isNative } from './native.js';
import * as analytics from './analytics.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';

/** 무료로 동시에 둘 수 있는 "안 끝난" 일정 수. 끝낸 것은 세지 않는다. */
export const FREE_PLAN_LIMIT = 5;

/* ── 30일 무료 체험 ──────────────────────────────
   처음 30일은 광고도 한도도 없다.

   7일이 아니라 30일인 이유: 이 앱은 글이 쌓여야 값을 한다. 되새김의
   '한 달 전' 카드도, 발견의 칩-기분 비교(같은 칩 3번 이상)도, 나의 단어의
   IDF 도 일주일치로는 아무 말을 못 한다. 아직 좋아지지 않은 앱을 보여준 뒤
   빼앗으면 사는 대신 지운다. 한 달이면 되새김이 처음 말을 걸기 시작한다. */
export const TRIAL_DAYS = 30;

/** 체험 시작 시각. 없으면(옛 사용자·첫 실행 전) 0 으로 본다. */
function trialStart() { return store.getSettings().trialStartedAt || 0; }

/** 체험이 끝나는 시각(ms). 시작 기록이 없으면 null */
export function trialEndsAt() {
  const t = trialStart();
  return t ? t + TRIAL_DAYS * 86400000 : null;
}

/** 체험을 받은 적이 있나 (1.6.3 부터 새로 설치한 사람은 체험이 없다) — 안내 문구를 고를 때 쓴다 */
export function hadTrial() { return !!trialStart(); }

/** 지금 체험 중인가 */
export function inTrial() {
  const end = trialEndsAt();
  return !!end && Date.now() < end;
}

/** 체험이 며칠 남았나 (체험 중이 아니면 null). 하루도 안 남았으면 1 로 올린다 */
export function trialDaysLeft() {
  const end = trialEndsAt();
  if (!end || Date.now() >= end) return null;
  return Math.max(1, Math.ceil((end - Date.now()) / 86400000));
}

/**
 * 한도 없이 쓸 수 있는 상태인가.
 * 산 사람, 체험 중인 사람, 그리고 살 방법이 없는 웹(PWA) 사용자.
 */
function unlimited() { return !isNative() || isPlus() || inTrial(); }

/**
 * 체험 중에 넣어둔 일정은 체험이 끝나도 인질로 잡지 않는다.
 * 체험 동안 도달한 최대 개수를 바닥값으로 두어, 이미 넣은 것은 그대로 두고
 * "더 넣으려면 사라"까지만 말한다. 많이 쓴 것이 벌이 되면 안 된다.
 */
export function planCeiling() {
  return Math.max(FREE_PLAN_LIMIT, store.getSettings().planFloor || 0);
}

/** 권한은 한 곳에서만 관리한다 — ads.js 가 이미 들고 있으므로 그걸 그대로 쓴다 */
export function isPlus() { return ads.isAdFree(); }
export async function setPlus(v) { return ads.setAdFree(v); }

/**
 * 지금 일정을 하나 더 넣을 수 있나.
 * 웹(PWA)에는 광고도 결제도 없다. 살 방법이 없는 곳에서 한도만 걸면
 * 빠져나갈 길 없이 막히는 셈이라, 한도는 네이티브에서만 적용한다.
 */
export function canAddPlan(activeCount) {
  if (unlimited()) return true;
  return activeCount < planCeiling();
}

/** 남은 개수 (한도가 없는 상황이면 null — 셀 이유가 없다) */
export function plansLeft(activeCount) {
  if (unlimited()) return null;
  return Math.max(0, planCeiling() - activeCount);
}

/* ⚠ 사진 달력은 플러스 기능이지만 아직 개발 중이라 모두에게 열어둔다.
     출시 전에 이 줄만 false 로 바꾸면 잠긴다 — 다른 곳은 손댈 필요 없다.
     여기 한 줄로 모아둔 이유가 그것이다. 조건을 여러 화면에 흩뿌리면
     나중에 하나를 빠뜨린 채로 출시된다. */
/** 달력을 사진으로 채울 수 있나 — 플러스 (2026-10-24 사용자 확인: "사진달력은 플러스 기능").
    플러스를 산 사람과 30일 체험 중인 사람. 체험이 끝나면 달력은 일반 보기로 그려진다 (calendar.js). */
export function canPhotoCalendar() {
  return !isNative() || isPlus() || inTrial();
}

/** 사진 묶음(콜라주)을 새로 만들 수 있나 — 플러스 (2026-10-24 사용자 확인).
    이미 만든 묶음은 누구나 보고, 빈 칸 채우기·틀 바꾸기·사진 빼기도 된다 — 새 묶음 만들기만 막는다.
    사진 넣기·글 사이 자리·크기 조절은 기본 기능(무료)이다. */
export function canCollage() {
  return !isNative() || isPlus() || inTrial();
}

/* ── 스티커 (1.6.6, 2026-10-18 사용자 결정: 스티커 플러스는 하지 않는다) ──
   · 모든 팩 — 하루칸 플러스를 산 사람, 30일 체험 중인 사람 (2026-10-24: 체험 중 계절·동물·테이프도 연다)
     hasStickerPlus 는 혹시 모를 예전 기록을 위해 남겨 둔다 (상품은 만들지 않았으니 항상 false).
   · 이미 붙인 스티커는 어느 쪽이든 그대로 보이고 옮기거나 뗄 수 있다 (stickers.js)
   웹(PWA)은 살 방법이 없으니 일정 한도와 같은 이유로 막지 않는다. */
export function canUseStickers(tier) {
  /* 2026-10-25 사용자 결정: 기본·계절·동물·테이프(56종, tier basic)는 누구나 무료 — 체험이 끝나도 쓴다.
     위로 스티커(120종, tier plus)만 플러스. 체험 중에는 모두 연다 */
  if (tier === 'basic') return true;
  /* 2026-10-24 사용자 결정: 30일 체험 동안은 플러스 기능을 모두 연다 (계절·동물·테이프 포함) */
  if (!isNative() || isPlus() || hasStickerPlus() || inTrial()) return true;
  return false;
}

/* 스티커 플러스 소유 여부. adFree 처럼 부팅 때 메모리로 올려 둔다 (서랍을 그릴 때 동기로 본다) */
let stickerPlus = false;
export function hasStickerPlus() { return stickerPlus; }
export async function loadStickerPlus() {
  stickerPlus = !!(await store.metaGet('stickerPlus', false));
  return stickerPlus;
}
export async function setStickerPlus(v) {
  stickerPlus = !!v;
  await store.metaSet('stickerPlus', stickerPlus);
}

/* ── 배경 꾸미기 (1.5.0) ──────────────────────
   그림 배경과 내 사진 배경. 플러스를 산 사람과 30일 체험 중인 사람이 쓴다 (2026-10-24 사용자 결정 — 예전엔 체험 중에도 잠갔다).
   체험이 끝나면 theme.js 가 기본 배경으로 돌려놓는다. 대신 꼾미기 화면에서 누구나 미리 입혀 볼 수 있다 (theme.js).
   웹(PWA)은 살 방법이 없으니 다른 기능과 같은 이유로 막지 않는다. */
export function canUseBackground() {
  return !isNative() || isPlus() || inTrial();     // 체험 중에도 연다 (2026-10-24 사용자 결정)
}

/* ── PDF 내보내기 (1.6.0, 2026-10-18 사용자 결정: 플러스) ────────
   배경 꾸미기와 같은 급 — 플러스를 산 사람과 체험 중인 사람 (2026-10-24 사용자 결정).
   대신 미리보기(첫 두 쪽)는 누구나 볼 수 있다. 만들어지는 모양을 보고 사게 한다.
   백업 파일·마크다운 내보내기는 그대로 무료다 — 내 글을 꺼내는 길은 막지 않는다.
   웹(PWA)은 살 방법이 없으니 막지 않는다. */
export function canExportPdf() {
  return !isNative() || isPlus() || inTrial();     // 체험 중에도 연다 (2026-10-24 사용자 결정)
}

/* ── 구매 ────────────────────────────────────────
   설정 화면에서도, 한도에 걸린 자리에서도 같은 흐름을 쓴다.
   두 군데에 따로 두면 문구와 오류 처리가 갈라진다. */

/* 스토어가 값을 주기 전(상품 등록 전·연결 지연)에도 가격은 보여주는 편이 낫다.
   "얼마인지 모를 물건"은 아무도 안 산다.
   다만 가격은 나라마다 다르므로 한국어일 때만 쓴다 — 다른 언어에서 원화를 보여주면
   실제 결제 금액과 어긋난다.
   ⚠ 값을 바꿀 일이 생기면 Play 콘솔과 이 줄을 반드시 함께 고칠 것. */
const FALLBACK_PRICE_KO = '₩14,500';         // remove_ads (가격 인상 전 사용자) — 2026-10-30 가격 변경
const FALLBACK_PRICE_KO_NEW = '₩29,000';     // plus_9900 (1.6.7~ 새로 설치한 사람) — 2026-10-30 가격 변경

/** 가격 문구. 스토어 값이 우선이고, 없으면 한국어에 한해 기본값을 쓴다. */
export function price() {
  const fb = billing.plusProductId() === billing.PRODUCT_PLUS_V2 ? FALLBACK_PRICE_KO_NEW : FALLBACK_PRICE_KO;
  return billing.priceText() || (i18n.current() === 'ko' ? fb : null);
}

/** 결제를 걸 수 있는 상태인가 (웹이거나 스토어 연결 전이면 false) */
export function canBuy() { return isNative() && billing.available(); }

/**
 * 구글 결제창을 띄운다. 부르기 전에 무엇을 사는지 이미 보여준 자리에서 쓴다.
 * @returns {Promise<'ok'|'unavailable'|'no-product'|'error'>}
 */
export async function buy(from = 'other') {
  analytics.design('plus:buy_tap:' + from);
  if (!canBuy()) return 'unavailable';
  return billing.buyRemoveAds();
}

/**
 * 무엇을 사는지 한 번 더 보여주고 구글 결제창을 띄운다.
 * 설정과 플러스 화면이 같이 쓴다 (예전엔 settings.js 안에 있었다).
 */
export async function confirmBuy(from = 'other') {
  const { toast, confirmSheet } = await import('./ui.js');
  analytics.design('plus:view:' + from);
  if (!canBuy()) { toast(buyErrorText('unavailable')); return; }
  const p = price();
  const yes = await confirmSheet({
    title: t('하루칸 플러스'),
    text: (p ? t('{p}, 한 번이면 됩니다. ', { p }) : t('한 번 구매로 '))
      + t('배너 광고가 영원히 사라지고 일정을 개수 제한 없이 쓸 수 있어요. 기기를 바꿔도 유지됩니다. 일기 기능은 지금처럼 전부 무료입니다.')
      + ' ' + t('배경 꾸미기·PDF 내보내기·위로 스티커 120종도 쓸 수 있어요.'),
    ok: p ? t('{p} 구매', { p }) : t('구매하기'),
  });
  if (!yes) return;
  const msg = buyErrorText(await buy(from));
  if (msg) toast(msg);
  // 성공하면 구글 결제창이 뜨고, 완료 시 앱이 알아서 적용합니다 (app.js onOwned)
}

/** 구매 다시 적용 (기기 변경·재설치) */
export async function restore() {
  const { toast } = await import('./ui.js');
  if (!billing.available()) {
    toast(t('지금은 스토어에 연결할 수 없어요. 잠시 후 다시 시도해주세요.'));
    return;
  }
  toast(t('구매 내역을 확인하는 중…'));
  const owned = await billing.restore();
  if (!owned.plus && !owned.stickers) toast(t('이 계정에는 구매 내역이 없어요.'));
  // 있으면 onOwned 가 처리하고 화면이 새로 그려진다
}

/** 결제 실패를 사람 말로 옮긴다 — 부르는 쪽마다 다르게 쓰지 않도록 */
export function buyErrorText(r) {
  if (r === 'unavailable') return t('지금은 스토어에 연결할 수 없어요. 잠시 후 다시 시도해주세요.');
  if (r === 'no-product') return t('스토어에서 상품을 찾지 못했어요. 잠시 후 다시 시도해주세요.');
  if (r === 'error') return t('결제를 시작하지 못했어요.');
  return null;
}

/**
 * "무엇이 달라지나요?" — 그 자리에서 바로 답한다.
 * 예전에는 설정 화면으로 보냈는데, 거기 가봐야 같은 한 줄이 있을 뿐이라
 * 물음에 답이 없었다. 무엇이 붙고 무엇이 원래 무료인지 여기서 다 밝힌다.
 */
export async function showInfo(from = 'other') {
  analytics.design('plus:view:' + from);
  const { el, icon, esc, openSheet, toast } = await import('./ui.js');
  const p = price();

  const box = el('div');

  /* 가격을 크게, 그 옆에 "한 번만". 이 앱의 강점은 싸다는 것보다
     구독이 아니라는 점이다 — 대부분의 일기 앱이 매달 돈을 받는다. */
  if (p) {
    const tag = el('div', { class: 'plus-price' });
    tag.innerHTML =
      `<span class="plus-price-n">${esc(p)}</span>
       <span class="plus-price-once">${esc(t('한 번만'))}</span>`;
    box.append(tag);
    box.append(el('div', { class: 'plus-price-sub' },
      esc(t('구독이 아니에요. 매달 나가는 돈이 없습니다.'))));
  }

  const list = el('div', { class: 'plus-points' });
  const point = (ico, text, on = true) => {
    const row = el('div', { class: 'plus-point' + (on ? '' : ' free') });
    row.innerHTML = icon(on ? 'check' : 'heart') + `<span>${esc(text)}</span>`;
    return row;
  };
  list.append(
    point('check', t('일정을 개수 제한 없이 넣을 수 있어요.')),
    point('check', t('배너 광고가 모든 화면에서 사라져요.')),
    point('check', t('위로 스티커 120종을 쓸 수 있어요. 기본·계절·동물·테이프 스티커 56종은 무료예요.')),
    point('check', t('그림 배경과 내 사진으로 화면을 꾸밀 수 있어요.')),
    point('check', t('일기를 카드 모양 PDF로 묶어 인쇄하고 간직할 수 있어요.')),
    point('check', t('사진 묶음과 사진 달력(달력을 그날 사진으로 채우기)을 쓸 수 있어요.')),
    point('check', t('한 번만 사면 됩니다. 기기를 바꿔도 그대로예요.')),
    point('heart', t('일기·사진·잠금·백업은 원래부터 전부 무료예요.'), false),
  );

  const items = [];
  if (canBuy()) {
    items.push({
      label: p ? t('{p}으로 사기', { p }) : t('구매하기'),
      icon: 'heart',
      onClick: async () => {
        const msg = buyErrorText(await buy('info_' + from));
        if (msg) toast(msg);
      },
    });
  }

  box.append(list);
  /* 자세히 보기 — 플러스 화면에서 기능마다 바로 가 볼 수 있다 */
  if (from !== 'plus_screen') {
    items.push({
      label: t('플러스 자세히 보기'), icon: 'chev',
      onClick: async () => { const { go } = await import('./app.js'); go('/plus'); },
    });
  }
  openSheet({
    center: true,
    title: t('하루칸 플러스'),
    content: box,
    items,
  });
}

/* ── 스티커 플러스 (1.6.0) ─────────────────────────
   하루칸 플러스와 따로 파는 스티커 상품. 계절·동물·테이프 팩 + 기본 팩.
   ⚠ 가격은 Play 콘솔 값이 우선이다. 한국어 기본값은 콘솔과 반드시 같이 고칠 것. */
const FALLBACK_STICKER_PRICE_KO = null;   // 가격 확정 전 — 콘솔 값이 오기 전에는 가격을 숨긴다

export function stickerPrice() {
  return billing.priceText(billing.PRODUCT_STICKER_PLUS) || (i18n.current() === 'ko' ? FALLBACK_STICKER_PRICE_KO : null);
}

export async function buyStickers(from = 'other') {
  analytics.design('stickerplus:buy_tap:' + from);
  if (!canBuy()) return 'unavailable';
  return billing.buy(billing.PRODUCT_STICKER_PLUS);
}

/**
 * 스티커 플러스 안내 — 무엇이 들어 있는지 그림으로 보여주고 그 자리에서 산다.
 * 하루칸 플러스와 헷갈리지 않게 "따로 파는 상품"이라는 걸 먼저 말한다.
 */
export async function showStickerInfo(from = 'other') {
  analytics.design('stickerplus:view:' + from);
  const { el, esc, openSheet, toast } = await import('./ui.js');
  const { PACKS, src } = await import('./stickers.js');
  const p = stickerPrice();
  const owned = hasStickerPlus();

  const box = el('div');
  if (p && !owned) {
    const tag = el('div', { class: 'plus-price' });
    tag.innerHTML = `<span class="plus-price-n">${esc(p)}</span><span class="plus-price-once">${esc(t('한 번만'))}</span>`;
    box.append(tag);
  }
  box.append(el('div', { class: 'plus-price-sub' }, esc(owned
    ? t('스티커 플러스를 쓰고 계세요. 모든 스티커를 쓸 수 있어요.')
    : t('하루칸 플러스와 따로 파는 스티커 묶음이에요. 계절·동물·테이프 스티커 32종과 기본 스티커 24종을 모두 쓸 수 있어요.'))));

  /* 무엇이 들어 있는지 — 팩마다 몇 장씩 미리 보여준다 */
  const prev = el('div', { class: 'stkp-preview' });
  for (const pack of PACKS.filter((x) => x.tier === 'stickerplus')) {
    for (const name of pack.items.slice(0, 4)) {
      prev.append(el('img', { src: src(`${pack.id}/${name}`), alt: '', loading: 'lazy' }));
    }
  }
  box.append(prev);

  const items = [];
  if (!owned && canBuy()) {
    items.push({
      label: p ? t('{p}으로 사기', { p }) : t('구매하기'),
      icon: 'heart',
      onClick: async () => {
        const msg = buyErrorText(await buyStickers('info_' + from));
        if (msg) toast(msg);
      },
    });
  }
  openSheet({ center: true, title: t('스티커 플러스'), content: box, items });
}
