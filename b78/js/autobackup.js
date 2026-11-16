/* ===========================================================
   autobackup.js — 자동 백업 (2026-11-05 사용자 요청: "자동 백업 복구 기능")
   · 앱을 켤 때·다른 앱에서 돌아올 때 "때가 됐으면" 암호 걸린 백업 파일을 문서 폴더에 조용히 쓴다 (백그라운드 서비스 없음)
   · 저장 위치: 문서/Harukan/auto/harukan-auto-YYYY-MM-DD.json — 파일 관리자·드라이브 업로드에서 보인다
   · 최근 7개만 남기고 오래된 자동 백업은 지운다
   · 암호: 사용자가 켤 때 한 번 정한다 (메타 'autoBackupPw', 이 폰에만). 잊으면 그 파일은 못 연다 — 수동 백업과 같은 규칙
   · 설정: autoBackup(bool) · autoBackupEvery('daily'|'weekly') · lastAutoBackupAt · lastAutoBackupName · lastAutoBackupFail
   =========================================================== */
import * as store from './store.js';
import * as analytics from './analytics.js';
import { t as t0 } from './i18n.js';

export const DIR = 'Harukan/auto';
/* 저장 위치 (1.8.1, 2026-11-05 사용자: "구글 드라이브에 할지 내 로컬에 할지 선택") — 설정 backupDest { kind:'phone'|'folder'|'drive', uri?, name?, email? }
   · phone  : 문서/Harukan/auto (기본, 플러그인 없이도 됨)
   · folder : 사용자가 고른 폴더(SAF 영구 권한) — 로컬·SD카드·폴더 고르기를 지원하는 클라우드 앱. 네이티브 BackupDest 플러그인 필요
   · drive  : 구글 드라이브 'Harukan' 폴더 — 네이티브 driveConnect/driveUpload/driveList/driveDownload/driveDelete (1.8.1, DriveBackup.java). caps.drive 가 참일 때만 선택지에
   플러그인이 없는 옛 앱(지금 스토어 판)은 '이 폰'만 보인다 → 이 코드는 1.8.1 전에 패치로 나가도 안전 */
function BD() { return window.Capacitor?.Plugins?.BackupDest || null; }
let capsP = null;
/** 어떤 저장 위치가 되는지 { folder, drive } — 플러그인이 없으면 둘 다 false */
export function caps() {
  if (capsP) return capsP;
  capsP = (async () => {
    const p = BD(); if (!p?.caps || !isNative()) return { folder: false, drive: false, file: false };
    try { const r = await Promise.race([p.caps(), new Promise((_, rj) => setTimeout(() => rj(new Error('timeout')), 2500))]); return { folder: !!r?.folder, drive: !!r?.drive, file: !!r?.file && !!p.pickSaveFile }; }
    catch { return { folder: false, drive: false, file: false }; }
  })();
  return capsP;
}
export function dest() { const d = store.getSettings().backupDest; return d && typeof d === 'object' && d.kind ? d : { kind: 'phone' }; }
export async function setDest(d) { await store.saveSettings({ backupDest: d, lastAutoBackupFail: '' }, { silent: true }); analytics.design('backup:dest:' + (d?.kind || 'phone')); }
/** 폴더 고르기 창을 띄우고 고른 폴더를 저장 위치로 */
export async function pickFolder() {
  const p = BD(); if (!p?.pickFolder) throw new Error('unsupported');
  const r = await p.pickFolder();
  if (!r?.uri) throw new Error('cancelled');
  await setDest({ kind: 'folder', uri: r.uri, name: r.name || '' });
  return r;
}
/* ── 파일 하나로 (1.8.2, 2026-11-05 사용자: "구글 드라이브에서 폴더를 선택하게") ──
   시스템 파일 저장 창(ACTION_CREATE_DOCUMENT)에는 구글 드라이브가 나온다 → 사용자가 드라이브의 아무 폴더나 골라 파일 하나를 만들면
   그 파일을 매번 덮어쓴다 (예전 일기장 앱 SafTarget FILE 방식). 최근 7개 보관은 안 된다 — 파일 하나 */
