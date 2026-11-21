/* ===========================================================
   feedback.js — 사용자 의견 보내기 (1.7.4, 2026-10-23 사용자 요청)
   하루칸은 서버가 없는 일기장이다. 이 기능만 예외로, 사용자가 직접 쓰고
   '보내기'를 누른 의견 한 건을 Supabase 표(harukan_feedback)에 넣는다.
   · 일기·사진·태그 같은 기록은 절대 보내지 않는다.
   · 보내는 것: 의견 종류, 의견 글, (원하면) 답장 받을 이메일, 앱 버전·언어·기기 종류.
   · 앱 열쇠(anon)는 '넣기'만 허락된다 (표 규칙 RLS: insert 만, 읽기·고치기·지우기 없음).
     그래서 앱 안에 열쇠가 들어 있어도 다른 사람의 의견을 읽을 수 없다.
   =========================================================== */

import * as i18n from './i18n.js';

/* Supabase 프로젝트 (하루칸 의견함). anon 열쇠는 공개용이라 앱에 넣어도 된다. */
export const SUPABASE_URL = 'https://bgnwwnowtzfobmirwtzu.supabase.co';   // mobileApp 프로젝트 (hjsollution), 표 harukan_feedback
export const SUPABASE_ANON = 'sb_publishable_0EPQyazqtV4gJlxlT5EVwQ_3kAhgYPM';   // publishable 키 (공개용)

export const KINDS = ['idea', 'problem', 'praise', 'other'];
export const MAX_LEN = 2000;
const GAP_MS = 60 * 1000;                 // 1분에 한 번만 (실수로 여러 번 누르기 방지)
const LAST_KEY = 'harukan.feedback.last';

export function available() { return !!(SUPABASE_URL && SUPABASE_ANON); }

export function looksLikeEmail(s) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

async function appVersion() {
  try {
    const i = await window.Capacitor?.Plugins?.App?.getInfo?.();
    if (i?.version) {
      const b = await import('./liveupdate.js').then((m) => m.currentBuild()).catch(() => 0);   // 내용 묶음 번호 (1.7.8)
      return String(i.version) + (b ? '+' + b : '');
    }
  } catch {}
  return 'web';
}

/** 기기 종류: "Android 15; SM-S931N" 정도만 (브라우저 식별 문자열에서) */
function deviceInfo() {
  const ua = navigator.userAgent || '';
  const m = ua.match(/\(([^)]*Android[^)]*)\)/);
  const raw = m ? m[1].replace(/Linux;\s*|U;\s*|wv;?\s*/g, '').replace(/\s*Build\/\S*/g, '').replace(/;\s*$/, '') : (navigator.platform || '');
  return raw.slice(0, 120);
}

/**
 * 의견 한 건을 보낸다.
 * @returns {Promise<'ok'|'tooSoon'|'offline'|'fail'|'off'>}
 */
export async function send({ kind, message, email }) {
  if (!available()) return 'off';
  const last = Number(localStorage.getItem(LAST_KEY) || 0);
  if (Date.now() - last < GAP_MS) return 'tooSoon';
  if (navigator.onLine === false) return 'offline';
  const body = {
    kind: KINDS.includes(kind) ? kind : 'other',
    message: String(message || '').trim().slice(0, MAX_LEN),
    email: email && looksLikeEmail(email.trim()) ? email.trim().slice(0, 200) : null,
    app_version: await appVersion(),
    lang: i18n.current(),
    device: deviceInfo(),
    platform: window.Capacitor?.getPlatform?.() || 'web',
  };
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    const r = await fetch(`${SUPABASE_URL}/rest/v1/harukan_feedback`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON,          // publishable 키는 apikey 머리글로만 보낸다 (JWT 가 아님)
        'Content-Type': 'application/json',
        Prefer: 'return=minimal',
      },
      body: JSON.stringify(body),
      signal: ctl.signal,
    });
    if (!r.ok) { console.error('의견 보내기 실패', r.status, await r.text().catch(() => '')); return 'fail'; }
    localStorage.setItem(LAST_KEY, String(Date.now()));
    return 'ok';
  } catch (e) {
    console.error('의견 보내기 실패', e);
    return navigator.onLine === false ? 'offline' : 'fail';
  } finally {
    clearTimeout(timer);
  }
}
