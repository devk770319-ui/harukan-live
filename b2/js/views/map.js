/* ===========================================================
   views/map.js — 내가 일기 쓴 곳 (1.7.8, 사용자 요청 2026-10-25)

   · 일기에 남긴 장소(entry.place)를 지도에 핀으로 모은다. 가까운 핀은 숫자로 묶이고,
     누르면 그 자리에서 쓴 일기 목록이 뜬다.
   · 좌표가 없는 지난 일기는 날씨의 동네 이름으로 대략 위치를 찾아 연한 핀으로 보여 준다 (place.geoName).
   · 지도 그림: MapLibre(앱에 들어 있음) + OpenFreeMap(가입·키·비용 없는 지도 그림 서버).
     지도를 볼 때 그 지역의 지도 그림만 받는다. 일기 내용·좌표 목록은 보내지 않는다.
   · 인터넷이 없거나 지도를 못 그리면 동네별 목록으로 보여 준다.
   · #/map?id=<일기 id> 로 열면 그 일기 자리로 바로 간다.
   =========================================================== */
import * as store from '../store.js';
import { go, back } from '../app.js';
import { el, esc, openSheet, closeSheet, fmtDate, summaryText, moodColor, toast } from '../ui.js';
import { t, current as lang } from '../i18n.js';
import * as place from '../place.js';
import * as analytics from '../analytics.js';
import * as NB from '../newbadge.js';

/* positron 은 너무 옅어 폰에서 '지도가 안 뜬다'고 보였다(사용자 신고) → 색이 있는 liberty */
const STYLE = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark: 'https://tiles.openfreemap.org/styles/dark',
};

let map = null;
let libP = null;
function loadLib() {
  if (window.maplibregl) return Promise.resolve(window.maplibregl);
  if (libP) return libP;
  libP = new Promise((res, rej) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = 'vendor/maplibre/maplibre-gl.css';
    document.head.append(css);
    const s = document.createElement('script');
    s.src = 'vendor/maplibre/maplibre-gl.js';
    s.onload = () => (window.maplibregl ? res(window.maplibregl) : rej(new Error('no maplibre')));
    s.onerror = () => { libP = null; rej(new Error('load')); };
    document.head.append(s);
  });
  return libP;
}

/** 지도에 찍을 점들: [{ e, lat, lon, approx }] */
function pointsNow() {
  const out = [];
  for (const e of store.live()) {
    if (e.demo) continue;
    const p = e.place;
    if (p && p.lat != null) { out.push({ e, lat: p.lat, lon: p.lon, approx: !!p.approx }); continue; }
    const nm = e.weather?.place;
    const g = nm && place.geoCached(nm);
    if (g) out.push({ e, lat: g.lat, lon: g.lon, approx: true, guess: true });
  }
  return out;
}
/** 좌표가 없고 동네 이름만 있는 지난 일기의 동네 이름들 (아직 안 찾아본 것) */
function namesToFind() {
  const set = new Set();
  for (const e of store.live()) {
    if (e.demo || e.place?.lat != null) continue;
    const nm = e.weather?.place;
    if (nm && !place.geoCached(nm)) set.add(nm);
  }
  return [...set];
}

function geojson(pts) {
  return {
    type: 'FeatureCollection',
    features: pts.map((p, i) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      properties: { i, approx: p.approx ? 1 : 0, color: p.e.mood ? moodColor(p.e.mood) : '' },
    })),
  };
}

/** 그 자리에서 쓴 일기 목록 */
function openList(items, title) {
  const list = [...items].sort((a, b) => (b.e.date || '').localeCompare(a.e.date || '') || (b.e.createdAt || 0) - (a.e.createdAt || 0));
  openSheet({
    title: title || t('이곳에서 쓴 일기 {n}편', { n: list.length }),
    items: list.slice(0, 60).map((p) => ({
      label: p.e.title || summaryText(p.e).slice(0, 40) || t('(내용 없음)'),
      sub: fmtDate(p.e.date, { year: true }) + (p.e.place ? ' · ' + place.label(p.e.place) : (p.e.weather?.place ? ' · ' + p.e.weather.place : '')),
      icon: 'book',
      onClick: () => { closeSheet(); go('/entry/' + encodeURIComponent(p.e.id)); },
    })),
  });
}

function emptyState(root, perm) {
  const box = el('div', { class: 'empty', style: 'margin-top:40px' });
  box.innerHTML = `<span class="empty-emoji">🗺️</span>
    <div class="empty-title">${esc(t('아직 지도에 남은 일기가 없어요'))}</div>
    <div class="empty-sub">${esc(t('일기 쓴 장소 기록을 켜면, 일기를 쓸 때 있던 곳이 이 지도에 모여요.'))}</div>`;
  root.append(box);
  if (perm !== 'unavailable' && !store.getSettings().placeAuto) {
    const b = el('button', { class: 'btn btn-primary', type: 'button', style: 'margin:18px auto 0;display:block' }, esc(t('장소 기록 켜기')));
    b.addEventListener('click', async () => { if (await enablePlace()) go('/map'); });
    root.append(b);
  }
}

