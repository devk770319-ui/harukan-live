/* ===========================================================
   views/backup.js — 백업·복원 (2026-11-05 사용자 요청: 자동 백업·복구, 디자인은 하루칸 식으로)
   · 맨 위 카드: 마지막 백업 시각 · 이 폰의 일기 편수 · [지금 백업] (수동 백업 = 기존 exportBackup, 늘 무료)
   · 자동 백업: 켜기(암호 한 번 정함) · 주기(매일/매주) · 저장 위치(문서/Harukan/auto, 최근 7개) · 상태 줄
   · 복원: 백업 파일에서 복원(플러스) · 자동 백업에서 복원(플러스) · 새 폰으로 옮기기 안내
   #/backup
   =========================================================== */
import * as store from '../store.js';
import * as native from '../native.js';
import * as plus from '../plus.js';
import * as analytics from '../analytics.js';
import * as AB from '../autobackup.js';
import { back, go } from '../app.js';
import { t, fmtClock } from '../i18n.js';
import { el, icon, esc, toast, openSheet, confirmSheet, promptSheet, fmtDate } from '../ui.js';
import { group, linkRow, toggleRow, exportBackup, importBackup, askNewBackupPassword, restoreEncrypted } from './settings.js';

function fmtWhen(ms) {
  if (!ms) return t('아직 없어요');
  const d = new Date(ms);
  return fmtDate(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`, { year: true, weekday: false }) + ' ' + fmtClock(d.getHours() + ':' + String(d.getMinutes()).padStart(2, '0'));
}

export async function render(root) {
  analytics.design('backup:screen_open');
  import('../newbadge.js').then((m) => m.used('backup')).catch(() => {});
  const s = store.getSettings();
  const n = store.realLive().length;
  const canAuto = AB.available();

  /* ── 마지막 백업 카드 ── */
  const card = el('div', { class: 'bk-card' });
  card.innerHTML =
    `<div class="bk-card-k">${icon('shield')}<span>${esc(t('마지막 백업'))}</span></div>
     <div class="bk-card-v">${esc(fmtWhen(+s.lastBackupAt || 0))}</div>
     <div class="bk-card-s">${esc(t('이 폰의 일기 {n}편', { n }))}</div>`;
  const now = el('button', { class: 'btn btn-primary bk-now', type: 'button' }, esc(t('지금 백업')));
  now.addEventListener('click', async () => { await exportBackup(); root.innerHTML = ''; await render(root); });
  card.append(now, el('div', { class: 'bk-card-note' }, esc(t('사진까지 들어 있고 암호로 보호돼요. 드라이브·메일로 보내 두면 폰을 바꿀 때 그대로 돌아와요.'))));
  root.append(card);

  /* ── 자동 백업 ── */
  const every = s.autoBackupEvery === 'weekly' ? 'weekly' : 'daily';
  const everyLabel = (v) => (v === 'weekly' ? t('매주') : t('매일'));
  const rows = [];
  rows.push(toggleRow(t('자동 백업'), !!s.autoBackup && canAuto,
    canAuto ? t('앱을 열 때 때가 됐으면 조용히 백업 파일을 만들어 둬요. 최근 7개를 남겨요.')
            : t('앱(APK)에서만 쓸 수 있어요. 브라우저에서는 지원되지 않습니다.'),
    async (v) => {
      if (!canAuto) { toast(t('앱에서만 쓸 수 있어요.')); return false; }
      if (!v) { await AB.setEnabled(false); refresh(); return true; }
      let pw = null;
      if (!(await AB.hasPassword())) {
        const ok = await confirmSheet({
          title: t('자동 백업 암호를 정할게요'),
          text: t('자동 백업 파일도 암호로 잠겨요. 암호는 이 폰에만 저장되고, 잊으면 그 파일은 열 수 없어요.'),
          ok: t('암호 정하기'),
        });
        if (!ok) return false;
        pw = await askNewBackupPassword();
        if (!pw) return false;
      }
      await AB.setEnabled(true, { password: pw });
      toast(t('자동 백업을 켰어요. 첫 백업을 만드는 중…'));
      AB.maybeRun({ force: true }).then(() => refresh());
      return true;
    }, { ico: 'refresh', tone: 'green' }));
  if (s.autoBackup && canAuto) {
    rows.push(linkRow(t('주기'), '', everyLabel(every), () => openSheet({
      title: t('주기'),
      items: ['daily', 'weekly'].map((v) => ({ label: everyLabel(v) + (v === every ? ' ✓' : ''), onClick: async () => { await store.saveSettings({ autoBackupEvery: v }, { silent: true }); analytics.design('backup:auto:every:' + v); refresh(); } })),
    }), { ico: 'clock', tone: 'green' }));
    /* 저장 위치 (1.8.1, 사용자 2026-11-05): 이 폰 / 폴더 직접 고르기 / (다음 판) 구글 드라이브. 플러그인 없는 옛 앱은 '이 폰'만 */
    const d = AB.dest();
    /* 값 칸은 짧게(이 폰 / 폴더 이름 / 구글 드라이브) — 긴 경로를 값 칸에 넣으면 제목 칸이 눌려 세로로 찢어진다 (에뮬레이터 확인 2026-11-05) */
    const destVal = d.kind === 'phone' ? t('이 폰') : d.kind === 'drive' ? t('구글 드라이브') : d.kind === 'file' ? (d.name || t('고른 파일')) : (d.name || t('고른 폴더'));
    const destSub = d.kind === 'phone' ? t('내 파일 › 문서 › Harukan › auto. 드라이브 앱에서 이 폴더를 올려 두면 안전해요.') : d.kind === 'drive' ? (d.email || t('자동 백업과 [지금 백업] 파일을 여기에 저장해요.')) : d.kind === 'file' ? t('이 파일 하나를 백업할 때마다 새로 덮어써요.') : t('자동 백업과 [지금 백업] 파일을 여기에 저장해요.');
    rows.push(linkRow(t('저장 위치'), destSub, destVal, () => pickDest(refresh), { ico: 'folder', tone: 'green' }));
    rows.push(linkRow(t('자동 백업 암호 바꾸기'), t('다음 자동 백업부터 새 암호로 잠가요.'), '', async () => {
      const pw = await askNewBackupPassword(); if (!pw) return;
      await store.metaSet('autoBackupPw', pw); toast(t('자동 백업 암호를 바꿨어요.'));
    }, { ico: 'lock', tone: 'green' }));
    const status = s.lastAutoBackupFail
      ? t('마지막 자동 백업 실패: {why}', { why: AB.failText(t, s.lastAutoBackupFail) })
      : (s.lastAutoBackupAt ? t('마지막 자동 백업 {when}', { when: fmtWhen(+s.lastAutoBackupAt) }) + ' · ' : '') + t('다음 백업 {when}', { when: AB.nextAt() <= Date.now() ? t('앱을 다시 열 때') : fmtWhen(AB.nextAt()) });
    rows.push(el('div', { class: 'set-row bk-status' + (s.lastAutoBackupFail ? ' bad' : '') }, esc(status)));
  }
  root.append(group(t('자동 백업'), rows, { ico: 'refresh', tone: 'green' }));

  /* ── 복원 ── */
  const rPill = plus.canRestore() ? '' : 'PLUS';
  const restoreRows = [
    linkRow(t('백업 파일에서 복원'), t('이 폰의 일기에 백업 내용을 합쳐요. 같은 글은 건너뛰고 없는 글만 추가해요.'), rPill, importBackup,
      { ico: 'down', tone: 'blue', pill: rPill ? 'accent' : '' }),
  ];
  if (canAuto && s.autoBackup) restoreRows.push(linkRow(AB.dest().kind === 'file' ? t('이 파일에서 복원') : t('자동 백업에서 복원'), AB.dest().kind === 'phone' ? t('이 폰에 남아 있는 자동 백업 파일을 골라요.') : AB.dest().kind === 'file' ? t('고른 파일({where})의 내용을 이 폰에 합쳐요.', { where: AB.destLabel(t) }) : t('{where}에 있는 자동 백업 파일을 골라요.', { where: AB.destLabel(t) }), rPill, () => restoreFromAuto(), { ico: 'clock', tone: 'blue', pill: rPill ? 'accent' : '' }));
  restoreRows.push(linkRow(t('새 폰으로 옮기기'), t('백업 만들기 → 파일 보내기 → 새 폰에서 복원, 세 단계예요.'), '', () => moveGuide(), { ico: 'phone', tone: 'blue' }));
  root.append(group(t('복원'), restoreRows, { ico: 'down', tone: 'blue' }));

  root.append(el('div', { class: 'note', style: 'margin:4px 6px 20px' }, esc(t('백업 파일 만들기는 늘 무료예요. 다른 기기의 백업을 불러오는 복원은 하루칸 플러스예요.'))));

  function refresh() { root.innerHTML = ''; render(root); }
  return { title: t('백업·복원'), left: { icon: 'back', onClick: back } };
}

async function restoreFromAuto() {
  if (!plus.canRestore()) {
    analytics.design('backup:restore:locked');
    plus.lockSheet('restore', t('백업 불러오기는 하루칸 플러스 기능이에요'), t('백업 파일 만들기는 무료예요. 다른 기기에서 만든 백업을 이 기기로 불러와 여러 기기에서 쓰려면 플러스가 필요해요.'));
    return;
  }
  const files = await AB.list();
  if (!files.length) { toast(AB.dest().kind === 'file' ? t('고른 파일에 더는 쓸 수 없어요. 저장 위치를 다시 골라 주세요.') : t('자동 백업 파일이 아직 없어요.')); return; }
  openSheet({
    title: AB.dest().kind === 'file' ? t('이 파일에서 복원') : t('자동 백업에서 복원'),
    items: files.map((f) => ({ label: f.fileUri ? f.name : f.name.replace(/^harukan-auto-/, '').replace(/\.json$/, ''), sub: f.fileUri ? (f.mtime ? new Date(f.mtime).toLocaleString() : '') : f.size ? `${(f.size / 1048576).toFixed(1)}MB` : '', onClick: async () => {
      try {
        const txt = await AB.read(f.name, f.docUri, f.id, f.fileUri);
        const backup = await import('../backup.js');
        const data = JSON.parse(txt);
        if (backup.detect(data) !== backup.KIND_ENC) { toast(t('파일을 읽지 못했어요. 하루칸 백업 파일이 맞나요?')); return; }
        await restoreEncrypted(backup, data);
      } catch (e) { console.error(e); toast(t('파일을 읽지 못했어요. 하루칸 백업 파일이 맞나요?')); }
    } })),
  });
}

/** 저장 위치 고르기 창 — 되는 것만 보여 준다 (caps) */
async function pickDest(refresh) {
  const c = await AB.caps();
  const cur = AB.dest().kind;
  const mark = (k) => (k === cur ? ' ✓' : '');
  const items = [
    { label: t('이 폰') + mark('phone'), sub: t('내 파일 › 문서 › Harukan › auto'), icon: 'phone', onClick: async () => { await AB.setDest({ kind: 'phone' }); toast(t('저장 위치를 바꿨어요.')); refresh(); } },
  ];
  if (c.folder) items.push({ label: t('폴더 직접 고르기') + mark('folder'), sub: t('내장 메모리·SD카드, 폴더 고르기를 지원하는 클라우드 앱. 구글 드라이브는 폴더 고르기가 안 돼요.'), icon: 'folder', onClick: async () => {
    try { const r = await AB.pickFolder(); toast(t('{where}에 저장해요.', { where: r.name || t('고른 폴더') })); AB.maybeRun({ force: true }).then(() => refresh()); refresh(); }
    catch (e) { if (String(e?.message || e) !== 'cancelled') toast(t('폴더를 고르지 못했어요.')); }
  } });
  if (c.file) items.push({ label: t('구글 드라이브·클라우드의 파일로') + mark('file'), sub: cur === 'file' && AB.dest().name ? AB.dest().name : t('파일 저장 창에서 구글 드라이브 폴더를 고르면 거기에 백업 파일 하나를 두고 매번 새로 덮어써요. 최근 7개 보관은 안 돼요.'), icon: 'fileTxt', onClick: async () => {
    /* 파일 하나로 (1.8.2): 시스템 저장 창에는 구글 드라이브가 나온다 — 폴더 고르기가 안 되는 드라이브도 이 길로는 된다 */
    try { const r = await AB.pickSaveFile(); analytics.design('backup:dest:file:' + (r.authority || '').replace(/[^a-z0-9]/gi, '_').toLowerCase()); toast(t('{where}에 저장해요.', { where: r.name || t('고른 파일') })); AB.maybeRun({ force: true }).then(() => refresh()); refresh(); }
    catch (e) { if (String(e?.message || e) !== 'cancelled') toast(t('파일을 고르지 못했어요.')); }
  } });
  if (c.drive) items.push({ label: t('구글 드라이브') + mark('drive'), sub: cur === 'drive' && AB.dest().email ? AB.dest().email : t('내 드라이브의 Harukan 폴더'), icon: 'cloud', onClick: async () => {
    /* 구글 드라이브 (1.8.1): 계정 고르기·동의 창 → 연결되면 바로 첫 백업 */
    toast(t('구글 계정을 골라 주세요.'));
    try {
      const r = await AB.driveConnect();
      analytics.design('backup:drive:connect');
      toast(t('{where}에 저장해요.', { where: t('구글 드라이브') + ' · ' + r.email }));
      AB.maybeRun({ force: true }).then(() => refresh()); refresh();
    } catch (e) {
      const m = String(e?.message || e?.code || e);
      analytics.design('backup:drive:connect_fail');
      if (m === 'cancelled') return;
      toast(m === 'noplay' ? t('이 폰에는 Google Play 서비스가 없어 구글 드라이브를 쓸 수 없어요.') : m === 'offline' ? t('인터넷이 연결되지 않아 다음에 다시 해요.') : t('구글 드라이브에 연결하지 못했어요.'));
    }
  } });
  if (cur === 'drive') items.push({ label: t('구글 드라이브 연결 끊기'), sub: t('저장 위치가 이 폰으로 돌아가요. 드라이브에 있는 백업 파일은 남아요.'), icon: 'unlink', onClick: async () => {
    await AB.driveDisconnect(); analytics.design('backup:drive:disconnect'); toast(t('구글 드라이브 연결을 끊었어요.')); refresh();
  } });
  const content = (!c.folder && !c.drive && !c.file) ? el('div', { class: 'note', style: 'margin:0 6px 8px' }, esc(t('다른 저장 위치(폴더 직접 고르기·구글 드라이브)는 다음 업데이트부터 고를 수 있어요.'))) : null;
  openSheet({ title: t('저장 위치'), items, ...(content ? { content } : {}) });
}

function moveGuide() {  const box = el('div', { class: 'bk-guide' });
  const steps = [
    [t('지금 폰에서 백업 만들기'), t('위의 [지금 백업]을 눌러 암호를 정하고 파일을 만들어요.')],
    [t('파일을 새 폰으로 보내기'), t('[다른 앱으로 보내기]로 드라이브·카톡·메일에 올리고, 새 폰에서 내려받아요.')],
    [t('새 폰 하루칸에서 복원'), t('설정 › 백업·복원 › [백업 파일에서 복원]에서 그 파일을 고르고 암호를 넣어요.')],
  ];
  steps.forEach(([h, b], i) => box.append(el('div', { class: 'bk-step' }, `<span class="bk-step-n">${i + 1}</span><div><b>${esc(h)}</b><span>${esc(b)}</span></div>`)));
  box.append(el('div', { class: 'note', style: 'margin-top:10px' }, esc(t('같은 구글 계정이면 플러스는 새 폰에서 자동으로 켜져요. 안 켜지면 설정의 [구매 복원]을 눌러 주세요.'))));
  openSheet({ title: t('새 폰으로 옮기기'), content: box });
}
