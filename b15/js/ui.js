/* ===========================================================
   ui.js — DOM 헬퍼, 아이콘, 토스트, 바텀시트, 확인 대화상자
   =========================================================== */

import * as i18n from './i18n.js';
import { t } from './i18n.js';

/* ── 아이콘 ─────────────────────────────────────── */
const P = {
  home:    '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V20h13V9.5"/><path d="M9.5 20v-6h5v6"/>',
  cal:     '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  chart:   '<path d="M4 19V9M9.5 19V5M15 19v-7M20.5 19v-4"/>',
  gear:    '<circle cx="12" cy="12" r="3.2"/><path d="M12 2.6v2.4M12 19v2.4M21.4 12H19M5 12H2.6M18.6 5.4l-1.7 1.7M7.1 16.9l-1.7 1.7M18.6 18.6l-1.7-1.7M7.1 7.1 5.4 5.4"/>',
  search:  '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/>',
  back:    '<path d="m15 5-7 7 7 7"/>',
  close:   '<path d="M6 6l12 12M18 6 6 18"/>',
  chev:    '<path d="m9 5 7 7-7 7"/>',
  chevL:   '<path d="m15 5-7 7 7 7"/>',
  chevD:   '<path d="m5 9 7 7 7-7"/>',
  chevU:   '<path d="m5 15 7-7 7 7"/>',
  check:   '<path d="m4.5 12.5 5 5 10-11"/>',
  plus:    '<path d="M12 5v14M5 12h14"/>',
  dots:    '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
  trash:   '<path d="M4 7h16M9 7V4.5h6V7M6.5 7l1 13h9l1-13"/>',
  edit:    '<path d="M4 20h4l10-10-4-4L4 16v4Z"/><path d="m14.5 5.5 4 4"/>',
  camera:  '<path d="M3 8.5h3.5L8 6h8l1.5 2.5H21v11H3z"/><circle cx="12" cy="14" r="3.6"/>',
  image:   '<rect x="3.5" y="4.5" width="17" height="15" rx="2.5"/><circle cx="9" cy="10" r="1.7"/><path d="m4 17.5 4.6-4.6 3.9 3.9 2.7-2.7 4.8 4.4"/>',
  mic:     '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 12a6.5 6.5 0 0 0 13 0M12 18.5V21"/>',
  tag:     '<path d="M3 11V4h7l10 10-7 7z"/><circle cx="7.5" cy="7.5" r="1.3"/>',
  mood:    '<circle cx="12" cy="12" r="9"/><path d="M8.5 14.5s1.3 1.7 3.5 1.7 3.5-1.7 3.5-1.7"/><circle cx="9" cy="9.8" r="1"/><circle cx="15" cy="9.8" r="1"/>',
  clock:   '<circle cx="12" cy="12" r="9"/><path d="M12 7v5.3l3.4 2"/>',
  rewind:  '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3.2 4.5v4.2h4.2"/>',
  spark:   '<path d="M12 3.5 13.7 9l5.5 1.7-5.5 1.7L12 18l-1.7-5.6L4.8 10.7 10.3 9z"/>',
  lock:    '<rect x="4.5" y="10" width="15" height="10.5" rx="3"/><path d="M8.2 10V7.2a3.8 3.8 0 0 1 7.6 0V10"/>',
  // 열린 자물쇠 — 고리가 한쪽만 걸려 있다. 잠긴 것과 한눈에 구분되어야 한다.
  unlock:  '<rect x="4.5" y="10" width="15" height="10.5" rx="3"/><path d="M8.2 10V7.2a3.8 3.8 0 0 1 7.3-1"/>',
  down:    '<path d="M12 4v11M7 11l5 5 5-5M4.5 20h15"/>',
  up:      '<path d="M12 20V9M7 13l5-5 5 5M4.5 4h15"/>',
  book:    '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 18.5V20a2 2 0 0 0 2 2h14v-4"/>',
  refresh: '<path d="M20 11a8 8 0 1 0-.7 4.5"/><path d="M20.5 5v5h-5"/>',
  undo:    '<path d="M4 9h10a5.5 5.5 0 0 1 0 11h-4"/><path d="M7.5 5.5 4 9l3.5 3.5"/>',
  eye:     '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
  bell:    '<path d="M6 9a6 6 0 0 1 12 0c0 5 1.8 6.5 1.8 6.5H4.2S6 14 6 9Z"/><path d="M10 19a2 2 0 0 0 4 0"/>',
  share:   '<path d="M12 15V4M8 7.5 12 3.5l4 4"/><path d="M5 13v6.5h14V13"/>',
  filter:  '<path d="M3.5 5.5h17L14 13v6l-4 2v-8z"/>',

  /* 시안에서 새로 필요해진 것들 — 같은 24 그리드, stroke 1.9 */
  db:      '<ellipse cx="12" cy="6" rx="7.5" ry="3"/><path d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6"/><path d="M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3"/>',
  folder:  '<path d="M3 7.5a2 2 0 0 1 2-2h4l2 2.5h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5z"/>',
  fileTxt: '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 13h6M9 17h4"/>',
  moon:    '<path d="M20 13.5A8 8 0 0 1 10.5 4a8 8 0 1 0 9.5 9.5Z"/>',
  dumbbell:'<path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10"/>',
  pill:    '<rect x="2.5" y="8.5" width="19" height="7" rx="3.5"/><path d="M12 8.5v7"/>',
  wine:    '<path d="M8 3h8l-.6 5.5a3.4 3.4 0 0 1-6.8 0Z"/><path d="M12 12v6M9 21h6"/>',
  coffee:  '<path d="M4 8h13v6a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4Z"/><path d="M17 9.5h1.5a2.5 2.5 0 0 1 0 5H17"/><path d="M6 3.5v2M10 3.5v2M14 3.5v2"/>',
  flame:   '<path d="M12 21a6 6 0 0 0 6-6c0-4-3-5.5-3-9 0 0-2 1.5-2 4 0 0-1.5-1.5-1.5-4C11.5 6 6 8 6 15a6 6 0 0 0 6 6Z"/>',
  info:    '<circle cx="12" cy="12" r="9"/><path d="M12 16.5v-5.5M12 7.8h.01"/>',
  users:   '<circle cx="9" cy="8" r="3.3"/><path d="M3 20c0-3.3 2.7-5.5 6-5.5s6 2.2 6 5.5"/><path d="M16 5.2a3.3 3.3 0 0 1 0 5.6M17.5 14.8c2 .8 3.5 2.6 3.5 5.2"/>',
  type:    '<path d="M3.5 18 8 6.5 12.5 18M5.2 14.2h5.6"/><path d="M20.5 18v-4.6a2.8 2.8 0 1 0-5.2 1.4 2.8 2.8 0 0 0 5.2 1.4"/>',
  sun:     '<circle cx="12" cy="12" r="4"/><path d="M12 2.5v2.6M12 18.9v2.6M21.5 12h-2.6M5.1 12H2.5M18.7 5.3l-1.8 1.8M7.1 16.9l-1.8 1.8M18.7 18.7l-1.8-1.8M7.1 7.1 5.3 5.3"/>',
  leaf:    '<path d="M4.5 20C4.5 11 10.5 5 20 4c0 9.5-6 15.5-15.5 16Z"/><path d="m5 19.5 9-9"/>',
  heart:   '<path d="M12 20s-7-4.4-7-9.5A4 4 0 0 1 12 7a4 4 0 0 1 7 3.5C19 15.6 12 20 12 20Z"/>',
  shield:  '<path d="M12 3 5 6v5.5c0 4.3 3 8.2 7 9.5 4-1.3 7-5.2 7-9.5V6Z"/>',
  quote:   '<path d="M4.5 20.5h15a2 2 0 0 0 2-2v-13a2 2 0 0 0-2-2h-15a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/><path d="M7 10h4M7 14h7"/>',
  list:    '<path d="M4 7h16M4 12h16M4 17h10"/>',
  finger:  '<path d="M4.8 8.5A8 8 0 0 1 12 4a8 8 0 0 1 7.2 4.5"/><path d="M5.5 12.5a6.5 6.5 0 0 1 13 0c0 1.6-.2 3.1-.6 4.6"/><path d="M8.5 12a3.5 3.5 0 0 1 7 0c0 3.6-.7 6.2-2 8.2"/><path d="M12 10.2a2 2 0 0 1 2 2c0 3-.5 5.6-1.5 7.8"/><path d="M9 20.6c.9-2 1.4-4.6 1.4-8.2"/>',
  backsp:  '<path d="M9 5.5h10a2.5 2.5 0 0 1 2.5 2.5v8a2.5 2.5 0 0 1-2.5 2.5H9L2.5 12z"/><path d="m12.5 9.5 5 5M17.5 9.5l-5 5"/>',
  /* 보관 표시. 채워진 모양은 따로 두지 않고 css 에서 fill 만 켠다 (.bm-on) */
  bookmark:'<path d="M6.5 3.5h11a1 1 0 0 1 1 1v16l-6.5-4.3-6.5 4.3v-16a1 1 0 0 1 1-1Z"/>',
  music:   '<path d="M9 18V5.5l11-2V16"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="17.5" cy="16" r="2.5"/>',   // 오늘의 노래 (1.7.9)
  play:    '<path d="M8 5.5v13l10.5-6.5z"/>',
  pause:   '<path d="M8.5 5.5v13M15.5 5.5v13"/>',
  pin:     '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/>',
  map:     '<path d="M9 4.5 3.5 6.5v13L9 17.5l6 2 5.5-2v-13L15 6.5z"/><path d="M9 4.5v13M15 6.5v13"/>',
  sticker: '<path d="M14.5 3.5H7A3.5 3.5 0 0 0 3.5 7v10A3.5 3.5 0 0 0 7 20.5h6.5l7-7V7A3.5 3.5 0 0 0 17 3.5z"/><path d="M13.5 20.5v-4a3 3 0 0 1 3-3h4"/><path d="M8.6 13.6c1.6 1.3 3.4 1.3 4.8 0"/><circle cx="9" cy="9.6" r=".9"/><circle cx="13.6" cy="9.6" r=".9"/>',
};
export function icon(name, cls = '') {
  return `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${P[name] || ''}</svg>`;
}

