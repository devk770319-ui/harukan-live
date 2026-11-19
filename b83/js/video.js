/* ===========================================================
   video.js — 일기에 동영상 넣기 (2026-11-14 사용자 '동영상 넣기 기능도 넣어줘', 1.8.9 앱부터)
   · 동영상은 앱 안쪽(PhotoPick.pickVideo/captureVideo)이 하루칸 전용 공간(files/videos)에 파일로 복사한다
   · 일기에는 { id, path, thumb(사진 id — 잠금을 켜면 암호화), dur(ms), w, h, size } 만 적는다 (entry.videos)
   · 한 일기에 3개, 한 개 100MB, 찍기는 1분까지. 백업 파일·구글 자동 백업에는 들어가지 않는다(새 폰 옮기기에는 들어감)
   =========================================================== */
import * as store from './store.js';
import { el, esc, icon, toast } from './ui.js';
import { t } from './i18n.js';

/* 안드로이드 웹뷰가 첫 장면 전에 띄우는 회색 ▶ 대기 그림 대신 투명 그림 (2026-11-15) */
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
export const MAX_PER_ENTRY = 3, MAX_MB = 100, MAX_SEC = 60;
const PP = () => window.Capacitor?.Plugins?.PhotoPick;

/** 동영상 부품이 든 앱(1.8.9+)인가 — 옛 앱의 플러그인에는 pickVideo 가 없다 */
export function available() {
  try {
    const h = (window.Capacitor?.PluginHeaders || []).find((x) => x.name === 'PhotoPick');
    return !!h && h.methods.some((m) => m.name === 'pickVideo');
  } catch { return false; }
}
export function src(path) {
  try { return window.Capacitor?.convertFileSrc ? window.Capacitor.convertFileSrc('file://' + path) : path; } catch { return path; }
}
export function fmtDur(ms) {
  const s = Math.max(0, Math.round((ms || 0) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** 앨범에서 고르기 / 찍기 → 일기에 붙일 기록 (실패·취소면 null) */
export async function pick(how = 'album') {
  try { window.__hkOutAt = Date.now(); } catch { /* 다른 화면으로 나갔다 와도 잠그지 않게 */ }
  let r;
  try { r = how === 'camera' ? await PP().captureVideo({ maxSec: MAX_SEC }) : await PP().pickVideo({ maxMb: MAX_MB }); }
  catch (e) { console.error('동영상', e); toast(how === 'camera' ? t('카메라를 열지 못했어요.') : t('동영상을 넣지 못했어요.')); return null; }
  if (!r || r.cancelled) return null;
  if (r.tooBig) { toast(t('{n}MB보다 큰 동영상은 넣을 수 없어요.', { n: MAX_MB })); return null; }
  if (r.failed || !r.path) { toast(t('동영상을 넣지 못했어요.')); return null; }
  const thumb = r.thumb ? await store.putPhoto(r.thumb) : null;
  return { id: 'v_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), path: r.path, thumb, dur: r.dur || 0, w: r.w || 0, h: r.h || 0, size: r.size || 0 };
}

/* ── 자르기 (2026-11-14 사용자 '원하는 부분만 편집해서 올리기') ──
   고르거나 찍은 직후 띄운다. 양쪽 손잡이로 남길 구간을 고르면 앱 안쪽(PhotoPick.trimVideo)이 다시 압축하지 않고 잘라 낸다.
   돌려주는 값: 넣을 동영상(잘랐으면 새 파일) / 취소면 null */
function canTrim() {
  try { const h = (window.Capacitor?.PluginHeaders || []).find((x) => x.name === 'PhotoPick'); return !!h && h.methods.some((m) => m.name === 'trimVideo'); } catch { return false; }
}
export function trimUI(v) {
  ensureCss();
  return new Promise((resolve) => {
    const dur = Math.max(1, v.dur || 1);
    let a = 0, b = dur;
    const L = el('div', { class: 'vtr-layer' });
    L.innerHTML = `<div class="vtr-top"><button type="button" class="vtr-cancel">${esc(t('취소'))}</button><div class="vtr-tt">${esc(t('남길 부분 고르기'))}</div><button type="button" class="vtr-ok">${esc(t('넣기'))}</button></div>
      <div class="vtr-stage"></div>
      <div class="vtr-bottom"><div class="vtr-times"></div><div class="vtr-track"><div class="vtr-sel"></div><div class="vtr-head"></div><button type="button" class="vtr-h vtr-ha" aria-label="${esc(t('시작'))}"></button><button type="button" class="vtr-h vtr-hb" aria-label="${esc(t('끝'))}"></button></div>
      <div class="vtr-hint">${esc(t('양쪽 손잡이를 끌어 남길 부분을 골라요.'))}</div></div>`;
    const vd = el('video', { class: 'vtr-video', muted: '', playsinline: '', autoplay: '', preload: 'auto', poster: BLANK });
    vd.addEventListener('loadeddata', () => vd.classList.add('live'), { once: true });
    vd.muted = true; vd.src = src(v.path);
    L.querySelector('.vtr-stage').append(vd);
    document.body.append(L);
    const track = L.querySelector('.vtr-track'), sel = L.querySelector('.vtr-sel'), head = L.querySelector('.vtr-head');
    const ha = L.querySelector('.vtr-ha'), hb = L.querySelector('.vtr-hb'), times = L.querySelector('.vtr-times');
    const draw = () => {
      const pa = a / dur * 100, pb = b / dur * 100;
      sel.style.left = pa + '%'; sel.style.width = (pb - pa) + '%';
      ha.style.left = pa + '%'; hb.style.left = pb + '%';
      times.textContent = `${fmtDur(a)} – ${fmtDur(b)}  ·  ${fmtDur(b - a)}`;
    };
    draw();
    vd.addEventListener('timeupdate', () => {
      const ms = vd.currentTime * 1000;
      head.style.left = Math.min(100, ms / dur * 100) + '%';
      if (ms >= b - 30) { vd.currentTime = a / 1000; vd.play().catch(() => {}); }   // 고른 구간만 되풀이
    });
    let drag = null;
    const msAt = (x) => { const r = track.getBoundingClientRect(); return Math.max(0, Math.min(dur, (x - r.left) / r.width * dur)); };
    for (const [h, k] of [[ha, 'a'], [hb, 'b']]) {
      h.addEventListener('pointerdown', (e) => { e.preventDefault(); drag = k; try { h.setPointerCapture(e.pointerId); } catch { /* */ } vd.pause(); });
      h.addEventListener('pointermove', (e) => {
        if (drag !== k) return;
        const ms = msAt(e.clientX);
        if (k === 'a') a = Math.min(ms, b - 1000); else b = Math.max(ms, a + 1000);
        a = Math.max(0, a); b = Math.min(dur, b);
        draw(); vd.currentTime = (k === 'a' ? a : b) / 1000;   // 손잡이 자리 장면을 바로 보여 준다
      });
      const up = () => { if (drag !== k) return; drag = null; vd.currentTime = a / 1000; vd.play().catch(() => {}); };
      h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    }
    const done = (val) => { try { vd.pause(); vd.removeAttribute('src'); vd.load(); } catch { /* */ } L.remove(); window.__hkVideoBack = null; resolve(val); };
    window.__hkVideoBack = () => { done(null); return true; };
    L.querySelector('.vtr-cancel').addEventListener('click', () => done(null));
    L.querySelector('.vtr-ok').addEventListener('click', async () => {
      if (a < 250 && b > dur - 250) { done(v); return; }        // 그대로
      if (!canTrim()) { done(v); return; }
      const ok = L.querySelector('.vtr-ok'); ok.disabled = true; ok.textContent = t('자르는 중…');
      let r = null;
      try { r = await PP().trimVideo({ path: v.path, startMs: a, endMs: b }); } catch (e) { console.error('자르기', e); }
      if (!r || r.failed || !r.path) { toast(t('자르지 못해 원본 그대로 넣었어요.')); done(v); return; }
      const thumb = r.thumb ? await store.putPhoto(r.thumb) : null;
      if (v.thumb) { try { await store.deletePhoto(v.thumb); } catch { /* */ } }
      try { import('./analytics.js').then((m) => m.design('video:trim', Math.round((b - a) / 1000))); } catch { /* */ }
      done({ ...v, path: r.path, thumb, dur: r.dur || (b - a), w: r.w || v.w, h: r.h || v.h, size: r.size || 0 });
    });
  });
}

/** 파일과 첫 장면 그림을 지운다 */
export async function remove(v) {
  if (!v) return;
  try { await PP()?.deleteVideo({ path: v.path }); } catch { /* */ }
  if (v.thumb) { try { await store.deletePhoto(v.thumb); } catch { /* */ } }
}

/** 동영상 카드 (첫 장면 + ▶ + 길이). onRemove 가 있으면 지우기 단추 */
export function card(v, { onRemove = null, onOpen = null } = {}) {
  ensureCss();
  const ratio = v.w && v.h ? Math.max(0.6, Math.min(1.8, v.w / v.h)) : 16 / 9;
  const c = el('div', { class: 'vid-card', 'data-vid': v.id, style: `aspect-ratio:${ratio.toFixed(3)}` });
  c.innerHTML = `<img alt="" class="vid-thumb"><span class="vid-play">${icon('play')}</span><span class="vid-dur">${esc(fmtDur(v.dur))}</span>`;
  const img = c.querySelector('img');
  if (v.thumb) store.fillImage(img, v.thumb, () => img.remove()); else img.remove();
  c.addEventListener('click', (e) => { if (e.target.closest('.vid-x')) return; (onOpen || play)(v); });
  if (onRemove) {
    const x = el('button', { class: 'vid-x', type: 'button', 'aria-label': t('지우기') }, icon('close'));
    x.addEventListener('click', (e) => { e.stopPropagation(); onRemove(v); });
    c.append(x);
  }
  return c;
}

/** 전체 화면으로 재생 */
let layer = null;
export function play(v) {
  ensureCss();
  close();
  layer = el('div', { class: 'vid-layer' });
  layer.innerHTML = `<button type="button" class="vid-close" aria-label="${esc(t('닫기'))}">${icon('close')}</button>`;
  const vd = el('video', { class: 'vid-player', controls: '', autoplay: '', playsinline: '', preload: 'metadata', poster: BLANK });
  vd.addEventListener('loadeddata', () => vd.classList.add('live'), { once: true });
  vd.src = src(v.path);
  vd.addEventListener('error', async () => {
    let ok = true;
    try { ok = !!(await PP()?.videoExists({ path: v.path }))?.ok; } catch { /* */ }
    toast(ok ? t('이 동영상을 재생하지 못했어요.') : t('동영상 파일을 찾을 수 없어요. 지워졌거나 다른 폰에서 옮겨 온 일기일 수 있어요.'));
    close();
  });
  layer.append(vd);
  layer.querySelector('.vid-close').addEventListener('click', close);
  document.body.append(layer);
  window.__hkVideoBack = () => { if (!layer) return false; close(); return true; };
  try { import('./analytics.js').then((a) => a.design('video:play')); } catch { /* */ }
}
export function close() {
  if (!layer) return;
  const vd = layer.querySelector('video');
  try { vd.pause(); vd.removeAttribute('src'); vd.load(); } catch { /* */ }
  layer.remove(); layer = null; window.__hkVideoBack = null;
}

let cssDone = false;
export function ensureCss() {
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
.vid-strip{display:flex;flex-wrap:wrap;gap:10px;margin:14px 0 4px}
.vid-strip:empty{display:none}
.vid-card{position:relative;flex:1 1 180px;max-width:100%;min-height:90px;max-height:320px;border-radius:16px;overflow:hidden;background:#1c1a17;cursor:pointer}
.vid-thumb{width:100%;height:100%;object-fit:cover;display:block}
.vid-play{position:absolute;left:50%;top:50%;width:52px;height:52px;margin:-26px 0 0 -26px;border-radius:50%;background:rgba(0,0,0,.55);display:grid;place-items:center;color:#fff;backdrop-filter:blur(4px)}
.vid-play svg{width:24px;height:24px;margin-left:3px;fill:#fff;stroke:#fff}
.vid-dur{position:absolute;right:8px;bottom:8px;font-size:12px;font-weight:800;color:#fff;background:rgba(0,0,0,.55);border-radius:8px;padding:2px 7px;font-variant-numeric:tabular-nums}
.vid-x{position:absolute;right:6px;top:6px;width:30px;height:30px;border-radius:50%;border:0;background:rgba(0,0,0,.55);color:#fff;display:grid;place-items:center}
.vid-x svg{width:16px;height:16px;fill:none;stroke:#fff;stroke-width:2.4}
.vid-layer{position:fixed;inset:0;z-index:320;background:#000;display:flex;align-items:center;justify-content:center}
.vid-player{width:100%;height:100%;object-fit:contain;background:#000;opacity:0;transition:opacity .15s}.vid-player.live{opacity:1}
.vid-close{position:absolute;left:12px;top:calc(env(safe-area-inset-top,0px) + 10px);z-index:2;width:42px;height:42px;border-radius:50%;border:0;background:rgba(255,255,255,.16);color:#fff;display:grid;place-items:center}
.vid-close svg{width:20px;height:20px;fill:none;stroke:#fff;stroke-width:2.4}
.vtr-layer{position:fixed;inset:0;z-index:330;background:#0f0e0d;color:#fff;display:flex;flex-direction:column;padding:calc(env(safe-area-inset-top,0px) + 6px) 16px calc(env(safe-area-inset-bottom,0px) + 18px)}
.vtr-top{display:flex;align-items:center;justify-content:space-between;height:48px}
.vtr-top button{background:none;border:0;color:#fff;font:inherit;font-size:15px;font-weight:700;padding:8px 6px}
.vtr-ok{color:#ffc58f!important}.vtr-ok:disabled{opacity:.6}
.vtr-tt{font-size:16px;font-weight:800}
.vtr-stage{flex:1;min-height:0;display:flex;align-items:center;justify-content:center;margin:8px 0 14px}
.vtr-video{max-width:100%;max-height:100%;border-radius:12px;background:#000;opacity:0;transition:opacity .15s}.vtr-video.live{opacity:1}
.vtr-times{text-align:center;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums;margin-bottom:12px;color:#e9e3da}
.vtr-track{position:relative;height:46px;margin:0 14px;border-radius:10px;background:rgba(255,255,255,.12);touch-action:none}
.vtr-sel{position:absolute;top:0;bottom:0;background:rgba(255,197,143,.28);border-top:3px solid #ffc58f;border-bottom:3px solid #ffc58f}
.vtr-head{position:absolute;top:-4px;bottom:-4px;width:2px;margin-left:-1px;background:#fff;pointer-events:none}
.vtr-h{position:absolute;top:-6px;bottom:-6px;width:26px;margin-left:-13px;border:0;border-radius:8px;background:#ffc58f;touch-action:none}
.vtr-h::after{content:'';position:absolute;left:11px;top:16px;bottom:16px;width:4px;border-radius:2px;background:rgba(0,0,0,.35)}
.vtr-hint{text-align:center;font-size:12.5px;color:rgba(255,255,255,.6);margin-top:14px}
`;
  document.head.append(s);
}
