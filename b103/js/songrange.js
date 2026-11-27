/* ===========================================================
   songrange.js — 오늘의 노래 '들을 구간 고르기' (2026-11-27, 의견 113번 등 다섯 번째 요청 · 운영 담당 전달, 개발용)
   · 유튜브·유튜브 뮤직 링크 노래: 곡 전체 안에서 시작(필요하면 끝)을 고른다.
     곡 길이·지금 위치는 유튜브 화면(iframe)이 보내 주는 알림으로 받는다(열쇠 필요 없음). 화면은 약관대로 보인 채로.
     재생은 embed 의 start/end(정수 초) — 유튜브가 가까운 장면부터 틀어 최대 2초쯤 앞에서 시작할 수 있다.
   · 검색으로 고른 노래(애플 30초 미리듣기): 미리듣기 30초 안에서만 고른다.
   · 저장 모양: entry.song.from(시작 초, 정수) · entry.song.to(끝 초, 정수 · 없으면 끝까지). 둘 다 없으면 예전처럼 처음부터.
   · 동영상 자르기(video.js trimUI)와 같은 모양 — 검은 화면, 양쪽 손잡이, 고른 구간만 되풀이
   =========================================================== */
import { el, esc, toast } from './ui.js';
import { t } from './i18n.js';
import { ensureCss, fmtDur } from './video.js';
import * as M from './music.js';

const MIN_YT = 5, MIN_PV = 3;
const fmt = (sec) => fmtDur((sec || 0) * 1000);

/** 노래에 고른 구간이 있나 */
export function hasRange(s) { return !!s && ((+s.from || 0) > 0 || (+s.to || 0) > 0); }
/** 카드에 보일 글: '0:45부터' 또는 '0:45–1:15' */
export function rangeText(s) {
  if (!hasRange(s)) return '';
  const a = +s.from || 0, b = +s.to || 0;
  return b > a ? `${fmt(a)}–${fmt(b)}` : t('{a}부터', { a: fmt(a) });
}
/** 유튜브 embed 주소 — 구간이 없으면 예전과 똑같은 주소 */
export function ytSrc(s, extra = '') {
  let q = 'autoplay=1&playsinline=1&rel=0';
  const a = Math.max(0, Math.floor(+s.from || 0)), b = Math.floor(+s.to || 0);
  if (a > 0) q += '&start=' + a;
  if (b > a) q += '&end=' + b;
  return `https://www.youtube-nocookie.com/embed/${s.yt}?${q}${extra}`;
}

