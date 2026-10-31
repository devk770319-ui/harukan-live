/* ===========================================================
   views/decor.js — 배경 꾸미기 (1.5.0, 하루칸 플러스)
   설정 → 화면 → 배경 꾸미기 / 플러스 화면 → 배경 꾸미기 에서 들어온다.

   한 화면에 두 가지를 나란히 둔다.
     · 그림 배경 — 기본 + 6종. 누르면 바로 입혀진다.
     · 내 사진   — 고르기 / 바꾸기 / 지우기 + 사진 흐리게
   플러스가 아니면: 그림은 눌러서 '미리보기'만 된다 (이 화면을 나가면 원래대로).
   아래에 미리보기 막대가 떠서 계속 쓰려면 플러스라는 걸 알려준다.
   사진은 미리보기 없이 플러스 안내로 보낸다 — 고른 사진을 저장했다가 다시 지우는 건
   사용자 입장에서 이상하다.
   =========================================================== */

import * as store from '../store.js';
import * as plus from '../plus.js';
import * as theme from '../theme.js';
import * as analytics from '../analytics.js';
import * as native from '../native.js';
import { applyTheme, back } from '../app.js';
import { el, icon, esc, toast, confirmSheet } from '../ui.js';
import { t } from '../i18n.js';

/* 그림 이름 — t('…') 리터럴로 적어야 check-i18n 이 키로 잡는다 (theme.js 의 id 와 같아야 한다) */
export function bgName(id) {
  if (!id || id === 'none') return t('기본');
  if (id === 'photo') return t('내 사진');
  return {
    wildflower: t('들꽃'), branch: t('꽃가지'), daisy: t('데이지'), lily: t('은방울꽃'), pressed: t('압화'),
    sapphire: t('사파이어'), crystal: t('크리스털 빛'), pearl: t('진주'), emerald: t('에메랄드'), diamond: t('다이아 별빛'),
  }[id] || t('기본');      // 빠진 배경(1.6.3 풍경·키트)을 골라두었던 사람은 기본으로 보인다
}

let rootEl = null;

export async function render(root) {
  // 설정의 NEW 표시는 이 화면을 한 번 열면 끈다 (1.6.6)
  if (!store.getSettings().bgNewSeen) store.saveSettings({ bgNewSeen: true }, { silent: true }).catch(() => {});
  rootEl = root;
  analytics.design('decor:view');
  await draw();
  return { title: t('배경 꾸미기'), left: { icon: 'back', onClick: back } };
}

export async function teardown() {
  // 미리보기는 이 화면 안에서만 — 나가면 원래 배경으로
  if (theme.previewing()) { theme.setPreview(null); applyTheme(); }
  document.querySelector('.decor-preview')?.remove();
  rootEl = null;
}