/** 설정에서도, 쓰기 화면에서도 쓰는 '장소 기록 켜기' — 먼저 무엇을 왜 쓰는지 알리고(앱 안 안내) 권한을 묻는다 */
export async function enablePlace() {
  const { confirmSheet } = await import('../ui.js');
  const ok = await confirmSheet({
    title: t('일기 쓴 곳을 지도에 남길까요?'),
    text: t('일기를 쓸 때 지금 있는 곳(정확한 위치)을 일기와 함께 이 폰에만 저장해요. 발견 › 내가 일기 쓴 곳에서 지도로 모아 볼 수 있어요. 위치는 개발자에게 보내지 않아요.'),
    ok: t('켜기'),
  });
  if (!ok) { analytics.design('place:ask_later'); await store.saveSettings({ placeAsked: true }, { silent: true }); return false; }
  const st = await place.requestPerm();
  analytics.design('place:perm:' + st);
  if (st === 'granted' || st === 'approx') {
    await store.saveSettings({ placeAuto: true, placeAsked: true }, { silent: true });
    if (st === 'approx') toast(t('대략적인 위치만 허용돼서 동네 단위로 남겨요. 폰 설정에서 정확한 위치를 켤 수 있어요.'));
    return true;
  }
  const go2 = await confirmSheet({
    title: t('위치를 허용해 주세요'),
    text: t("일기 쓴 곳을 남기려면 위치 권한이 필요해요. 폰 설정에서 하루칸의 위치를 '앱 사용 중에만 허용'으로 바꾸고 '정확한 위치 사용'을 켜 주세요."),
    ok: t('설정 열기'),
  });
  if (go2) { const wx = await import('../weather.js'); await wx.openSettings('app'); }
  return false;
}

