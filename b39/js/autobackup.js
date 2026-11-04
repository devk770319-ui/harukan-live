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

export const DIR = 'Harukan/auto';
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
      const fs = FS();
      const name = `${DIR}/${todayName()}`;
      try { window.__hkOutAt = Date.now(); } catch { /* */ }
      const { name: written } = await backup.writeFresh(fs, { path: name, data: JSON.stringify(data), directory: 'DOCUMENTS', encoding: 'utf8', recursive: true });
      const st = await fs.stat({ path: written, directory: 'DOCUMENTS' });
      if (!st?.size) throw new Error('empty');
      await store.saveSettings({ lastAutoBackupAt: Date.now(), lastAutoBackupName: written.split('/').pop(), lastAutoBackupFail: '', lastBackupAt: Date.now() }, { silent: true });
      analytics.design('backup:auto:run');
      await trim(fs).catch(() => {});
      return 'done';
    } catch (e) {
      const why = /ENOSPC|space/i.test(String(e?.message || e)) ? 'nospace' : /EACCES|denied/i.test(String(e?.message || e)) ? 'denied' : 'error';
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
/** 오래된 자동 백업 정리 — 최근 KEEP 개만 */
export async function trim(fs = FS()) {
  if (!fs?.readdir) return;
  const r = await fs.readdir({ path: DIR, directory: 'DOCUMENTS' });
  const files = (r?.files || []).map((f) => (typeof f === 'string' ? f : f.name)).filter((n) => /^harukan-auto-\d{4}-\d{2}-\d{2}(?: \(\d+\))?\.json$/.test(n)).sort();
  for (const n of files.slice(0, Math.max(0, files.length - KEEP))) await fs.deleteFile({ path: `${DIR}/${n}`, directory: 'DOCUMENTS' }).catch(() => {});
}
/** 자동 백업 파일 목록 (새 것부터) */
export async function list() {
  const fs = FS(); if (!fs?.readdir) return [];
  try {
    const r = await fs.readdir({ path: DIR, directory: 'DOCUMENTS' });
    return (r?.files || []).map((f) => (typeof f === 'string' ? { name: f } : { name: f.name, size: f.size, mtime: f.mtime })).filter((f) => /^harukan-auto-/.test(f.name)).sort((a, b) => b.name.localeCompare(a.name));
  } catch { return []; }
}
/** 자동 백업 파일 하나를 읽는다 (복원용) */
export async function read(name) {
  const fs = FS(); if (!fs) return null;
  const r = await fs.readFile({ path: `${DIR}/${name}`, directory: 'DOCUMENTS', encoding: 'utf8' });
  return r?.data ?? null;
}
export function failText(t, reason) {
  return { nospace: t('저장 공간이 부족해요.'), denied: t('문서 폴더에 쓸 수 없었어요.'), nopassword: t('자동 백업 암호가 없어요. 자동 백업을 껐다 켜 주세요.'), unsupported: t('이 기기에서는 자동 백업을 쓸 수 없어요.') }[reason] || t('백업 파일을 저장하지 못했어요. 저장 공간을 확인해 주세요.');
}

let inited = false;
/** 앱에서 한 번 부른다 — 켤 때 + 돌아올 때 (3초 뒤, 화면을 끊지 않게) */
export function init() {
  if (inited) return; inited = true;
  const kick = () => setTimeout(() => { maybeRun().catch(() => {}); }, 3000);
  kick();
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
}