/** 구간 고르기 창. 고르면 { from, to } (to 는 끝까지면 null, 처음부터면 from 0), 취소하면 null */
export function pickRange(s) {
  ensureCss();
  return new Promise((resolve) => {
    const isYt = !!s.yt;
    let dur = 0;                             // 미리듣기는 바로 30초로, 유튜브는 알림을 받으면 곡 길이로
    let a = Math.max(0, +s.from || 0), b = +s.to || 0;
    let drag = null;
    const L = el('div', { class: 'vtr-layer srg-layer' });
    L.innerHTML = `<div class="vtr-top"><button type="button" class="vtr-cancel">${esc(t('취소'))}</button><div class="vtr-tt">${esc(t('노래 구간 고르기'))}</div><button type="button" class="vtr-ok">${esc(t('저장'))}</button></div>
      <div class="vtr-stage srg-stage"></div>
      <div class="vtr-bottom"><div class="srg-name"></div><div class="vtr-times"></div><div class="vtr-track"><div class="vtr-sel"></div><div class="vtr-head"></div><button type="button" class="vtr-h vtr-ha" aria-label="${esc(t('시작'))}"></button><button type="button" class="vtr-h vtr-hb" aria-label="${esc(t('끝'))}"></button></div>
      <div class="vtr-hint">${esc(isYt ? t('양쪽 손잡이를 끌어 들을 부분을 골라요.') : t('30초 미리듣기 안에서 골라요.'))}</div>
      <div class="srg-btns"><button type="button" class="srg-reset">${esc(t('처음부터 듣기'))}</button><button type="button" class="srg-again">${esc(t('구간 다시 듣기'))}</button></div></div>`;
    L.querySelector('.srg-name').textContent = M.label(s) || s.t || '';
    const stage = L.querySelector('.srg-stage');
    const track = L.querySelector('.vtr-track'), sel = L.querySelector('.vtr-sel'), head = L.querySelector('.vtr-head');
    const ha = L.querySelector('.vtr-ha'), hb = L.querySelector('.vtr-hb'), times = L.querySelector('.vtr-times');
    const okB = L.querySelector('.vtr-ok');
    document.body.append(L);
    const minLen = isYt ? MIN_YT : MIN_PV;
    const ready = () => dur > 0;
    const draw = () => {
      L.classList.toggle('loading', !ready());
      okB.disabled = !ready();
      if (!ready()) { times.textContent = t('노래 길이를 불러오는 중…'); return; }
      const pa = a / dur * 100, pb = b / dur * 100;
      sel.style.left = pa + '%'; sel.style.width = (pb - pa) + '%';
      ha.style.left = pa + '%'; hb.style.left = pb + '%';
      times.textContent = `${fmt(a)} – ${fmt(b)}  ·  ${fmt(b - a)}`;
    };
    const setDur = (d) => {
      if (!(d > 0) || dur === d) return;
      const first = !ready();
      dur = isYt ? Math.floor(d) : Math.min(30, d);
      if (first || b <= 0 || b > dur) b = (+s.to || 0) > 0 ? Math.min(dur, +s.to) : dur;
      a = Math.min(a, Math.max(0, b - minLen));
      draw();
    };

    /* ── 재생기: 유튜브(iframe 알림) / 미리듣기(audio) ── */
    let fr = null, au = null, cur = 0, poll = 0, gave = 0;
    const post = (func, args = []) => { try { fr?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args, id: 1, channel: 'widget' }), '*'); } catch { /* */ } };
    const seek = (sec, play = true) => {
      if (isYt) { post('seekTo', [sec, true]); if (play) post('playVideo'); }
      else if (au) { try { au.currentTime = sec; if (play) au.play().catch(() => {}); } catch { /* */ } }
    };
    const pause = () => { if (isYt) post('pauseVideo'); else au?.pause(); };
    const onTime = (sec) => {
      cur = sec;
      if (!ready()) return;
      head.style.left = Math.min(100, sec / dur * 100) + '%';
      if (!drag && sec >= b - 0.25) seek(a);                     // 고른 구간만 되풀이
    };
    const onMsg = (e) => {
      if (!fr || e.source !== fr.contentWindow) return;
      let d = e.data; if (typeof d === 'string') { try { d = JSON.parse(d); } catch { return; } }
      const info = d?.info;
      if (!info || typeof info !== 'object') return;
      if (info.duration > 0) setDur(info.duration);
      if (typeof info.currentTime === 'number') onTime(info.currentTime);
    };
    if (isYt) {
      window.addEventListener('message', onMsg);
      const origin = /^https?:/.test(location.origin) ? '&origin=' + encodeURIComponent(location.origin) : '';
      fr = el('iframe', {
        class: 'sc-frame srg-frame', src: ytSrc({ yt: s.yt, from: a }, '&enablejsapi=1' + origin),
        title: s.t || t('오늘의 노래'), allow: 'autoplay; encrypted-media', referrerpolicy: 'strict-origin-when-cross-origin',
      });
      stage.append(fr);
      /* 유튜브 화면이 알림을 보내기 시작하게 '듣고 있다'고 알린다 (알림이 올 때까지 되풀이) */
      const hello = () => { try { fr.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 1, channel: 'widget' }), '*'); } catch { /* */ } };
      fr.addEventListener('load', hello);
      poll = setInterval(() => { if (!ready()) { hello(); if (++gave > 40) { clearInterval(poll); times.textContent = t('노래를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); } } }, 400);
    } else {
      if (s.art) stage.append(el('img', { class: 'srg-art', src: s.art, alt: '' }));
      (async () => {
        let url = M.previewUrl(s.pv);
        if (!url && s.it) { try { url = await M.lookupPreview(s.it); } catch { url = null; } }
        if (!L.isConnected) return;
        if (!url) { times.textContent = t('노래를 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'); return; }
        au = new Audio(); au.preload = 'auto'; au.src = url;
        au.addEventListener('loadedmetadata', () => { setDur(au.duration); seek(a); });
        au.addEventListener('timeupdate', () => onTime(au.currentTime));
        au.addEventListener('ended', () => seek(a));
        au.play().catch(() => {});
      })();
      setDur(30);                            // 미리듣기는 30초로 바로 고를 수 있다 (실제 길이가 오면 맞춘다)
    }
    draw();

    /* ── 손잡이 ── */
    const secAt = (x) => { const r = track.getBoundingClientRect(); return Math.max(0, Math.min(dur, (x - r.left) / r.width * dur)); };
    for (const [h, k] of [[ha, 'a'], [hb, 'b']]) {
      h.addEventListener('pointerdown', (e) => { if (!ready()) return; e.preventDefault(); drag = k; try { h.setPointerCapture(e.pointerId); } catch { /* */ } pause(); });
      h.addEventListener('pointermove', (e) => {
        if (drag !== k) return;
        const v = Math.round(secAt(e.clientX));   // 초 단위로 — 보이는 시각과 저장 값이 같게
        if (k === 'a') a = Math.max(0, Math.min(v, Math.floor(b) - minLen)); else b = Math.min(dur, Math.max(v, Math.ceil(a) + minLen));
        draw();
      });
      const up = () => { if (drag !== k) return; drag = null; seek(k === 'a' ? a : Math.max(a, b - 3)); };   // 끝 손잡이는 끝나기 3초 전부터 들려준다
      h.addEventListener('pointerup', up); h.addEventListener('pointercancel', up);
    }
    L.querySelector('.srg-again').addEventListener('click', () => { if (ready()) seek(a); });
    L.querySelector('.srg-reset').addEventListener('click', () => { if (!ready()) return; a = 0; b = dur; draw(); seek(0); });

    const done = (val) => {
      clearInterval(poll); window.removeEventListener('message', onMsg);
      try { pause(); } catch { /* */ }
      if (au) { try { au.removeAttribute('src'); au.load(); } catch { /* */ } }
      L.remove(); window.__hkVideoBack = null; resolve(val);
    };
    window.__hkVideoBack = () => { done(null); return true; };
    L.querySelector('.vtr-cancel').addEventListener('click', () => done(null));
    okB.addEventListener('click', () => {
      if (!ready()) return;
      const from = Math.round(a), to = b < dur - 1 ? Math.round(b) : null;
      if (from > 0 || to) toast(t('들을 구간을 저장했어요.'));
      done({ from, to });
    });
    /* 시험용: 유튜브 알림 흉내 */
    L._qa = { setDur, onTime, get a() { return a; }, get b() { return b; }, set: (x, y) => { a = x; b = y; draw(); } };
  });
}

/** 노래에 구간을 붙이거나 지운 새 노래 객체 (from 0·to 없음이면 구간 값을 지운다 = 예전 모양) */
export function withRange(s, r) {
  const n = { ...s };
  delete n.from; delete n.to;
  if (r && r.from > 0) n.from = r.from;
  if (r && r.to > (r.from || 0)) n.to = r.to;
  return n;
}
