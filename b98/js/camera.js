/* ===========================================================
   camera.js — 하루칸 카메라 (2026-11-15 사용자: '카메라에 무음 설정을 넣어주고 필터도 달아줘 — 흑백, 바랜 빛… 기본 앱 필터들')
   · 폰 기본 카메라 앱 대신 하루칸 안에서 찍는다 → 셔터음이 나지 않는다(무음 끄면 하루칸이 부드러운 셔터 소리를 낸다)
   · 필터: 원본·선명하게·따뜻하게·차갑게·바랜 빛·빈티지·필름·흑백·느와르·부드럽게 — 찍기 전 미리보기, 찍은 뒤에도 바꿀 수 있다
   · 앞뒤 카메라, 플래시(켜 두기), 찍은 뒤 [다시 찍기]/[넣기]. 결과는 기존 사진과 같은 dataURL(JPEG, 긴 쪽 1600px)
   · 1.8.9 앱(카메라 권한을 선언한 앱)부터. 그 전 앱이나 권한을 거절하면 기본 카메라 앱으로 찍는다
   =========================================================== */
import * as store from './store.js';
import { el, esc, icon, toast, haptic } from './ui.js';
import { t } from './i18n.js';

/* 필터 (2026-11-15 사용자: '스노우처럼 인물을 예쁘게, 크림 색감, 원색을 살린 그림 같은 필터') —
   css(기본 색) + glow(흐린 사진을 한 겹 더: 뽀샤시) + tint(색 덧칠) + vig(가장자리 어둡게)를 겹친다. 미리보기와 저장 모두 같은 겹침 */
export const FILTERS = [
  { k: 'none', name: '원본', css: 'none' },
  { k: 'skin', name: '뽀얀 피부', css: 'brightness(1.07) contrast(.94) saturate(1.04)', glow: { b: 0.012, o: 0.55, m: 'lighten' }, tint: { c: '#ffe1e1', o: 0.22, m: 'soft-light' } },
  { k: 'bright', name: '화사하게', css: 'brightness(1.1) contrast(.92) saturate(1.12)', glow: { b: 0.02, o: 0.4, m: 'screen' }, tint: { c: '#ffe6ef', o: 0.25, m: 'soft-light' } },
  { k: 'cream', name: '크림', css: 'contrast(.86) saturate(.78) brightness(1.13) sepia(.16)', glow: { b: 0.015, o: 0.2, m: 'screen' }, tint: { c: '#fbe8c8', o: 0.36, m: 'multiply' } },
  { k: 'milk', name: '우유빛', css: 'brightness(1.14) contrast(.8) saturate(.82)', glow: { b: 0.015, o: 0.3, m: 'screen' }, tint: { c: '#fffaf2', o: 0.18, m: 'screen' } },
  { k: 'peach', name: '복숭아', css: 'brightness(1.05) saturate(1.08)', glow: { b: 0.012, o: 0.25, m: 'screen' }, tint: { c: '#ffb59a', o: 0.3, m: 'soft-light' } },
  { k: 'dreamy', name: '몽환', css: 'brightness(1.08) contrast(.88) saturate(.95)', glow: { b: 0.03, o: 0.5, m: 'screen' }, tint: { c: '#e8d9ff', o: 0.25, m: 'soft-light' } },
  { k: 'paint', name: '그림처럼', css: 'saturate(1.75) contrast(1.2) brightness(1.04)', glow: { b: 0.006, o: 0.35, m: 'overlay' }, vig: 0.22 },
  { k: 'pop', name: '원색 팝', css: 'saturate(2) contrast(1.28) brightness(1.02)' },
  { k: 'sunset', name: '노을빛', css: 'saturate(1.15) brightness(1.03)', tint: { c: '#ff8a4c', o: 0.32, m: 'soft-light' }, vig: 0.2 },
  { k: 'sky', name: '하늘빛', css: 'brightness(1.05) saturate(1.05)', tint: { c: '#9fd3ff', o: 0.3, m: 'soft-light' } },
  { k: 'vivid', name: '선명하게', css: 'contrast(1.12) saturate(1.38)' },
  { k: 'warm', name: '따뜻하게', css: 'sepia(.22) saturate(1.22) hue-rotate(-8deg) brightness(1.03)' },
  { k: 'cool', name: '차갑게', css: 'saturate(.92) hue-rotate(14deg) brightness(1.04) contrast(1.02)' },
  { k: 'faded', name: '바랜 빛', css: 'contrast(.84) saturate(.68) brightness(1.1) sepia(.14)' },
  { k: 'vintage', name: '빈티지', css: 'sepia(.5) contrast(.9) saturate(.82) brightness(1.04)', vig: 0.25 },
  { k: 'film', name: '필름', css: 'contrast(1.1) saturate(.82) sepia(.18) brightness(.98)', vig: 0.18 },
  { k: 'mono', name: '흑백', css: 'grayscale(1) contrast(1.08)' },
  { k: 'noir', name: '느와르', css: 'grayscale(1) contrast(1.45) brightness(.88)', vig: 0.3 },
  { k: 'soft', name: '부드럽게', css: 'brightness(1.07) contrast(.9) saturate(.94)', glow: { b: 0.015, o: 0.3, m: 'screen' } },
];

