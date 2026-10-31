/* ===========================================================
   views/notices.js — 공지사항 (#/notices, 1.7.0)
   업데이트 소식을 최신순으로. 맨 위(최신) 공지는 펼쳐 두고 나머지는 접는다.
   이 화면을 열면 안 읽음 표시(종 아이콘의 빨간 점)가 꺼진다.
   =========================================================== */

import * as N from '../notices.js';
import { t } from '../i18n.js';
import { back, go } from '../app.js';
import { el, esc, icon } from '../ui.js';
import * as analytics from '../analytics.js';

export async function render(root) {
  await N.load();
  const wasUnread = N.hasUnread();
  await N.markRead();
  analytics.design('notice:list_view');

  N.NOTICES.forEach((n, i) => {
    const card = el('div', { class: 'card notice-card' + (i === 0 ? ' open' : '') });
    const head = el('button', { class: 'notice-head', type: 'button' });
    head.innerHTML =
      `<span class="notice-ico">${icon('spark')}</span>
       <span class="notice-main"><span class="notice-title">${esc(N.titleOf(n))}${i === 0 && wasUnread ? ' <span class="new-pill">NEW</span>' : ''}</span>
       <span class="notice-date">${esc(N.dateOf(n))}</span></span>
       <span class="notice-chev">${icon('chev', 'chev')}</span>`;
    const body = el('ul', { class: 'notice-items' });
    body.innerHTML = N.itemsOf(n).map((s) => `<li>${esc(s)}</li>`).join('');
    head.addEventListener('click', () => card.classList.toggle('open'));
    card.append(head, body);
    /* 의견 보내기 버튼이 붙는 공지 (1.7.4) */
    if (n.action === 'feedback') {
      const b = el('button', { class: 'btn btn-primary notice-act', type: 'button' }, esc(t('의견 보내기')));
      b.addEventListener('click', () => { analytics.design('notice:list_feedback'); go('/feedback'); });
      card.append(b);
    }
    root.append(card);
  });
  return { title: t('공지사항'), left: { icon: 'back', onClick: back } };
}
