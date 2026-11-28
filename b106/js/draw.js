/* ===========================================================
   draw.js — 손으로 그리기 (2026-11-27 사용자 '서버가 필요 없는 기능을 만들어 배포', 그림일기 앱인데 직접 그리는 기능이 없었다)
   · 쓰기 › 사진 추가 › '그림 그리기' → 종이에 손가락으로 그린다 → [넣기]면 사진 한 장(JPEG)으로 일기에 들어간다.
     사진과 똑같이 저장되므로 백업·PDF·사진 배치·지우기는 지금 사진 길을 그대로 탄다 (새 저장 모양 없음).
   · 도구: 펜 색 9가지 · 굵기 3단계 · 지우개 · 되돌리기 · 모두 지우기. 그린 것이 있으면 나갈 때 한 번 묻는다.
   · 화면 끝 몸짓(뒤로)에 먹히지 않게 종이를 가장자리에서 띄운다. 손가락 하나만 그린다(두 번째 손가락은 무시).
   · 모든 것은 폰 안에서만 — 서버·권한 필요 없음. 무료.
   =========================================================== */
import { el, esc, icon, toast } from './ui.js';
import { t } from './i18n.js';

const COLORS = ['#2b2622', '#8a5a3b', '#e04b3a', '#f39a3b', '#f2cf45', '#4caf6a', '#3d7be0', '#8e5cc8', '#f28bb3'];
const SIZES = [3, 7, 14];
const PAPER = '#fffdf8';
const OUT = 1080;                                // 넣을 그림 크기(정사각형, 픽셀)

let cssDone = false;
function ensureCss() {
  if (cssDone) return; cssDone = true;
  const st = document.createElement('style');
  st.textContent = `
.drw-layer{position:fixed;inset:0;z-index:330;background:#efe9df;color:#2b2622;display:flex;flex-direction:column;padding:calc(env(safe-area-inset-top,0px) + 6px) 0 calc(env(safe-area-inset-bottom,0px) + 12px);touch-action:none;-webkit-user-select:none;user-select:none}
.drw-top{display:flex;align-items:center;justify-content:space-between;height:48px;padding:0 16px}
.drw-top button{background:none;border:0;font:inherit;font-size:15px;font-weight:700;padding:8px 6px;color:#2b2622}
.drw-top .drw-ok{color:#b5652f}
.drw-tt{font-size:16px;font-weight:800}
.drw-stage{flex:1;display:flex;align-items:center;justify-content:center;min-height:0;padding:8px 0}
.drw-paper{position:relative;background:${PAPER};border-radius:14px;box-shadow:0 6px 22px rgba(60,40,20,.16);touch-action:none;overflow:hidden}
.drw-paper canvas{display:block;width:100%;height:100%;touch-action:none}
.drw-tools{display:flex;flex-direction:column;gap:10px;padding:6px 28px 0}
.drw-row{display:flex;align-items:center;justify-content:center;gap:9px;flex-wrap:wrap}
.drw-colors{gap:6px;flex-wrap:nowrap}
.drw-c{--d:min(28px,calc((100vw - 104px) / 9));width:var(--d);height:var(--d);flex:0 0 var(--d);border-radius:50%;border:2px solid rgba(0,0,0,.08);padding:0}
.drw-c.on{box-shadow:0 0 0 3px #efe9df,0 0 0 5px #2b2622}
.drw-s{width:40px;height:36px;border-radius:12px;border:1px solid #d8cfc2;background:#fff;display:flex;align-items:center;justify-content:center;padding:0}
.drw-s i{display:block;border-radius:50%;background:#2b2622}
.drw-s.on,.drw-b.on{border-color:#2b2622;box-shadow:inset 0 0 0 1px #2b2622}
.drw-b{height:36px;border-radius:12px;border:1px solid #d8cfc2;background:#fff;font:inherit;font-size:13px;font-weight:700;color:#2b2622;display:flex;align-items:center;gap:5px;padding:0 11px}
.drw-b svg{width:17px;height:17px;fill:none;stroke:currentColor;stroke-width:1.9;stroke-linecap:round;stroke-linejoin:round}
.drw-b:disabled{opacity:.4}
.drw-ask{position:absolute;inset:0;background:rgba(30,20,10,.45);display:flex;align-items:center;justify-content:center;z-index:2}
.drw-ask-box{background:#fffdf8;border-radius:18px;padding:20px 18px 14px;width:min(86vw,320px);text-align:center}
.drw-ask-box p{margin:0 0 14px;font-weight:700;font-size:15px;line-height:1.5}
.drw-ask-box button{display:block;width:100%;margin-top:8px;height:44px;border-radius:12px;border:0;font:inherit;font-weight:800;font-size:15px}
.drw-ask-box .yes{background:#d9534f;color:#fff}
.drw-ask-box .no{background:#efe9df;color:#2b2622}
`;
  document.head.append(st);
}