/** 원본 그림(src, 캔버스·영상·사진)에 필터를 입힌 새 캔버스 (W×H). sx..sh 는 잘라 낼 부분 */
export function renderFiltered(src, f, W, H, sx = 0, sy = 0, sw = 0, sh = 0) {
  sw = sw || src.videoWidth || src.naturalWidth || src.width; sh = sh || src.videoHeight || src.naturalHeight || src.height;
  const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
  const g = cv.getContext('2d');
  g.filter = f.css || 'none'; g.drawImage(src, sx, sy, sw, sh, 0, 0, W, H); g.filter = 'none';
  if (f.glow) {
    const base = document.createElement('canvas'); base.width = W; base.height = H; base.getContext('2d').drawImage(cv, 0, 0);
    g.save(); g.globalAlpha = f.glow.o; g.globalCompositeOperation = f.glow.m; g.filter = `blur(${Math.max(0.5, f.glow.b * W).toFixed(1)}px)`;
    g.drawImage(base, 0, 0); g.restore();
  }
  if (f.tint) { g.save(); g.globalAlpha = f.tint.o; g.globalCompositeOperation = f.tint.m; g.fillStyle = f.tint.c; g.fillRect(0, 0, W, H); g.restore(); }
  if (f.vig) {
    const r = g.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.32, W / 2, H / 2, Math.hypot(W, H) / 2);
    r.addColorStop(0, 'rgba(0,0,0,0)'); r.addColorStop(1, `rgba(0,0,0,${f.vig})`);
    g.save(); g.fillStyle = r; g.fillRect(0, 0, W, H); g.restore();
  }
  return cv;
}
/* 사진 비율 (2026-11-15 사용자: '4:3, 16:9, 전체 사이즈 등으로 선택') — 세로로 들었을 때 기준(긴 변 : 짧은 변). full = 화면 모양 그대로 */
export const RATIOS = [
  { k: 'full', name: '전체 화면' },
  { k: '1:1', r: 1 },
  { k: '4:3', r: 4 / 3 },
  { k: '16:9', r: 16 / 9 },
];
const MAX_EDGE = 1600;
const PP = () => window.Capacitor?.Plugins?.PhotoPick;

/** 하루칸 카메라를 쓸 수 있는 앱인가 (1.8.9+, 카메라 권한 선언) */
export function available() {
  if (!navigator.mediaDevices?.getUserMedia) return false;
  if (!window.Capacitor?.isNativePlatform?.()) return true;      // 웹(시험)에서는 그대로
  try { const h = (window.Capacitor?.PluginHeaders || []).find((x) => x.name === 'PhotoPick'); return !!h && h.methods.some((m) => m.name === 'hasCamera'); } catch { return false; }
}
export function silentOn() { return store.getSettings().camSilent !== false; }   // 기본: 무음
function filterOf(k) { return FILTERS.find((f) => f.k === k) || FILTERS[0]; }

/* 무음을 끈 사람에게만: 하루칸이 직접 내는 부드러운 '찰칵' (폰 셔터음보다 작다) */
function shutterSound() {
  try {
    const C = window.AudioContext || window.webkitAudioContext; const ac = new C();
    const n = ac.createBufferSource(); const b = ac.createBuffer(1, ac.sampleRate * 0.06, ac.sampleRate);
    const d = b.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
    n.buffer = b; const g = ac.createGain(); g.gain.value = 0.35; const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2400;
    n.connect(f); f.connect(g); g.connect(ac.destination); n.start(); setTimeout(() => ac.close(), 300);
  } catch { /* */ }
}