/** 지도를 못 그릴 때: 동네별 목록 */
function fallbackList(root, pts) {
  const groups = new Map();
  for (const p of pts) {
    const k = p.e.place?.name || p.e.weather?.place || t('이름 없는 곳');
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(p);
  }
  root.append(el('div', { class: 'note', style: 'margin:6px 4px 12px' }, esc(t('지도를 불러오지 못해 동네별 목록으로 보여드려요.'))));
  const wrap = el('div', { class: 'map-groups' });
  for (const [k, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
    const b = el('button', { class: 'map-group', type: 'button' });
    b.innerHTML = `<span class="map-pin-ico">📍</span><span class="n">${esc(k)}</span><span class="c">${esc(t('{n}편', { n: list.length }))}</span>`;
    b.addEventListener('click', () => openList(list, k));
    wrap.append(b);
  }
  root.append(wrap);
}

export async function render(root, params) {
  const chrome = { title: t('내가 일기 쓴 곳'), left: { icon: 'back', onClick: back } };
  NB.used('map');
  const perm = await place.permState();
  let pts = pointsNow();
  const todo = namesToFind();
  if (!pts.length && !todo.length) { emptyState(root, perm); return chrome; }

  const wrap = el('div', { class: 'map-wrap' });
  const box = el('div', { class: 'map-box' });
  const info = el('div', { class: 'map-info' });
  wrap.append(box, info);
  root.append(wrap);
  const fit = () => {
    const top = wrap.getBoundingClientRect().top + window.scrollY;
    const tab = document.getElementById('tabbar');
    const tabH = tab && !tab.hidden ? tab.getBoundingClientRect().height : 0;
    wrap.style.height = Math.max(320, window.innerHeight - top - tabH - 12) + 'px';
  };
  fit();
  const paintInfo = () => {
    const places = new Set(pts.map((p) => p.lat.toFixed(3) + ',' + p.lon.toFixed(3))).size;
    const guess = pts.filter((p) => p.guess).length;
    info.innerHTML = `<b>${esc(t('{p}곳 · 일기 {n}편', { p: places, n: pts.length }))}</b>`
      + (guess ? `<span>${esc(t('연한 핀은 동네 이름으로 찾은 대략 위치예요'))}</span>` : '')
      + (!store.getSettings().placeAuto && perm !== 'unavailable' ? `<button type="button" class="map-on">${esc(t('장소 기록 켜기'))}</button>` : '');
    info.querySelector('.map-on')?.addEventListener('click', async () => { if (await enablePlace()) paintInfo(); });
  };
  paintInfo();

  let ml;
  try { ml = await loadLib(); } catch { wrap.remove(); fallbackList(root, pts); return chrome; }
  const dark = document.documentElement.dataset.theme === 'dark';
  const focus = params?.id ? pts.find((p) => p.e.id === params.id) : null;
  try {
    map = new ml.Map({
      container: box,
      style: dark ? STYLE.dark : STYLE.light,
      center: focus ? [focus.lon, focus.lat] : (pts[0] ? [pts[0].lon, pts[0].lat] : [127, 37.5]),
      zoom: focus ? 16 : 11,
      attributionControl: { compact: true },
      dragRotate: false, pitchWithRotate: false, touchPitch: false,
    });
  } catch (e) { wrap.remove(); fallbackList(root, pts); return chrome; }
  map.touchZoomRotate.disableRotation();
  const loading = el('div', { class: 'map-loading' }, `<span class="wx-spin"></span><span>${esc(t('지도 불러오는 중…'))}</span>`);
  wrap.append(loading);
  const failT = setTimeout(() => { if (!map?.isStyleLoaded()) { /* 인터넷이 없으면 지도 그림이 안 온다 */ loading.innerHTML = `<span>${esc(t('인터넷에 연결되면 지도가 보여요'))}</span>`; } }, 12000);
  map.once('idle', () => loading.remove());

  const accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#b5577e';
  map.on('load', () => {
    clearTimeout(failT);
    /* 지명은 앱 언어로 (없으면 현지 이름) */
    const L = lang() || 'en';
    for (const ly of map.getStyle().layers || []) {
      if (ly.type !== 'symbol' || !ly.layout?.['text-field']) continue;
      try { map.setLayoutProperty(ly.id, 'text-field', ['coalesce', ['get', 'name:' + L], ['get', 'name']]); } catch {}
    }
    map.addSource('diary', { type: 'geojson', data: geojson(pts), cluster: true, clusterRadius: 44, clusterMaxZoom: 17 });
    map.addLayer({ id: 'cl', type: 'circle', source: 'diary', filter: ['has', 'point_count'],
      paint: { 'circle-color': accent, 'circle-opacity': 0.9, 'circle-radius': ['step', ['get', 'point_count'], 16, 5, 20, 20, 26], 'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } });
    map.addLayer({ id: 'cl-n', type: 'symbol', source: 'diary', filter: ['has', 'point_count'],
      layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 13, 'text-font': ['Noto Sans Bold'] },
      paint: { 'text-color': '#fff' } });
    map.addLayer({ id: 'pt', type: 'circle', source: 'diary', filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': ['case', ['==', ['get', 'color'], ''], accent, ['get', 'color']],
        'circle-opacity': ['case', ['==', ['get', 'approx'], 1], 0.45, 1],
        'circle-radius': 9, 'circle-stroke-width': 3, 'circle-stroke-color': '#fff',
      } });
    const fitAll = () => {
      if (focus || !pts.length) return;
      const b = new ml.LngLatBounds();
      for (const p of pts) b.extend([p.lon, p.lat]);
      map.fitBounds(b, { padding: 60, maxZoom: 15, duration: 0 });
    };
    fitAll();
    /* 이 일기 자리: 목록을 바로 띄우면 지도를 가린다 → 핀 둘레에 고리만 두르고, 핀을 누르면 목록 */
    if (focus) {
      map.addSource('focus', { type: 'geojson', data: { type: 'Feature', geometry: { type: 'Point', coordinates: [focus.lon, focus.lat] }, properties: {} } });
      map.addLayer({ id: 'focus', type: 'circle', source: 'focus', paint: { 'circle-radius': 22, 'circle-color': accent, 'circle-opacity': 0.18, 'circle-stroke-width': 2, 'circle-stroke-color': accent } }, 'pt');
    }

    map.on('click', 'cl', async (ev) => {
      const f = ev.features[0];
      const src = map.getSource('diary');
      const z = await src.getClusterExpansionZoom(f.properties.cluster_id);
      if (z <= 17 && map.getZoom() < 17) { map.easeTo({ center: f.geometry.coordinates, zoom: z }); return; }
      const leaves = await src.getClusterLeaves(f.properties.cluster_id, 200, 0);
      openList(leaves.map((l) => pts[l.properties.i]).filter(Boolean));
    });
    map.on('click', 'pt', (ev) => {
      const f = ev.features[0];
      const p0 = pts[f.properties.i];
      if (!p0) return;
      openList(pts.filter((p) => Math.abs(p.lat - p0.lat) < 2e-4 && Math.abs(p.lon - p0.lon) < 2e-4), p0.e.place ? place.fullLabel(p0.e.place) : p0.e.weather?.place);
    });
    for (const id of ['cl', 'pt']) {
      map.on('mouseenter', id, () => { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', id, () => { map.getCanvas().style.cursor = ''; });
    }

    /* 지난 일기: 동네 이름으로 대략 위치 찾기 (한 번 찾은 건 기억) */
    (async () => {
      let added = 0;
      for (const nm of todo.slice(0, 40)) {
        if (!map) return;
        const g = await place.geoName(nm);
        if (g) added++;
      }
      if (added && map) {
        pts = pointsNow();
        map.getSource('diary')?.setData(geojson(pts));
        paintInfo();
        fitAll();
      }
    })();
  });
  map.on('error', (e) => console.warn('[map]', e?.error?.message || e));
  analytics.design('map:open:' + (pts.length ? 'pins' : 'names'));
  return chrome;
}

export function teardown() {
  try { map?.remove(); } catch {}
  map = null;
}
