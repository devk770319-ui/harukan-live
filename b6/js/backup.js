/* ===========================================================
   backup.js — 백업 파일 만들기 / 되돌리기

   폰을 바꿀 때 쓰는 기능이다. 그래서 두 가지가 절대 조건이다.
     1. 파일이 진짜로 저장돼야 한다.
        웹에서 쓰던 <a download> 는 안드로이드 웹뷰에서 조용히 아무 일도
        하지 않는 경우가 있다. "저장했어요"라고 말해놓고 파일이 없으면
        백업 기능으로서 최악이므로, 네이티브에서는 파일 시스템에 직접
        쓰고 그 경로를 확인한 뒤에만 성공이라고 말한다.
     2. 파일이 암호화돼 있어야 한다.
        앱은 비밀번호로 일기를 암호화하는데 백업만 평문이면 구멍이다.
        다운로드 폴더의 파일은 클라우드 자동 백업으로 딸려 올라가기도 한다.

   백업 암호는 앱 잠금 비밀번호와 별개다. 새 폰에는 아직 잠금이 없을 수도
   있고, 잠금을 안 쓰는 사람도 백업은 지켜야 하기 때문이다.
   =========================================================== */

import * as store from './store.js';
import { deriveKey, encryptJSON, decryptJSON, b64, randomBytes, ITER } from './crypto.js';
import { isNative } from './native.js';
import { t } from './i18n.js';

export const KIND_ENC = 'backup-enc';   // 암호화된 백업 (지금 만드는 것)
export const KIND_RAW = 'raw';          // 비밀번호를 잊었을 때 빼내는 원본
const VERSION = 2;

/* 백업 암호는 사용자가 직접 정한다. 4자리 PIN 과 달리 길이 제한이 없으므로
   앱 잠금과 같은 반복 횟수를 쓴다. */
const BACKUP_ITER = ITER;

/* ── 만들기 ──────────────────────────────────────── */

/**
 * 암호화된 백업 객체를 만든다.
 * 겉껍데기(글 수·만든 날짜)는 평문으로 남긴다 — 가져오기 화면에서
 * 암호를 묻기 전에 "몇 편짜리 백업인지" 보여줘야 하기 때문이다.
 * 일기 내용은 payload 안에 들어가고 암호 없이는 열리지 않는다.
 */
export async function createEncrypted(password, { includePhotos = true } = {}) {
  const data = await store.exportJSON({ includePhotos });
  const salt = b64(randomBytes(16));
  const key = await deriveKey(password, salt, BACKUP_ITER);
  const sec = await encryptJSON(key, data);
  return {
    app: 'harukan',
    kind: KIND_ENC,
    version: VERSION,
    createdAt: new Date().toISOString(),
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: BACKUP_ITER, salt },
    cipher: 'AES-GCM',
    // 암호 없이도 볼 수 있는 정보 (내용은 아니다)
    summary: {
      entries: data.entries.length,
      photos: Object.keys(data.photos || {}).length,
    },
    sec,
  };
}

/* ── 되돌리기 ────────────────────────────────────── */

/** 파일이 어떤 종류인지 알아본다. 종류를 잘못 짚으면 데이터가 깨진다. */
export function detect(data) {
  if (!data || data.app !== 'harukan') return null;
  if (data.kind === KIND_ENC) return KIND_ENC;
  if (data.kind === KIND_RAW) return KIND_RAW;
  if (Array.isArray(data.entries)) return 'plain';   // 옛 평문 백업 (version 1)
  return null;
}

/**
 * 암호를 풀어 안쪽 백업 데이터를 꺼낸다.
 * 암호가 틀리면 AES-GCM 이 인증 실패로 던진다 — 그걸 그대로 쓴다.
 * @returns {Promise<object|null>} 암호가 틀리면 null
 */
export async function decrypt(data, password) {
  const salt = data.kdf?.salt;
  const iter = data.kdf?.iterations || BACKUP_ITER;
  if (!salt || !data.sec) throw new Error('백업 파일이 손상되었습니다.');
  const key = await deriveKey(password, salt, iter);
  try {
    return await decryptJSON(key, data.sec);
  } catch {
    return null;      // 암호 불일치
  }
}

/* ── 파일로 내보내기 ─────────────────────────────── */

function FS() { return window.Capacitor?.Plugins?.Filesystem || null; }
function Sharer() { return window.Capacitor?.Plugins?.Share || null; }