/**
 * 찍기. 돌려주는 값: { photos: [dataURL] } / 취소 { photos: [], cancelled: true } / 쓸 수 없음 null (→ 부르는 쪽이 기본 카메라로)
 */
export async function shoot() {
  try { window.__hkOutAt = Date.now(); } catch { /* */ }
  /* 권한: 앱이 먼저 묻는다(웹뷰가 물으면 설명 없이 뜬다) */
  if (window.Capacitor?.isNativePlatform?.()) {
    try {
      const r = await PP().askCamera();
      if (r?.perm !== 'granted') { toast(t('카메라 권한이 없어 기본 카메라 앱으로 찍어요.')); return null; }
    } catch { return null; }
  }
  ensureCss();
  return new Promise((resolve) => {
    let facing = localStorage.getItem('hk.camFacing') || 'environment';
    let fk = localStorage.getItem('hk.camFilter') || 'none';
    let rk = localStorage.getItem('hk.camRatio') || '4:3';
    if (!RATIOS.some((x) => x.k === rk)) rk = '4:3';
    let stream = null, torch = false, shot = null, closed = false;
    const L = el('div', { class: 'cam-layer' });
    L.innerHTML = `
      <div class="cam-top">
        <button type="button" class="cam-ib cam-x" aria-label="${esc(t('닫기'))}">${icon('close')}</button>
        <button type="button" class="cam-pill cam-sil"></button>
        <button type="button" class="cam-ib cam-torch" aria-label="${esc(t('플래시'))}">${icon('spark')}</button>
      </div>
      <div class="cam-stage"><div class="cam-frame"><video class="cam-video" playsinline autoplay muted poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></video><video class="cam-glow" playsinline autoplay muted hidden poster="data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"></video><img class="cam-shot" alt="" hidden><img class="cam-shotglow" alt="" hidden><div class="cam-tint"></div><div class="cam-vig"></div></div><div class="cam-flash"></div></div>
      <div class="cam-filters"></div>
      <div class="cam-ratios"></div>
      <div class="cam-bottom">
        <button type="button" class="cam-ib cam-sys" aria-label="${esc(t('기본 카메라 앱으로'))}">${icon('camera')}</button>
        <button type="button" class="cam-shutter" aria-label="${esc(t('찍기'))}"><i></i></button>
        <button type="button" class="cam-ib cam-flip" aria-label="${esc(t('앞뒤 카메라 바꾸기'))}">${icon('undo')}</button>
      </div>
      <div class="cam-review" hidden>
        <button type="button" class="btn cam-retake">${esc(t('다시 찍기'))}</button>
        <button type="button" class="btn btn-primary cam-use">${esc(t('넣기'))}</button>
      </div>`;
    document.body.append(L);
    const $ = (s) => L.querySelector(s);
    const video = $('.cam-video'), img = $('.cam-shot'), strip = $('.cam-filters'), frame = $('.cam-frame'), stage = $('.cam-stage');
    /* 지금 고른 비율의 가로÷세로. 영상이 세로로 들어오면(폰을 세로로 듦) 세로가 긴 쪽 */
    const aspect = () => {
      const R = RATIOS.find((x) => x.k === rk) || RATIOS[2];
      const sr = stage.getBoundingClientRect();
      if (!R.r) return sr.width / Math.max(1, sr.height);           // 전체 화면 = 미리보기 칸 모양 그대로
      const vw = video.videoWidth || 3, vh = video.videoHeight || 4;
      return vh >= vw ? 1 / R.r : R.r;
    };
    const fit = () => {
      const sr = stage.getBoundingClientRect(); const a = aspect();
      let w = sr.width, h = w / a; if (h > sr.height) { h = sr.height; w = h * a; }
      frame.style.width = Math.round(w) + 'px'; frame.style.height = Math.round(h) + 'px';
    };
    const rbox = $('.cam-ratios');
    for (const R of RATIOS) {
      const b = el('button', { type: 'button', class: 'cam-r', 'data-k': R.k }, esc(R.r ? R.k : t(R.name)));
      b.addEventListener('click', () => { if (shot) return; rk = R.k; localStorage.setItem('hk.camRatio', rk); haptic(5); paintR(); fit(); });
      rbox.append(b);
    }
    const paintR = () => { for (const b of rbox.children) b.classList.toggle('on', b.dataset.k === rk); rbox.classList.toggle('lock', !!shot); };
    paintR();
    const onRs = () => fit();
    window.addEventListener('resize', onRs);
    video.addEventListener('loadedmetadata', fit);

    const paintSil = () => { const on = silentOn(); $('.cam-sil').innerHTML = `${on ? '🔇' : '🔈'} <span>${esc(on ? t('무음') : t('소리'))}</span>`; $('.cam-sil').classList.toggle('on', on); };
    paintSil();
    $('.cam-sil').addEventListener('click', async () => { await store.saveSettings({ camSilent: !silentOn() }, { silent: true }); paintSil(); haptic(6); toast(silentOn() ? t('무음으로 찍어요.') : t('찍을 때 소리가 나요.')); });

    const vGlow = $('.cam-glow'), iGlow = $('.cam-shotglow'), tint = $('.cam-tint'), vig = $('.cam-vig');
    /* 미리보기: 같은 겹침을 화면 층으로 (영상 위에 흐린 영상 한 겹 + 색 덧칠 + 가장자리) */
    const apply = () => {
      const f = filterOf(fk), fw = frame.getBoundingClientRect().width || 360;
      video.style.filter = f.css; img.style.filter = f.css;
      const glow = shot ? iGlow : vGlow; (shot ? vGlow : iGlow).hidden = true;
      if (f.glow) { glow.hidden = false; glow.style.filter = `${f.css} blur(${Math.max(0.5, f.glow.b * fw).toFixed(1)}px)`; glow.style.opacity = f.glow.o; glow.style.mixBlendMode = f.glow.m; }
      else glow.hidden = true;
      if (f.tint) { tint.style.display = 'block'; tint.style.background = f.tint.c; tint.style.opacity = f.tint.o; tint.style.mixBlendMode = f.tint.m; } else tint.style.display = 'none';
      vig.style.opacity = f.vig || 0;
      for (const b of strip.children) b.classList.toggle('on', b.dataset.k === fk);
      const mir = facing === 'user' && !shot ? 'scaleX(-1)' : '';
      video.style.transform = mir; vGlow.style.transform = mir;
    };
    /* 필터 줄: 지금 화면을 작게 떠서 각 필터를 입혀 보여 준다 */
    const thumbs = [];
    for (const f of FILTERS) {
      const b = el('button', { type: 'button', class: 'cam-f', 'data-k': f.k }, `<canvas width="120" height="120"></canvas><span>${esc(t(f.name))}</span>`);
      b.addEventListener('click', () => { fk = f.k; localStorage.setItem('hk.camFilter', fk); haptic(5); apply(); });
      strip.append(b); thumbs.push([b.querySelector('canvas'), f]);
    }
    const drawThumbs = (src) => {
      const sw = src.videoWidth || src.naturalWidth, sh = src.videoHeight || src.naturalHeight; if (!sw || !sh) return;
      const s = Math.min(sw, sh);
      for (const [cv, f] of thumbs) { const r = renderFiltered(src, f, 120, 120, (sw - s) / 2, (sh - s) / 2, s, s); const g = cv.getContext('2d'); g.clearRect(0, 0, 120, 120); g.drawImage(r, 0, 0); }
    };

    async function start() {
      stop();
      /* 방금 닫은 카메라가 아직 풀리는 중이면 실패할 수 있다 — 잠깐 뒤 한 번 더, 그래도 안 되면 조건을 낮춰 한 번 더 */
      const ask = (v) => navigator.mediaDevices.getUserMedia({ audio: false, video: v });
      try {
        try { stream = await ask({ facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }); }
        catch { await new Promise((r) => setTimeout(r, 600)); if (closed) return; try { stream = await ask({ facingMode: { ideal: facing }, width: { ideal: 1920 }, height: { ideal: 1440 } }); } catch { await new Promise((r) => setTimeout(r, 600)); if (closed) return; stream = await ask({ facingMode: facing }); } }
      } catch (e) {
        console.error('카메라', e?.name, e?.message);
        finish(null); toast(t('카메라를 열지 못해 기본 카메라 앱으로 찍어요.'));
        return;
      }
      if (closed) { stop(); return; }
      video.classList.remove('live');
      video.srcObject = stream;
      vGlow.srcObject = stream; vGlow.play().catch(() => {});
      video.addEventListener('playing', () => video.classList.add('live'), { once: true });
      try { await video.play(); } catch { /* */ }
      const tr = stream.getVideoTracks()[0];
      const caps = tr?.getCapabilities?.() || {};
      $('.cam-torch').hidden = !caps.torch;
      torch = false; $('.cam-torch').classList.remove('on');
      setTimeout(() => drawThumbs(video), 400);
      apply();
    }
    function stop() { try { stream?.getTracks().forEach((x) => x.stop()); } catch { /* */ } stream = null; }
    function finish(val) {
      if (closed) return; closed = true;
      stop(); window.removeEventListener('resize', onRs); L.remove(); window.__hkCameraBack = null; resolve(val);
    }
    window.__hkCameraBack = () => { if (shot) { retake(); return true; } finish({ photos: [], cancelled: true }); return true; };

    $('.cam-x').addEventListener('click', () => finish({ photos: [], cancelled: true }));
    $('.cam-sys').addEventListener('click', () => finish(null));
    $('.cam-flip').addEventListener('click', () => { facing = facing === 'user' ? 'environment' : 'user'; localStorage.setItem('hk.camFacing', facing); haptic(6); start(); });
    $('.cam-torch').addEventListener('click', async () => {
      const tr = stream?.getVideoTracks()[0]; if (!tr) return;
      torch = !torch;
      try { await tr.applyConstraints({ advanced: [{ torch }] }); $('.cam-torch').classList.toggle('on', torch); } catch { torch = false; }
    });
    $('.cam-shutter').addEventListener('click', () => {
      const w = video.videoWidth, h = video.videoHeight; if (!w || !h) return;
      /* 고른 비율로 가운데를 잘라 낸다 — 미리보기 틀에 보이던 그대로 */
      const a = aspect();
      let cw = w, ch = h; if (w / h > a) cw = Math.round(h * a); else ch = Math.round(w / a);
      const sx = Math.round((w - cw) / 2), sy = Math.round((h - ch) / 2);
      const s = Math.min(1, MAX_EDGE / Math.max(cw, ch));
      const cv = document.createElement('canvas'); cv.width = Math.round(cw * s); cv.height = Math.round(ch * s);
      const g = cv.getContext('2d');
      if (facing === 'user') { g.translate(cv.width, 0); g.scale(-1, 1); }   // 앞 카메라는 거울처럼 보이던 그대로
      g.drawImage(video, sx, sy, cw, ch, 0, 0, cv.width, cv.height);
      shot = cv;
      if (!silentOn()) shutterSound();
      haptic(12);
      const fl = $('.cam-flash'); fl.classList.remove('go'); void fl.offsetWidth; fl.classList.add('go');
      img.src = cv.toDataURL('image/jpeg', 0.9); iGlow.src = img.src; img.hidden = false; video.hidden = true;
      $('.cam-bottom').hidden = true; $('.cam-review').hidden = false;
      if (torch) { try { stream.getVideoTracks()[0].applyConstraints({ advanced: [{ torch: false }] }); } catch { /* */ } }
      img.onload = () => drawThumbs(img);
      paintR();
      apply();
    });
    function retake() { shot = null; setTimeout(paintR, 0); img.hidden = true; video.hidden = false; $('.cam-bottom').hidden = false; $('.cam-review').hidden = true; drawThumbs(video); apply(); }
    $('.cam-retake').addEventListener('click', retake);
    $('.cam-use').addEventListener('click', () => {
      if (!shot) return;
      const out = renderFiltered(shot, filterOf(fk), shot.width, shot.height);
      try { import('./analytics.js').then((a) => a.design('camera:shot:' + fk + ':' + rk.replace(':', 'x') + (silentOn() ? ':silent' : ''))); } catch { /* */ }
      finish({ photos: [out.toDataURL('image/jpeg', 0.84)], filter: fk, ratio: rk });
    });
    start();
  });
}

