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

/* ── 복구 코드 (2026-10-30 사용자 지시: "비밀번호를 잃어버려도 복구가 가능하게") ──────────
   잠금을 켠 사람이 원하면 16자리 복구 코드를 만든다. 서버·이메일 없이 기기 안에서만 동작한다.
   · 일기를 여는 열쇠는 비밀번호에서 나온다. 그래서 복구 코드로는 '비밀번호'를 되찾는다.
   · 비밀번호를 바꿔도 같은 코드를 계속 쓰게 하려고 공개키를 쓴다:
       만들 때 RSA 열쇠쌍을 만들고, 개인키는 복구 코드로 잠가(AES-GCM, PBKDF2) 두고, 공개키로 비밀번호를 잠가 둔다.
       비밀번호를 바꾸면 공개키로 새 비밀번호를 다시 잠근다(코드가 없어도 된다).
       잊었을 때: 코드 → 개인키 풀기 → 비밀번호 풀기 → 일기 열기 → 새 비밀번호 정하기.
   · 코드 자체는 어디에도 저장하지 않는다. 코드를 가진 사람은 일기를 열 수 있다.
   · 코드: Crockford base32 16자 (80비트). 0/O, 1/I/L 은 같은 글자로 읽는다. */
const REC_ABC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const REC_ITER = 200_000;

export function newRecoveryCode() {
  const r = randomBytes(16);
  let s = '';
  for (let i = 0; i < 16; i++) s += REC_ABC[r[i] & 31];
  return s;
}
/** 보여 줄 때: XXXX-XXXX-XXXX-XXXX */
export function formatRecoveryCode(c) { return String(c).match(/.{1,4}/g).join('-'); }
/* 한글 자판 상태로 친 글자 → 같은 자리의 영문 (두벌식). 예: ㅎ7ㅗ8 → G7H8, '호' → GH (2026-10-30 폰에서 확인) */
const KO_KEY = { 'ㅂ':'Q','ㅈ':'W','ㄷ':'E','ㄱ':'R','ㅅ':'T','ㅛ':'Y','ㅕ':'U','ㅑ':'I','ㅐ':'O','ㅔ':'P','ㅁ':'A','ㄴ':'S','ㅇ':'D','ㄹ':'F','ㅎ':'G','ㅗ':'H','ㅓ':'J','ㅏ':'K','ㅣ':'L','ㅋ':'Z','ㅌ':'X','ㅊ':'C','ㅍ':'V','ㅠ':'B','ㅜ':'N','ㅡ':'M',
  'ㅃ':'Q','ㅉ':'W','ㄸ':'E','ㄲ':'R','ㅆ':'T','ㅒ':'O','ㅖ':'P','ㅘ':'HK','ㅙ':'HO','ㅚ':'HL','ㅝ':'NJ','ㅞ':'NP','ㅟ':'NL','ㅢ':'ML',
  'ㄳ':'RT','ㄵ':'SW','ㄶ':'SG','ㄺ':'FR','ㄻ':'FA','ㄼ':'FQ','ㄽ':'FT','ㄾ':'FX','ㄿ':'FV','ㅀ':'FG','ㅄ':'QT' };
const KO_CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
const KO_JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ';
const KO_JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
function hangulToKeys(s) {
  let out = '';
  for (const ch of String(s || '')) {
    const c = ch.charCodeAt(0);
    if (c >= 0xAC00 && c <= 0xD7A3) {
      const n = c - 0xAC00;
      out += (KO_KEY[KO_CHO[Math.floor(n / 588)]] || '') + (KO_KEY[KO_JUNG[Math.floor((n % 588) / 28)]] || '') + (KO_KEY[KO_JONG[n % 28]] || '');
    } else out += KO_KEY[ch] || ch;
  }
  return out;
}
/** 넣은 값을 비교할 모양으로: 한글 자판 → 영문, 띄어쓰기·대시 빼기, 대문자, 헷갈리는 글자(O→0, I·L→1, U→V) */
export function cleanRecoveryInput(s) {
  return hangulToKeys(s).toUpperCase().replace(/[\s\-_.·]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
}
/** 사용자가 넣은 값 → 16자. 모양이 틀리면 '' */
export function normalizeRecoveryCode(s) {
  const c = cleanRecoveryInput(s);
  return /^[0-9A-HJKMNP-TV-Z]{16}$/.test(c) ? c : '';
}

const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' };

/** 새 복구 정보 { v, salt, iter, pub, priv, pin, at } — 비밀번호(pin)는 공개키로 잠근다 */
export async function recoveryCreate(code, pin) {
  const kp = await crypto.subtle.generateKey({ ...RSA, modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
  const pub = b64(await crypto.subtle.exportKey('spki', kp.publicKey));
  const pk8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', kp.privateKey));
  const salt = b64(randomBytes(16));
  const ck = await deriveKey(code, salt, REC_ITER);
  const iv = randomBytes(12);
  const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, ck, pk8);
  const rec = { v: 1, salt, iter: REC_ITER, pub, priv: { iv: b64(iv), ct: b64(ct) }, at: Date.now() };
  return recoveryRewrap(rec, pin);
}

/** 비밀번호가 바뀌면 공개키로 새 비밀번호를 다시 잠근다 (코드는 필요 없다) */
export async function recoveryRewrap(rec, pin) {
  const pk = await crypto.subtle.importKey('spki', unb64(rec.pub), RSA, false, ['encrypt']);
  const ct = await crypto.subtle.encrypt(RSA, pk, enc.encode(pin));
  return { ...rec, pin: b64(ct) };
}

/** 복구 코드로 비밀번호를 되찾는다. 코드가 틀리면 null */
export async function recoveryOpen(rec, code) {
  try {
    const ck = await deriveKey(code, rec.salt, rec.iter || REC_ITER);
    const pk8 = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.priv.iv) }, ck, unb64(rec.priv.ct));
    const pk = await crypto.subtle.importKey('pkcs8', pk8, RSA, false, ['decrypt']);
    return dec.decode(await crypto.subtle.decrypt(RSA, pk, unb64(rec.pin)));
  } catch { return null; }
}
