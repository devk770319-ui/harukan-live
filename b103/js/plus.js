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
import * as clover from './clover.js';
import * as store from './store.js';
import * as billing from './billing.js';
import { isNative } from './native.js';
import * as analytics from './analytics.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';

/** 무료로 동시에 둘 수 있는 "안 끝난" 일정 수. 끝낸 것은 세지 않는다. */
export const FREE_PLAN_LIMIT = 2;   // 2026-11-01 사용자: 5 → 2. 이미 넣어 둔 일정은 그대로(한도 위면 새로 못 넣을 뿐), 체험 중 바닥값(planFloor) 규칙 유지

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
/* 클로버 (2026-11-26, 개발용): 체험이 끝난 무료 사용자가 광고로 모은 클로버로 기능을 24시간 연다 */
const cl = (f) => clover.isOpen(f);
/** 클로버를 보여 줄 대상인가 — 폰 앱 · 플러스 아님 · 체험 중 아님 */
export function cloverEligible() { return CLOVER_ON && isNative() && !isPlus() && !inTrial(); }
export const CLOVER_ON = true;   // 개발용에서만 켬 — 배포판 가지에는 아직 없다

/**
 * 체험 중에 넣어둔 일정은 체험이 끝나도 인질로 잡지 않는다.
 * 체험 동안 도달한 최대 개수를 바닥값으로 두어, 이미 넣은 것은 그대로 두고
 * "더 넣으려면 사라"까지만 말한다. 많이 쓴 것이 벌이 되면 안 된다.
 */
export function planCeiling() {
  return Math.max(FREE_PLAN_LIMIT, store.getSettings().planFloor || 0);
}

/** 권한은 한 곳에서만 관리한다 — ads.js 가 이미 들고 있으므로 그걸 그대로 쓴다 */
export function isPlus() { return ads.isAdFree() || ads.isSub(); }
/** 평생 이용권을 가졌나 (월 이용권과 구분해야 할 때) */
export function isLifetime() { return ads.isAdFree(); }
/** 월 이용권 사용 중인가 */
export function isMonthly() { return !ads.isAdFree() && ads.isSub(); }
export async function setPlus(v) { return ads.setAdFree(v); }

/**
 * 지금 일정을 하나 더 넣을 수 있나.
 * 웹(PWA)에는 광고도 결제도 없다. 살 방법이 없는 곳에서 한도만 걸면
 * 빠져나갈 길 없이 막히는 셈이라, 한도는 네이티브에서만 적용한다.
 */
export function canAddPlan(activeCount) {
  if (unlimited() || cl('plans')) return true;
  return activeCount < planCeiling();
}

/* 습관 (2026-11-01 사용자 결정 변경: '습관은 완전히 플러스 사용자만 — 무료 3개가 아니라').
   쓸 수 있는 사람 = 플러스 · 체험 중(체험 = 플러스 기능 전부) · 웹(살 방법이 없어 막지 않는다).
   체험이 끝난 무료 사용자: 새로 만들기·체크·알림이 멈춘다. 만든 습관과 기록은 지우지 않고, 플러스를 사면 그대로 돌아온다.
   HABIT_GRANDFATHER 를 켜면 HABIT_PLUS_SINCE 이전에 만든 습관이 있는 사람은 예전 규칙(무료 3개)으로 계속 쓴다 — 기본 꺼짐 */
export const HABIT_GRANDFATHER = false;
export const HABIT_PLUS_SINCE = Date.parse('2026-11-01T00:00:00+09:00');
export const FREE_HABIT_LIMIT = 3;   // 옛 규칙 (HABIT_GRANDFATHER 일 때만 씀)
export function habitCeiling() { return Math.max(FREE_HABIT_LIMIT, store.getSettings().habitFloor || 0); }
function habitGrandfathered(list) { return HABIT_GRANDFATHER && !!list && list.some((h) => h.createdAt && h.createdAt < HABIT_PLUS_SINCE); }
/** 습관을 쓸 수 있나 (체크·알림·고치기). list: 지금 습관 목록 — 옛 사용자 예외를 볼 때만 필요 */
export function canUseHabits(list = null) { return unlimited() || cl('habit') || habitGrandfathered(list); }
export function canAddHabit(activeCount, list = null) {
  if (unlimited() || cl('habit')) return true;
  return habitGrandfathered(list) && activeCount < habitCeiling();
}
export async function bumpHabitFloor(activeCount) {
  if (!inTrial()) return;
  if (activeCount > (store.getSettings().habitFloor || 0)) await store.saveSettings({ habitFloor: activeCount }, { silent: true });
}

