/* ===========================================================
   chipedit.js — '오늘은 이런 날' 칩 편집 (1.7.9, 사용자 결정 2026-10-29 "만들고 무료로 제공하자")
   · 기본 칩 숨기기/보이기 (지우지 않는다 — 지난 일기의 칩은 그대로)
   · 내 칩 만들기: 이름(최대 12자) + 아이콘 + 넣을 묶음
   · 묶음 안에서 순서 바꾸기 (▲ ▼), 내 칩 지우기
   · 처음대로 되돌리기
   저장: settings.chipPrefs (prompts.js 설명 참고). 백업에 설정과 함께 들어간다.
   =========================================================== */
import * as store from './store.js';
import * as analytics from './analytics.js';
import { el, icon, esc, toast, openSheet, closeSheet, confirmSheet } from './ui.js';
import { t } from './i18n.js';
import { CHIP_GROUPS, MINE_GROUP, CHIP_PICK_ICONS, CHIP_NAME_MAX, CHIP_CUSTOM_MAX, ALL_CHIPS, chipGroupsAll } from './prompts.js';

function prefs() {
  const p = store.getSettings().chipPrefs || {};
  return {
    hidden: Array.isArray(p.hidden) ? p.hidden.slice() : [],
    custom: Array.isArray(p.custom) ? p.custom.map((c) => ({ ...c })) : [],
    order: p.order && typeof p.order === 'object' ? JSON.parse(JSON.stringify(p.order)) : {},
  };
}
async function save(p) {
  await store.saveSettings({ chipPrefs: p }, { silent: true });
}

