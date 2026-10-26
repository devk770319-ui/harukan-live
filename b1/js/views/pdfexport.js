/* ===========================================================
   views/pdfexport.js — PDF 로 내보내기 (1.6.0)
   설정 → 내 데이터 → PDF 로 내보내기.

   순서: 묶는 단위(하루·한 달·한 해) → 어느 날/달/해 → 미리보기 → 만들기 → 저장·보내기
   미리보기로 첫 두 쪽을 실제로 그려 보여준다. 만들고 나서 "생각과 다르다"를 줄이려고.
   PDF 에는 암호가 걸리지 않는다 — 잠금을 켜둔 사람에게는 그 점을 분명히 말한다.
   =========================================================== */

import * as store from '../store.js';
import * as native from '../native.js';
import * as analytics from '../analytics.js';
import * as pdf from '../pdf.js';
import * as plus from '../plus.js';
import { back } from '../app.js';
import { el, icon, esc, toast, confirmSheet } from '../ui.js';
import { t } from '../i18n.js';
import { THEME_IDS } from '../pdfthemes.js';

/* 디자인 이름 (1.7.5) */
const themeName = (id) => ({
  card: t('기본 카드'), note: t('모눈 노트'), scrap: t('스크랩북'), minimal: t('미니멀'), mood: t('기분 색'),
})[id] || id;

let state = null;
let rootEl = null;
let previewUrls = [];
let previewSeq = 0;

export async function render(root) {
  rootEl = root;
  analytics.design('pdf:view');
  state = state || { unit: 'month', key: null, photos: true, shown: 30 };
  if (!state.theme) state.theme = THEME_IDS.includes(store.getSettings().pdfTheme) ? store.getSettings().pdfTheme : 'card';
  draw();
  return { title: t('PDF로 내보내기'), left: { icon: 'back', onClick: back } };
}

export async function teardown() {
  for (const u of previewUrls) URL.revokeObjectURL(u);
  previewUrls = [];
  rootEl = null;
}

