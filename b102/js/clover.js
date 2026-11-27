/* ===========================================================
   clover.js — 클로버 (2026-11-26 사용자 결정, 광고분석 담당 전달 · 개발용만, 배포는 '배포해줘' 때)

   · 돈으로 팔지 않는다. 보상형 광고로만 얻는다: 광고 1번 = 클로버 3개, 하루(달력 날짜) 5번까지
   · 클로버 10개 = 플러스 기능 전부를 24시간 (배너 광고도 없음). 2026-11-27 사용자 제안으로 '2개 = 기능 하나'는 없앴다 — 규칙을 하나로
     (사용자 '24시간으로 해줘' — 연 순간부터 24시간. 이미 열려 있으면 24시간을 더 붙인다)
   · 체험이 끝난 사람에게 한 번 클로버 10개 선물(2026-11-27, 6→10). 가질 수 있는 클로버는 30개까지
   · 대상: 체험이 끝난 무료 사용자만(폰 앱). 체험 중·플러스·웹에게는 보이지 않는다
   · 이미 붙인 스티커·만든 것은 24시간이 지나도 그대로 남는다(지금 무료 규칙과 같다)
   · 습관도 다른 플러스 기능과 같은 규칙 — 사용자가 습관을 따로 무료로 풀기로 하면 FEATURES 에서 'habit' 만 빼면 된다
   기록: clover:gift · clover:ad:tap · clover:ad:done · clover:ad:fail · clover:use:<기능> · clover:use:all · clover:view
   =========================================================== */
import * as store from './store.js';
import { todayKey } from './ui.js';

export const PER_AD = 3, ADS_PER_DAY = 5, COST_ALL = 10, MAX = 30, GIFT = 10, HOURS = 24;   // 선물 10개 = 체험 끝나자마자 하루 전부 (2026-11-27 사용자)
const H = 3600 * 1000;

/** 클로버로 여는 기능 묶음 (2026-11-26 사용자 '기능별로 하나로 묶어서' — 스티커는 위로·내 스티커·글자 상자를 한 번에, 배경도 마찬가지)
 *  sticker 스티커 꾸미기(위로 스티커·내 스티커·글자 상자) · background 배경 꾸미기(그림 배경·내 사진·아래 탭 아이콘)
 *  media 사진·동영상(동영상·무음 카메라·사진 묶음·사진 달력) · habit · plans · pdf · restore */
export const FEATURES = ['sticker', 'background', 'media', 'habit', 'plans', 'pdf', 'restore'];
/** 세부 기능 → 묶음 (plus.js 의 cl('textbox') 등이 묶음으로 열려 있는지 본다) */
const GROUP = { textbox: 'sticker', mysticker: 'sticker', video: 'media', camera: 'media', collage: 'media', photocal: 'media' };
export const groupOf = (f) => GROUP[f] || f;
const FROM = {
  sticker: 'sticker', letter_sticker: 'sticker', mysticker: 'sticker', textbox: 'sticker', letter_text: 'sticker',
  decor: 'background', decor_photo: 'background', decor_pick: 'background', habits: 'habit', pdf: 'pdf', plan_limit: 'plans',
  photo_cal: 'media', silent_camera: 'media', video: 'media', collage: 'media', restore: 'restore',
};
export function featureOf(from) { const f = FROM[from] || null; return f && FEATURES.includes(f) ? f : null; }

let S = { n: 0, open: {}, adDay: '', adCount: 0, gift: false };
let loaded = false;
export async function load() {
  try { S = { ...S, ...((await store.metaGet('clover', null)) || {}) }; S.open = S.open || {}; } catch { /* 못 읽으면 빈 상태 */ }
  loaded = true;
  return S;
}
/* 저장할 때마다 알린다 — 홈 칩 등이 스스로 숫자를 고친다 (가상 폰 점검 2026-11-26: 선물이 홈을 그린 뒤 들어와 칩이 0개로 남았다) */
const save = () => { try { window.dispatchEvent(new CustomEvent('hk:clover')); } catch { /* */ } return store.metaSet('clover', S).catch(() => {}); };
export function isLoaded() { return loaded; }

export function count() { return S.n || 0; }
/** 그 기능이 열린 끝 시각 (전부 열기 포함). 닫혀 있으면 0 */
export function until(f) { return FEATURES.includes(groupOf(f)) ? allOpenUntil() : 0; }   // 전부 열기 하나뿐 (예전 기능별 열기는 읽지 않는다)
export function isOpen(f) { return FEATURES.includes(groupOf(f)) && until(f) > 0; }
export function allOpenUntil() { const u = +(S.open?.all) || 0; return u > Date.now() ? u : 0; }
/** 지금 열려 있는 기능들 [{ f, until }] (전부 열기는 f='all') */
export function openList() {
  const now = Date.now();
  const u = +(S.open?.all) || 0;
  return u > now ? [{ f: 'all', until: u }] : [];
}
export function hoursLeft(u) { return Math.max(1, Math.ceil((u - Date.now()) / H)); }

export function adsLeft() { return S.adDay === todayKey() ? Math.max(0, ADS_PER_DAY - (S.adCount || 0)) : ADS_PER_DAY; }
export function canTakeMore() { return count() < MAX; }

/** 클로버 10개로 플러스 기능 전부를 24시간 연다 ('all' 만). 모자라면 false. 이미 열려 있으면 24시간을 더 붙인다 */
export async function spend(f = 'all') {
  if (f !== 'all') return false;
  if (count() < COST_ALL) return false;
  S.n = count() - COST_ALL;
  const base = Math.max(Date.now(), +(S.open?.all) || 0);
  S.open = { all: base + HOURS * H };
  await save();
  return true;
}

/** 광고를 끝까지 봤을 때 (보상 알림을 받은 순간 바로) */
export async function rewardAd() {
  const d = todayKey();
  if (S.adDay !== d) { S.adDay = d; S.adCount = 0; }
  S.adCount = (S.adCount || 0) + 1;
  const before = count();
  S.n = Math.min(MAX, before + PER_AD);
  await save();
  return S.n - before;
}

/** 체험이 끝난 사람에게 한 번 선물 (클로버를 보여 줄 대상일 때만 부른다) */
export async function giftIfDue() {
  if (S.gift) return 0;
  S.gift = true;
  const before = count();
  S.n = Math.min(MAX, before + GIFT);
  await save();
  return S.n - before;
}

/* 시험용 */
export function _state() { return S; }
export async function _set(v) { S = { n: 0, open: {}, adDay: '', adCount: 0, gift: false, ...v }; await save(); }
