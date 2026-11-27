/* ===========================================================
   motto.js — '오늘의 한 칸' 카드 문구 (2026-11-20 사용자: "100개 모두 넣고 랜덤으로, 명언은 출처자도").
   · 앱을 켤 때마다 하나를 고른다(켜 있는 동안은 같은 문구 — 홈을 다시 그려도 바뀌지 않게).
   · 한 바퀴 다 보기 전에는 같은 문구가 다시 나오지 않게 섞은 순서(주머니)를 기억한다.
   · 지금 언어 문장이 없으면 영어, 그래도 없으면 한국어.
   =========================================================== */
import { MOTTO } from './motto-data.js';

const K_BAG = 'hk.mottoBag';
let current = null;

function shuffled() {
  const a = MOTTO.map((m) => m.id);
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

/** 이번 실행의 문구 { id, text, by } (by 는 명언일 때만) */
export function todayMotto(lang = 'ko') {
  if (!current) {
    let bag = [];
    try { bag = JSON.parse(localStorage.getItem(K_BAG) || '[]').filter((id) => MOTTO.some((m) => m.id === id)); } catch { bag = []; }
    if (!bag.length) bag = shuffled();
    const id = bag.shift();
    try { localStorage.setItem(K_BAG, JSON.stringify(bag)); } catch { /* */ }
    current = MOTTO.find((m) => m.id === id) || MOTTO[0];
  }
  const L = (o) => (o ? o[lang] || o.en || o.ko : '');
  return { id: current.id, text: L(current.t), by: current.by ? L(current.by) : '' };
}
/** 시험용: 다음 호출에서 새로 고르게 */
export function _reset() { current = null; }
