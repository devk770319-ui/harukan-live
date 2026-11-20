/* ===========================================================
   homeorder.js — 홈 상자 순서 바꾸기 (2026-11-14 사용자: '홈 화면 박스들을 길게 눌러서 위아래 순서 변경',
   이어서 '따로 화면 말고 그냥 홈 화면에서 아래로 내려서 바꾸면 편하겠다')
   · 상자를 길게 누르면(0.45초) 살짝 떠오르고, 그대로 끌어 위아래로 옮긴다. 다른 상자는 비켜 준다
   · 화면 위·아래 끝으로 끌면 저절로 스크롤된다. 손을 떼면 그 자리에 놓이고 순서가 저장된다(settings.homeOrder)
   · 지금 홈에 안 보이는 상자(습관이 없을 때 등)는 저장할 때 원래 앞뒤 자리를 지킨다
   · 인사·알림 허용·이번 주 정리처럼 위에 고정된 안내 카드는 옮기지 않는다
   =========================================================== */
import * as store from './store.js';
import { haptic } from './ui.js';

export const BLOCKS = ['today', 'habits', 'opened', 'sealed', 'letter', 'recall', 'saved', 'week', 'recent'];
const DEFAULT = BLOCKS;
const HOLD_MS = 450;

/** 저장한 순서 + 새로 생긴 상자는 기본 순서의 앞 상자 뒤에 끼워 넣는다 */
export function order() {
  const saved = (store.getSettings().homeOrder || []).filter((k) => DEFAULT.includes(k));
  if (!saved.length) return DEFAULT.slice();
  const out = saved.filter((k, i) => saved.indexOf(k) === i);
  DEFAULT.forEach((k, i) => {
    if (out.includes(k)) return;
    const prev = DEFAULT.slice(0, i).reverse().find((p) => out.includes(p));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, k);
  });
  return out;
}

/* 상자 하나 = 같은 이름표를 단 이어진 요소들 (오늘 쓴 글이 여러 편이면 카드 여러 장 + '한 편 더 쓰기') */
function groups(root) {
  const G = [];
  for (const n of root.children) {
    const k = n.dataset?.blk; if (!k) continue;
    const last = G[G.length - 1];
    if (last && last.key === k) last.nodes.push(n); else G.push({ key: k, nodes: [n] });
  }
  return G;
}

/** 홈을 다 그린 뒤: 상자들을 저장한 순서로 다시 놓는다 (상자 뒤에 오던 다른 것은 그대로 뒤에) */
export function apply(root) {
  const G = groups(root);
  if (G.length < 2) return;
  const lastNodes = G[G.length - 1].nodes;
  const after = lastNodes[lastNodes.length - 1].nextSibling;
  const ord = order();
  const sorted = G.slice().sort((a, b) => ord.indexOf(a.key) - ord.indexOf(b.key) || G.indexOf(a) - G.indexOf(b));
  if (sorted.every((g, i) => g === G[i])) return;
  for (const g of sorted) for (const n of g.nodes) root.insertBefore(n, after);
}