async function draw() {
  const root = rootEl;
  if (!root) return;
  const s = store.getSettings();
  const can = plus.canUseBackground();
  const shown = theme.previewing() || (can ? (s.bgTheme || 'none') : 'none');
  const hasPhoto = await theme.hasPhoto();
  const photoUrl = hasPhoto ? await theme.getPhoto() : null;

  root.innerHTML = '';

  /* 플러스가 아니면 맨 위에 한 줄로 알린다 — 눌러보기 전에 알아야 실망하지 않는다 */
  if (!can) {
    const nb = el('button', { class: 'decor-plus', type: 'button' });
    nb.innerHTML =
      `<span class="decor-plus-badge">PLUS</span>
       <span class="decor-plus-text"><b>${esc(t('하루칸 플러스 기능이에요'))}</b>
       <span>${esc(t('그림을 누르면 미리 입혀볼 수 있어요.'))}</span></span>${icon('chev')}`;
    nb.addEventListener('click', () => plus.showInfo('decor'));
    root.append(nb);
  }

  /* ── 배경: 미니멀 10종 (1.6.3 부터 이것만 — 풍경 그림·꾸미기 키트는 뺄다) ── */
  root.append(head(t('미니멀'), 'spark'));
  const grid = el('div', { class: 'decor-grid' });
  grid.append(tile({ id: 'none', name: t('기본'), on: shown === 'none', plain: true }));
  for (const b of theme.BG_THEMES) {
    grid.append(tile({ id: b.id, name: bgName(b.id), img: theme.imageUrl(b.id), on: shown === b.id,
      locked: !can, dark: !!b.alwaysDark }));
  }
  root.append(grid);

  /* ── 내 사진 ── */
  root.append(head(t('내 사진'), 'camera'));
  const pgrid = el('div', { class: 'decor-grid' });
  if (photoUrl) {
    pgrid.append(tile({ id: 'photo', name: t('내 사진'), img: photoUrl, on: shown === 'photo', locked: !can }));
  }
  const add = el('button', { class: 'decor-tile decor-add', type: 'button' });
  add.innerHTML = `${icon('camera')}<span>${esc(photoUrl ? t('사진 바꾸기') : t('사진 고르기'))}</span>`
    + (can ? '' : `<span class="stk-lock">${icon('lock')}</span>`);
  add.addEventListener('click', pickPhoto);
  pgrid.append(add);
  root.append(pgrid);

  if (photoUrl && can) {
    const list = el('div', { class: 'set-list', style: 'margin-top:12px' });
    // 사진 흐리게 — 사진마다 밝기가 달라서 글이 잘 읽히는 정도를 사용자가 맞춘다
    const row = el('div', { class: 'set-row', style: 'flex-direction:column;align-items:stretch;gap:8px' });
    const top = el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' });
    top.append(el('div', { class: 'set-row-title' }, esc(t('사진 흐리게'))));
    const val = el('div', { class: 'set-row-val' }, (s.bgPhotoDim ?? 25) + '%');
    top.append(val);
    const inp = el('input', { type: 'range', min: 0, max: 60, step: 5, value: s.bgPhotoDim ?? 25,
      style: 'width:100%;accent-color:var(--accent)' });
    inp.addEventListener('input', async () => {
      val.textContent = inp.value + '%';
      await store.saveSettings({ bgPhotoDim: Number(inp.value) }, { silent: true });
      if (theme.activeId() === 'photo') applyTheme();
    });
    row.append(top, inp, el('div', { class: 'set-row-sub' },
      esc(t('글이 잘 안 읽히면 더 흐리게 해 보세요.'))));
    list.append(row);

    const del = el('div', { class: 'set-row danger', style: 'cursor:pointer' });
    del.innerHTML = `<div class="set-ico ico-red">${icon('trash')}</div>
      <div class="set-row-main"><div class="set-row-title">${esc(t('사진 지우기'))}</div></div>`;
    del.addEventListener('click', removePhoto);
    list.append(del);
    root.append(list);
  }

  root.append(el('div', { class: 'note', style: 'margin:14px 6px 0' },
    esc(t('사진은 이 기기 안에만 저장돼요. 잠금을 켜면 일기처럼 암호화됩니다. 백업 파일에는 들어가지 않아요.'))));

  previewBar();
}

function head(label, ico) {
  const h = el('div', { class: 'set-label', style: 'margin-top:20px' });
  h.innerHTML = icon(ico) + `<span>${esc(label)}</span>`;
  return h;
}

function tile({ id, name, img, on, locked = false, plain = false, dark = false }) {
  const b = el('button', { class: 'decor-tile' + (on ? ' on' : '') + (plain ? ' plain' : '') + (dark ? ' dark' : ''),
    type: 'button', 'aria-pressed': String(!!on), 'aria-label': name });
  if (img) b.style.backgroundImage = `url("${img}")`;
  b.innerHTML =
    (on ? `<span class="decor-check">${icon('check')}</span>` : '')
    + (locked && id !== 'none' ? `<span class="stk-lock">${icon('lock')}</span>` : '')
    + `<span class="decor-name">${esc(name)}</span>`;
  b.addEventListener('click', () => choose(id, locked && id !== 'none'));
  return b;
}