/** 그리기 창을 연다. [넣기]면 JPEG dataURL, 취소면 null */
export function openDraw() {
  ensureCss();
  return new Promise((resolve) => {
    const L = el('div', { class: 'drw-layer' });
    L.innerHTML = `<div class="drw-top"><button type="button" class="drw-cancel">${esc(t('취소'))}</button><div class="drw-tt">${esc(t('그림 그리기'))}</div><button type="button" class="drw-ok">${esc(t('넣기'))}</button></div>
      <div class="drw-stage"><div class="drw-paper"><canvas></canvas></div></div>
      <div class="drw-tools"><div class="drw-row drw-colors"></div><div class="drw-row drw-sizes"></div></div>`;
    const paper = L.querySelector('.drw-paper'), cv = L.querySelector('canvas');
    const colorsRow = L.querySelector('.drw-colors'), sizesRow = L.querySelector('.drw-sizes');
    document.body.append(L);

    /* ── 상태 ── */
    const strokes = [];                          // { c, w, er, pts:[[x,y],…] } — 종이 기준 0~1 좌표
    let color = COLORS[0], size = SIZES[1], eraser = false, cur = null, pid = null;
    let W = 0, dpr = 1, ctx = null;

    /* ── 종이 크기: 가장자리 몸짓을 피해 양옆 28px 이상 띄운 정사각형 ── */
    const layout = () => {
      const stage = L.querySelector('.drw-stage').getBoundingClientRect();
      const side = Math.floor(Math.max(160, Math.min(window.innerWidth - 56, stage.height - 16, 560)));
      paper.style.width = side + 'px'; paper.style.height = side + 'px';
      W = side; dpr = Math.min(3, window.devicePixelRatio || 1);
      cv.width = Math.round(side * dpr); cv.height = Math.round(side * dpr);
      ctx = cv.getContext('2d');
      redraw();
    };
    const stroke = (g, s, scale) => {
      const p = s.pts; if (!p.length) return;
      g.save();
      g.globalCompositeOperation = 'source-over';
      g.strokeStyle = s.er ? PAPER : s.c; g.fillStyle = g.strokeStyle;
      g.lineWidth = s.w * scale; g.lineCap = 'round'; g.lineJoin = 'round';
      const px = (q) => [q[0] * g.canvas.width, q[1] * g.canvas.height];   // 점은 종이 기준 0~1, 굵기는 화면 px × scale
      if (p.length === 1) { const [x, y] = px(p[0]); g.beginPath(); g.arc(x, y, (s.w * scale) / 2, 0, Math.PI * 2); g.fill(); g.restore(); return; }
      g.beginPath();
      let [x0, y0] = px(p[0]); g.moveTo(x0, y0);
      for (let i = 1; i < p.length - 1; i++) {        // 가운데 점을 이어 부드럽게
        const [x1, y1] = px(p[i]), [x2, y2] = px(p[i + 1]);
        g.quadraticCurveTo(x1, y1, (x1 + x2) / 2, (y1 + y2) / 2);
      }
      const [xl, yl] = px(p[p.length - 1]); g.lineTo(xl, yl);
      g.stroke(); g.restore();
    };
    const redraw = () => {
      if (!ctx) return;
      ctx.fillStyle = PAPER; ctx.fillRect(0, 0, cv.width, cv.height);
      for (const s of strokes) stroke(ctx, s, cv.width / W);
      paint();
    };

    /* ── 손가락 ── */
    const at = (e) => { const r = cv.getBoundingClientRect(); return [Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))]; };
    cv.addEventListener('pointerdown', (e) => {
      if (pid !== null) return;                  // 두 번째 손가락은 무시
      e.preventDefault(); pid = e.pointerId;
      try { cv.setPointerCapture(pid); } catch { /* */ }
      cur = { c: color, w: size, er: eraser, pts: [at(e)] };
      strokes.push(cur); redraw();
    });
    cv.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid || !cur) return;
      e.preventDefault();
      const evs = typeof e.getCoalescedEvents === 'function' ? e.getCoalescedEvents() : [e];
      for (const q of (evs.length ? evs : [e])) cur.pts.push(at(q));
      redraw();
    });
    const end = (e) => { if (e.pointerId !== pid) return; pid = null; cur = null; paint(); };
    cv.addEventListener('pointerup', end); cv.addEventListener('pointercancel', end);

    /* ── 도구 ── */
    for (const c of COLORS) {
      const b = el('button', { class: 'drw-c', type: 'button', 'aria-label': t('색'), style: `background:${c}` });
      b.dataset.c = c;
      b.addEventListener('click', () => { color = c; eraser = false; paint(); });
      colorsRow.append(b);
    }
    SIZES.forEach((s) => {
      const b = el('button', { class: 'drw-s', type: 'button', 'aria-label': t('굵기') }, `<i style="width:${Math.max(4, s)}px;height:${Math.max(4, s)}px"></i>`);
      b.dataset.s = s;
      b.addEventListener('click', () => { size = s; paint(); });
      sizesRow.append(b);
    });
    const er = el('button', { class: 'drw-b drw-er', type: 'button' }, esc(t('지우개')));
    er.addEventListener('click', () => { eraser = !eraser; paint(); });
    const un = el('button', { class: 'drw-b drw-undo', type: 'button' }, icon('undo') + `<span>${esc(t('실행 취소'))}</span>`);
    un.addEventListener('click', () => { if (strokes.length) { strokes.pop(); redraw(); } });
    const clr = el('button', { class: 'drw-b drw-clear', type: 'button' }, esc(t('모두 지우기')));
    clr.addEventListener('click', () => { if (!strokes.length) return; ask(t('그린 것을 모두 지울까요?'), t('모두 지우기'), () => { strokes.length = 0; redraw(); }); });
    sizesRow.append(er, un, clr);
    function paint() {
      for (const b of colorsRow.children) b.classList.toggle('on', !eraser && b.dataset.c === color);
      for (const b of sizesRow.querySelectorAll('.drw-s')) b.classList.toggle('on', +b.dataset.s === size);
      er.classList.toggle('on', eraser);
      un.disabled = !strokes.length; clr.disabled = !strokes.length;
    }

    /* ── 묻기(창 안에서 — 다른 창 아래로 숨지 않게) ── */
    function ask(text, yes, onYes) {
      const a = el('div', { class: 'drw-ask' });
      a.innerHTML = `<div class="drw-ask-box"><p>${esc(text)}</p><button type="button" class="yes">${esc(yes)}</button><button type="button" class="no">${esc(t('계속 그리기'))}</button></div>`;
      a.querySelector('.yes').addEventListener('click', () => { a.remove(); onYes(); });
      a.querySelector('.no').addEventListener('click', () => a.remove());
      L.append(a);
    }

    /* ── 끝내기 ── */
    const onResize = () => layout();
    const done = (val) => { window.removeEventListener('resize', onResize); L.remove(); window.__hkVideoBack = null; resolve(val); };
    const cancel = () => {
      if (L.querySelector('.drw-ask')) { L.querySelector('.drw-ask').remove(); return; }
      if (!strokes.length) { done(null); return; }
      ask(t('그린 그림을 버릴까요?'), t('버리기'), () => done(null));
    };
    window.__hkVideoBack = () => { cancel(); return true; };   // 뒤로 가기 (app.js 가 먼저 묻는다)
    L.querySelector('.drw-cancel').addEventListener('click', cancel);
    L.querySelector('.drw-ok').addEventListener('click', () => {
      if (!strokes.length) { toast(t('먼저 그림을 그려 주세요.')); return; }
      const out = document.createElement('canvas'); out.width = OUT; out.height = OUT;
      const g = out.getContext('2d');
      g.fillStyle = PAPER; g.fillRect(0, 0, OUT, OUT);
      for (const s of strokes) stroke(g, s, OUT / W);
      let url = '';
      try { url = out.toDataURL('image/jpeg', 0.9); } catch { url = ''; }
      if (!/^data:image\//.test(url)) { toast(t('그림을 넣지 못했어요. 다시 해 주세요.')); return; }
      done(url);
    });
    window.addEventListener('resize', onResize);
    requestAnimationFrame(layout);
    /* 시험용 */
    L._qa = { strokes, layout, get W() { return W; } };
  });
}