/** 남은 개수 (한도가 없는 상황이면 null — 셀 이유가 없다) */
export function plansLeft(activeCount) {
  if (unlimited() || cl('plans')) return null;
  return Math.max(0, planCeiling() - activeCount);
}

/* ⚠ 사진 달력은 플러스 기능이지만 아직 개발 중이라 모두에게 열어둔다.
     출시 전에 이 줄만 false 로 바꾸면 잠긴다 — 다른 곳은 손댈 필요 없다.
     여기 한 줄로 모아둔 이유가 그것이다. 조건을 여러 화면에 흩뿌리면
     나중에 하나를 빠뜨린 채로 출시된다. */
/** 달력을 사진으로 채울 수 있나 — 플러스 (2026-10-24 사용자 확인: "사진달력은 플러스 기능").
    플러스를 산 사람과 30일 체험 중인 사람. 체험이 끝나면 달력은 일반 보기로 그려진다 (calendar.js). */
export function canPhotoCalendar() {
  return !isNative() || isPlus() || inTrial() || cl('photocal');
}

/** 사진 묶음(콜라주)을 새로 만들 수 있나 — 플러스 (2026-10-24 사용자 확인).
    이미 만든 묶음은 누구나 보고, 빈 칸 채우기·틀 바꾸기·사진 빼기도 된다 — 새 묶음 만들기만 막는다.
    사진 넣기·글 사이 자리·크기 조절은 기본 기능(무료)이다. */
/* 무음 카메라(하루칸 카메라·필터)·동영상 넣기 (2026-11-15 사용자: 플러스 회원만) — 체험 중에는 열림.
   이미 넣은 동영상은 체험이 끝나도 보고·재생하고·뺄 수 있다(기존 기록은 인질로 잡지 않는다) */
export function canSilentCamera() { return !isNative() || isPlus() || inTrial() || cl('camera'); }
export function canVideo() { return !isNative() || isPlus() || inTrial() || cl('video'); }

export function canCollage() {
  return !isNative() || isPlus() || inTrial() || cl('collage');
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
  if (!isNative() || isPlus() || hasStickerPlus() || inTrial() || cl('sticker')) return true;
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
  return !isNative() || isPlus() || inTrial() || cl('background');     // 체험 중에도 연다 (2026-10-24 사용자 결정)
}

/* ── PDF 내보내기 (1.6.0, 2026-10-18 사용자 결정: 플러스) ────────
   배경 꾸미기와 같은 급 — 플러스를 산 사람과 체험 중인 사람 (2026-10-24 사용자 결정).
   대신 미리보기(첫 두 쪽)는 누구나 볼 수 있다. 만들어지는 모양을 보고 사게 한다.
   백업 파일·마크다운 내보내기는 그대로 무료다 — 내 글을 꺼내는 길은 막지 않는다.
   웹(PWA)은 살 방법이 없으니 막지 않는다. */
/** 백업 파일 불러오기(복원)는 플러스 (2026-11-01 사용자 결정: 백업 만들기는 무료, 다른 기기에서 불러오기는 플러스).
    체험 중·플러스·웹은 된다 — 새로 깐 폰은 체험이 새로 시작되므로 30일 안에는 불러올 수 있다 */
export function canRestore() { return unlimited() || cl('restore'); }

/** 글자 상자는 플러스 (2026-11-02 사용자 결정). 체험 중·플러스·웹은 된다.
    이미 붙여 둔 글자 상자는 그대로 보이고 옮기·지우기는 된다 — 새로 만들기·글 고치기만 플러스 */
export function canUseTextBox() { return unlimited() || cl('textbox'); }

