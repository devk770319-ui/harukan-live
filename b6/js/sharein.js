/* ===========================================================
   sharein.js — 다른 앱에서 '공유 → 하루칸' 으로 들어온 노래 (1.7.9, 사용자 결정 2026-10-28)

   어디에 넣나
    ① 쓰기 화면이 열려 있으면(일기를 쓰다가 유튜브에 다녀온 경우) → 그 일기에 바로
    ② 아니면 작은 창: [오늘 일기에 넣기] · [다른 날 고르기] · [나중에 고를게요(노래 보관함)]
       고른 날에 일기가 있으면 그 일기를, 없으면 새 일기를 연다. 이미 노래가 있으면 바꿀지 묻는다(write.js).
   노래 보관함: 나중에 고를 노래를 모아 둔다 (meta 'songInbox', 이 폰에만, 최대 30곡).
              일기를 쓸 때 음표 버튼 창 맨 위에 '공유해 둔 노래'로 보인다.
   네이티브(ShareInPlugin)가 없는 옛 앱에서는 아무것도 하지 않는다 — 내려받기 업데이트로 먼저 가도 안전하다.
   잠금 화면이 떠 있으면 풀린 뒤에 처리한다 (app.js finishBoot 에서 init 을 다시 부른다).
   =========================================================== */
import * as store from './store.js';
import * as M from './music.js';
import { t } from './i18n.js';
import { el, esc, openSheet, closeSheet, toast, todayKey } from './ui.js';
import * as analytics from './analytics.js';

const INBOX_MAX = 30;
let inited = false;
const queue = [];
let pending = null;      // 쓰기 화면이 열리면 가져갈 노래

function plugin() {
  try {
    const C = window.Capacitor;
    if (!C?.isNativePlatform?.() || !C.isPluginAvailable?.('ShareIn')) return null;
    return C.Plugins.ShareIn;
  } catch { return null; }
}
export function available() { return !!plugin(); }
const locked = () => { const ls = document.getElementById('lockscreen'); return !!ls && !ls.hidden; };

/** 부팅·잠금 해제 뒤마다 부른다: 기다리던 공유 글을 가져와 처리 */
export async function init() {
  const p = plugin();
  if (!p) return;
  if (!inited) {
    inited = true;
    p.addListener('shared', (d) => { if (d?.text) { queue.push(d.text); flush(); } });
  }
  try { const r = await p.take(); if (r?.text) queue.push(r.text); } catch { /* 없음 */ }
  flush();
}

function flush() {
  if (locked()) return;
  while (queue.length) handle(queue.shift());
}

async function handle(text) {
  const p = M.parseLink(text);
  if (!p) {
    toast(t('노래 링크가 아니에요. YouTube · YouTube Music · Spotify에서 공유해 주세요.'));
    analytics.design('share:in:notmusic');
    return;
  }
  analytics.design('share:in:' + p.kind);
  toast(t('노래 정보를 가져오는 중…'));
  const song = (await M.fromLink(p)) || M.clean({ url: p.url, yt: p.yt, sp: p.sp, am: p.am, t: p.t });
  if (!song) return;
  /* ① 쓰던 일기가 열려 있으면 그 일기에 */
  try {
    const w = await import('./views/write.js');
    if (await w.acceptSharedSong?.(song)) { analytics.design('share:in:to:writing'); return; }
  } catch { /* 쓰기 화면이 없다 */ }
  /* ② 어디에 넣을지 묻기 */
  choose(song);
}

function choose(song) {
  const head = el('div', { class: 'si-song' });
  if (song.art) head.append(el('img', { src: song.art, alt: '' }));
  const tx = el('div', { class: 'si-tx' });
  tx.append(el('div', { class: 'si-t' }, esc(song.t || song.url || '')));
  if (song.a) tx.append(el('div', { class: 'si-a' }, esc(song.a)));
  head.append(tx);
  openSheet({
    title: t('어느 일기에 넣을까요?'),
    content: head,
    items: [
      { label: t('오늘 일기에 넣기'), icon: 'edit', onClick: () => toDate(todayKey(), 'today', song) },
      { label: t('다른 날 고르기'), icon: 'cal', onClick: () => pickDate(song) },
      { label: t('나중에 고를게요'), sub: t('노래 보관함에 넣어 두고, 일기를 쓸 때 음표 버튼에서 골라요.'), icon: 'music',
        onClick: async () => { await inboxAdd(song); analytics.design('share:in:to:inbox'); toast(t('노래 보관함에 넣어 뒀어요.')); } },
    ],
  });
}

function pickDate(song) {
  const box = el('div', { class: 'si-date' });
  const inp = el('input', { type: 'date', class: 'ss-in', max: todayKey(), value: todayKey() });
  const ok = el('button', { class: 'btn btn-primary', type: 'button', style: 'width:100%;margin-top:12px' }, esc(t('이 날 일기에 넣기')));
  ok.addEventListener('click', () => { if (inp.value) { closeSheet(); toDate(inp.value, 'date', song); } });
  box.append(inp, ok);
  setTimeout(() => openSheet({ title: t('다른 날 고르기'), content: box, onClose: null }), 230);
}

async function toDate(date, why, song) {
  analytics.design('share:in:to:' + why);
  pending = song;      // 쓰기 화면이 열리면 가져간다
  const e = store.byDate(date).filter((x) => !x.demo && !x.deletedAt)[0];
  const { go } = await import('./app.js');
  go(e ? `/write?id=${e.id}` : `/write?d=${date}`);
}

/** 쓰기 화면이 열릴 때 가져간다 (한 번만) */
export function takePending() { const s = pending; pending = null; return s; }

/* ── 노래 보관함 ─────────────────────────────── */
export async function inboxList() {
  const v = await store.metaGet('songInbox', []);
  return Array.isArray(v) ? v.filter((x) => x && x.s) : [];
}
export async function inboxAdd(song) {
  const list = (await inboxList()).filter((x) => (x.s.url || x.s.t) !== (song.url || song.t));
  list.unshift({ s: song, at: Date.now() });
  await store.metaSet('songInbox', list.slice(0, INBOX_MAX));
}
export async function inboxRemove(at) {
  await store.metaSet('songInbox', (await inboxList()).filter((x) => x.at !== at));
}