/* ── DOM ────────────────────────────────────────── */
export const $  = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, html) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === false || v == null) continue;
    if (k === 'class') n.className = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v === true ? '' : v);
  }
  if (html != null) n.innerHTML = html;
  return n;
}

/* 입력칸 높이를 내용에 맞춘다. 쓴 만큼 보여야 하므로 스크롤을 만들지 않는다.
   전에는 입력마다 height 를 auto 로 되돌린 뒤 다시 지정했다. 그러면 글이 길어질수록
   (2천 자면 3천 픽셀이 넘는다) 상자가 매 타건마다 접혔다 펴지면서 문서 전체가 다시 배치되고,
   포커스된 입력칸의 배치가 흔들리니 조합 중인 IME 까지 영향을 받는다.
   줄 수가 실제로 달라졌을 때만 손댄다 — 대부분의 타건은 아무것도 건드리지 않는다. */
export function autogrow(ta, force = false) {
  if (!ta) return;
  if (force) { if (ta._agRaf) cancelAnimationFrame(ta._agRaf); ta._agRaf = 0; doGrow(ta); return; }
  // 입력 처리 도중에 배치를 강제로 계산하지 않는다. 다음 프레임으로 미루면
  // IME 가 조합을 끝낼 틈이 생기고, 한 프레임에 여러 번 들어와도 한 번만 돈다.
  if (ta._agRaf) return;
  ta._agRaf = requestAnimationFrame(() => { ta._agRaf = 0; doGrow(ta); });
}

