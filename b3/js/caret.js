/* ===========================================================
   caret.js — 쓰는 자리가 키보드·툴바에 가리지 않게 (1.7.2, 사용자 신고)
   "쓰다가 다시 쓰려고 화면을 누르면 쓸 자리가 키보드에 가려 안 보인다"

   왜 생기나
   · 본문 입력칸은 글 길이만큼 늘어나(autogrow) 칸 안에서는 스크롤이 없고 화면 전체가 스크롤된다.
     웹뷰는 키보드가 뜨면 '입력칸'을 보이게 맞추는데, 칸이 화면보다 길면 이미 보인다고 보고 움직이지 않는다.
   · 뒤로 가기로 키보드만 내리면 커서(포커스)는 칸에 남아 있다. 그 상태에서 다시 누르면 포커스가 바뀌지 않아
     웹뷰가 아무 맞춤도 하지 않는다.
   · 화면 맨 아래에 붙은 쓰기 툴바(.writebar)는 웹뷰가 모른다 — 커서가 툴바 뒤에 숨어도 '보인다'고 본다.

   어떻게
   · 칸을 누를 때, 키보드가 뜨거나 내려가 화면 높이가 바뀔 때, 글을 쓰다 멈출 때
     커서의 실제 위치(거울 요소로 잰다)를 구해, 툴바 위 여유 자리 밖이면 그만큼만 화면을 굴린다.
   · 키보드는 0.3초쯤 걸려 올라오므로 몇 번 나눠서 다시 본다.
   =========================================================== */

const MARGIN = 28;          // 커서 아래로 남겨 둘 여유 (한 줄 정도)
const MIRROR_PROPS = ['boxSizing', 'width', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
  'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth', 'borderStyle',
  'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'fontVariant', 'fontStretch', 'lineHeight', 'letterSpacing',
  'wordSpacing', 'textTransform', 'textIndent', 'tabSize', 'direction', 'textAlign', 'whiteSpace', 'wordBreak', 'overflowWrap'];

let mirror = null;

/** 입력칸 안에서 커서의 위·아래 (화면 좌표). 못 재면 null */
export function caretRect(ta) {
  try {
    if (!ta || ta.selectionEnd == null) return null;
    const r = ta.getBoundingClientRect();
    if (ta.tagName === 'INPUT') return { top: r.top, bottom: r.bottom };
    const cs = getComputedStyle(ta);
    if (!mirror) {
      mirror = document.createElement('div');
      mirror.setAttribute('aria-hidden', 'true');
      mirror.style.cssText = 'position:absolute;left:-9999px;top:0;visibility:hidden;overflow:hidden;height:auto;';
    }
    for (const p of MIRROR_PROPS) mirror.style[p] = cs[p];
    mirror.style.whiteSpace = 'pre-wrap';
    mirror.style.overflowWrap = cs.overflowWrap === 'normal' ? 'break-word' : cs.overflowWrap;
    mirror.textContent = ta.value.slice(0, ta.selectionEnd);
    const mark = document.createElement('span');
    mark.textContent = '\u200b';
    mirror.append(mark);
    document.body.append(mirror);
    const lh = parseFloat(cs.lineHeight) || parseFloat(cs.fontSize) * 1.6 || 24;
    const y = mark.offsetTop - ta.scrollTop;
    mirror.remove();
    const top = r.top + y;
    return { top, bottom: top + lh };
  } catch { return null; }
}

/** 지금 화면에서 글자가 보이는 세로 범위 (위 막대 아래 ~ 쓰기 툴바/키보드 위) */
function visibleBand() {
  const vv = window.visualViewport;
  let top = vv ? vv.offsetTop : 0;
  let bottom = vv ? vv.offsetTop + vv.height : window.innerHeight;
  const bar = document.querySelector('.writebar');
  /* 툴바는 position:fixed 라 offsetParent 가 늘 null 이다 — 크기로 보이는지 판단한다 */
  if (bar) { const b = bar.getBoundingClientRect(); if (b.height && b.top > top && b.top < bottom) bottom = b.top; }
  const tb = document.querySelector('.topbar');
  if (tb) { const b = tb.getBoundingClientRect(); if (getComputedStyle(tb).position !== 'static' && b.bottom > top && b.bottom < bottom) top = b.bottom; }
  return { top, bottom };
}

