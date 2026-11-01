/* ===========================================================
   views/entry.js — 글 보기
   읽는 화면에도 "다음 글"을 붙인다. 일기는 읽혀야 값을 한다.
   =========================================================== */

import * as store from '../store.js';
import { go, back } from '../app.js';
import {
  el, icon, esc, toast, haptic, openSheet, confirmSheet,
  fmtDate, fmtTime, relDay, moodColor, moodWord, summaryText, todayKey, daysBetween,
} from '../ui.js';
import { entryItem, paintBookmark, syncBookmark } from './home.js';
import { t, locale } from '../i18n.js';
import * as stickers from '../stickers.js';
import * as wx from '../weather.js';
import * as place from '../place.js';
import * as PL from '../photolayout.js';
import { songCard } from '../songcard.js';
import * as BGM from '../bgm.js';

export async function render(root, params) {
  const e = store.byId(params.id);
  if (!e || e.deletedAt) {
    root.append(el('div', { class: 'empty' },
      `<div class="empty-title">${t('글을 찾을 수 없어요')}</div><div class="empty-sub">${t('휴지통에 있을 수도 있어요.')}</div>`));
    return { title: '', left: { icon: 'back' } };
  }
  /* 묻어둔 글은 주소를 직접 쳐도 열리지 않아야 한다. 한 군데라도 새면
     "정한 날까지 못 본다"는 약속이 깨지고, 그 약속이 이 기능의 전부다. */
  if (store.isSealed(e)) {
    root.append(el('div', { class: 'empty', style: 'margin-top:40px' },
      `<span class="empty-emoji">🏺</span>
       <div class="empty-title">${t('아직 묻혀 있어요')}</div>
       <div class="empty-sub">${esc(t('{d}에 열립니다 · {n}일 남음',
         { d: fmtDate(e.sealedUntil, { year: true }), n: daysBetween(todayKey(), e.sealedUntil).toLocaleString() }))}</div>`));
    return { title: t('미래의 나에게'), left: { icon: 'back' } };
  }
  store.markRead(e.id);
  /* 묻었던 글을 처음 펼친 순간 — 홈의 알림은 이걸 보고 사라진다 */
  if (e.sealedUntil && !e.openedAt) store.markOpened(e.id);

  /* 개발 중에 있던 꾸미기 모드 주소(?deco=1)는 쓰기 화면으로 보낸다. 스티커는 이제 거기서 붙인다 */
  if (params.deco === '1') { go(`/write?id=${e.id}&stk=1`, { replace: true }); return {}; }

  /* 스티커가 얹히는 '종이'. 날짜부터 태그까지가 한 장이고, 아래 이동 버튼·관련 글은 종이 밖이다 */
  const page = el('div', { class: 'entry-page' });

  const head = el('div', { class: 'entry-head' });
  head.innerHTML =
    `<div class="entry-date">${esc(fmtDate(e.date, { year: true }))}</div>
     ${e.title ? `<h2 class="entry-title">${esc(e.title)}</h2>` : ''}`;
  const sub = el('div', { class: 'entry-sub' });
  if (e.mood) {
    sub.innerHTML += `<span class="mood-dot" style="background:${moodColor(e.mood)}"></span>
                      <span>${esc(t('{기분} 하루', { 기분: moodWord(e.mood) }))}</span>`;
  }
  sub.innerHTML += `<span>${t('{t}에 씀', { t: fmtTime(e.createdAt) })}</span>`;
  if (e.wordCount) sub.innerHTML += `<span>${t('{n}자', { n: e.wordCount })}</span>`;
  sub.innerHTML += `<span>${esc(relDay(e.date))}</span>`;
  head.append(sub);
  /* 그날 날씨 (1.7.2) */
  if (e.weather?.k) {
    const card = el('div', { class: 'wx-card' });
    const tt = wx.tempText(e.weather);
    const when = e.weather.auto && e.weather.place
      ? [e.weather.place, e.weather.at ? new Date(e.weather.at).toLocaleTimeString(locale(), { hour: 'numeric', minute: '2-digit' }) : ''].filter(Boolean).join(' · ') : '';
    card.innerHTML = wx.wxSvg(e.weather.k, 54) + `<div><div class="n">${esc(wx.nameOf(e.weather.k))}</div>`
      + (tt ? `<div class="s">${esc(tt)}</div>` : '') + (when ? `<div class="s">${esc(when)}</div>` : '') + '</div>';
    head.append(card);
  }
  /* 일기 쓴 곳 (1.7.8) — 누르면 지도. 자리는 본문 바로 아래 (2026-10-31 사용자 의견: 위쪽을 너무 많이 차지한다) */
  let placeRow = null;
  if (e.place?.lat != null) {
    const row = el('button', { class: 'pl-row', type: 'button' });
    const sub = e.place.addr && e.place.name ? e.place.name : (e.place.approx ? t('대략적인 위치') : '');
    row.innerHTML = icon('pin') + `<span class="n">${esc(place.label(e.place))}${sub ? `<span class="s">${esc(sub)}</span>` : ''}</span><span class="go">${esc(t('지도'))} ›</span>`;
    row.addEventListener('click', () => go('/map?id=' + encodeURIComponent(e.id)));
    placeRow = row;
  }
  const songAuto = !!e.song?.yt && store.getSettings().songAuto !== false;
  /* 배경음악 (1.7.9) — 창 없이 흐른다. 멈춤·다시 틀기만 한 줄로. 자리는 일기 본문 아래 */
  let bgmRow = null;
  if (BGM.trackOf(e.bgm)) {
    const row = el('button', { class: 'pl-row bgm-bar', type: 'button' });
    const paint = () => {
      const s = BGM.state();
      const on = s.playing && s.id === e.bgm;
      row.classList.toggle('on', on);
      row.innerHTML = icon('music') + `<span class="n">${esc(BGM.nameOf(e.bgm))}<span class="s">${esc(t('배경음악'))}</span></span>`
        + `<span class="go">${on ? '<span class="bgm-eq"><i></i><i></i><i></i></span>' + esc(t('멈추기')) : icon('play') + esc(t('틀기'))}</span>`;
    };
    row.addEventListener('click', () => BGM.toggle(e.bgm));
    const un = BGM.subscribe(() => { if (!row.isConnected) { un(); return; } paint(); });
    paint();
    bgmRow = row;                       // 일기 아래에 붙인다 (2026-10-29 사용자: "배경음악은 일기 아래에")
    /* 유튜브 노래가 자동으로 틀어지면 배경음악은 기다린다 (두 음악이 겹치지 않게) */
    if (store.getSettings().bgmAuto !== false && !songAuto) setTimeout(() => { if (row.isConnected) BGM.play(e.bgm); }, 250);
  }
  page.append(head);

  if (e.chips?.length) {
    const row = el('div', { class: 'chip-row', style: 'margin-bottom:18px' });
    for (const c of e.chips) row.append(el('span', { class: 'chip on' }, esc(t(c))));
    page.append(row);
  }

  /* 사진: 자리·크기를 정한 사진(1.7.5)은 그대로, 나머지는 예전처럼 본문 위에 묶어서.
     스티커는 '.entry-photos img' 의 화면 순서로 사진에 붙는다 (e.photos 순서와 같다, photolayout.normalize) */
  const lay = PL.split(e);
  /* 낱장은 예전처럼 한 상자에 차례로, 사진 묶음(콜라주)은 틀 모양 상자로 (1.7.5) */
  const photoBox = (pids, cls = '') => {
    const frag = document.createDocumentFragment();
    let ps = null;
    for (const ch of PL.chunks(e, pids)) {
      if (ch.cid) { frag.append(collageBox(ch, cls)); ps = null; continue; }
      if (!ps) { ps = el('div', { class: 'entry-photos' + cls }); frag.append(ps); }
      const img = el('img', { alt: t('첨부 사진'), loading: 'lazy', class: 'ph-' + PL.sizeOf(e, ch.pid), style: PL.boxStyle(e, ch.pid) });   // 자유 크기·좌우 자리 (1.7.9)
      ps.append(img);
      PL.applyRot(img, PL.rotOf(e, ch.pid), PL.widthOf(e, ch.pid));   // 회전 (1.7.9)
      store.fillImage(img, ch.pid, () => img.remove());
    }
    return frag;
  };
  const collageBox = (ch, cls) => {
    const T = PL.TEMPLATES[ch.t];
    /* 틀 비율은 폭에 대한 padding 으로 잡는다 — aspect-ratio 는 묶음이 flex 안에 있을 때 무시돼 칸이 사진 비율로 늘었다 */
    const box = el('div', { class: 'entry-photos collage' + cls, style: `padding-top:${(T.ratio * 100).toFixed(3)}%` });
    const grid = el('div', { class: 'cl-grid', style: `grid-template-columns:repeat(${T.cols},1fr);grid-template-rows:repeat(${T.rows},1fr)` });
    box.append(grid);
    T.cells.forEach(([c, r, cs, rs], i) => {
      const pid = ch.pids[i];
      const pos = `grid-column:${c + 1}/span ${cs};grid-row:${r + 1}/span ${rs}`;
      if (!pid) { grid.append(el('div', { class: 'cl-empty', style: pos })); return; }
      const f = PL.focusOf(e, pid);
      const img = el('img', { alt: t('첨부 사진'), loading: 'lazy', style: `${pos};object-position:${(f.x * 100).toFixed(1)}% ${(f.y * 100).toFixed(1)}%` });
      grid.append(img);
      store.fillImage(img, pid, () => img.remove());
    });
    return box;
  };
  if (lay.top.length) page.append(photoBox(lay.top));

  // 사진만 있는 글은 사진이 곧 본문이다. 굳이 "내용 없음"을 붙이지 않는다.
  if (lay.flow.length > 1) {
    /* 글 사이 사진 (1.7.5): 본문 칸 하나 안에 글과 사진을 차례로. 스티커의 '본문' 닻은 이 칸 전체다 */
    const b = el('div', { class: 'entry-body entry-flow' });
    for (const seg of lay.flow) {
      if (seg.photos) b.append(photoBox(seg.photos, ' inline'));
      else if (seg.text) b.append(el('div', { class: 'ef-text' }, esc(seg.text)));
    }
    page.append(b);
  } else if ((e.body || '').trim()) {
    page.append(el('div', { class: 'entry-body' }, esc(e.body)));
  } else if (!e.photos?.length) {
    // 제목은 이미 위에 크게 나와 있다 — 여기서 또 쓰지 않는다
    const s = summaryText(e, 0, { title: false });
    if (s) page.append(el('div', { class: 'entry-body muted' }, esc(s)));
  }

  /* 오늘의 노래 (1.7.9) */
  /* 노래는 일기 아래에 (사용자 2026-10-29: 위에 있으면 일기 내용이 안 보인다). 유튜브 링크 노래는 열자마자 거기서 튼다 */
  if (placeRow) { const wrap = el('div', { class: 'entry-place' }); wrap.append(placeRow); page.append(wrap); }
  if (bgmRow) { const wrap = el('div', { class: 'entry-bgm' }); wrap.append(bgmRow); page.append(wrap); }
  if (e.song && (e.song.t || e.song.a || e.song.url)) page.append(songCard(e.song, { autoplay: songAuto }));

  if (e.tags?.length) {
    const t = el('div', { class: 'entry-tags' });
    for (const tag of e.tags) {
      const b = el('button', { class: 'tag', type: 'button' }, esc(tag));
      b.addEventListener('click', () => go(`/search?q=${encodeURIComponent('#' + tag)}`));
      t.append(b);
    }
    page.append(t);
  }
  root.append(page);

  /* 스티커 — 여기서는 보여주기만 한다. 붙이고 옮기는 건 고쳐 쓰기 화면 한 곳에서.
     onChange 는 개발 중 만든 옛 모양을 새 모양으로 바꾼 때만 불린다.
     고친 게 아니라서 updatedAt 은 건드리지 않는다 (되새김이 방금 쓴 글로 착각한다) */
  stickers.mount(page, e, {
    anchors: stickers.readingAnchors(page),
    onChange: () => store.put(e, { silent: true, touch: false }),
  });

  /* 앞뒤 글 이동 */
  const list = store.live();
  const i = list.findIndex((x) => x.id === e.id);
  const prev = list[i + 1], next = list[i - 1];
  const foot = el('div', { class: 'entry-foot' });
  const mkNav = (target, label, ic) => {
    const b = el('button', { class: 'btn', type: 'button', style: 'flex:1' },
      (ic === 'chevL' ? icon('chevL') : '') + `<span>${esc(label)}</span>` + (ic === 'chev' ? icon('chev') : ''));
    b.disabled = !target;
    if (target) b.addEventListener('click', () => go(`/entry/${target.id}`));
    return b;
  };
  foot.append(mkNav(prev, t('이전 글'), 'chevL'), mkNav(next, t('다음 글'), 'chev'));
  root.append(foot);

  /* 이어지는 글 — 같은 태그의 과거 글 */
  const related = list.filter((x) =>
    x.id !== e.id && (x.tags || []).some((t) => (e.tags || []).includes(t))).slice(0, 3);
  if (related.length) {
    const sec = el('div', { class: 'related section' });
    sec.append(el('div', { class: 'section-head' },
      `<div class="section-title">${t('같은 주제의 글')}</div>`));
    const wrap = el('div', { class: 'elist' });
    for (const r of related) wrap.append(entryItem(r));
    sec.append(wrap);
    root.append(sec);
  }

  /* 같은 날짜, 다른 해 */
  const anniv = list.filter((x) => x.id !== e.id && x.date.slice(5) === e.date.slice(5));
  if (anniv.length) {
    const sec = el('div', { class: 'related section' });
    sec.append(el('div', { class: 'section-head' },
      `<div class="section-title">${t('다른 해의 {m}월 {d}일', { m: Number(e.date.slice(5, 7)), d: Number(e.date.slice(8)) })}</div>`));
    const wrap = el('div', { class: 'elist' });
    for (const r of anniv.slice(0, 3)) wrap.append(entryItem(r));
    sec.append(wrap);
    root.append(sec);
  }

  return {
    title: fmtDate(e.date, { weekday: false }),
    left: { icon: 'back', label: t('뒤로'), onClick: back },
    right: [
      { icon: 'bookmark', label: t('보관함에 넣기'), data: { bmId: e.id },
        build: (b) => paintBookmark(b, !!e.bookmarkedAt),
        onClick: async () => {
          const on = await store.toggleBookmark(e.id);
          haptic();
          syncBookmark(e.id, on);
          toast(on ? t('보관함에 넣었어요.') : t('보관을 해제했어요.'));
        } },
      /* 글·사진·스티커를 모두 여기서 고친다. 스티커를 알리려고 NEW 를 붙인다 (서랍을 한 번 열면 사라진다) */
      { icon: 'edit', label: t('고쳐 쓰기'), build: (b) => stickers.paintNew(b), onClick: () => go(`/write?id=${e.id}&from=entry`) },
      { icon: 'dots', label: t('더보기'), onClick: () => menu(e) },
    ],
  };
}

function menu(e) {
  openSheet({
    title: fmtDate(e.date, { year: true }),
    items: [
      { label: t('고쳐 쓰기'), icon: 'edit', onClick: () => go(`/write?id=${e.id}&from=entry`) },
      { label: t('텍스트 복사'), icon: 'book', onClick: async () => {
        const text = `${e.date}${e.title ? ' — ' + e.title : ''}\n\n${e.body || ''}`;
        try { await navigator.clipboard.writeText(text); toast(t('복사했어요.')); }
        catch { toast(t('복사에 실패했어요.')); }
      } },
      { label: t('휴지통으로 보내기'), icon: 'trash', danger: true, onClick: async () => {
        const ok = await confirmSheet({
          title: t('휴지통으로 보낼까요?'),
          text: t('30일 동안 보관돼요. 그 안에는 언제든 되살릴 수 있습니다.'),
          ok: t('보내기'), danger: true,
        });
        if (!ok) return;
        await store.softDelete(e.id);
        go('/home', { replace: true });
        toast(t('휴지통으로 보냈어요.'), { action: t('되살리기'), onAction: () => store.restore(e.id) });
      } },
    ],
  });
}