/* scrollHeight 에는 테두리가 빠져 있다. box-sizing:border-box 인 입력칸에
   그 값을 그대로 height 로 주면 테두리 두께만큼 짧아져서 마지막 줄이 잘린다.
   요소마다 한 번만 재서 붙여둔다 (매 타건마다 계산하지 않는다). */
function borderY(ta) {
  if (ta._agBorder == null) {
    const cs = getComputedStyle(ta);
    ta._agBorder = cs.boxSizing === 'border-box'
      ? (parseFloat(cs.borderTopWidth) || 0) + (parseFloat(cs.borderBottomWidth) || 0)
      : 0;
  }
  return ta._agBorder;
}

function doGrow(ta) {
  const cur = parseFloat(ta.style.height) || 0;
  const len = ta.value.length;
  const shrank = len < (ta._agLen ?? 0);
  ta._agLen = len;
  const fit = () => { ta.style.height = 'auto'; ta.style.height = (ta.scrollHeight + borderY(ta)) + 'px'; };
  if (!cur) { fit(); return; }
  // 커질 때는 auto 로 되돌릴 필요가 없다. 한 번만 쓰면 된다.
  if (ta.scrollHeight + borderY(ta) > cur) { ta.style.height = (ta.scrollHeight + borderY(ta)) + 'px'; return; }
  // 접을 때만 어쩔 수 없이 auto 를 거친다 — 지웠을 때뿐이다.
  if (shrank) fit();
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (m) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
}

export function haptic(ms = 8) {
  try { navigator.vibrate?.(ms); } catch { /* 지원 안 하면 무시 */ }
}

/* ── 토스트 (실행 취소 지원) ────────────────────── */
export function toast(msg, opts = {}) {
  const root = $('#toasts');
  const t = el('div', { class: 'toast' });
  t.append(el('span', { class: 'toast-msg' }, esc(msg)));
  let timer;
  const close = () => {
    clearTimeout(timer);
    t.classList.add('out');
    setTimeout(() => t.remove(), 200);
  };
  if (opts.action) {
    const b = el('button', { class: 'toast-act', type: 'button' }, esc(opts.action));
    b.addEventListener('click', () => { close(); opts.onAction?.(); });
    t.append(b);
  }
  root.append(t);
  timer = setTimeout(close, opts.duration ?? (opts.action ? 6000 : 2600));
  return close;
}

/* ── 바텀 시트 ──────────────────────────────────── */
let sheetCloser = null;

export function closeSheet() { sheetCloser?.(); }

/**
 * openSheet({ title, text, items:[{label,sub,icon,danger,onClick}], content:HTMLElement })
 */
