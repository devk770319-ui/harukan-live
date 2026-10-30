/* ===========================================================
   crypto.js — 선택적 암호 잠금 (AES-GCM + PBKDF2)
   서버가 없으므로 열쇠는 오직 사용자 머릿속에만 있다.
   암호를 잊으면 복구 방법이 없다 — UI에서 반드시 경고할 것.
   =========================================================== */

const enc = new TextEncoder();
const dec = new TextDecoder();

/* 4자리 PIN 은 경우의 수가 1만 개뿐이라 무차별 대입에 약하다.
   반복 횟수를 올려 한 번의 시도를 비싸게 만든다.
   예전에 만든 잠금은 250k 로 되어 있으므로, 반복 횟수를 잠금 설정에 적어두고
   그 값으로 유도한다(안 적혀 있으면 옛 기본값). 그래야 쓰던 사람이 잠기지 않는다. */
export const ITER_LEGACY = 250_000;
export const ITER = 600_000;

export function randomBytes(n) {
  return crypto.getRandomValues(new Uint8Array(n));
}

export function b64(buf) {
  const b = new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}
export function unb64(str) {
  const s = atob(str);
  const b = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) b[i] = s.charCodeAt(i);
  return b;
}

export async function deriveKey(passphrase, saltB64, iterations = ITER_LEGACY) {
  const base = await crypto.subtle.importKey('raw', enc.encode(passphrase), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: unb64(saltB64), iterations, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJSON(key, obj) {
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
  return { iv: b64(iv), ct: b64(ct) };
}

export async function decryptJSON(key, sec) {
  const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(sec.iv) }, key, unb64(sec.ct));
  return JSON.parse(dec.decode(pt));
}

/** 암호가 맞는지 검사하기 위한 토큰 */
export const VERIFY_TEXT = 'harukan-ok';

export async function makeVerifier(key) {
  return encryptJSON(key, VERIFY_TEXT);
}
export async function checkVerifier(key, verifier) {
  try { return (await decryptJSON(key, verifier)) === VERIFY_TEXT; }
  catch { return false; }
}