function draw() {
  const root = rootEl;
  if (!root) return;
  root.innerHTML = '';

  const can = plus.canExportPdf();
  /* 플러스 기능 (1.6.0) — 골라 보고 미리보기까지는 누구나, 만들기는 플러스 */
  if (!can) {
    const nb = el('button', { class: 'decor-plus', type: 'button' });
    nb.innerHTML =
      `<span class="decor-plus-badge">PLUS</span>
       <span class="decor-plus-text"><b>${esc(t('하루칸 플러스 기능이에요'))}</b>
       <span>${esc(t('어떻게 만들어지는지 미리보기는 누구나 볼 수 있어요.'))}</span></span>${icon('chev')}`;
    nb.addEventListener('click', () => plus.showInfo('pdf'));
    root.append(nb);
  }

  root.append(el('div', { class: 'note', style: 'margin:6px 4px 14px' },
    esc(t('일기를 카드 모양으로 묶어 PDF로 만들어요. 인쇄하거나 파일로 간직해 두세요.'))));

  if (!pdf.exportable().length) {
    root.append(el('div', { class: 'empty', style: 'margin-top:40px' },
      `<div class="empty-title">${esc(t('아직 내보낼 일기가 없어요'))}</div>`));
    return;
  }

  /* ① 묶는 단위 */
  const seg = el('div', { class: 'segmented', style: 'margin-bottom:14px' });
  for (const [v, label] of [['day', t('하루')], ['month', t('한 달')], ['year', t('한 해')]]) {
    const b = el('button', { type: 'button', class: state.unit === v ? 'on' : '' }, esc(label));
    b.addEventListener('click', () => { state.unit = v; state.key = null; state.shown = 30; draw(); });
    seg.append(b);
  }
  root.append(seg);

  /* ② 어느 날/달/해 */
  const list = pdf.periods(state.unit);
  if (!state.key || !list.some((p) => p.key === state.key)) state.key = list[0]?.key || null;
  const box = el('div', { class: 'set-list pdf-periods' });
  for (const p of list.slice(0, state.shown)) {
    const r = el('button', { type: 'button', class: 'set-row pdf-period' + (p.key === state.key ? ' on' : '') });
    r.innerHTML =
      `<div class="set-row-main"><div class="set-row-title">${esc(p.label)}</div></div>
       <div class="set-row-val">${esc(t('{n}편', { n: p.count }))}</div>
       <span class="pdf-radio">${p.key === state.key ? icon('check') : ''}</span>`;
    r.addEventListener('click', () => { state.key = p.key; draw(); });
    box.append(r);
  }
  root.append(box);
  if (list.length > state.shown) {
    const more = el('button', { type: 'button', class: 'btn btn-ghost btn-block', style: 'margin-top:6px' }, esc(t('더 보기')));
    more.addEventListener('click', () => { state.shown += 30; draw(); });
    root.append(more);
  }

  /* ③ 디자인 (1.7.5, 사용자 요청) — 실제 그리기 코드로 그린 작은 그림을 보고 고른다 */
  root.append(el('div', { class: 'set-label', style: 'margin-top:20px' }, `<span>${esc(t('디자인'))}</span>`));
  const th = el('div', { class: 'pdf-themes', role: 'radiogroup', 'aria-label': t('디자인') });
  for (const id of THEME_IDS) {
    const b = el('button', { type: 'button', class: 'pdf-theme' + (id === state.theme ? ' on' : ''), role: 'radio', 'aria-checked': String(id === state.theme), 'data-theme': id },
      `<img alt="" src="${pdf.themeThumb(id)}"><span>${esc(themeName(id))}</span>`);
    b.addEventListener('click', () => {
      if (state.theme === id) return;
      state.theme = id;
      analytics.design('pdf:theme:' + id);
      store.saveSettings({ pdfTheme: id }, { silent: true }).catch(() => {});
      const sx = th.scrollLeft;
      draw();
      const nth = rootEl?.querySelector('.pdf-themes'); if (nth) nth.scrollLeft = sx;
    });
    th.append(b);
  }
  root.append(th);

  /* ④ 사진 넣기 */
  const opt = el('div', { class: 'set-list', style: 'margin-top:14px' });
  const row = el('div', { class: 'set-row', style: 'cursor:pointer' });
  row.innerHTML =
    `<div class="set-row-main"><div class="set-row-title">${esc(t('사진 넣기'))}</div>
       <div class="set-row-sub">${esc(t('끄면 글만 담겨서 파일이 훨씬 가벼워요.'))}</div></div>
     <div class="switch${state.photos ? ' on' : ''}" role="switch" aria-checked="${state.photos}"></div>`;
  row.addEventListener('click', () => { state.photos = !state.photos; draw(); });
  opt.append(row);
  root.append(opt);

  /* ④ 미리보기 */
  const pv = el('div', { class: 'pdf-preview' }, `<div class="pdf-preview-wait">${esc(t('미리보기를 만드는 중…'))}</div>`);
  root.append(el('div', { class: 'set-label', style: 'margin-top:20px' }, `<span>${esc(t('미리보기'))}</span>`), pv);
  renderPreview(pv);

  /* ⑤ 만들기 */
  const go = el('button', { type: 'button', class: 'btn btn-primary btn-block', style: 'margin-top:18px' },
    icon(can ? 'fileTxt' : 'lock') + `<span>${esc(can ? t('PDF 만들기') : t('플러스로 PDF 만들기'))}</span>`);
  go.addEventListener('click', () => {
    if (!plus.canExportPdf()) { analytics.design('pdf:locked'); plus.showInfo('pdf'); return; }
    make(go);
  });
  root.append(go);

  if (store.hasCryptoKey()) {
    root.append(el('div', { class: 'note', style: 'margin:12px 6px 0' },
      esc(t('PDF에는 암호가 걸려 있지 않아요. 앱 잠금을 켜 두었어도 이 파일은 누구나 열 수 있으니 보관에 신경 써 주세요.'))));
  }
}