/**
 * @param {{center?: boolean}} opts
 *   center — 화면 아래가 아니라 한가운데에 띄운다.
 *   광고 배너는 네이티브 뷰라 웹 화면 위를 덮는다. 그래서 아래에 붙는 시트는
 *   배너가 있고 없고에 따라 보이는 위치가 달라진다. 설명 팝업처럼 "읽고 닫는"
 *   것은 가운데에 띄워서 배너와 무관하게 항상 같은 자리에 오게 한다.
 */
/**
 * 물음표 버튼 — 누르면 그 항목이 무엇인지 설명하는 팝업을 띄운다.
 *
 * 숫자만 보여주고 설명이 없으면 "이게 뭘 센 값이지" 하고 넘어가게 된다.
 * 눌러서 설명이 나오는 자리에는 반드시 이 표시를 붙인다 — 표시가 없으면
 * 눌러볼 생각 자체를 못 한다 (통계 타일이 그래서 아무도 안 눌렀다).
 *
 * 팝업은 항상 가운데에 띄운다. 아래에서 올라오는 시트는 광고 배너에 가린다.
 */
export function infoButton(title, text) {
  const b = el('button', { class: 'info-btn', type: 'button', 'aria-label': title }, icon('info'));
  b.addEventListener('click', (e) => {
    e.stopPropagation();          // 카드 전체가 눌리는 자리에서도 설명만 뜨게
    openSheet({ title, text, center: true });
  });
  return b;
}

export function openSheet({ title, text, items = [], content, center = false, onClose = null } = {}) {
  closeSheet();
  const root = $('#sheetRoot');
  const scrim = el('div', { class: 'scrim' });
  const sheet = el('div', { class: 'sheet' + (center ? ' sheet-center' : ''), role: 'dialog', 'aria-modal': 'true' });
  if (!center) sheet.append(el('div', { class: 'sheet-grip' }));
  if (title) sheet.append(el('div', { class: 'sheet-title' }, esc(title)));
  if (text)  sheet.append(el('div', { class: 'sheet-text' }, esc(text)));
  if (content) sheet.append(content);

  if (items.length) {
    const list = el('div', { class: 'sheet-list' });
    for (const it of items) {
      const b = el('button', { class: 'sheet-item' + (it.danger ? ' danger' : ''), type: 'button' });
      b.innerHTML =
        (it.icon ? icon(it.icon) : '') +
        `<span><span>${esc(it.label)}</span>${it.sub ? `<span class="sheet-item-sub">${esc(it.sub)}</span>` : ''}</span>`;
      b.addEventListener('click', () => { close(); it.onClick?.(); });
      list.append(b);
    }
    sheet.append(list);
  }

  const onKey = (e) => { if (e.key === 'Escape') close(); };
  let closing = false;
  function close() {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', onKey);
    sheetCloser = null;
    try { onClose?.(); } catch { /* 닫힘 알림은 실패해도 닫는다 */ }
    // 열릴 때처럼 닫힐 때도 부드럽게 사라진다
    scrim.classList.add('out');
    sheet.classList.add('out');
    setTimeout(() => { scrim.remove(); sheet.remove(); }, 210);
  }
  sheetCloser = close;

  // 가운데 팝업에는 닫기 버튼을 단다 — 배경을 눌러야 닫힌다는 걸 모를 수 있다
  if (center) {
    const x = el('button', { class: 'sheet-x', type: 'button', 'aria-label': t('닫기') }, icon('close'));
    x.addEventListener('click', close);
    sheet.prepend(x);
    /* 누를 것이 하나도 없으면 닫기 버튼을 단다. 모서리의 ✕ 하나만 있으면
       못 찾는 사람이 있다. content 안에 이미 버튼이 있으면(확인 대화상자 등)
       그쪽이 닫기를 맡으므로 얹지 않는다. */
    if (!items.length && !content?.querySelector?.('button')) {
      const ok = el('button', { class: 'btn btn-primary btn-block', style: 'margin-top:18px', type: 'button' }, t('닫기'));
      ok.addEventListener('click', close);
      sheet.append(ok);
    }
  }

  scrim.addEventListener('click', close);
  document.addEventListener('keydown', onKey);
  root.append(scrim, sheet);
  sheet.querySelector('button, input, textarea')?.focus?.();
  return close;
}

/** 예/아니오 확인. Promise<boolean> */
export function confirmSheet({ title, text, ok = null, danger = false }) {
  return new Promise((resolve) => {
    const box = el('div');
    const row = el('div', { class: 'btn-row', style: 'margin-top:4px' });
    const cancel = el('button', { class: 'btn', type: 'button' }, t('취소'));
    const okBtn = el('button', { class: 'btn ' + (danger ? 'btn-primary' : 'btn-primary'), type: 'button' }, esc(ok || t('확인')));
    if (danger) okBtn.style.background = 'var(--bad)', okBtn.style.borderColor = 'var(--bad)';
    let done = false;
    cancel.addEventListener('click', () => { done = true; close(); resolve(false); });
    okBtn.addEventListener('click', () => { done = true; close(); resolve(true); });
    row.append(cancel, okBtn);
    box.append(row);
    const close = openSheet({ title, text, content: box });
    // 스크림으로 닫으면 취소로 간주
    const obs = new MutationObserver(() => {
      if (!document.body.contains(box) && !done) { done = true; obs.disconnect(); resolve(false); }
    });
    obs.observe(document.getElementById('sheetRoot'), { childList: true, subtree: true });
  });
}

