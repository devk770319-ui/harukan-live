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
import * as NB from '../newbadge.js';
import * as tabicons from '../tabicons.js';
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
    lovelystrawberry: t('딸기우유'), lovelyheart: t('하트 구름'), cozyrain: t('비 오는 창가'), cozyfire: t('겨울 벽난로'),
    catcloud: t('구름 고양이'), catflower: t('꽃밭 고양이'),
    seasonsummer: t('여름 해변'), seasonspring: t('봄 벚꽃길'), seasonautumn: t('가을 억새'), seasonwinter: t('겨울 호수'),
    fairycastle: t('구름성'), fairyforest: t('숲속 오두막'), fairystarsea: t('별바다'), fairygarden: t('장미 정원'),
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
  if (tabicons.previewing()) { tabicons.setPreview(null); tabicons.apply(); }   // 탭 아이콘 미리보기도 원래대로
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
    nb.addEventListener('click', () => plus.goPlus('decor'));
    root.append(nb);
  }

  /* ── 아래 탭 아이콘 모양 (2026-11-04 사용자: 배경과 따로 고르고, 색은 지금 배경에 맞춰 자동) ──
     배경 꾸미기와 같은 규칙: 플러스·체험 중은 저장, 아니면 이 화면 안에서만 미리보기 */
  const ih = head(t('아래 탭 아이콘'), 'spark');
  ih.insertAdjacentHTML('beforeend', NB.pill('tabicons'));
  root.append(ih);
  root.append(el('div', { class: 'tabicon-hint' }, esc(t('고른 아이콘은 배경 색에 맞춰 색이 바뀌어요.'))));
  const ig = el('div', { class: 'tabicon-pick' });
  const curIcon = tabicons.previewing() || tabicons.saved();
  for (const [v, label] of [['theme', t('테마 그대로')], ['face', t('표정')], ['sticker', t('스티커')], ['animal', t('동물 친구')], ['crayon', t('색연필')]]) {
    const on = v === curIcon;
    const b = el('button', { type: 'button', class: 'tabicon-opt' + (on ? ' on' : ''), 'aria-pressed': String(on), 'data-v': v });
    let pics = `<span class="tabicon-theme">${icon('spark')}</span>`;
    if (v !== 'theme') {
      try { pics = (await tabicons.sample(v)).map((u) => `<img src="${u}" alt="">`).join(''); } catch { /* 그림을 못 읽으면 이름만 */ }
    }
    b.innerHTML = `<span class="tabicon-pics">${pics}</span><span class="tabicon-name">${esc(label)}</span>`;
    b.addEventListener('click', async () => {
      NB.used('tabicons');
      analytics.design('decor:tabicons:' + (can ? '' : 'preview:') + v);
      if (!can) tabicons.setPreview(v === 'theme' ? null : v);
      else await store.saveSettings({ tabIcons: v }, { silent: true });
      await tabicons.apply();
      await draw();
    });
    ig.append(b);
  }
  root.append(ig);

  /* ── 새 테마 6종 (2026-11-04): 러블리 · 아늑한 그림 · 고양이 — 배경 꾸미기와 같은 규칙(플러스·체험 중) ── */
  for (const [g, title] of [['lovely', t('러블리')], ['cozy', t('아늑한 그림')], ['cat', t('고양이')]]) {
    const gh = head(title, 'spark');
    gh.insertAdjacentHTML('beforeend', NB.pill('lovely'));   // 새 테마 NEW (2026-11-04 사용자 지시: 공지와 함께)
    root.append(gh);
    const gg = el('div', { class: 'decor-grid' });
    for (const b of theme.BG_THEMES.filter((x) => x.group === g)) {
      gg.append(tile({ id: b.id, name: bgName(b.id), img: theme.imageUrl(b.id), on: shown === b.id,
        locked: !can, dark: !!b.alwaysDark }));
    }
    root.append(gg);
  }

  /* ── 사계절 4종 (감성 사진 + 흰 선 카드 + 단색 아이콘, 2026-11-02) — 배경 꾸미기와 같은 규칙 ── */
  const sh = head(t('사계절'), 'spark');
  sh.insertAdjacentHTML('beforeend', NB.pill('season'));    // 새 테마 NEW (2026-11-02 사용자 지시)
  root.append(sh);
  const sgrid = el('div', { class: 'decor-grid' });
  for (const b of theme.BG_THEMES.filter((x) => x.group === 'season')) {
    sgrid.append(tile({ id: b.id, name: bgName(b.id), img: theme.imageUrl(b.id), on: shown === b.id,
      locked: !can, dark: !!b.alwaysDark }));
  }
  root.append(sgrid);

  /* ── 동화 4종 (그림책 배경 + 따로 얹는 소품 + 아이콘) — 배경 꾸미기와 같은 규칙(플러스·체험 중) ── */
  const fh = head(t('동화'), 'spark');
  fh.insertAdjacentHTML('beforeend', NB.pill('fairy'));      // 새 테마 NEW (2026-11-01 사용자 지시)
  root.append(fh);
  const fgrid = el('div', { class: 'decor-grid' });
  for (const b of theme.BG_THEMES.filter((x) => x.group === 'fairy')) {
    fgrid.append(tile({ id: b.id, name: bgName(b.id), img: theme.imageUrl(b.id), on: shown === b.id,
      locked: !can, dark: !!b.alwaysDark }));
  }
  root.append(fgrid);
  /* ── 동화 테마 탭 아이콘: 젤리(기본) · 동화 소품 (2026-11-01 사용자 — 수채는 뺐다). 배경과 같은 규칙 ── */
  const curStyle = theme.fairyIconStyle();
  const sl = el('div', { class: 'set-label', style: 'margin-top:4px' }); sl.innerHTML = `<span>${esc(t('탭 아이콘'))}</span>`;
  root.append(sl);
  const seg = el('div', { class: 'segmented decor-iconstyle', style: 'margin:0 0 14px' });
  for (const [v, label] of [['jelly', t('젤리')], ['story', t('동화 소품')]]) {
    const sb = el('button', { type: 'button', class: v === curStyle ? 'on' : '', 'data-v': v, 'aria-pressed': String(v === curStyle) }, esc(label));
    sb.addEventListener('click', async () => {
      NB.used('fairy');
      analytics.design('decor:iconstyle:' + (can ? '' : 'preview:') + v);
      if (!can) {
        /* 플러스가 아니면 미리보기만 — 동화 테마를 입혀 보는 중이 아니면 구름성으로 입혀서 보여 준다 */
        if (!/^fairy/.test(theme.previewing() || '')) theme.setPreview('fairycastle');
        theme.setIconStylePreview(v);
      } else await store.saveSettings({ tabIconStyle: v }, { silent: true });
      applyTheme();
      await draw();
    });
    seg.append(sb);
  }
  root.append(seg);

  /* ── 배경: 미니멀 10종 (1.6.3 부터 이것만 — 풍경 그림·꾸미기 키트는 뺄다) ── */
  root.append(head(t('미니멀'), 'spark'));
  const grid = el('div', { class: 'decor-grid' });
  grid.append(tile({ id: 'none', name: t('기본'), on: shown === 'none', plain: true }));
  for (const b of theme.BG_THEMES.filter((x) => x.group === 'minimal')) {
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
  if (/^fairy/.test(id)) NB.used('fairy');   // 동화 테마를 입혀 보면(미리보기 포함) NEW 를 지운다
  if (/^season/.test(id)) NB.used('season'); // 사계절도 같은 방식 (2026-11-02)
  if (/^(lovely|cozy|cat)/.test(id)) NB.used('lovely'); // 새 테마 6종 (2026-11-04)
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
  go.addEventListener('click', () => plus.goPlus('decor_preview'));
  const x = el('button', { class: 'decor-preview-x', type: 'button', 'aria-label': t('닫기') }, icon('close'));
  x.addEventListener('click', async () => { theme.setPreview(null); applyTheme(); await draw(); });
  bar.append(go, x);
  document.body.append(bar);
}

async function pickPhoto() {
  if (!plus.canUseBackground()) { plus.lockSheet('decor_photo', t('배경 꾸미기는 하루칸 플러스 기능이에요'), t('어떤 배경이든 미리 입혀 볼 수 있어요. 계속 쓰려면 플러스가 필요해요.')); return; }
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