export async function pickSaveFile() {
  const p = BD(); if (!p?.pickSaveFile) throw new Error('unsupported');
  const r = await p.pickSaveFile({ suggestedName: 'harukan-backup.json', mime: 'application/json' });
  if (!r?.uri) throw new Error('cancelled');
  await setDest({ kind: 'file', uri: r.uri, name: r.name || '', authority: r.authority || '' });
  return r;
}
/** 고른 파일에 아직 쓸 수 있나 */
export async function fileOk(d = dest()) {
  if (d.kind !== 'file' || !d.uri) return false;
  const p = BD(); if (!p?.hasUriPermission) return false;
  try { return !!(await p.hasUriPermission({ uri: d.uri }))?.ok; } catch { return false; }
}
/* ── 구글 드라이브 (1.8.1) ── */
export async function driveStatus() {
  const p = BD(); if (!p?.driveStatus) return { connected: false, email: null };
  try { const r = await p.driveStatus(); return { connected: !!r?.connected, email: r?.email || null }; } catch { return { connected: false, email: null }; }
}
/** 계정 고르기·동의 창 → 저장 위치를 드라이브로. 취소하면 'cancelled', Play 서비스 없으면 'noplay' */
export async function driveConnect() {
  const p = BD(); if (!p?.driveConnect) throw new Error('unsupported');
  const r = await p.driveConnect();
  if (!r?.email) throw new Error('auth');
  await setDest({ kind: 'drive', email: r.email });
  return r;
}
export async function driveDisconnect() {
  const p = BD(); try { await p?.driveDisconnect?.(); } catch { /* */ }
  if (dest().kind === 'drive') await setDest({ kind: 'phone' });
}
/** 드라이브 오류 코드 → 실패 이유 */
function driveWhy(e) {
  const m = String(e?.message || e?.code || e);
  if (/needsuser|auth|cancelled/.test(m)) return 'drivelost';
  if (/offline/.test(m)) return 'offline';
  if (/quota/.test(m)) return 'drivequota';
  if (/noplay/.test(m)) return 'unsupported';
  return 'error';
}
/** 고른 폴더 권한이 아직 살아 있나 (앱 삭제·폴더 삭제·권한 회수) */
export async function folderOk(d = dest()) {
  if (d.kind !== 'folder' || !d.uri) return false;
  const p = BD(); if (!p?.hasPermission) return false;
  try { return !!(await p.hasPermission({ uri: d.uri }))?.ok; } catch { return false; }
}
export function destLabel(t, d = dest()) {
  if (d.kind === 'folder') return d.name || t('고른 폴더');
  if (d.kind === 'file') return d.name || t('고른 파일');
  if (d.kind === 'drive') return t('구글 드라이브') + (d.email ? ' · ' + d.email : '');
  return t('이 폰 (내 파일 › 문서 › Harukan › auto)');
}
export const KEEP = 7;
const DAY = 864e5;

function FS() { return window.Capacitor?.Plugins?.Filesystem || null; }
function isNative() { return !!window.Capacitor?.isNativePlatform?.(); }
const pad = (n) => String(n).padStart(2, '0');
export function todayName(d = new Date()) { return `harukan-auto-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}.json`; }

export function available() { return isNative() && !!FS(); }
export function enabled() { return !!store.getSettings().autoBackup; }
export function periodMs() { return store.getSettings().autoBackupEvery === 'weekly' ? 7 * DAY : DAY; }
/** 다음 자동 백업 예정 시각 (켜져 있을 때). 아직 한 번도 안 했으면 지금 */
export function nextAt() {
  const s = store.getSettings();
  if (!s.autoBackup) return null;
  return (+s.lastAutoBackupAt || 0) + periodMs();
}
export function due() { return enabled() && Date.now() >= (nextAt() || 0); }

export async function setEnabled(on, { password = null, every = null } = {}) {
  const patch = { autoBackup: !!on };
  if (every) patch.autoBackupEvery = every;
  if (on && password) await store.metaSet('autoBackupPw', password);
  if (on) patch.lastAutoBackupFail = '';
  await store.saveSettings(patch, { silent: true });
  analytics.design(on ? 'backup:auto:on' : 'backup:auto:off');
}
export async function hasPassword() { return !!(await store.metaGet('autoBackupPw', '')); }