function scroller(el) {
  for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
    const s = getComputedStyle(p).overflowY;
    if ((s === 'auto' || s === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return document.scrollingElement || document.documentElement;
}

/* 안 보이는 상자는 지금 저장된 순서에서의 앞 상자 뒤에 둔다 */
function mergeHidden(shown) {
  const prevOrd = order();
  const out = shown.slice();
  prevOrd.forEach((k, i) => {
    if (out.includes(k)) return;
    const prev = prevOrd.slice(0, i).reverse().find((p) => out.includes(p));
    out.splice(prev ? out.indexOf(prev) + 1 : 0, 0, k);
  });
  return out;
}

/** 상자를 길게 누른 채 끌어 옮기기
    · 끌기 시작할 때 상자들 위치를 한 번만 재 두고, 끄는 동안은 화면 배치를 다시 계산하지 않는다(폰에서 뻑뻑하던 원인).
    · 든 상자는 손가락에 바로 붙어 움직이고(애니메이션 없음), 다른 상자는 비켜 주기만 한다. 실제 순서는 손을 뗄 때 한 번에 바꾼다.
    (2026-11-14 사용자: '블럭이 자연스럽지 않고 뻑뻑하고 이상하게 움직인다') */
export function bindLongPress(root) {
  ensureCss();
  let press = null, drag = null;
  const cancelPress = () => { if (press) { clearTimeout(press.timer); press = null; } };

  root.addEventListener('pointerdown', (e) => {
    if (drag || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const node = e.target.closest('[data-blk]');
    if (!node || node.parentElement !== root) return;
    if (e.target.closest('.hb-list, input, textarea, [contenteditable]')) return;   // 습관 줄은 자체 길게 누르기가 있다
    cancelPress();
    press = { id: e.pointerId, x: e.clientX, y: e.clientY, key: node.dataset.blk, timer: setTimeout(() => lift(e.pointerId), HOLD_MS) };
  });

  const span = (g) => { const a = g.nodes[0].getBoundingClientRect(), b = g.nodes[g.nodes.length - 1].getBoundingClientRect(); return { top: a.top, bottom: b.bottom }; };
  const setT = (g, y, extra = '') => { for (const n of g.nodes) n.style.transform = y || extra ? `translate3d(0,${y}px,0)${extra}` : ''; };

  function lift(pid) {
    if (!press || press.id !== pid) return;
    const G = groups(root);
    const i = G.findIndex((x) => x.key === press.key); if (i < 0) { press = null; return; }
    const sc = scroller(root);
    const geo = G.map((g) => span(g));
    /* 든 상자가 빠진 자리 크기 = 다음 상자까지의 거리(사이 여백 포함). 맨 아래면 위 상자와의 거리 */
    const slot = G[i + 1] ? geo[i + 1].top - geo[i].top : (G[i - 1] ? geo[i].bottom - geo[i - 1].bottom : geo[i].bottom - geo[i].top);
    drag = { pid, G, i, j: i, geo, slot, y0: press.y, y: press.y, s0: sc.scrollTop, sc, raf: 0, frame: 0 };
    press = null;
    haptic(20);
    try { root.setPointerCapture(pid); } catch { /* */ }
    document.documentElement.classList.add('ho-dragging');
    G.forEach((g, k) => { for (const n of g.nodes) { n.classList.add(k === i ? 'ho-lift' : 'ho-other'); } });
    drag.raf = requestAnimationFrame(tick);
  }

  /* 한 화면 그릴 때마다 한 번: 손가락 위치 + 스크롤로 든 상자를 옮기고, 들어갈 자리를 정해 이웃을 비켜 준다 */
  function tick() {
    if (!drag) return;
    const d = drag;
    /* 화면 끝에서 저절로 스크롤 */
    const edge = 96, bottomBar = (document.getElementById('tabbar')?.getBoundingClientRect().height || 64) + 16;
    let v = 0;
    if (d.y < edge) v = -Math.min(18, Math.ceil((edge - d.y) / 5));
    else if (d.y > innerHeight - bottomBar - edge) v = Math.min(18, Math.ceil((d.y - (innerHeight - bottomBar - edge)) / 5));
    if (v) d.sc.scrollTop += v;
    const dy = (d.y - d.y0) + (d.sc.scrollTop - d.s0);
    setT(d.G[d.i], dy, ' scale(1.02)');
    /* 들어갈 자리: 든 상자의 가운데가 이웃 상자의 가운데를 넘으면 */
    const c = (d.geo[d.i].top + d.geo[d.i].bottom) / 2 + dy;
    let j = d.i;
    for (let k = d.i + 1; k < d.G.length; k++) if (c > (d.geo[k].top + d.geo[k].bottom) / 2) j = k;
    for (let k = d.i - 1; k >= 0; k--) if (c < (d.geo[k].top + d.geo[k].bottom) / 2) j = k;
    if (j !== d.j) {
      d.j = j; haptic(6);
      d.G.forEach((g, k) => {
        if (k === d.i) return;
        const shift = (k > d.i && k <= j) ? -d.slot : (k < d.i && k >= j) ? d.slot : 0;
        setT(g, shift);
      });
    }
    d.raf = requestAnimationFrame(tick);
  }

  root.addEventListener('pointermove', (e) => {
    if (press && e.pointerId === press.id && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 10) cancelPress();
    if (drag && e.pointerId === drag.pid) drag.y = e.clientY;
  });

  const drop = async (e) => {
    if (press && (!e || e.pointerId === press.id)) cancelPress();
    if (!drag || (e && e.pointerId !== drag.pid)) return;
    const d = drag; drag = null;
    cancelAnimationFrame(d.raf);
    /* 지금 보이는 자리(FLIP 처음) */
    const first = d.G.map((g) => g.nodes.map((n) => n.getBoundingClientRect().top));
    /* 실제 순서 바꾸기 */
    if (d.j !== d.i) {
      const g = d.G[d.i];
      if (d.j > d.i) { const tgt = d.G[d.j]; const after = tgt.nodes[tgt.nodes.length - 1].nextSibling; for (const n of g.nodes) root.insertBefore(n, after); }
      else { const tgt = d.G[d.j]; for (const n of g.nodes) root.insertBefore(n, tgt.nodes[0]); }
    }
    document.documentElement.classList.remove('ho-dragging');
    d.G.forEach((g) => { for (const n of g.nodes) { n.classList.remove('ho-lift', 'ho-other'); n.style.transition = 'none'; n.style.transform = ''; } });
    /* 새 자리에서 지금 보이는 자리만큼 되돌려 놓고 → 부드럽게 제자리로 */
    d.G.forEach((g, k) => g.nodes.forEach((n, m) => {
      const off = first[k][m] - n.getBoundingClientRect().top;
      if (Math.abs(off) > 0.5) n.style.transform = `translate3d(0,${off}px,0)`;
    }));
    requestAnimationFrame(() => requestAnimationFrame(() => {
      d.G.forEach((g) => { for (const n of g.nodes) { n.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)'; n.style.transform = ''; } });
      setTimeout(() => d.G.forEach((g) => { for (const n of g.nodes) n.style.transition = ''; }), 260);
    }));
    haptic(10);
    /* 손을 떼며 생기는 눌림(click)은 한 번 막는다 */
    const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); };
    window.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener('click', stop, { capture: true }), 500);
    const full = mergeHidden(groups(root).map((x) => x.key));
    if (full.join() !== order().join()) {
      await store.saveSettings({ homeOrder: full.join() === DEFAULT.join() ? [] : full }, { silent: true });
      try { (await import('./analytics.js')).design('home:order:' + full.slice(0, 3).join('_')); } catch { /* */ }
    }
  };
  root.addEventListener('pointerup', drop);
  root.addEventListener('pointercancel', drop);
  root.addEventListener('contextmenu', (e) => { if (e.target.closest('[data-blk]') && !e.target.closest('.hb-list')) e.preventDefault(); });
  /* 끄는 동안 화면이 같이 스크롤되지 않게 (터치 이동을 막아야 브라우저가 끌기를 가로채지 않는다) */
  root.addEventListener('touchmove', (e) => { if (drag && e.cancelable) e.preventDefault(); }, { passive: false });
}
export function reset() { return store.saveSettings({ homeOrder: [] }); }

let cssDone = false;
function ensureCss() {
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
[data-blk]{-webkit-touch-callout:none}
html.ho-dragging, html.ho-dragging *{user-select:none;-webkit-user-select:none}
/* 끄는 동안: 든 상자는 애니메이션 없이 손가락에 바로 붙고, 이웃 상자만 부드럽게 비켜 준다. 무거운 배경 흐림은 잠시 끈다 */
html.ho-dragging [data-blk], html.ho-dragging [data-blk] *{backdrop-filter:none!important;-webkit-backdrop-filter:none!important}
.ho-lift{position:relative;z-index:50;transition:none!important;will-change:transform;box-shadow:0 18px 40px rgba(60,40,20,.26)!important;border-radius:var(--radius,18px)}
.ho-other{transition:transform .2s cubic-bezier(.2,.8,.2,1)!important;will-change:transform}`;
  document.head.append(s);
}