/** 한 줄 입력 프롬프트. Promise<string|null> */
export function promptSheet({ title, text, placeholder = '', value = '', ok = null, type = 'text' }) {
  return new Promise((resolve) => {
    const box = el('div');
    const input = el('input', {
      class: 'lock-input', type, placeholder, value,
      style: 'text-align:start;margin-bottom:12px', autocomplete: 'off',
    });
    const row = el('div', { class: 'btn-row' });
    const cancel = el('button', { class: 'btn', type: 'button' }, t('취소'));
    const okBtn = el('button', { class: 'btn btn-primary', type: 'button' }, esc(ok || t('확인')));
    let done = false;
    const finish = (v) => { done = true; close(); resolve(v); };
    cancel.addEventListener('click', () => finish(null));
    okBtn.addEventListener('click', () => finish(input.value));
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') finish(input.value); });
    row.append(cancel, okBtn);
    box.append(input, row);
    const close = openSheet({ title, text, content: box });
    setTimeout(() => input.focus(), 60);
    const obs = new MutationObserver(() => {
      if (!document.body.contains(box) && !done) { done = true; obs.disconnect(); resolve(null); }
    });
    obs.observe(document.getElementById('sheetRoot'), { childList: true, subtree: true });
  });
}

/**
 * 비밀번호(숫자 네 자리)를 바텀시트로 받는다. Promise<string|null>
 * 비밀번호를 묻는 자리는 전부 이것을 쓴다 — 잠금 화면과 같은 키패드라
 * 어디서 물어보든 넣는 방법이 같고, 글자가 섞여 들어갈 수 없다.
 */
export function pinSheet({ title, text } = {}) {
  return new Promise((resolve) => {
    let pin = '';
    let done = false;
    const box = el('div', { class: 'pin-sheet' });
    const dots = el('div', { class: 'pin-dots', role: 'status' }, '<i></i><i></i><i></i><i></i>');
    box.append(dots);
    const finish = (v) => { if (done) return; done = true; close(); resolve(v); };
    box.append(buildKeypad((k) => {
      if (k === 'back') { pin = pin.slice(0, -1); setDots(dots, pin.length); return; }
      if (pin.length >= PIN_LEN) return;
      pin += k;
      setDots(dots, pin.length);
      if (pin.length === PIN_LEN) setTimeout(() => finish(pin), 130);   // 마지막 점을 보고 넘어간다
    }));
    const cancel = el('button', { class: 'btn btn-block', type: 'button', style: 'margin-top:14px' }, t('취소'));
    cancel.addEventListener('click', () => finish(null));
    box.append(cancel);
    const close = openSheet({ title, text, content: box });
    const obs = new MutationObserver(() => {
      if (!document.body.contains(box) && !done) { done = true; obs.disconnect(); resolve(null); }
    });
    obs.observe(document.getElementById('sheetRoot'), { childList: true, subtree: true });
  });
}

/* ── 숫자 키패드 ─────────────────────────────────
   잠금 화면과 비밀번호 설정 화면이 같은 것을 쓴다.
   ------------------------------------------------ */
export const PIN_LEN = 4;

/** onKey('0'~'9' | 'back') */
export function buildKeypad(onKey) {
  const pad = el('div', { class: 'keypad' });
  for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', '', '0', 'back']) {
    if (!k) { pad.append(el('div', { class: 'key-gap', 'aria-hidden': 'true' })); continue; }
    const back = k === 'back';
    const b = el('button', {
      class: 'key' + (back ? ' key-back' : ''), type: 'button',
      'aria-label': back ? t('지우기') : k,
    }, back ? icon('backsp') : k);
    b.addEventListener('click', () => { haptic(back ? 4 : 7); onKey(k); });
    pad.append(b);
  }
  return pad;
}

/** 점 표시 갱신. shake=true 면 흔들어서 틀렸다고 알린다. */
export function setDots(box, filled, { shake = false } = {}) {
  if (!box) return;
  [...box.children].forEach((d, i) => d.classList.toggle('on', i < filled));
  if (shake) {
    box.classList.remove('shake');
    void box.offsetWidth;            // 애니메이션 재시작
    box.classList.add('shake');
    haptic([40, 60, 40]);
  }
}

/* ── 날짜 ───────────────────────────────────────── */
/* 언어가 바뀌면 배열 내용만 갈아끼운다 — 호출부는 그대로 WD[요일] 로 쓴다 */
const WD = ['일', '월', '화', '수', '목', '금', '토'];
i18n.onChange(() => { try { WD.splice(0, 7, ...i18n.weekdayShort()); } catch { /* 그대로 */ } });