let running = null;
/** 때가 됐으면 백업을 쓴다. 돌려주는 값: 'done' | 'skip' | 'fail' */
export async function maybeRun({ force = false } = {}) {
  if (running) return running;
  const task = (async () => {
    try {
      if (!enabled()) return 'skip';
      if (!available()) { await fail('unsupported'); return 'fail'; }
      if (!force && !due()) return 'skip';
      const pw = await store.metaGet('autoBackupPw', '');
      if (!pw) { await fail('nopassword'); return 'fail'; }
      const backup = await import('./backup.js');
      const est = await backup.estimate();
      if (!est.entries) { await store.saveSettings({ lastAutoBackupAt: Date.now(), lastAutoBackupFail: '' }, { silent: true }); return 'skip'; }   // 쓸 글이 없다 — 다음 때로
      const data = await backup.createEncrypted(pw, { includePhotos: true });
      try { window.__hkOutAt = Date.now(); } catch { /* */ }
      const written = await writeTo(dest(), todayName(), JSON.stringify(data));
      await store.saveSettings({ lastAutoBackupAt: Date.now(), lastAutoBackupName: written, lastAutoBackupFail: '', lastBackupAt: Date.now() }, { silent: true });
      analytics.design('backup:auto:run' + (dest().kind !== 'phone' ? ':' + dest().kind : ''));
      await trim().catch(() => {});
      return 'done';
    } catch (e) {
      const m = String(e?.message || e);
      const why = m === 'folderlost' ? 'folderlost' : m === 'filelost' ? 'filelost' : m.startsWith('drive:') ? m.slice(6) : /ENOSPC|space/i.test(m) ? 'nospace' : /EACCES|denied/i.test(m) ? 'denied' : 'error';
      await fail(why);
      return 'fail';
    }
  })();
  running = task;
  task.finally(() => { if (running === task) running = null; });   // 바로 끝나는(skip) 경우에도 잠금이 남지 않게
  return task;
}
async function fail(reason) {
  await store.saveSettings({ lastAutoBackupFail: reason }, { silent: true });
  analytics.design('backup:auto:fail:' + reason);
}
/** [지금 백업] 파일도 고른 저장 위치(폴더·드라이브)에 한 벌 더 쓴다 → 쓴 곳 이름, '이 폰'이면 null, 실패하면 던진다 */
export async function copyManual(fileName, text) {
  const d = dest();
  if (d.kind === 'phone') return null;
  await writeTo(d, fileName, text);
  return d;
}
/** 저장 위치에 파일 하나 쓰기 → 실제 파일 이름. 폴더 권한이 사라졌으면 'folderlost' */
async function writeTo(d, fileName, text) {
  if (d.kind === 'folder') {
    const p = BD(); if (!p?.writeFile) throw new Error('unsupported');
    if (!(await folderOk(d))) throw new Error('folderlost');
    const r = await p.writeFile({ uri: d.uri, name: fileName, text, mime: 'application/json' });
    if (!r?.size) throw new Error('empty');
    return r.name || fileName;
  }
  if (d.kind === 'drive') {
    const p = BD(); if (!p?.driveUpload) throw new Error('unsupported');
    let r; try { r = await p.driveUpload({ name: fileName, text, mime: 'application/json' }); } catch (e) { throw new Error('drive:' + driveWhy(e)); }
    if (!r?.id) throw new Error('empty');
    return r.name || fileName;
  }
  if (d.kind === 'file') {
    /* 파일 하나를 덮어쓴다 — 이름은 사용자가 저장 창에서 정한 것 그대로 */
    const p = BD(); if (!p?.writeUri) throw new Error('unsupported');
    if (!(await fileOk(d))) throw new Error('filelost');
    let r; try { r = await p.writeUri({ uri: d.uri, text }); } catch (e) { const m = String(e?.message || e?.code || e); throw new Error(/lost|denied/.test(m) ? 'filelost' : /nospace/.test(m) ? 'ENOSPC' : m); }
    if (!r?.size) throw new Error('empty');
    return d.name || fileName;
  }
  const backup = await import('./backup.js');
  const fs = FS();
  const { name: written } = await backup.writeFresh(fs, { path: `${DIR}/${fileName}`, data: text, directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
  const st = await fs.stat({ path: written, directory: 'DOCUMENTS' });
  if (!st?.size) throw new Error('empty');
  return written.split('/').pop();
}
const isAuto = (n) => /^harukan-auto-\d{4}-\d{2}-\d{2}(?: \(\d+\))?\.json$/.test(n);
/** 오래된 자동 백업 정리 — 최근 KEEP 개만 (저장 위치별) */
export async function trim() {
  const d = dest();
  if (d.kind === 'folder') {
    const p = BD(); if (!p?.listFiles) return;
    const r = await p.listFiles({ uri: d.uri, prefix: 'harukan-auto-' });
    const files = (r?.files || []).filter((f) => isAuto(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    for (const f of files.slice(0, Math.max(0, files.length - KEEP))) await p.deleteFile({ docUri: f.docUri }).catch(() => {});
    return;
  }
  if (d.kind === 'drive') {
    const p = BD(); if (!p?.driveList) return;
    const r = await p.driveList({ prefix: 'harukan-auto-' });
    const files = (r?.files || []).filter((f) => isAuto(f.name)).sort((a, b) => a.name.localeCompare(b.name));
    for (const f of files.slice(0, Math.max(0, files.length - KEEP))) await p.driveDelete({ id: f.id }).catch(() => {});
    return;
  }
  if (d.kind === 'file') return;   // 파일 하나를 덮어쓰므로 정리할 게 없다
  return trimPhone();
}
async function trimPhone(fs = FS()) {
  if (!fs?.readdir) return;
  const r = await fs.readdir({ path: DIR, directory: 'DOCUMENTS' });
  const files = (r?.files || []).map((f) => (typeof f === 'string' ? f : f.name)).filter((n) => /^harukan-auto-\d{4}-\d{2}-\d{2}(?: \(\d+\))?\.json$/.test(n)).sort();
  for (const n of files.slice(0, Math.max(0, files.length - KEEP))) await fs.deleteFile({ path: `${DIR}/${n}`, directory: 'DOCUMENTS' }).catch(() => {});
}
/** 자동 백업 파일 목록 (새 것부터, 저장 위치별) */
export async function list() {
  const d = dest();
  if (d.kind === 'folder') {
    const p = BD(); if (!p?.listFiles) return [];
    try { const r = await p.listFiles({ uri: d.uri, prefix: 'harukan-auto-' }); return (r?.files || []).map((f) => ({ name: f.name, size: f.size, mtime: f.mtime, docUri: f.docUri })).sort((a, b) => b.name.localeCompare(a.name)); } catch { return []; }
  }
  if (d.kind === 'drive') {
    const p = BD(); if (!p?.driveList) return [];
    try { const r = await p.driveList({ prefix: 'harukan-auto-' }); return (r?.files || []).filter((f) => isAuto(f.name)).map((f) => ({ name: f.name, size: f.size, mtime: f.mtime, id: f.id })).sort((a, b) => b.name.localeCompare(a.name)); } catch { return []; }
  }
  if (d.kind === 'file') {
    /* 파일 하나 — 있으면 그것 하나만. 마지막 자동 백업 시각을 날짜로 */
    if (!(await fileOk(d))) return [];
    const at = store.getSettings().lastAutoBackupAt || store.getSettings().lastBackupAt || 0;
    return [{ name: d.name || t0('고른 파일'), size: 0, mtime: at, fileUri: d.uri }];
  }
  const fs = FS(); if (!fs?.readdir) return [];
  try {
    const r = await fs.readdir({ path: DIR, directory: 'DOCUMENTS' });
    return (r?.files || []).map((f) => (typeof f === 'string' ? { name: f } : { name: f.name, size: f.size, mtime: f.mtime })).filter((f) => /^harukan-auto-/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
  } catch { return []; }
}
/** 자동 백업 파일 하나를 읽는다 (복원용) */
export async function read(name, docUri = null, id = null, fileUri = null) {
  if (dest().kind === 'file' && (fileUri || dest().uri)) {
    const p = BD(); if (!p?.readUri) return null;
    const r = await p.readUri({ uri: fileUri || dest().uri, text: true }); return r?.text ?? null;
  }
  if (dest().kind === 'drive' && id) {
    const p = BD(); if (!p?.driveDownload) return null;
    const r = await p.driveDownload({ id, text: true }); return r?.text ?? null;
  }
  if (dest().kind === 'folder' && docUri) {
    const p = BD(); if (!p?.readFile) return null;
    const r = await p.readFile({ docUri, text: true }); return r?.text ?? null;
  }
  const fs = FS(); if (!fs) return null;
  const r = await fs.readFile({ path: `${DIR}/${name}`, directory: 'DOCUMENTS', encoding: 'utf8' });
  return r?.data ?? null;
}
export function failText(t, reason) {
  return { nospace: t('저장 공간이 부족해요.'), denied: t('문서 폴더에 쓸 수 없었어요.'), folderlost: t('고른 폴더에 더는 쓸 수 없어요. 저장 위치를 다시 골라 주세요.'), filelost: t('고른 파일에 더는 쓸 수 없어요. 저장 위치를 다시 골라 주세요.'), drivelost: t('구글 드라이브 연결이 끊겼어요. 저장 위치에서 다시 연결해 주세요.'), offline: t('인터넷이 연결되지 않아 다음에 다시 해요.'), drivequota: t('구글 드라이브 용량이 가득 찼어요.'), nopassword: t('자동 백업 암호가 없어요. 자동 백업을 껐다 켜 주세요.'), unsupported: t('이 기기에서는 자동 백업을 쓸 수 없어요.') }[reason] || t('백업 파일을 저장하지 못했어요. 저장 공간을 확인해 주세요.');
}

let inited = false;
/** 앱에서 한 번 부른다 — 켤 때 + 돌아올 때 (3초 뒤, 화면을 끊지 않게) */
export function init() {
  if (inited) return; inited = true;
  const kick = () => setTimeout(() => { maybeRun().catch(() => {}); }, 3000);
  kick();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
}
