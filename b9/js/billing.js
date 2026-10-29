/* ===========================================================
   billing.js — 구글 플레이 결제 (일회성 상품 두 개)
   cordova-plugin-purchase v13 (Play Billing Library 9) 를 쓴다.

   상품 (1.6.7 부터 플러스가 두 가지 값 — 아래 PLUS_IDS 설명)
   · remove_ads   — 하루칸 플러스 (광고 제거·일정 무제한·기본 스티커·배경 꾸미기)
                    이름이 remove_ads 인 것은 광고 제거만 팔던 시절의 ID 라서다. 바꾸면
                    이미 산 분들의 구매가 인식되지 않는다.
   · sticker_plus — 스티커 플러스 (1.6.0, 2026-10-18 사용자 결정: 스티커는 따로 판다)
                    계절·동물·테이프 팩 + 기본 팩

   원칙:
   · 가격은 코드에 적지 않는다 — Play 콘솔에 등록된 현지 가격 문자열을 그대로 보여준다.
   · 소유 판정은 이벤트로 온다. 어느 경로로든 "샀다"가 확인되면 onOwned(상품 ID) 를
     상품마다 딱 한 번 부른다 (구매 직후든, 재설치 후 부팅이든).
   · 웹이나 플러그인이 없는 환경에서는 전부 조용히 꺼진다.

   출시 전 할 일: Play 콘솔 → 수익 창출 → 인앱 상품에 위 ID 를 비소모성으로 등록해야 한다.
   =========================================================== */

import { isNative } from './native.js';
import * as analytics from './analytics.js';

export const PRODUCT_REMOVE_ADS = 'remove_ads';     // Play 콘솔의 상품 ID 와 반드시 일치
export const PRODUCT_STICKER_PLUS = 'sticker_plus';
/* 하루칸 플러스 ₩9,900 (1.6.7, 2026-10-19 사용자 결정: 가격 인상).
   하나의 상품을 사람마다 다른 값에 팔 수는 없어서 상품을 하나 더 만들었다.
   · remove_ads — ₩4,990. 가격 인상 전부터 쓰던 사람(priceTier 'legacy')에게 보여준다
   · plus_9900  — ₩9,900. 그 뒤에 설치한 사람('new')에게 보여준다 (해외도 나라별로 두 배)
   둘 중 무엇을 샀든 하루칸 플러스다. 복원·기기 변경 때도 둘 다 확인한다. */
export const PRODUCT_PLUS_V2 = 'plus_9900';
export const PLUS_IDS = [PRODUCT_REMOVE_ADS, PRODUCT_PLUS_V2];
/* 스티커 플러스는 1.6.6 에서 없앴다 (스티커는 하루칸 플러스에 포함). 상품도 만들지 않았으니 묻지 않는다 */
const PRODUCTS = [...PLUS_IDS];

/* 이 사람에게 팔 플러스 상품 — app.js 가 priceTier 를 보고 정해 준다. 모르면 예전 값(사용자에게 유리한 쪽) */
let plusId = PRODUCT_REMOVE_ADS;
export function setPlusTier(tier) { plusId = tier === 'new' ? PRODUCT_PLUS_V2 : PRODUCT_REMOVE_ADS; }
export function plusProductId() { return plusId; }

let inited = false;
const ownedFired = new Set();
let onOwnedCb = null;
let ordering = null;      // 이 실행에서 사용자가 구매 버튼으로 결제를 시작한 상품 ID

function CP() { return window.CdvPurchase || null; }

function product(id = plusId) {
  const cp = CP();
  try { return cp?.store?.get(id, cp.Platform.GOOGLE_PLAY) || null; }
  catch { return null; }
}

function fireOwned(id) {
  if (ownedFired.has(id)) return;
  ownedFired.add(id);
  try { onOwnedCb?.(id); } catch (e) { console.error(e); }
}

/* 카카오 웹뷰처럼 플러그인 주입이 살짝 늦는 경우가 있어 잠깐 기다려 본다 */
async function waitForPlugin(ms = 3000) {
  const t0 = Date.now();
  while (!CP() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 150));
  return CP();
}

/**
 * 부팅 때 한 번 부른다.
 * @param {{onOwned: (productId: string) => void}} opts  소유가 확인되면 (상품마다 딱 한 번) 불린다
 */
export async function init({ onOwned } = {}) {
  onOwnedCb = onOwned || null;
  if (!isNative()) return;
  const cp = await waitForPlugin();
  if (!cp) return;

  const { store, ProductType, Platform, LogLevel } = cp;
  try {
    store.verbosity = LogLevel.ERROR;
    store.register(PRODUCTS.map((id) => ({ id, type: ProductType.NON_CONSUMABLE, platform: Platform.GOOGLE_PLAY })));

    store.when()
      // 결제 승인 → 영수증 검증 서버가 없으므로 바로 마무리하고 소유 처리
      .approved((tx) => {
        try { tx.finish(); } catch { /* 이미 끝난 거래 */ }
        for (const p of tx.products || []) {
          if (!PRODUCTS.includes(p.id)) continue;
          /* 이번에 사용자가 직접 산 것만 결제 통계로 센다 (복원·재설치는 빼고) */
          if (ordering === p.id) {
            ordering = null;
            const pr = product(p.id)?.pricing;
            if (pr?.priceMicros && pr?.currency) analytics.business(p.id, pr.priceMicros / 10000, pr.currency);
            analytics.design(p.id === PRODUCT_STICKER_PLUS ? 'stickerplus:purchased' : 'plus:purchased');
          }
          fireOwned(p.id);
        }
      })
      // 재설치·기기 변경: 스토어가 보유 내역을 되돌려줄 때
      .productUpdated((p) => {
        if (PRODUCTS.includes(p?.id) && p.owned) fireOwned(p.id);
      });

    await store.initialize([Platform.GOOGLE_PLAY]);
    inited = true;

    for (const id of PRODUCTS) if (product(id)?.owned) fireOwned(id);
  } catch (e) {
    console.error('결제 초기화 실패', e);
  }
}

/** 결제를 쓸 수 있는 상태인가 */
export function available() { return inited; }

/** 콘솔에 설정된 현지 가격 문자열 (예: "₩1,990"). 아직 모르면 null */
export function priceText(id = plusId) {
  return product(id)?.pricing?.price || null;
}

/**
 * 구매를 시작한다.
 * 결과: 'ok'(구글 결제창까지 정상 진행) | 'no-product'(스토어에 상품 없음) | 'error'
 * 실제 소유 확정은 approved 이벤트 → onOwned 로 온다.
 */
export async function buy(id) {
  if (!inited) return 'error';
  const offer = product(id)?.getOffer?.();
  if (!offer) return 'no-product';
  try {
    ordering = id;
    const err = await CP().store.order(offer);
    if (err) ordering = null;
    return err ? 'error' : 'ok';
  } catch { return 'error'; }
}

/** 하루칸 플러스 구매 (예전 이름 그대로 둔다) */
export function buyRemoveAds() { return buy(plusId); }

/** 구매 내역 복원. 복원 후 무엇을 갖고 있는지 돌려준다 */
export async function restore() {
  if (!inited) return { plus: false, stickers: false };
  try { await CP().store.restorePurchases(); } catch { /* 취소 등 */ }
  const ownedPlus = PLUS_IDS.filter((id) => product(id)?.owned);
  const res = { plus: ownedPlus.length > 0, stickers: false };
  for (const id of ownedPlus) fireOwned(id);
  return res;
}
