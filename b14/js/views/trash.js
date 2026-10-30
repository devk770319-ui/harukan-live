/* ===========================================================
   views/trash.js — 휴지통
   "실수로 지웠는데 되돌릴 수 없다"는 사고가 기존 앱들의
   대표적인 리뷰 불만이라, 삭제는 언제나 여기를 거친다.
   =========================================================== */

import * as store from '../store.js';
import { t } from '../i18n.js';
import { back } from '../app.js';
import { el, icon, esc, toast, confirmSheet, openSheet, fmtDate, parseKey, WD, summaryText } from '../ui.js';

export async function render(root) {
  const list = store.trashed();

  if (!list.length) {
    root.append(el('div', { class: 'empty', style: 'margin-top:50px' },
      `<span class="empty-emoji">🗑️</span>
       <div class="empty-title">${esc(t('휴지통이 비어 있어요'))}</div>
       <div class="empty-sub">${esc(t('지운 글은 30일간 여기 보관돼요.'))}</div>`));
    return { title: t('휴지통'), left: { icon: 'back', onClick: back } };
  }

  root.append(el('div', { class: 'note', style: 'margin:6px 4px 14px' },
    t('지운 지 30일이 지나면 자동으로 완전히 삭제돼요.')));

  const wrap = el('div', { class: 'elist' });
  for (const e of list) {
    const left = 30 - Math.floor((Date.now() - e.deletedAt) / 86400000);
    const d = parseKey(e.date);
    const b = el('button', { class: 'eitem', type: 'button' });
    b.innerHTML =
      `<div class="eitem-day">
         <div class="eitem-dnum">${d.getDate()}</div>
         <div class="eitem-dwk">${WD[d.getDay()]}</div>
       </div>
       <div class="eitem-main">
         ${e.title ? `<div class="eitem-title">${esc(e.title)}</div>` : ''}
         <div class="eitem-ex">${esc(summaryText(e))}</div>
         <div class="eitem-meta"><span class="eitem-wc">${esc(fmtDate(e.date, { year: true, weekday: false }))} · ${esc(t('{n}일 뒤 삭제', { n: left }))}</span></div>
       </div>`;
    b.addEventListener('click', () => openSheet({
      title: fmtDate(e.date, { year: true }),
      items: [
        { label: t('되살리기'), icon: 'undo', onClick: async () => { await store.restore(e.id); toast(t('되살렸어요.')); } },
        { label: t('완전히 삭제'), icon: 'trash', danger: true, onClick: async () => {
          const ok = await confirmSheet({
            title: t('완전히 삭제할까요?'), text: t('이건 되돌릴 수 없어요.'), ok: t('삭제'), danger: true,
          });
          if (ok) { await store.hardDelete(e.id); toast(t('삭제했습니다.')); }
        } },
      ],
    }));
    wrap.append(b);
  }
  root.append(wrap);

  const empty = el('button', { class: 'btn btn-danger btn-block', type: 'button', style: 'margin-top:18px' },
    icon('trash') + `<span>${t('휴지통 비우기')}</span>`);
  empty.addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: t('휴지통을 비울까요?'), text: t('{n}편이 완전히 사라집니다.', { n: list.length }), ok: t('비우기'), danger: true,
    });
    if (!ok) return;
    for (const e of list) await store.hardDelete(e.id);
    toast(t('휴지통을 비웠어요.'));
  });
  root.append(empty);

  return {
    title: t('휴지통'),
    left: { icon: 'back', onClick: back },
  };
}