/** Blob → base64 (zip 같은 바이너리는 문자열로 바꾸면 깨진다) */
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error('파일을 읽지 못했습니다.'));
    fr.onload = () => resolve(String(fr.result).split(',')[1] || '');
    fr.readAsDataURL(blob);
  });
}


/* 같은 이름의 파일이 이미 문서 폴더에 있는데 다른 설치본(앱을 지웠다 깐 경우·DEV 판)이 만든 것이면
   안드로이드가 덮어쓰기를 막는다(EACCES). 그때는 "이름 (2).pdf" 처럼 새 이름으로 쓴다 (1.7.2 폰 점검). */
export function altName(name, k) {
  const i = name.lastIndexOf('.');
  return i > 0 ? `${name.slice(0, i)} (${k})${name.slice(i)}` : `${name} (${k})`;
}
function denied(e) { return /EACCES|Permission denied|EEXIST|exists/i.test(String(e?.message || e)); }
/** opts.path 로 쓰되 막히면 새 이름으로. 실제로 쓴 이름과 결과를 돌려준다 */
export async function writeFresh(fs, opts) {
  let name = opts.path;
  for (let k = 2; ; k++) {
    try { const res = await fs.writeFile({ ...opts, path: name }); return { name, res }; }
    catch (e) { if (k > 30 || !denied(e)) throw e; name = altName(opts.path, k); }
  }
}

/**
 * 파일을 저장한다. data 는 문자열이거나 Blob(바이너리)이다.
 * 네이티브에서는 파일 시스템에 쓰고 경로를 돌려준다. 실패하면 던진다 —
 * 부르는 쪽이 "저장했다"고 말하기 전에 반드시 성공을 확인하게 하기 위해서다.
 * @returns {Promise<{where:'native'|'web', path?:string, uri?:string}>}
 */
export async function saveFile(filename, data, mime = 'application/json') {
  const isBlob = data instanceof Blob;

  if (isNative() && FS()) {
    const fs = FS();
    // Documents 는 사용자가 파일 관리자에서 찾아갈 수 있는 위치다.
    // 바이너리는 base64 로 넘긴다 (encoding 을 주지 않으면 base64 로 해석한다).
    const opts = isBlob
      ? { path: filename, data: await blobToBase64(data), directory: 'DOCUMENTS', recursive: true }
      : { path: filename, data, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true };
    const { name, res } = await writeFresh(fs, opts);
    // 진짜 써졌는지 확인한다. 여기서 던지면 성공 문구가 뜨지 않는다.
    const stat = await fs.stat({ path: name, directory: 'DOCUMENTS' });
    if (!stat || !stat.size) throw new Error('파일이 만들어지지 않았습니다.');
    return { where: 'native', path: name, uri: res?.uri || stat.uri, size: stat.size };
  }

  // 웹(브라우저 PWA)에서는 기존 방식 그대로
  const blob = isBlob ? data : new Blob([data], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 8000);
  return { where: 'web' };
}

/** 저장한 파일을 다른 앱(드라이브·메일·USB)으로 넘긴다. 폰을 바꿀 때 이게 핵심이다. */
export async function shareFile(uri, title) {
  const sh = Sharer();
  if (!isNative() || !sh || !uri) return false;
  try {
    await sh.share({ title, url: uri, dialogTitle: title });
    return true;
  } catch {
    return false;   // 사용자가 공유 창을 닫은 것도 여기로 온다 — 실패가 아니다
  }
}

/** 파일 선택 창을 띄우고 텍스트를 읽어온다. */
export function pickFile(accept = '.json,application/json') {
  return new Promise((resolve) => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.accept = accept;
    inp.style.display = 'none';
    document.body.append(inp);
    inp.addEventListener('change', async () => {
      const f = inp.files?.[0];
      inp.remove();
      if (!f) return resolve(null);
      try {
        resolve({ name: f.name, size: f.size, text: await f.text() });
      } catch {
        resolve(null);
      }
    });
    // 창을 닫아버리면 change 가 안 온다. 그대로 두면 Promise 가 영원히 매달린다.
    inp.addEventListener('cancel', () => { inp.remove(); resolve(null); });
    inp.click();
  });
}

/** 백업 크기를 미리 재본다. 사진이 많으면 통째로 문자열에 담다가 앱이 죽을 수 있다. */
export async function estimate() {
  const list = store.all().filter((e) => !e.demo);   // 백업에 들어가는 글만 센다 (예시 제외)
  const entries = list.length;
  let photos = 0;
  for (const e of list) photos += (e.photos?.length || 0);
  return { entries, photos, roughBytes: photos * 350_000 + entries * 2_000 };
}