export function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function parseKey(k) {
  const [y, m, d] = k.split('-').map(Number);
  return new Date(y, m - 1, d);
}
export function weekdayOf(k) { return WD[parseKey(k).getDay()]; }
export function fmtDate(k, { year = 'auto', weekday = true } = {}) {
  const d = parseKey(k);
  const showYear = year === true || (year === 'auto' && d.getFullYear() !== new Date().getFullYear());
  return i18n.fmtDateParts(d, { year: showYear, weekday });
}
/**
 * 시간 고르는 칸. <input type="time"> 은 앱 언어가 아니라 폰 시스템 언어로 그려져서
 * 앱을 영어로 바꿔도 한국어 폰에서는 '오후 10:00' 으로 나왔다(사용자 신고 2026-10-15).
 * 보이는 글자는 앱 언어로 직접 그리고, 진짜 입력칸은 그 위에 투명하게 덮어
 * 누르면 폰의 시간 고르기 창이 열리게 한다.
 * @returns {{ wrap: HTMLElement, input: HTMLInputElement, refresh: () => void }}
 */
export function timeInput(value, { faceClass = '', faceStyle = '', empty = '', block = false } = {}) {
  const wrap = el('span', { class: 'time-field' + (block ? ' block' : '') });
  const face = el('span', { class: 'time-face ' + faceClass, style: faceStyle });
  const input = el('input', { type: 'time', value: value || '', 'aria-label': empty || '' });
  const refresh = () => {
    face.textContent = input.value ? i18n.fmtClock(input.value) : empty;
    face.classList.toggle('empty', !input.value);
  };
  input.addEventListener('input', refresh);
  input.addEventListener('change', refresh);
  /* 누르면 앱이 직접 그린 시간 고르기 창을 연다 (2026-10-31 사용자 지시 B안: 구글 기본 시계 대신 앱 색·말투로).
     12시간 언어(한국어·영어·아랍어)는 오전/오후 + 1~12, 24시간 언어는 0~23. 고르면 input 에 'HH:MM' 을 넣고
     input·change 이벤트를 낸다 — 부르는 쪽(습관·일정·설정)은 예전 그대로 input 만 본다. */
  input.tabIndex = -1;
  input.setAttribute('aria-hidden', 'true');
  let opening = false;
  const open = async (ev) => {
    ev?.preventDefault?.();
    if (opening) return;
    opening = true;
    try {
      const v = await openTimePicker(input.value, { allowEmpty: !!empty, emptyLabel: empty });
      if (v == null) return;
      input.value = v;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    } finally { opening = false; }
  };  wrap.addEventListener('click', open);
  wrap.setAttribute('role', 'button');
  wrap.tabIndex = 0;
  wrap.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') open(e); });
  wrap.append(face, input);
  refresh();
  return { wrap, input, refresh };
}

/** 날짜·시간 입력칸을 한 번 눌러 바로 달력을 연다 (1.7.5, 사용자 신고 '일정 날짜는 두 번 눌러야 달력이 나와').
    안드로이드 웹뷰는 첫 누름에 초점만 주고 두 번째에 창을 여는 경우가 있다. showPicker 가 있으면 직접 연다. */
export function tapToPick(input) {
  let opening = false;
  input.addEventListener('click', (ev) => {
    if (opening) return;
    opening = true;
    setTimeout(() => { opening = false; }, 600);
    try { if (typeof input.showPicker === 'function') { ev.preventDefault(); input.showPicker(); } }
    catch { /* 못 여는 환경이면 기본 동작 */ }
  });
  return input;
}
export function fmtTime(ts) {
  return i18n.fmtTimeParts(new Date(ts));
}
export function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}
export function addDays(k, n) {
  const d = parseKey(k); d.setDate(d.getDate() + n); return todayKey(d);
}
/** 그 날이 속한 주의 월요일 */
export function weekStart(k) {
  const d = parseKey(k);
  const off = (d.getDay() + 6) % 7;      // 월=0
  d.setDate(d.getDate() - off);
  return todayKey(d);
}
export function relDay(k) {
  const diff = daysBetween(k, todayKey());
  if (diff < 7) return i18n.relDays(diff);
  if (diff < 30) return i18n.relWeeks(Math.floor(diff / 7));
  if (diff < 365) return i18n.relMonths(Math.floor(diff / 30));
  return i18n.relYears(Math.floor(diff / 365));
}
export { WD };

/* ── 기분 색 / 이름 ─────────────────────────────── */
/**
 * mood = { v: -1..1 (불쾌↔유쾌), e: -1..1 (차분↔들뜸) }
 * 색: v로 색상(hue), 반지름으로 채도. 5색 팔레트의 한계를 없애는 연속 색상.
 */