let cssDone = false;
function ensureCss() {
  if (cssDone) return; cssDone = true;
  const s = document.createElement('style');
  s.textContent = `
.cam-layer{position:fixed;inset:0;z-index:340;background:#000;color:#fff;display:flex;flex-direction:column;padding:env(safe-area-inset-top,0px) 0 calc(env(safe-area-inset-bottom,0px) + 10px)}
.cam-top{display:flex;align-items:center;justify-content:space-between;height:56px;padding:0 10px}
.cam-ib{width:44px;height:44px;border-radius:50%;border:0;background:rgba(255,255,255,.12);color:#fff;display:grid;place-items:center}
.cam-ib svg{width:22px;height:22px;fill:none;stroke:#fff;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.cam-ib.on{background:#ffd66b}.cam-ib.on svg{stroke:#222}
.cam-ib[hidden]{visibility:hidden;display:grid}
.cam-pill{border:0;border-radius:20px;padding:8px 14px;background:rgba(255,255,255,.14);color:#fff;font:inherit;font-size:13.5px;font-weight:800}
.cam-pill.on{background:rgba(255,214,107,.22);color:#ffd66b}
.cam-stage{position:relative;flex:1;min-height:0;display:flex;align-items:center;justify-content:center;overflow:hidden}
.cam-frame{position:relative;overflow:hidden;background:#000;flex:none;max-width:100%;max-height:100%;isolation:isolate}
.cam-glow,.cam-shotglow,.cam-tint,.cam-vig{position:absolute;inset:0;width:100%;height:100%;pointer-events:none}
.cam-glow,.cam-shotglow{object-fit:cover}
.cam-glow[hidden],.cam-shotglow[hidden]{display:none}
.cam-tint{display:none}
.cam-vig{opacity:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 45%,rgba(0,0,0,1) 100%)}
.cam-video,.cam-shot{width:100%;height:100%;object-fit:cover;display:block}
/* 안드로이드 웹뷰는 첫 장면 전에 회색 ▶ 대기 그림을 띄운다 (2026-11-15 사용자: '이상한 플레이 화면이 잠깐') — 나오기 시작할 때까지 숨김 */
.cam-video{opacity:0;transition:opacity .15s}.cam-video.live{opacity:1}
.cam-video[hidden],.cam-shot[hidden]{display:none}
.cam-flash{position:absolute;inset:0;background:#fff;opacity:0;pointer-events:none}
.cam-flash.go{animation:camFl .28s ease-out}
@keyframes camFl{0%{opacity:.85}100%{opacity:0}}
.cam-filters{display:flex;gap:10px;overflow-x:auto;padding:12px 14px 6px;scrollbar-width:none}
.cam-filters::-webkit-scrollbar{display:none}
.cam-f{flex:none;border:0;background:none;color:rgba(255,255,255,.75);font:inherit;font-size:11.5px;font-weight:700;display:flex;flex-direction:column;align-items:center;gap:5px;padding:0}
.cam-f canvas{width:58px;height:58px;border-radius:14px;border:2px solid transparent;background:#222}
.cam-f.on{color:#ffd66b}.cam-f.on canvas{border-color:#ffd66b}
.cam-ratios{display:flex;justify-content:center;gap:8px;padding:4px 14px 2px}
.cam-r{border:0;border-radius:16px;padding:6px 13px;background:rgba(255,255,255,.12);color:rgba(255,255,255,.8);font:inherit;font-size:12.5px;font-weight:800;font-variant-numeric:tabular-nums}
.cam-r.on{background:#ffd66b;color:#222}
.cam-ratios.lock .cam-r:not(.on){opacity:.35}
.cam-bottom{display:flex;align-items:center;justify-content:space-around;height:96px}
.cam-bottom[hidden],.cam-review[hidden]{display:none}
.cam-shutter{width:76px;height:76px;border-radius:50%;border:4px solid #fff;background:transparent;display:grid;place-items:center;padding:0}
.cam-shutter i{width:60px;height:60px;border-radius:50%;background:#fff;display:block;transition:transform .1s}
.cam-shutter:active i{transform:scale(.88)}
.cam-review{display:flex;gap:12px;padding:16px 18px 18px}
.cam-review .btn{flex:1;height:54px}
.cam-review .btn:not(.btn-primary){background:rgba(255,255,255,.14);color:#fff;border:0}
`;
  document.head.append(s);
}