/** 커서가 보이는 범위 밖이면 그만큼만 굴린다. 굴렸으면 true */
export function reveal(ta = document.activeElement) {
  if (!ta || !(ta.tagName === 'TEXTAREA' || ta.tagName === 'INPUT')) return false;
  const c = caretRect(ta);
  if (!c) return false;
  const band = visibleBand();
  if (band.bottom - band.top < 60) return false;   // 화면이 아직 정리되지 않았다
  let dy = 0;
  if (c.bottom + MARGIN > band.bottom) dy = c.bottom + MARGIN - band.bottom;
  else if (c.top - 12 < band.top) dy = c.top - 12 - band.top;
  if (Math.abs(dy) < 2) return false;
  window.scrollBy({ top: Math.round(dy), behavior: 'auto' });
  return true;
}

/** root 안의 입력칸을 지킨다. 해제 함수를 돌려준다 */
export function guard(root) {
  let timers = [];
  let idle = 0;
  const isField = (n) => n && root.contains(n) && (n.tagName === 'TEXTAREA' || (n.tagName === 'INPUT' && /^(text|search|)$/i.test(n.type || '')));
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  /* 키보드가 올라오는 동안 몇 번 나눠서 본다 */
  const soon = () => {
    clear();
    for (const ms of [60, 220, 420, 700]) timers.push(setTimeout(() => { if (isField(document.activeElement)) reveal(document.activeElement); }, ms));
  };
  const onTap = (e) => { if (isField(e.target)) soon(); };
  const onFocus = (e) => { if (isField(e.target)) soon(); };
  const onResize = () => { if (isField(document.activeElement)) soon(); };
  /* 쓰는 중에는 조합(IME)을 방해하지 않도록 손을 멈춘 뒤에 한 번만 본다 */
  const onInput = (e) => {
    if (!isField(e.target)) return;
    clearTimeout(idle);
    idle = setTimeout(() => reveal(e.target), 160);
  };
  root.addEventListener('click', onTap);
  root.addEventListener('focusin', onFocus);
  root.addEventListener('input', onInput);
  window.visualViewport?.addEventListener('resize', onResize);
  window.addEventListener('resize', onResize);
  return () => {
    clear(); clearTimeout(idle);
    root.removeEventListener('click', onTap);
    root.removeEventListener('focusin', onFocus);
    root.removeEventListener('input', onInput);
    window.visualViewport?.removeEventListener('resize', onResize);
    window.removeEventListener('resize', onResize);
  };
}

/* ── 키보드가 떠 있는 동안 아래 탭바 숨기기 (1.7.2, 폰 점검) ──────────────
   웹뷰가 키보드만큼 줄어들면 화면 맨 아래에 붙은 탭바가 키보드 바로 위로 올라와
   찾기·일정 입력 화면의 절반 가까이를 가렸다. 입력칸에 커서가 있고 화면 높이가
   평소보다 크게(25% 넘게) 줄었을 때만 키보드로 본다 — 회전·분할 화면과 헷갈리지 않게. */
export function watchKeyboard() {
  let full = window.innerHeight;
  const typing = () => {
    const n = document.activeElement;
    if (!n) return false;
    if (n.isContentEditable || n.tagName === 'TEXTAREA') return true;
    return n.tagName === 'INPUT' && /^(text|search|email|url|tel|password|number|)$/i.test(n.type || '');
  };
  const update = () => {
    const h = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    if (!typing() && h > full * 0.9) full = Math.max(h, window.innerHeight);
    if (h > full) full = h;
    document.documentElement.classList.toggle('kb-up', typing() && h < full * 0.75);
  };
  window.visualViewport?.addEventListener('resize', update);
  window.addEventListener('resize', update);
  document.addEventListener('focusin', () => setTimeout(update, 50));
  document.addEventListener('focusout', () => setTimeout(update, 160));
  window.addEventListener('orientationchange', () => { full = 0; setTimeout(update, 400); });
}