export function moodColor(mood, { light = null } = {}) {
  if (!mood) return 'var(--card-2)';
  const { v, e } = mood;
  const r = Math.min(1, Math.hypot(v, e));
  // 6(붉음) → 154(초록). 살짝 비선형으로 눌러서 부정 쪽이 확실히 붉게 보이도록.
  const hue = 6 + Math.pow((v + 1) / 2, 1.3) * 148;
  const sat = 22 + r * 52;
  const dark = document.documentElement.dataset.theme === 'dark';
  const lit = light ?? (dark ? 40 + (e + 1) / 2 * 16 : 56 + (e + 1) / 2 * 14);
  return `hsl(${hue.toFixed(0)} ${sat.toFixed(0)}% ${lit.toFixed(0)}%)`;
}

/* 4분면 × 3단계 = 12가지. "색 5개로는 감정이 다 안 담긴다"는 불만에 대한 답. */
const MOOD_TABLE = {
  hp: ['살짝 들뜬', '기분 좋은', '아주 신나는'],
  lp: ['잔잔한', '편안한', '아주 평온한'],
  hn: ['조금 뒤숭숭한', '불안하고 답답한', '많이 힘든'],
  ln: ['조금 지친', '가라앉은', '많이 지친'],
};
export function moodWord(mood) {
  if (!mood) return t('기록 안 함');
  const r = Math.hypot(mood.v, mood.e);
  if (r < 0.18) return t('그저 그런');
  const key = (mood.e >= 0 ? 'h' : 'l') + (mood.v >= 0 ? 'p' : 'n');
  const idx = r > 0.72 ? 2 : r > 0.42 ? 1 : 0;
  return t(MOOD_TABLE[key][idx]);
}
/** 4분면 이름 (인사이트에서 묶어 볼 때) — 값 자체는 한국어 원형으로 쓰고, 화면엔 t() 를 거친다 */
export function moodQuadrant(mood) {
  if (!mood) return null;
  if (Math.hypot(mood.v, mood.e) < 0.18) return '보통';
  return { hp: '활기', lp: '평온', hn: '긴장', ln: '침체' }[(mood.e >= 0 ? 'h' : 'l') + (mood.v >= 0 ? 'p' : 'n')];
}
export function moodScore(mood) { return mood ? mood.v : null; }

/**
 * 목록에 보여줄 한 줄 요약.
 * 사진만 넣거나 칩만 찍은 글도 "내용 없음"이 아니다 — 그것도 그날의 기록이다.
 */
export function summaryText(e, max = 0, { title = true } = {}) {
  const cut = (s) => (max && s.length > max ? s.slice(0, max) + '…' : s);
  const body = (e.body || '').replace(/\s+/g, ' ').trim();
  if (body) return cut(body);
  // 본문이 비어도 제목은 사람이 직접 쓴 글이다. 사진·칩보다 먼저 온다.
  const ttl = (e.title || '').replace(/\s+/g, ' ').trim();
  if (title && ttl) return cut(ttl);
  const bits = [];
  if (e.photos?.length) bits.push(t('사진 {n}장', { n: e.photos.length }));
  if (e.chips?.length) bits.push(e.chips.slice(0, 3).map((c) => t(c)).join(' · '));
  if (e.mood) bits.push(t('{기분} 하루', { 기분: moodWord(e.mood) }));
  if (bits.length) return bits.join(' · ');
  // 제목을 이미 따로 보여주는 화면이라면 같은 말을 두 번 쓰지 않는다.
  return ttl ? '' : t('아직 비어 있어요');
}

/* ── 시간 고르기 창 (2026-10-31, 사용자 지시 B안 '누르는 숫자판') ─────────────
   시트 위에도 뜰 수 있게 #sheetRoot 가 아닌 따로 띄운다 (일정 고치기 시트 위에서 열린다).
   돌려 고르는 바퀴 대신 누르는 판: 작은 화면에서도 한 칸 어긋나지 않는다. 분은 5분 칸 + ∓1분. */