async function choose(id, locked) {
  if (locked) {
    // 미리보기: 저장하지 않고 입혀만 본다
    analytics.design('decor:preview:' + id);
    theme.setPreview(id);
    applyTheme();
    await draw();
    return;
  }
  theme.setPreview(null);
  analytics.design('decor:pick:' + id);
  await store.saveSettings({ bgTheme: id }, { silent: true });
  applyTheme();
  await draw();
}

/* 미리보기 중이면 아래에 막대를 띄운다 */
function previewBar() {
  document.querySelector('.decor-preview')?.remove();
  const p = theme.previewing();
  if (!p || p === 'none') return;
  const bar = el('div', { class: 'decor-preview', role: 'status' });
  bar.innerHTML =
    `<div class="decor-preview-text"><b>${esc(t('{name} 미리보는 중', { name: bgName(p) }))}</b>
     <span>${esc(t('플러스로 이 배경을 계속 쓸 수 있어요.'))}</span></div>`;
  const go = el('button', { class: 'btn btn-primary btn-sm', type: 'button' }, esc(t('플러스 보기')));
  go.addEventListener('click', () => plus.showInfo('decor_preview'));
  const x = el('button', { class: 'decor-preview-x', type: 'button', 'aria-label': t('닫기') }, icon('close'));
  x.addEventListener('click', async () => { theme.setPreview(null); applyTheme(); await draw(); });
  bar.append(go, x);
  document.body.append(bar);
}

async function pickPhoto() {
  if (!plus.canUseBackground()) { plus.showInfo('decor_photo'); return; }
  /* 1.5.1: 앱에서는 시스템 사진 선택기를 직접 띄운다. 웹뷰의 고르기 창이 한 번 꼬이면
     앱을 끄기 전까지 이 버튼이 아무 반응이 없었다 (1.5.0 사용자 신고) */
  if (native.canPickNative()) {
    try {
      const r = await native.pickPhotos({ multiple: false, maxEdge: 1600, quality: 85 });
      if (r?.photos?.[0]) await usePhoto(r.photos[0]);
      else if (r?.failed) toast(t('사진을 넣지 못했어요. 다른 사진으로 해 보세요.'));
    } catch (e) {
      console.error('사진 선택기', e);
      toast(t('사진을 넣지 못했어요. 다른 사진으로 해 보세요.'));
    }
    return;
  }
  const inp = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
  document.body.append(inp);
  inp.addEventListener('change', async () => {
    const f = inp.files?.[0];
    inp.remove();
    if (!f) return;
    try {
      toast(t('사진을 넣는 중…'));
      // 화면 크기면 충분하다. 긴 쪽 1600px — 일기 사진과 같은 기준
      await usePhoto(await store.fileToDataUrl(f, 1600, 0.85));
    } catch (e) {
      console.error(e);
      toast(t('사진을 넣지 못했어요. 다른 사진으로 해 보세요.'));
    }
  }, { once: true });
  inp.click();
}

/** 고른 사진(dataURL)을 배경으로 저장하고 입힌다 */
async function usePhoto(dataUrl) {
  await theme.savePhoto(dataUrl);
  await store.saveSettings({ bgTheme: 'photo' }, { silent: true });
  theme.setPreview(null);
  analytics.design('decor:photo_set');
  applyTheme();
  await draw();
  toast(t('배경을 내 사진으로 바꿨어요.'));
}

async function removePhoto() {
  const ok = await confirmSheet({
    title: t('배경 사진을 지울까요?'),
    text: t('배경이 기본으로 돌아가요. 일기에 넣은 사진은 그대로예요.'),
    ok: t('지우기'), danger: true,
  });
  if (!ok) return;
  await theme.clearPhoto();
  if (store.getSettings().bgTheme === 'photo') await store.saveSettings({ bgTheme: 'none' }, { silent: true });
  analytics.design('decor:photo_del');
  applyTheme();
  await draw();
}