export function canExportPdf() {
  return !isNative() || isPlus() || inTrial() || cl('pdf');     // 체험 중에도 연다 (2026-10-24 사용자 결정)
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
const FALLBACK_PRICE_KO_V3 = '₩49,000';      // plus_lifetime (2026-11-04~ 새로 설치한 사람)

/** 가격 문구. 스토어 값이 우선이고, 없으면 한국어에 한해 기본값을 쓴다. */
export function price() {
  const id = billing.plusProductId();
  const fb = id === billing.PRODUCT_PLUS_V3 || (billing.plusTierNow() === 'v3' && !billing.available()) ? FALLBACK_PRICE_KO_V3
    : id === billing.PRODUCT_PLUS_V2 ? FALLBACK_PRICE_KO_NEW : FALLBACK_PRICE_KO;
  return billing.priceText() || (i18n.current() === 'ko' ? fb : null);
}

/* ── 월 이용권 (2026-11-03 플러스 화면 B안, 2026-11-04 가격: 한국 ₩1,900 · 미국·영국 ₩3,900 상당 · 그 밖 ₩1,900 상당) ──
   가격은 항상 스토어(plus_monthly) 값을 쓴다. 아래는 한국어에서 스토어 연결 전에만 */
const FALLBACK_MONTHLY_KO = '₩1,900';
export const MONTHLY_MANAGE_URL = 'https://play.google.com/store/account/subscriptions?sku=plus_monthly&package=app.harukan.diary';
/** 월 이용권 가격 문구. 스토어 값이 우선, 없으면 한국어에 한해 기본값 */
/** 평생 이용권이 월 이용권 몇 달 값인지 (반올림). 두 값을 스토어에서 모두 알 때만, 아니면 null (2026-11-04: 고정 '10달' 문구를 없앰) */
export function breakEvenMonths() {
  const l = billing.priceMicros(), m = billing.monthlyPriceMicros();
  if (!l || !m) return null;
  const n = Math.round(l / m);
  return n >= 2 && n <= 120 ? n : null;
}
export function monthlyPrice() { return billing.monthlyPriceText() || (i18n.current() === 'ko' ? FALLBACK_MONTHLY_KO : null); }
/** 앱 체험 중에 사면 첫 결제일 = 체험이 끝나는 날 (무료 체험 offer 가 있을 때). 아니면 오늘 */
export function monthlyFirstCharge() {
  const left = trialDaysLeft();
  const tr = left ? billing.trialOfferFor(left) : null;
  if (tr) return { at: Date.now() + tr.days * 86400000, trialDays: tr.days };
  if (left && left >= 3 && !billing.available()) return { at: trialEndsAt(), trialDays: left };   // 스토어 연결 전 미리보기
  return { at: Date.now(), trialDays: 0 };
}
export function fmtDay(ms) {
  try { return new Date(ms).toLocaleDateString(i18n.current() || undefined, { month: 'long', day: 'numeric' }); } catch { return new Date(ms).toISOString().slice(5, 10); }
}
/** 정기 이용권 다음 결제일 (산 날 적어 둔 첫 결제일에서 한 달씩, 1년 이용권은 1년씩). 모르면 null */
export async function monthlyNextCharge() {
  const s = await ads.subInfo();
  const yearly = s?.plan === 'yearly';
  let at = yearly && s?.planFrom ? s.planFrom : s?.firstChargeAt; if (!at) return null;
  const d = new Date(at); const now = Date.now();
  for (let i = 0; i < 240 && d.getTime() <= now; i++) d.setMonth(d.getMonth() + (yearly ? 12 : 1));
  return d.getTime();
}

/* ── 1년 이용권 (2026-11-15·16 사용자 결정: 한국 ₩19,000, 월 ×12 취소선과 할인율, 월과 같은 한 달 무료 체험) ──
   가격은 항상 스토어 값. 아래는 한국어에서 스토어 연결 전에만 */
const FALLBACK_YEARLY_KO = '₩19,000', FALLBACK_YEARLY_FULL_KO = '₩22,800';
const koPreview = () => !billing.available() && i18n.current() === 'ko';
/** 1년 카드를 보여 줄까 (스토어에 1년 요금제가 있을 때, 연결 전 한국어 미리보기) */
export function yearlyAvailable() { return billing.hasYearly() || koPreview(); }
export function yearlyPrice() { return billing.yearlyPriceText() || (koPreview() ? FALLBACK_YEARLY_KO : null); }
/** 월 가격 × 12 (취소선으로 긋는 값) */
export function yearlyFullPrice() {
  const m = billing.monthlyPriceMicros(), cur = billing.subCurrency();
  if (m && cur) {
    const v = (m * 12) / 1e6, whole = Math.abs(v - Math.round(v)) < 1e-6;
    try { return new Intl.NumberFormat(i18n.current() || undefined, { style: 'currency', currency: cur, minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: whole ? 0 : 2 }).format(v); } catch { return null; }
  }
  return koPreview() ? FALLBACK_YEARLY_FULL_KO : null;
}
/** 1년 가격을 12로 나눈 한 달 값 ("₩1,583") — 체험 끝 창·플러스 화면 '한 달 ○○꼴' (2026-11-19). 모르면 null */
export function yearlyPerMonth() {
  const y = billing.yearlyPriceMicros(), cur = billing.subCurrency();
  if (y && cur) {
    try {
      const nf = new Intl.NumberFormat(i18n.current() || undefined, { style: 'currency', currency: cur });
      const fd = nf.resolvedOptions().maximumFractionDigits ?? 2, p = 10 ** fd;
      return nf.format(Math.floor((y / 1e6 / 12) * p) / p);
    } catch { return null; }
  }
  return koPreview() ? '₩1,583' : null;
}
/** 월 ×12 보다 몇 % 싼가 (반올림). 두 값을 모두 알 때만 */
export function yearlyDiscount() {
  const m = billing.monthlyPriceMicros(), y = billing.yearlyPriceMicros();
  if (m && y) { const d = Math.round((1 - y / (m * 12)) * 100); return d >= 5 && d < 90 ? d : null; }
  return koPreview() ? 17 : null;
}
/** 지금 쓰는 정기 이용권이 1년인가 (월에서 바꾸고 아직 바뀌는 날 전이면 false) */
export function isYearly() { const r = ads.subRecNow(); return isMonthly() && r?.plan === 'yearly' && !(+r.planFrom > Date.now()); }
/** 월 → 1년으로 바꾸기로 했고 아직 바뀌는 날 전이면 그날, 아니면 0 */
export function yearlySwitchAt() { const r = ads.subRecNow(); return isMonthly() && r?.plan === 'yearly' && +r.planFrom > Date.now() ? +r.planFrom : 0; }
/** 지금 정기 이용권의 가격 (다음에 나갈 돈) */
export function subPriceNow() { const r = ads.subRecNow(); return r?.plan === 'yearly' ? yearlyPrice() : monthlyPrice(); }
/** 1년 이용권 첫 결제 (체험 중이면 체험이 끝나는 날) */
export function yearlyFirstCharge() {
  const left = trialDaysLeft();
  const tr = left ? billing.trialOfferFor(left, billing.YEARLY_PLAN) : null;
  if (tr) return { at: Date.now() + tr.days * 86400000, trialDays: tr.days };
  if (left && left >= 3 && !billing.available()) return { at: trialEndsAt(), trialDays: left };
  return { at: Date.now(), trialDays: 0 };
}
/**
 * 월 이용권: 구글 정책에 맞춰 금액·첫 결제일·자동 갱신·해지 방법을 먼저 보여 주고, [계속]을 누르면 구글 결제창
 */
export async function confirmMonthly(from = 'other') { return confirmSub('monthly', from); }
/** 정기 이용권(월·1년) 구매 전 확인 창. 이미 월 이용권을 쓰는 사람이 1년을 고르면 '바꾸기' 창으로 */
export async function confirmSub(plan = 'monthly', from = 'other') {
  const yearly = plan === 'yearly';
  if (yearly && isMonthly()) return confirmSwitchYearly(from);
  const { toast, el, esc, openSheet } = await import('./ui.js');
  analytics.design(yearly ? 'plus:sub:yearly:view' : 'plus:sub:view');
  if (!canBuy()) { toast(buyErrorText('unavailable')); return; }
  const pr = (yearly ? yearlyPrice() : monthlyPrice()) || '';
  const fc = yearly ? yearlyFirstCharge() : monthlyFirstCharge();
  const box = el('div', { class: 'mp-confirm' });
  const line = (k, v) => `<div class="mp-cf-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  box.innerHTML =
    line(t('금액'), yearly ? t('{p} / 1년', { p: pr }) : t('{p} / 1개월', { p: pr }))
    + line(t('첫 결제'), fc.trialDays ? t('{d} (체험이 끝나는 날)', { d: fmtDay(fc.at) }) : t('오늘 ({d})', { d: fmtDay(fc.at) }))
    + line(t('그다음'), yearly ? t('매년 {d}', { d: fmtDay(fc.at) }) : t('매달 {d}일', { d: new Date(fc.at).getDate() }))
    + `<div class="mp-cf-note">${esc(yearly ? t('해지하기 전까지 1년마다 자동으로 결제돼요. 해지는 Play 스토어 › 결제 및 정기 결제에서 언제든 할 수 있고, 해지해도 결제한 기간이 끝날 때까지 플러스를 쓸 수 있어요.')
      : t('해지하기 전까지 매달 자동으로 결제돼요. 해지는 Play 스토어 › 결제 및 정기 결제에서 언제든 할 수 있고, 해지해도 결제한 기간이 끝날 때까지 플러스를 쓸 수 있어요.'))}</div>`
    + (fc.trialDays ? `<div class="mp-cf-note">${esc(t('체험이 끝나는 날까지는 결제되지 않아요. 그 전에 해지하면 돈이 나가지 않아요.'))}</div>` : '');
  let go = false;
  await new Promise((resolve) => {
    openSheet({ center: true, title: yearly ? t('하루칸 플러스 1년 이용권') : t('하루칸 플러스 월 이용권'), content: box, onClose: resolve,
      items: [{ label: t('계속 (Google 결제)'), icon: 'heart', onClick: () => { go = true; resolve(); } }] });
  });
  if (!go) return;
  analytics.design('plus:buy_tap:' + plan + ':' + from);
  await store.metaSet('plusSubOrder', { firstChargeAt: fc.at, trialDays: fc.trialDays, at: Date.now(), plan });
  const r = await billing.buySub(yearly ? billing.YEARLY_PLAN : billing.MONTHLY_PLAN, trialDaysLeft() || 0);
  const msg = buyErrorText(r.r);
  if (msg) toast(msg);
}
/** 월 이용권을 쓰는 사람 → 1년 이용권. 지금 결제한 달이 끝나는 날 바뀌고 그날 첫 결제 (구글 DEFERRED) */
export async function confirmSwitchYearly(from = 'other') {
  const { toast, el, esc, openSheet } = await import('./ui.js');
  analytics.design('plus:sub:yearly:switch_view');
  if (!canBuy()) { toast(buyErrorText('unavailable')); return; }
  const yp = yearlyPrice() || '';
  const at = (await monthlyNextCharge()) || Date.now();
  const box = el('div', { class: 'mp-confirm' });
  const line = (k, v) => `<div class="mp-cf-row"><span>${esc(k)}</span><b>${esc(v)}</b></div>`;
  box.innerHTML =
    line(t('금액'), t('{p} / 1년', { p: yp }))
    + line(t('바뀌는 날'), fmtDay(at))
    + line(t('그다음'), t('매년 {d}', { d: fmtDay(at) }))
    + `<div class="mp-cf-note">${esc(t('지금 쓰는 월 이용권이 끝나는 {d}부터 1년 이용권으로 바뀌고, 그날 {p}이 결제돼요. 그 전까지는 더 결제되지 않아요.', { d: fmtDay(at), p: yp }))}</div>`
    + `<div class="mp-cf-note">${esc(t('해지하기 전까지 1년마다 자동으로 결제돼요. 해지는 Play 스토어 › 결제 및 정기 결제에서 언제든 할 수 있고, 해지해도 결제한 기간이 끝날 때까지 플러스를 쓸 수 있어요.'))}</div>`;
  let go = false;
  await new Promise((resolve) => {
    openSheet({ center: true, title: t('1년 이용권으로 바꾸기'), content: box, onClose: resolve,
      items: [{ label: t('계속 (Google 결제)'), icon: 'heart', onClick: () => { go = true; resolve(); } }] });
  });
  if (!go) return;
  analytics.design('plus:buy_tap:yearly_switch:' + from);
  const r = await billing.buySub(billing.YEARLY_PLAN, 0);
  if (r.switched) {
    await ads.setSubPlan('yearly', at);
    toast(t('{d}부터 1년 이용권으로 바뀌어요', { d: fmtDay(at) }));
    try { const A = await import('./app.js'); if (location.hash.startsWith('#/plus')) A.go('/plus', { replace: true }); } catch { /* */ }
    return;
  }
  const msg = buyErrorText(r.r);
  if (msg) toast(msg);
}
/** 평생 이용권 구매 (확인 창 없이 — 플러스 화면·잠금 창에서 가격을 이미 보여 준 뒤) */
export async function buyLifetime(from = 'other') {
  const { toast } = await import('./ui.js');
  if (isMonthly()) analytics.design('plus:sub:upgrade_lifetime');
  const msg = buyErrorText(await buy(from));
  if (msg) toast(msg);
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
/* 플러스 기능이 잠겼을 때 — 어디서나 같은 모양 (2026-11-02 점검, 사용자: 안내가 일관성 있게):
   가운데 창 [제목 '~는 하루칸 플러스 기능이에요' · 짧은 이유] + 버튼 하나 [하루칸 플러스 알아보기] → 플러스 화면(/plus?from=…) */
export async function goPlus(from = 'other') { const { go } = await import('./app.js'); go('/plus?from=' + encodeURIComponent(from)); }
export async function lockSheet(from, title, text) {
  analytics.design('plus:lock:' + from);
  const { openSheet } = await import('./ui.js');
  /* 월 이용권이 생긴 뒤 (2026-11-03, B안): [월 ○○로 시작 · 언제든 해지] [평생 ○○ · 한 번만 결제] [플러스 자세히 보기] */
  const mp = monthlyPrice(), lp = price();
  const items = [];
  if (canBuy() || mp) items.push({ label: mp ? t('월 {p}로 시작', { p: mp }) : t('월 이용권으로 시작'), sub: t('언제든 해지'), icon: 'heart', onClick: () => confirmMonthly(from) });
  const yp = yearlyPrice(), yd = yearlyDiscount();
  if (yearlyAvailable() && (canBuy() || yp)) items.push({ label: yp ? t('1년 {p}', { p: yp }) : t('1년 이용권'), sub: (yd ? t('{n}% 할인', { n: yd }) + ' · ' : '') + t('언제든 해지'), icon: 'spark', onClick: () => confirmSub('yearly', from) });
  if (canBuy() || lp) items.push({ label: lp ? t('평생 {p}', { p: lp }) : t('평생 이용권'), sub: t('한 번만 결제'), icon: 'check', onClick: () => buyLifetime(from) });
  /* 클로버 (2026-11-26, 개발용) — 결제 버튼 아래, '자세히 보기' 위 */
  items.push(...cloverItems(from, () => lockSheet(from, title, text)));
  items.push({ label: t('플러스 자세히 보기'), icon: 'chev', onClick: () => goPlus(from) });
  openSheet({ center: true, title, text, items });
}

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
  }
  /* 가격을 아직 못 받아도 '한 번 구매·평생'은 늘 보이게 (2026-11-01 사용자 지시) */
  box.append(el('div', { class: 'plus-price-sub' },
    esc(t('한 번 구매로 평생, 또는 월 이용권으로 쓸 수 있어요.'))));

  const list = el('div', { class: 'plus-points' });
  const point = (ico, text, on = true) => {
    const row = el('div', { class: 'plus-point' + (on ? '' : ' free') });
    row.innerHTML = icon(on ? 'check' : 'heart') + `<span>${esc(text)}</span>`;
    return row;
  };
  list.append(
    point('check', t('습관 기록·알림: 약 먹기·물 마시기 같은 습관을 기록하고 정한 시간에 알려 드려요.')),
    point('check', t('일정을 개수 제한 없이 넣을 수 있어요.')),
    point('check', t('배너 광고가 모든 화면에서 사라져요.')),
    point('check', t('위로 스티커 120종을 쓸 수 있어요. 기본·계절·동물·테이프 스티커 56종은 무료예요.')),
    point('check', t('미니멀·동화·사계절 배경과 내 사진으로 화면을 꾸며요.')),
    point('check', t('일기 위에 짧은 글을 스티커처럼 붙이고 색·배경·크기를 바꿔요.')),
    point('check', t('다른 기기에서 만든 백업을 불러와 폰·태블릿 여러 곳에서 써요. 백업 파일 만들기는 무료예요.')),
    point('check', t('일기를 카드 모양 PDF로 묶어 인쇄하고 간직할 수 있어요.')),
    point('check', t('사진 묶음과 사진 달력(달력을 그날 사진으로 채우기)을 쓸 수 있어요.')),
    point('check', t('한 번만 사면 됩니다. 기기를 바꿔도 그대로예요.')),
    point('heart', t('일기 쓰기·사진 넣기(글 사이 자리·크기)·스티커 56종·잠금·백업 파일 만들기는 원래부터 전부 무료예요. 30일 무료 체험 동안은 위의 플러스 기능을 모두 써 볼 수 있어요.'), false),
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

/* ── 클로버 (2026-11-26 사용자 결정 · 광고분석 담당 전달, 개발용) ───────────────
   광고 1번 = 클로버 3개(하루 5번) · 10개 = 플러스 기능 전부 24시간(2026-11-27 하나로) · 체험 끝 선물 10개 · 최대 30개 */
const FEAT_NAME = {
  sticker: () => t('스티커 꾸미기'), media: () => t('사진·동영상'), textbox: () => t('글자 상자'), background: () => t('배경 꾸미기'), habit: () => t('습관'),
  pdf: () => t('PDF 내보내기'), plans: () => t('일정 더 넣기'), photocal: () => t('사진 달력'), camera: () => t('무음 카메라'),
  video: () => t('동영상 넣기'), collage: () => t('사진 묶음'), restore: () => t('백업 불러오기'), all: () => t('플러스 기능 전부'),
};
export function cloverFeatureName(f) { return (FEAT_NAME[f] || (() => f))(); }
/* 묶음에 무엇이 들어 있는지 — 확인 창·클로버 창에서 보여 준다 */
const FEAT_DESC = { all: () => ['sticker', 'background', 'media', 'habit', 'plans', 'pdf', 'restore'].map(cloverFeatureName).join('·'), sticker: () => t('위로 스티커·내 스티커·글자 상자'), background: () => t('그림 배경·내 사진·아래 탭 아이콘'), media: () => t('동영상·무음 카메라·사진 묶음·사진 달력') };
export function cloverFeatureLong(f) { const d = FEAT_DESC[f]?.(); return cloverFeatureName(f) + (d ? ` (${d})` : ''); }
/** 잠금 안내 창에 넣을 클로버 줄들. reopen: 광고를 본 뒤 다시 띄울 창 */
export function cloverItems(from, reopen) {
  const f = clover.featureOf(from);
  if (!cloverEligible() || !f) return [];
  const n = clover.count(), out = [];
  const have = t('가진 클로버 {n}개', { n });
  if (n >= clover.COST_ALL) out.push({ label: '🍀 ' + t('클로버 {c}개로 플러스 기능 전부 24시간', { c: clover.COST_ALL }), sub: have, onClick: () => useClover('all', from) });
  if (clover.adsLeft() > 0 && clover.canTakeMore()) out.push({ label: '🍀 ' + t('광고 보고 클로버 {c}개 받기', { c: clover.PER_AD }), sub: t('오늘 {n}번 더 볼 수 있어요', { n: clover.adsLeft() }) + (n < clover.COST_ALL ? ' · ' + have + ' · ' + t('클로버 {c}개로 플러스 기능 전부를 24시간 동안', { c: clover.COST_ALL }) : ''), onClick: () => watchCloverAd(from, reopen) });
  return out;
}
/** 클로버를 쓰기 직전 확인 — 24시간 동안 열린다는 것을 분명히 */
export async function useClover(f = 'all', from = 'other') {
  const { openSheet, toast } = await import('./ui.js');
  f = 'all';   // 2026-11-27: 전부 열기 하나뿐
  const cost = clover.COST_ALL;
  const name = cloverFeatureName(f);
  let go = false;
  await new Promise((resolve) => openSheet({ center: true, title: t('클로버를 쓸까요?'),
    text: t('클로버 {c}개를 쓰면 지금부터 24시간 동안 쓸 수 있어요: {f}', { c: cost, f: cloverFeatureLong(f) }) + '.' + (f === 'all' ? ' (' + t('배너 광고도 없어요') + ')' : '') + ' ' + t('24시간이 지나도 이미 만든 것은 그대로 남아요.') + ' ' + t('가진 클로버 {n}개', { n: clover.count() }),
    onClose: resolve, items: [{ label: '🍀 ' + t('클로버 {c}개 쓰기', { c: cost }), onClick: () => { go = true; resolve(); } }] }));
  if (!go) return false;
  if (!(await clover.spend(f))) { toast(t('클로버가 모자라요. 광고를 보면 클로버를 받을 수 있어요.')); return false; }
  analytics.design('clover:use:' + f + ':' + from);
  if (f === 'all') ads.setCloverAll(clover.allOpenUntil());   // 전부 열기 = 배너 광고도 24시간 없음
  toast(t('{f}: 24시간 동안 쓸 수 있어요', { f: name }));
  try { const A = await import('./app.js'); A.applyTheme?.(); A.rerender?.(); } catch { /* */ }
  return true;
}
/** 광고를 보고 클로버 받기 — 보상을 먼저 알리고, 끝까지 보면(보상 알림) 바로 준다 */
export async function watchCloverAd(from = 'other', reopen = null) {
  const { openSheet, toast } = await import('./ui.js');
  if (clover.adsLeft() <= 0) { toast(t('오늘은 광고를 다 봤어요. 내일 다시 받을 수 있어요.')); return; }
  if (!clover.canTakeMore()) { toast(t('클로버는 {n}개까지 가질 수 있어요.', { n: clover.MAX })); return; }
  let go = false;
  await new Promise((resolve) => openSheet({ center: true, title: t('광고 보고 클로버 받기'),
    text: t('광고를 끝까지 보면 클로버 {c}개를 받아요.', { c: clover.PER_AD }) + ' ' + t('오늘 {n}번 더 볼 수 있어요', { n: clover.adsLeft() }) + '.',
    onClose: resolve, items: [{ label: t('광고 보기'), icon: 'play', onClick: () => { go = true; resolve(); } }] }));
  if (!go) return;
  analytics.design('clover:ad:tap:' + from);
  let got = 0;
  const r = await ads.showRewarded(async () => { got = await clover.rewardAd(); analytics.design('clover:ad:done'); });
  if (r === 'ok' || got) {
    toast(t('클로버 {c}개를 받았어요 · 가진 클로버 {n}개', { c: got || clover.PER_AD, n: clover.count() }));
    try { (await import('./app.js')).rerender?.(); } catch { /* 홈 클로버 칩 숫자 */ }
    if (reopen) setTimeout(() => reopen(), 500);
  } else if (r === 'closed') { analytics.design('clover:ad:closed'); toast(t('광고를 끝까지 봐야 클로버를 받을 수 있어요.')); }
  else { analytics.design('clover:ad:fail'); toast(t('지금은 광고를 불러오지 못했어요. 잠시 뒤 다시 해 주세요.')); }
}
/** 클로버 창 — 가진 수 · 열려 있는 기능과 남은 시간 · 쓰는 법 · [광고 보고 받기] [10개로 전부] */
export async function cloverSheet(from = 'other') {
  if (!cloverEligible()) return;   // 평생·월·1년 플러스와 체험 중에는 열지 않는다 (2026-11-27)
  analytics.design('clover:view:' + from);
  const { openSheet, el, esc } = await import('./ui.js');
  const n = clover.count();
  const box = el('div', { class: 'clv-box' });
  const open = clover.openList();
  box.innerHTML = `<div class="clv-big"><span>🍀</span><b>${n}</b><small>/ ${clover.MAX}</small></div>`
    + (open.length ? `<div class="clv-open">${open.map((o) => `<div class="clv-row"><span>${esc(cloverFeatureName(o.f))}</span><b>${esc(t('{h}시간 남음', { h: clover.hoursLeft(o.until) }))}</b></div>`).join('')}</div>` : '')
    + `<ul class="clv-rules"><li>${esc(t('광고 1번에 클로버 {c}개 · 하루 {n}번까지', { c: clover.PER_AD, n: clover.ADS_PER_DAY }))}</li><li>${esc(t('클로버 {c}개로 플러스 기능 전부를 24시간 동안', { c: clover.COST_ALL }))} · ${esc(t('배너 광고도 없어요'))}</li><li>${esc(FEAT_DESC.all())}</li></ul>`;
  const items = [];
  if (clover.adsLeft() > 0 && clover.canTakeMore()) items.push({ label: '🍀 ' + t('광고 보고 클로버 {c}개 받기', { c: clover.PER_AD }), sub: t('오늘 {n}번 더 볼 수 있어요', { n: clover.adsLeft() }), onClick: () => watchCloverAd(from, () => cloverSheet(from)) });
  if (n >= clover.COST_ALL) items.push({ label: '🍀 ' + t('클로버 {c}개로 플러스 기능 전부 24시간', { c: clover.COST_ALL }), onClick: () => useClover('all', from) });
  openSheet({ center: true, title: t('클로버'), content: box, items });
}
