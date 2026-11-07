/* ===========================================================
   views/songs.js — 내가 고른 음악 (2026-11-08 사용자 요청)
   "내가 일기에 넣었던 노래 목록을 일기 작성일자 기준으로 보고 싶다 — 설정에 넣으면 너무 많으니 별도 메뉴로"
   · 일기에 넣은 '오늘의 노래'를 일기 날짜 순서(최근 날짜가 위)로, 달마다 묶어 보여 준다.
   · 줄을 누르면 그 일기로, [듣기]는 글 보기의 노래 카드와 같은 듣기 창(songcard.openListen).
   · 들어오는 길: 발견 화면의 '내가 고른 음악' 카드. 예시 글·휴지통 글은 뺀다.
   · 저장 형식은 바꾸지 않는다 (entry.song 을 읽기만 한다).
   =========================================================== */

import * as store from '../store.js';
import * as analytics from '../analytics.js';
import { t, monthTitle } from '../i18n.js';
import { back, go } from '../app.js';
import { el, icon, esc, fmtDate } from '../ui.js';

/** 노래가 들어 있는 내 일기 (일기 날짜 최근 순) */
export function songEntries() {
  return store.live()
    .filter((e) => !e.demo && !e.deletedAt && e.song && (e.song.t || e.song.url))
    .sort((a, b) => (a.date === b.date ? (b.createdAt || 0) - (a.createdAt || 0) : a.date < b.date ? 1 : -1));
}

export async function render(root) {
  const list = songEntries();
  const head = { title: t('내가 고른 음악'), left: { icon: 'back', onClick: back } };
  analytics.design('songs:open', list.length);

  if (!list.length) {
    root.append(el('div', { class: 'empty', style: 'margin-top:50px' },
      `<span class="empty-emoji">🎵</span>
       <div class="empty-title">${esc(t('아직 일기에 넣은 노래가 없어요'))}</div>
       <div class="empty-sub">${esc(t('일기를 쓸 때 음표 버튼으로 오늘의 노래를 넣어 보세요.'))}</div>`));
    return head;
  }

  root.append(el('div', { class: 'note', style: 'margin:6px 4px 14px' },
    esc(t('일기에 넣은 노래를 일기 날짜 순서로 모았어요.')) + ' · ' + esc(t('{n}곡', { n: list.length }))));

  let month = '';
  let box = null;
  for (const e of list) {
    const ym = e.date.slice(0, 7);
    if (ym !== month) {
      month = ym;
      root.append(el('div', { class: 'section-title songs-month' }, `<span>${esc(monthTitle(+ym.slice(0, 4), +ym.slice(5, 7)))}</span>`));
      box = el('div', { class: 'card songs-box' });
      root.append(box);
    }
    const s = e.song;
    const row = el('div', { class: 'songs-row' });
    const b = el('button', { class: 'songs-item', type: 'button' });
    const art = el('div', { class: 'ss-art' });
    if (s.art) art.append(el('img', { src: s.art, alt: '', loading: 'lazy' }));
    else art.innerHTML = icon('music');
    const tx = el('div', { class: 'songs-tx' });
    tx.append(
      el('div', { class: 'ss-t' }, esc(s.t || s.url || '')),
      el('div', { class: 'ss-a' }, esc(s.a || '')),
      el('div', { class: 'songs-date' }, esc(fmtDate(e.date, { weekday: true }))),
    );
    b.append(art, tx);
    b.addEventListener('click', () => { analytics.design('songs:entry'); go(`/entry/${e.id}`); });
    const play = el('button', { class: 'songs-play', type: 'button', 'aria-label': t('듣기') }, `${icon('play')}<span>${esc(t('듣기'))}</span>`);
    play.addEventListener('click', async () => {
      analytics.design('songs:listen');
      const SC = await import('../songcard.js');
      SC.openListen(s);
    });
    row.append(b, play);
    box.append(row);
  }
  return head;
}
