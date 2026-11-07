/* ===========================================================
   songcard.js — 오늘의 노래 카드 (1.7.9). 쓰기·글 보기가 같은 카드를 쓴다.
   [듣기] · 링크로 넣은 노래는 그 링크를 바로 그 앱(YouTube Music · YouTube · Spotify · Apple Music)에서 연다
          · 검색으로 고른 노래는 어디서 들을지 고르는 창 (YouTube Music · Spotify · Apple Music · YouTube)
   유튜브 링크 노래는 '여기서 듣기(작은 화면)'도 고를 수 있다 — 누를 때만 띄우고, 약관대로 최소 200px 높이로 보인다.
   (2026-10-28 사용자: 창을 항상 띄우지는 말고, 다른 앱으로만 보내지도 말 것. 유튜브는 화면을 숨긴 재생을 금지한다)
   =========================================================== */
import { el, icon, esc, openSheet, toast } from './ui.js';
import { t } from './i18n.js';
import * as M from './music.js';
import * as analytics from './analytics.js';
import * as BGM from './bgm.js';

/**
 * @param {object} s     entry.song
 * @param {object} opts  { onEdit?: () => void, onRemove?: () => void }  — 쓰기 화면에서만
 *                       { autoplay?: true } — 글 보기: 유튜브 링크 노래는 열자마자 작은 화면으로 틀어 준다
 *                         (2026-10-28 사용자 "일기 들어가면 자동으로 플레이"). 약관대로 화면은 보이고(최소 200px),
 *                         앱을 벗어나면 멈춘다(숨긴 재생 금지).
 */
export function songCard(s, { onEdit = null, onRemove = null, autoplay = false } = {}) {
  const card = el('div', { class: 'song-card' + (onEdit ? ' editable' : '') });
  const row = el('div', { class: 'sc-row' });
  const art = el('div', { class: 'sc-art' });
  if (s.art) art.append(el('img', { src: s.art, alt: '' }));
  else art.innerHTML = icon('music');
  const txt = el('div', { class: 'sc-txt' });
  txt.append(el('div', { class: 'sc-k' }, esc(t('오늘의 노래'))));
  txt.append(el('div', { class: 'sc-t' }, esc(s.t || s.url || '')));
  if (s.a) txt.append(el('div', { class: 'sc-a' }, esc(s.a)));
  const play = el('button', { class: 'sc-play', type: 'button', 'aria-label': t('듣기') }, icon('play') + `<span>${esc(t('듣기'))}</span>`);
  row.append(art, txt, play);
  if (onRemove) {
    const x = el('button', { class: 'sc-del', type: 'button', 'aria-label': t('노래 빼기') }, '✕');
    x.addEventListener('click', (ev) => { ev.stopPropagation(); onRemove(); });
    row.append(x);
  }
  card.append(row);
  const player = el('div', { class: 'sc-player', hidden: true });
  card.append(player);
  const label = (on) => { play.innerHTML = icon(on ? 'pause' : 'play') + `<span>${esc(on ? t('멈추기') : t('듣기'))}</span>`; play.classList.toggle('on', on); };
  const closePlayer = () => { player.hidden = true; player.innerHTML = ''; label(false); };
  /* 앱을 벗어나면(홈 버튼·다른 앱) 멈춘다 — 유튜브는 화면 없는 재생을 금지한다 */
  const onHide = () => {
    if (!card.isConnected) { document.removeEventListener('visibilitychange', onHide); return; }
    if (document.hidden && !player.hidden) closePlayer();
  };
  document.addEventListener('visibilitychange', onHide);
  const showPlayer = () => {
    PV.stop();
    BGM.stop();
    player.innerHTML = '';
    const fr = el('iframe', {
      class: 'sc-frame', src: `https://www.youtube-nocookie.com/embed/${s.yt}?autoplay=1&playsinline=1&rel=0`,
      title: s.t || t('오늘의 노래'), allow: 'autoplay; encrypted-media; picture-in-picture', allowfullscreen: true,
      referrerpolicy: 'strict-origin-when-cross-origin',
    });
    const close = el('button', { class: 'sc-more', type: 'button' }, esc(t('닫기')));
    close.addEventListener('click', closePlayer);
    player.append(fr, close);
    player.hidden = false;
    label(true);
    analytics.design('song:embed:yt');
  };

  if (onEdit) {
    art.addEventListener('click', onEdit);
    txt.addEventListener('click', onEdit);
  }
  play.addEventListener('click', (ev) => {
    ev.stopPropagation();
    /* 링크로 넣은 노래: 그 링크를 바로 그 앱에서. 검색·직접 적은 노래: 어디서 들을지 고른다 */
    if (s.yt) {
      if (!player.hidden) { closePlayer(); return; }
      openSheet({
        title: t('어디서 들을까요?'), text: M.label(s),
        items: [
          { label: t('여기서 듣기'), sub: t('일기 안에 작은 화면으로'), onClick: showPlayer },
          { label: /music\.youtube/.test(s.url || '') ? 'YouTube Music' : 'YouTube', sub: t('붙여 넣은 링크'),
            onClick: () => { analytics.design('song:open:link-yt'); M.openExternal(s.url || 'https://www.youtube.com/watch?v=' + s.yt); } },
        ],
      });
      return;
    }
    /* 검색으로 넣은 노래: 하루칸 안에서 30초 미리듣기 (누를 때만, 스트리밍만) */
    if (!s.url && (s.pv || s.it)) { togglePreview(); return; }
    if (s.url && (s.sp || s.am)) {
      analytics.design('song:open:link-' + (s.yt ? 'yt' : s.sp ? 'sp' : 'am'));
      M.openExternal(s.url);
      return;
    }
    openListen(s);
  });
  /* ── 30초 미리듣기 ── */
  const isPv = !s.url && !s.yt && (s.pv || s.it);
  let pvBar = null, pvFill = null, pvTime = null;
  if (isPv) {
    play.innerHTML = icon('play') + `<span>${esc(t('미리듣기'))}</span>`;
    const pvRow = el('div', { class: 'sc-pv' });
    pvBar = el('div', { class: 'sc-pv-bar', hidden: true });
    pvFill = el('i'); pvBar.append(pvFill);
    pvTime = el('span', { class: 'sc-pv-time' }, esc(t('30초 미리듣기')));
    const badge = el('button', { class: 'sc-am', type: 'button' }, `<span class="sc-am-ico"></span><span>${esc(t('Apple Music에서 듣기'))}</span>`);
    badge.addEventListener('click', (ev) => { ev.stopPropagation(); stopPreview(); analytics.design('song:open:am-badge'); M.openExternal(s.am || 'https://music.apple.com/search?term=' + encodeURIComponent(M.label(s).replace(' · ', ' '))); });
    const full = el('button', { class: 'sc-full', type: 'button' }, esc(t('YouTube Music에서 전곡')));
    full.addEventListener('click', (ev) => { ev.stopPropagation(); stopPreview(); analytics.design('song:open:ytm-full'); M.openExternal('https://music.youtube.com/search?q=' + encodeURIComponent(M.label(s).replace(' · ', ' '))); });
    pvRow.append(pvTime, badge, full);
    card.append(pvBar, pvRow, el('div', { class: 'sc-credit' }, esc(t('미리듣기 제공: Apple Music'))));
  }
  const paintPv = (on) => {
    if (!isPv) return;
    play.innerHTML = icon(on ? 'pause' : 'play') + `<span>${esc(on ? t('멈추기') : t('미리듣기'))}</span>`;
    play.classList.toggle('on', on);
    pvBar.hidden = !on;
    if (!on) { pvFill.style.width = '0'; pvTime.textContent = t('30초 미리듣기'); }
  };
  function stopPreview() { if (PV.owner === card) PV.stop(); }
  async function togglePreview() {
    if (PV.owner === card && PV.audio && !PV.audio.paused) { PV.stop(); return; }
    let url = M.previewUrl(s.pv);
    if (!url && s.it) { play.disabled = true; url = await M.lookupPreview(s.it); play.disabled = false; }
    if (!url) { openListen(s); return; }            // 미리듣기가 없는 곡 → 어디서 들을지 고르기
    BGM.stop();
    PV.start(card, url, {
      onTime: (cur, dur) => { pvFill.style.width = Math.min(100, (cur / (dur || 30)) * 100) + '%'; pvTime.textContent = `0:${String(Math.floor(cur)).padStart(2, '0')} / 0:${String(Math.round(dur || 30)).padStart(2, '0')}`; },
      onState: paintPv,
      onError: () => toast(t('미리듣기를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')),
    });
    analytics.design('song:preview');
  }
  if (autoplay && s.yt) {
    /* 화면에 붙은 뒤 튼다 (다른 화면으로 이미 떠났으면 틀지 않는다) */
    setTimeout(() => { if (card.isConnected && !document.hidden) { showPlayer(); analytics.design('song:autoplay'); } }, 300);
  }
  return card;
}

