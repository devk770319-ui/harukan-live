/* ===========================================================
   bgm.js — 일기 배경음악 (1.7.9, 2026-10-28 사용자 결정)
   "일기와 사진을 보면서 음악을 듣고 싶다 — 다른 앱으로 가 버리면 안 된다"
   · 하루칸이 직접 가진 곡(music/*.webm, Opus 40kbps · 2분 안팎)을 일기마다 하나 고른다 (entry.bgm = 곡 id).
   · 일기를 열면 창 없이 흐르고(설정 '배경음악 자동 재생', 기본 켬), 글 보기 화면을 떠나면 멈춘다.
     앱을 내려 두면 멈추고, 다시 올라오면 이어서 튼다. 인터넷이 필요 없다.
   · 곡: Kevin MacLeod (incompetech.com), Creative Commons 저작자표시 4.0 — 앱 안 '음악 출처'에 표시한다.
   =========================================================== */
import { t } from './i18n.js';

/* name 은 화면 이름(번역 키), title 은 원곡 제목(출처 표시용) */
export const TRACKS = [
  { id: 'piano',  name: '잔잔한 피아노', title: 'Gymnopedie No 1' },
  { id: 'calm',   name: '고요한 밤',     title: 'Meditation Impromptu 02' },
  { id: 'dream',  name: '꿈꾸는 오후',   title: 'Dreamer' },
  { id: 'walk',   name: '가벼운 산책',   title: 'Wallpaper' },
  { id: 'happy',  name: '기분 좋은 날',  title: 'Easy Lemon' },
  { id: 'cafe',   name: '카페에서',      title: 'Lobby Time' },
  { id: 'rest',   name: '쉬어 가기',     title: 'At Rest' },
  { id: 'guitar', name: '느긋한 기타',   title: 'Laid Back Guitars' },
];
/* 번역 검사(check-i18n)가 키를 찾도록 한 번씩 적어 둔다 */
void [t('잔잔한 피아노'), t('고요한 밤'), t('꿈꾸는 오후'), t('가벼운 산책'), t('기분 좋은 날'), t('카페에서'), t('쉬어 가기'), t('느긋한 기타')];

export const CREDIT_AUTHOR = 'Kevin MacLeod (incompetech.com)';
export const CREDIT_LICENSE = 'Creative Commons: By Attribution 4.0 — https://creativecommons.org/licenses/by/4.0/';

export function trackOf(id) { return TRACKS.find((x) => x.id === id) || null; }
export function nameOf(id) { const x = trackOf(id); return x ? t(x.name) : ''; }
export function srcOf(id) { return 'music/' + id + '.webm'; }

const VOL = 0.5;
let audio = null;
let cur = null;          // 지금 걸린 곡 id
let wanted = false;      // 사용자가 틀어 둔 상태인가 (앱을 내렸다 올렸을 때 이어 틀지)
let fadeT = 0;
let playSeq = 0;      // 마지막 play/stop 순번 — 늦게 끝난 play 가 stop 을 덮지 않게
const subs = new Set();
const emit = () => { for (const f of subs) { try { f(state()); } catch { /* 무시 */ } } };

export function state() { return { id: cur, playing: !!audio && !audio.paused && !!cur }; }
export function subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }

function fadeTo(v, ms, done) {
  clearInterval(fadeT);
  if (!audio) { done?.(); return; }
  const a = audio, from = a.volume, steps = Math.max(1, Math.round(ms / 40));
  let k = 0;
  fadeT = setInterval(() => {
    k++;
    a.volume = Math.max(0, Math.min(1, from + (v - from) * (k / steps)));
    if (k >= steps) { clearInterval(fadeT); done?.(); }
  }, 40);
}

/** 곡을 튼다 (같은 곡이면 이어서). 자동 재생이 막히면 false */
export async function play(id) {
  if (!trackOf(id)) return false;
  if (!audio) {
    audio = new Audio();
    audio.loop = true;
    audio.preload = 'auto';
    audio.addEventListener('play', emit);
    audio.addEventListener('pause', emit);
    audio.addEventListener('ended', emit);
  }
  if (cur !== id) { audio.src = srcOf(id); cur = id; }
  wanted = true;
  const my = ++playSeq;
  audio.volume = 0;
  try { await audio.play(); } catch { wanted = false; emit(); return false; }
  /* 재생이 시작되기 전에 멈추라는 말이 왔다(화면을 바로 옮김) — 소리 없이 멈춘다 (2026-10-31) */
  if (my !== playSeq || !wanted) { audio.pause(); emit(); return false; }
  fadeTo(VOL, 1200);
  emit();
  return true;
}

/** 멈춘다 (부드럽게 줄이고) */
export function stop({ fade = true } = {}) {
  wanted = false;
  playSeq++;
  if (!audio || audio.paused) { emit(); return; }
  const a = audio;
  if (!fade) { a.pause(); emit(); return; }
  fadeTo(0, 450, () => { a.pause(); emit(); });
}

export function toggle(id) {
  const s = state();
  if (s.playing && s.id === id) { stop(); return false; }
  play(id);
  return true;
}

/* 화면을 옮기면 멈춘다 — 글 보기 화면이 다시 그려지면 그쪽에서 다시 튼다 (play 가 줄이던 소리를 받아 이어간다) */
window.addEventListener('hashchange', () => stop());

/* 앱을 내리면 멈추고, 다시 올라오면 이어 튼다 (틀어 두었던 경우만) */
let resumeOnShow = false;
document.addEventListener('visibilitychange', () => {
  if (!audio) return;
  if (document.hidden) {
    resumeOnShow = wanted && !audio.paused;
    if (!audio.paused) audio.pause();
  } else if (resumeOnShow && wanted && cur) {
    resumeOnShow = false;
    audio.play().catch(() => {});
  }
});