let tpCloser = null;
export function closeTimePicker() { if (!tpCloser) return false; tpCloser(null); return true; }
function hour12() {
  try { const hc = new Intl.DateTimeFormat(i18n.locale(), { hour: 'numeric' }).resolvedOptions().hourCycle; return hc === 'h12' || hc === 'h11'; }
  catch { return false; }
}
function dayPeriods() {
  const pick = (h) => {
    try { return new Intl.DateTimeFormat(i18n.locale(), { hour: 'numeric', hour12: true }).formatToParts(new Date(2024, 0, 1, h)).find((p) => p.type === 'dayPeriod')?.value || (h < 12 ? 'AM' : 'PM'); }
    catch { return h < 12 ? 'AM' : 'PM'; }
  };
  return [pick(9), pick(21)];
}
export function openTimePicker(value, { title = '', allowEmpty = false, emptyLabel = '' } = {}) {
  closeTimePicker();
  return new Promise((resolve) => {
    const [h0, m0] = String(value || '').split(':').map(Number);
    let H = Number.isFinite(h0) ? h0 : 9;
    let M = Number.isFinite(m0) ? m0 : 0;
    const is12 = hour12();
    const root = el('div', { class: 'tp-root' });
    const scrim = el('div', { class: 'tp-scrim' });
    const box = el('div', { class: 'tp-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title || t('시간 고르기') });
    const big = el('div', { class: 'tp-big', 'aria-live': 'polite' });
    const chips = el('div', { class: 'tp-chips' });
    const seg = el('div', { class: 'tp-seg' });
    const hours = el('div', { class: 'tp-grid' });
    const mins = el('div', { class: 'tp-grid' });
    const minHead = el('div', { class: 'tp-lab tp-minhead' });
    const pad = (n) => String(n).padStart(2, '0');
    const val = () => `${pad(H)}:${pad(M)}`;
    const paint = () => {
      big.textContent = i18n.fmtClock(val());
      seg.querySelectorAll('button').forEach((b, i) => b.classList.toggle('on', (H >= 12) === (i === 1)));
      hours.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.h === (is12 ? (H % 12 || 12) : H)));
      mins.querySelectorAll('button').forEach((b) => b.classList.toggle('on', +b.dataset.m === M));
      chips.querySelectorAll('button').forEach((b) => b.classList.toggle('on', b.dataset.v === val()));
    };
    for (const [k, v] of [['아침', '07:00'], ['점심', '12:30'], ['저녁', '19:00'], ['자기 전', '22:00']]) {
      const b = el('button', { class: 'tp-chip', type: 'button', 'data-v': v }, `${esc(t(k))} <b>${esc(i18n.fmtClock(v))}</b>`);
      b.addEventListener('click', () => { [H, M] = v.split(':').map(Number); paint(); haptic?.(6); });
      chips.append(b);
    }
    if (is12) {
      dayPeriods().forEach((lab, i) => {
        const b = el('button', { type: 'button' }, esc(lab));
        b.addEventListener('click', () => { const pm = i === 1; if ((H >= 12) !== pm) H = (H + 12) % 24; paint(); });
        seg.append(b);
      });
    }
    const hs = is12 ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : Array.from({ length: 24 }, (_, i) => i);
    for (const h of hs) {
      const b = el('button', { class: 'tp-n', type: 'button', 'data-h': String(h) }, is12 ? String(h) : pad(h));
      b.addEventListener('click', () => { H = is12 ? ((h % 12) + (H >= 12 ? 12 : 0)) : h; paint(); });
      hours.append(b);
    }
    for (let m = 0; m < 60; m += 5) {
      const b = el('button', { class: 'tp-n', type: 'button', 'data-m': String(m) }, pad(m));
      b.addEventListener('click', () => { M = m; paint(); });
      mins.append(b);
    }
    const step = (d) => { const tot = (H * 60 + M + d + 1440) % 1440; H = Math.floor(tot / 60); M = tot % 60; paint(); };
    const minus = el('button', { class: 'tp-step', type: 'button', dir: 'ltr', 'aria-label': t('1분 빼기') }, '−1');
    const plus1 = el('button', { class: 'tp-step', type: 'button', dir: 'ltr', 'aria-label': t('1분 더하기') }, '+1');
    minus.addEventListener('click', () => step(-1)); plus1.addEventListener('click', () => step(1));
    minHead.append(el('span', {}, esc(t('분'))), el('span', { class: 'tp-steps' }), );
    minHead.lastChild.append(minus, plus1);
    const done = (v) => {
      if (!tpCloser) return;
      tpCloser = null;
      root.classList.remove('on');
      setTimeout(() => root.remove(), 200);
      resolve(v);
    };
    tpCloser = done;
    const btns = el('div', { class: 'tp-btns' });
    if (allowEmpty) {
      const e = el('button', { class: 'btn btn-ghost tp-empty', type: 'button' }, esc(emptyLabel || t('지우기')));
      e.addEventListener('click', () => done(''));
      btns.append(e);
    }
    const cancel = el('button', { class: 'btn btn-ghost', type: 'button' }, esc(t('취소')));
    const ok = el('button', { class: 'btn btn-primary', type: 'button' }, esc(t('확인')));
    cancel.addEventListener('click', () => done(null));
    ok.addEventListener('click', () => done(val()));
    btns.append(cancel, ok);
    scrim.addEventListener('click', () => done(null));
    box.append(el('div', { class: 'sheet-grip' }));
    if (title) box.append(el('div', { class: 'sheet-title' }, esc(title)));
    box.append(big, chips);
    if (is12) box.append(seg);
    box.append(el('div', { class: 'tp-lab' }, esc(t('시'))), hours, minHead, mins, btns);
    root.append(scrim, box);
    document.body.append(root);
    paint();
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('on')));
    setTimeout(() => ok.focus({ preventScroll: true }), 50);
  });
}