function currentJob() {
  const entries = pdf.entriesFor(state.unit, state.key);
  const label = pdf.periodLabel(state.unit, state.key);
  return {
    entries,
    opts: {
      title: label,
      sub: t('{n}편의 기록', { n: entries.length }),
      footLabel: label,
      cover: state.unit !== 'day',          // 하루짜리는 표지 없이 카드만
      photos: state.photos,
      theme: state.theme,
    },
  };
}

async function renderPreview(box) {
  const seq = ++previewSeq;
  for (const u of previewUrls) URL.revokeObjectURL(u);
  previewUrls = [];
  try {
    const { entries, opts } = currentJob();
    const urls = await pdf.preview(entries, opts);
    if (seq !== previewSeq || !box.isConnected) { urls.forEach((u) => URL.revokeObjectURL(u)); return; }
    previewUrls = urls;
    box.innerHTML = '';
    for (const u of urls) box.append(el('img', { src: u, alt: t('미리보기') }));
  } catch (e) {
    console.error(e);
    if (seq === previewSeq) box.innerHTML = `<div class="pdf-preview-wait">${esc(t('미리보기를 만들지 못했어요.'))}</div>`;
  }
}

async function make(btn) {
  const { entries, opts } = currentJob();
  if (!entries.length) return;
  btn.disabled = true;
  const label = btn.querySelector('span');
  analytics.design('pdf:make:' + state.unit, entries.length);
  analytics.design('pdf:make_theme:' + state.theme);
  try {
    const { blob, pages } = await pdf.build(entries, {
      ...opts,
      onProgress: (d, n) => { label.textContent = t('PDF 만드는 중… {d}/{n}쪽', { d, n }); },
    });
    label.textContent = t('저장하는 중…');
    let name = pdf.fileName(state.key);
    const res = await savePdf(name, blob);
    if (res.name) name = res.name;
    analytics.design('pdf:saved:' + state.unit, pages);
    if (res.where === 'native') {
      const ok = await confirmSheet({
        title: t('PDF를 저장했어요.'),
        text: t('문서 폴더에 “{name}” 으로 저장했습니다. {n}쪽이에요. 인쇄하거나 다른 앱으로 보내 보세요.', { name, n: pages }),
        ok: t('다른 앱으로 보내기'),
      });
      if (ok) {
        const backup = await import('../backup.js');
        await backup.shareFile(res.uri, t('하루칸 일기'));
      }
    } else {
      toast(t('PDF를 저장했어요.'));
    }
  } catch (e) {
    console.error(e);
    analytics.design('pdf:fail');
    toast(t('PDF를 만들지 못했어요. 저장 공간을 확인하거나 사진 넣기를 끄고 다시 해 보세요.'));
  } finally {
    btn.disabled = false;
    label.textContent = t('PDF 만들기');
  }
}

/* 큰 파일을 한 번에 글자(base64)로 바꿔 넘기면 메모리가 모자랄 수 있다.
   3MB 씩 잘라 이어 쓴다 (3 의 배수여야 조각마다 base64 가 온전하다). */
async function savePdf(name, blob) {
  const FS = window.Capacitor?.Plugins?.Filesystem;
  if (native.isNative() && FS) {
    const CHUNK = 3 * 1024 * 1024;
    const b64 = (b) => new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onerror = () => rej(fr.error);
      fr.onload = () => res(String(fr.result).split(',')[1] || '');
      fr.readAsDataURL(b);
    });
    const { writeFresh } = await import('../backup.js');
    let res = null;
    for (let i = 0; i < blob.size; i += CHUNK) {
      const data = await b64(blob.slice(i, i + CHUNK));
      /* 같은 이름이 다른 설치본 소유로 남아 있으면 덮어쓰지 못한다 → 새 이름으로 (1.7.2) */
      if (i === 0) ({ name, res } = await writeFresh(FS, { path: name, data, directory: 'DOCUMENTS', recursive: true }));
      else await FS.appendFile({ path: name, data, directory: 'DOCUMENTS' });
    }
    const stat = await FS.stat({ path: name, directory: 'DOCUMENTS' });
    if (!stat?.size) throw new Error('파일이 만들어지지 않았습니다.');
    return { where: 'native', uri: res?.uri || stat.uri, name };
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
  return { where: 'web' };
}