/** 어디서 들을까요? — 그 앱의 검색 화면(또는 붙여 넣은 링크)을 연다 */
export function openListen(s) {
  const items = M.listenTargets(s).map((x) => ({
    label: x.name,
    sub: x.id.endsWith('-link') ? t('붙여 넣은 링크') : '',
    onClick: () => { analytics.design('song:open:' + x.id); M.openExternal(x.url); },
  }));
  if (!items.length) return;
  openSheet({ title: t('어디서 들을까요?'), text: M.label(s), items });
}

/* 30초 미리듣기 재생기 — 한 번에 하나만. 스트리밍만 하고 저장하지 않는다.
   화면을 떠나거나(카드가 사라짐) 앱을 내리면 멈춘다 */
const PV = {
  audio: null, owner: null, cb: null, watch: 0,
  start(owner, url, cb) {
    this.stop();
    const a = new Audio();
    a.preload = 'none';
    a.src = url;
    this.audio = a; this.owner = owner; this.cb = cb;
    a.addEventListener('timeupdate', () => cb.onTime?.(a.currentTime, a.duration));
    a.addEventListener('ended', () => this.stop());
    a.addEventListener('error', () => { cb.onError?.(); this.stop(); });
    a.play().then(() => cb.onState?.(true)).catch(() => { cb.onError?.(); this.stop(); });
    this.watch = setInterval(() => { if (!owner.isConnected) this.stop(); }, 700);
  },
  stop() {
    clearInterval(this.watch);
    const a = this.audio, cb = this.cb;
    this.audio = null; this.owner = null; this.cb = null;
    if (a) { try { a.pause(); a.removeAttribute('src'); a.load(); } catch { /* 이미 멈춤 */ } }
    cb?.onState?.(false);
  },
};
document.addEventListener('visibilitychange', () => { if (document.hidden) PV.stop(); });
/* 배경음악을 틀면 미리듣기는 멈춘다 (두 소리가 겹치지 않게). 막 시작한 직후의 배경음악 끄기 알림은 무시 */
let pvT0 = 0;
const _start = PV.start.bind(PV);
PV.start = (...a) => { pvT0 = Date.now(); _start(...a); };
BGM.subscribe(() => { if (PV.audio && Date.now() - pvT0 > 1500 && BGM.state().playing) PV.stop(); });
export function stopPreview() { PV.stop(); }