/** 편집 창을 연다. onDone 은 창이 닫힌 뒤 불린다 (고르기 화면을 다시 그리게) */
export function openChipEditor(onDone) {
  analytics.design('chips:edit:open');
  const box = el('div', { class: 'chip-edit' });

  /* ── 내 칩 만들기 ── */
  const add = el('div', { class: 'ce-add' });
  const name = el('input', { class: 'ss-in ce-name', type: 'text', maxlength: String(CHIP_NAME_MAX), placeholder: t('예: 산책 30분'), 'aria-label': t('칩 이름'), enterkeyhint: 'done' });
  let pickIcon = 'spark', pickGroup = MINE_GROUP;
  const icons = el('div', { class: 'ce-icons' });
  for (const ic of CHIP_PICK_ICONS) {
    const b = el('button', { class: 'ce-ico' + (ic === pickIcon ? ' on' : ''), type: 'button', 'data-i': ic, 'aria-label': ic }, icon(ic));
    b.addEventListener('click', () => { pickIcon = ic; icons.querySelectorAll('.ce-ico').forEach((x) => x.classList.toggle('on', x.dataset.i === ic)); });
    icons.append(b);
  }
  const groupsRow = el('div', { class: 'chip-row ce-groups' });
  for (const gname of [MINE_GROUP, ...CHIP_GROUPS.map((g) => g.name)]) {
    const b = el('button', { class: 'chip' + (gname === pickGroup ? ' on' : ''), type: 'button', 'data-g': gname }, `<span>${esc(t(gname))}</span>`);
    b.addEventListener('click', () => { pickGroup = gname; groupsRow.querySelectorAll('.chip').forEach((x) => x.classList.toggle('on', x.dataset.g === gname)); });
    groupsRow.append(b);
  }
  const addBtn = el('button', { class: 'btn btn-primary ce-addbtn', type: 'button' }, icon('plus') + `<span>${esc(t('추가'))}</span>`);
  const doAdd = async () => {
    const n = name.value.trim().replace(/\s+/g, ' ').slice(0, CHIP_NAME_MAX);
    if (!n) { name.focus(); return; }
    const p = prefs();
    const exists = p.custom.some((c) => c.n === n) || ALL_CHIPS.includes(n) || ALL_CHIPS.some((c) => t(c) === n);
    if (exists) { toast(t('이미 있는 칩이에요.')); return; }
    if (p.custom.length >= CHIP_CUSTOM_MAX) { toast(t('내 칩은 {n}개까지 만들 수 있어요.', { n: CHIP_CUSTOM_MAX })); return; }
    p.custom.push({ n, i: pickIcon, g: pickGroup });
    await save(p);
    analytics.design('chips:edit:add');
    name.value = '';
    toast(t('「{n}」 칩을 만들었어요.', { n }));
    paint();
  };
  addBtn.addEventListener('click', doAdd);
  name.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); doAdd(); } });
  add.append(
    el('div', { class: 'plan-label' }, esc(t('내 칩 만들기'))),
    el('div', { class: 'ss-row' }, ''),
    icons,
    el('div', { class: 'muted ss-hint' }, esc(t('넣을 묶음'))),
    groupsRow,
  );
  add.querySelector('.ss-row').append(name, addBtn);

  /* ── 지금 칩 목록 ── */
  const list = el('div', { class: 'ce-list' });
  const paint = () => {
    list.innerHTML = '';
    const groups = chipGroupsAll(store.getSettings());
    for (const g of groups) {
      if (g.mine && !g.chips.length) continue;
      list.append(el('div', { class: 'chips-step-g' }, esc(t(g.name))));
      const ul = el('div', { class: 'ce-rows' });
      g.chips.forEach((c, idx) => {
        const row = el('div', { class: 'ce-row' + (c.hidden ? ' off' : '') });
        row.append(el('span', { class: 'ce-ri' }, c.i ? icon(c.i) : ''), el('span', { class: 'ce-rn' }, esc(c.custom ? c.n : t(c.n))));
        const up = el('button', { class: 'ce-mv', type: 'button', 'aria-label': t('위로'), disabled: idx === 0 }, icon('chevU'));
        const dn = el('button', { class: 'ce-mv', type: 'button', 'aria-label': t('아래로'), disabled: idx === g.chips.length - 1 }, icon('chevD'));
        const move = async (d) => {
          const p = prefs();
          const names = g.chips.map((x) => x.n);
          const j = idx + d;
          [names[idx], names[j]] = [names[j], names[idx]];
          p.order[g.name] = names;
          await save(p); analytics.design('chips:edit:move'); paint();
        };
        up.addEventListener('click', () => move(-1));
        dn.addEventListener('click', () => move(1));
        row.append(up, dn);
        if (c.custom) {
          const del = el('button', { class: 'ce-del', type: 'button', 'aria-label': t('지우기') }, icon('trash'));
          del.addEventListener('click', async () => {
            const p = prefs();
            p.custom = p.custom.filter((x) => x.n !== c.n);
            await save(p); analytics.design('chips:edit:delete');
            toast(t('칩을 지웠어요. 이미 쓴 일기에 붙은 칩은 그대로 남아요.'));
            paint();
          });
          row.append(del);
        } else {
          const sw = el('button', { class: 'ce-vis' + (c.hidden ? '' : ' on'), type: 'button', role: 'switch', 'aria-checked': c.hidden ? 'false' : 'true', 'aria-label': t('보이기') },
            esc(c.hidden ? t('숨김') : t('보임')));
          sw.addEventListener('click', async () => {
            const p = prefs();
            const s = new Set(p.hidden);
            if (s.has(c.n)) s.delete(c.n); else s.add(c.n);
            p.hidden = [...s];
            await save(p); analytics.design('chips:edit:' + (s.has(c.n) ? 'hide' : 'show'));
            paint();
          });
          row.append(sw);
        }
        ul.append(row);
      });
      list.append(ul);
    }
  };
  paint();

  const reset = el('button', { class: 'btn btn-ghost btn-block', type: 'button', style: 'margin-top:12px' }, esc(t('처음대로 되돌리기')));
  reset.addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: t('처음대로 되돌릴까요?'),
      text: t('숨긴 칩이 다시 보이고, 순서도 처음대로 돌아가요. 내가 만든 칩은 지워지지 않아요.'),
      ok: t('되돌리기'),
    });
    /* confirmSheet 가 편집 창을 닫았으므로 다시 연다 */
    if (ok) { const p = prefs(); p.hidden = []; p.order = {}; await save(p); analytics.design('chips:edit:reset'); toast(t('처음대로 되돌렸어요.')); }
    openChipEditor(onDone);
  });
  const done = el('button', { class: 'btn btn-primary ss-done', type: 'button' }, esc(t('완료')));
  done.addEventListener('click', () => closeSheet());

  box.append(add, el('div', { class: 'plan-label ce-listhead' }, esc(t('지금 칩'))),
    el('div', { class: 'muted ss-hint' }, esc(t('안 쓰는 칩은 숨기고, ▲▼로 순서를 바꿔요. 이미 쓴 일기의 칩은 그대로 남아요.'))),
    list, reset, done);
  let resetting = false;
  reset.addEventListener('pointerdown', () => { resetting = true; });
  openSheet({
    title: t('오늘은 이런 날 편집'),
    content: box,
    onClose: () => { if (resetting) { resetting = false; return; } onDone?.(); },
  });
}
