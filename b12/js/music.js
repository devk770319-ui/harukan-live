/* ===========================================================
   music.js — 오늘의 노래 (1.7.9, 2026-10-28 사용자 결정: 하루콩식 검색 + Day One식 링크)
   사용자 의견(튀르키예, 10/24·10/25·10/27): "일기에 음악을 넣고 싶다"

   넣는 길 세 가지
   · 검색  — Apple iTunes 검색(무료, 키 없음)으로 곡을 찾아 고른다. 곡 정보만 쓴다.
             (30초 미리듣기는 약관상 '홍보용'이라 일기 배경음악으로 쓰지 않는다)
   · 링크  — YouTube · YouTube Music · Spotify · Apple Music 공유 링크를 붙여 넣는다.
             제목·그림은 각 서비스의 공개 oEmbed 로 가져오고, [듣기]는 그 링크를 그 앱에서 연다.
             (일기 안 동영상 플레이어는 두지 않는다 — 사용자 요청. 유튜브는 화면을 숨긴 재생을 금지한다)
   · 직접  — 제목·가수만 적는다 (인터넷이 없을 때도)

   저장 모양 entry.song (잠금이 켜져 있으면 본문처럼 암호화된다 — store.SECRET_FIELDS)
     { t: 제목, a: 가수, al?: 앨범, art?: 작은 그림(dataURL, 이 폰에 저장 — 볼 때마다 서버에 묻지 않게),
       it?: iTunes 곡 번호, am?: Apple Music 주소, yt?: YouTube 영상 번호, sp?: 'track/<id>' 같은 Spotify 자리,
       url?: 붙여 넣은 원래 링크 }
   인터넷에 나가는 것: 검색어(Apple), 붙여 넣은 링크(YouTube·Spotify), 그림 한 장. 일기 내용은 나가지 않는다.
   =========================================================== */
import { current as langNow } from './i18n.js';

export const MAX_RESULTS = 20;
/* 앱 언어 → 검색할 iTunes 나라 (기기 지역이 있으면 그쪽이 먼저) */
const COUNTRY = { ko: 'KR', ja: 'JP', tr: 'TR', pt: 'BR', es: 'ES', th: 'TH', ar: 'SA', zh: 'TW', de: 'DE', fr: 'FR', nl: 'NL', pl: 'PL', en: 'US' };

function region() {
  try {
    for (const l of navigator.languages || [navigator.language]) {
      const m = /[-_]([A-Za-z]{2})$/.exec(l || '');
      if (m) return m[1].toUpperCase();
    }
  } catch { /* 없으면 앱 언어로 */ }
  return COUNTRY[langNow()] || 'US';
}

/** 곡 검색 — [{ t, a, al, artUrl, it, am }]. 한국처럼 iTunes 음악 가게가 없는 나라는 미국 가게로 다시 찾는다 */
export async function search(q, { signal } = {}) {
  const term = (q || '').trim();
  if (!term) return [];
  const one = async (c) => {
    const u = `https://itunes.apple.com/search?media=music&entity=song&limit=${MAX_RESULTS}&country=${c}&term=${encodeURIComponent(term)}`;
    const r = await fetch(u, { signal });
    if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json();
    return (j.results || []).filter((x) => x.trackName).map((x) => ({
      t: x.trackName, a: x.artistName || '', al: x.collectionName || '',
      artUrl: x.artworkUrl100 || x.artworkUrl60 || '', it: x.trackId || 0, am: x.trackViewUrl || '',
      pv: previewUrl(x.previewUrl),
    }));
  };
  const c = region();
  let list = await one(c);
  if (!list.length && c !== 'US') list = await one('US');
  const seen = new Set();
  return list.filter((x) => {
    const k = (x.t + '|' + x.a).toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** 붙여 넣은 글에서 음악 링크를 알아본다 → { kind:'yt'|'sp'|'am', … } 또는 null */
export function parseLink(s) {
  const str = (s || '').trim();
  let u = null;
  const m0 = str.match(/https?:\/\/\S+/);
  try { u = new URL(m0 ? m0[0] : str); } catch { return null; }
  if (!/^https?:$/.test(u.protocol)) return null;
  const h = u.hostname.toLowerCase().replace(/^(www|m)\./, '');
  const yt = (id, music) => (/^[\w-]{11}$/.test(id || '')
    ? { kind: 'yt', yt: id, url: (music ? 'https://music.youtube.com/watch?v=' : 'https://www.youtube.com/watch?v=') + id } : null);
  if (h === 'youtu.be') return yt(u.pathname.slice(1).split('/')[0], false);
  if (h === 'youtube.com' || h === 'music.youtube.com') {
    let id = u.searchParams.get('v');
    if (!id) { const m = u.pathname.match(/^\/(?:shorts|embed|live)\/([\w-]{11})/); if (m) id = m[1]; }
    return yt(id, h === 'music.youtube.com');
  }
  if (h === 'open.spotify.com') {
    const m = u.pathname.match(/\/(?:intl-[\w-]+\/)?(track|album|playlist|episode)\/([A-Za-z0-9]{22})/);
    if (m) return { kind: 'sp', sp: m[1] + '/' + m[2], url: `https://open.spotify.com/${m[1]}/${m[2]}` };
    return null;
  }
  if (h === 'music.apple.com') {
    /* 제목은 주소의 이름 조각에서 (예: /kr/album/밤편지/1234?i=5678) */
    const seg = u.pathname.split('/').filter(Boolean);
    const name = seg.length >= 3 ? decodeURIComponent(seg[seg.length - 2]).replace(/-/g, ' ') : '';
    return { kind: 'am', am: u.href, url: u.href, t: name };
  }
  return null;
}

/** 링크로 노래 정보 만들기 (인터넷이 안 되면 링크만 담는다) */
export async function fromLink(p) {
  if (!p) return null;
  if (p.kind === 'yt') {
    let t = '', a = '';
    try {
      const j = await (await fetch('https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent('https://www.youtube.com/watch?v=' + p.yt))).json();
      t = j.title || ''; a = (j.author_name || '').replace(/\s*-\s*Topic$/i, '');
    } catch { /* 제목 없이 */ }
    const art = await thumb('https://i.ytimg.com/vi/' + p.yt + '/mqdefault.jpg');
    return clean({ t, a, art, yt: p.yt, url: p.url });
  }
  if (p.kind === 'sp') {
    let t = '', art = '';
    try {
      const j = await (await fetch('https://open.spotify.com/oembed?url=' + encodeURIComponent(p.url))).json();
      t = j.title || '';
      if (j.thumbnail_url) art = await thumb(j.thumbnail_url);
    } catch { /* 제목 없이 */ }
    return clean({ t, a: '', art, sp: p.sp, url: p.url });
  }
  if (p.kind === 'am') return clean({ t: p.t || '', a: '', am: p.am, url: p.url });
  return null;
}

/** 검색 결과 하나 → 저장할 노래 (그림은 작게 줄여 이 폰에 넣는다) */
export async function fromResult(r) {
  const big = (r.artUrl || '').replace(/\/\d+x\d+bb\./, '/200x200bb.');
  const art = (await thumb(big)) || (await thumb(r.artUrl));
  return clean({ t: r.t, a: r.a, al: r.al, art, it: r.it, am: r.am, pv: r.pv });
}

/** 그림 주소 → 정사각형 작은 그림(dataURL). 실패하면 '' */
export async function thumb(url, size = 160) {
  if (!url) return '';
  try {
    const res = await fetch(url);
    if (!res.ok) return '';
    const bmp = await createImageBitmap(await res.blob());
    const c = document.createElement('canvas');
    c.width = size; c.height = size;
    const s = Math.min(bmp.width, bmp.height);
    c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
    bmp.close?.();
    return c.toDataURL('image/jpeg', 0.82);
  } catch { return ''; }
}

const str = (v, n = 200) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const httpUrl = (v) => (typeof v === 'string' && /^https:\/\//.test(v) ? v.slice(0, 500) : '');

/** 저장 모양으로 다듬는다 (모르는 값은 버린다). 제목·가수·링크가 다 없으면 null */
export function clean(s) {
  if (!s || typeof s !== 'object') return null;
  const o = {};
  const t = str(s.t), a = str(s.a), al = str(s.al);
  if (t) o.t = t;
  if (a) o.a = a;
  if (al) o.al = al;
  if (typeof s.art === 'string' && /^data:image\/(jpeg|png|webp);base64,/.test(s.art) && s.art.length < 80000) o.art = s.art;
  if (Number.isFinite(s.it) && s.it > 0) o.it = s.it;
  if (httpUrl(s.am)) o.am = httpUrl(s.am);
  if (previewUrl(s.pv)) o.pv = previewUrl(s.pv);
  if (/^[\w-]{11}$/.test(s.yt || '')) o.yt = s.yt;
  if (/^(track|album|playlist|episode)\/[A-Za-z0-9]{22}$/.test(s.sp || '')) o.sp = s.sp;
  if (httpUrl(s.url)) o.url = httpUrl(s.url);
  return o.t || o.a || o.url ? o : null;
}

export function label(s) {
  return [s?.t, s?.a].filter(Boolean).join(' · ');
}

/** 다른 앱에서 듣기 — 제목·가수로 그 앱의 검색 화면을 연다 (API 없이) */
export function listenTargets(s) {
  const q = encodeURIComponent([s?.t, s?.a].filter(Boolean).join(' '));
  const out = [];
  if (s?.yt) out.push({ id: 'yt-link', name: 'YouTube', url: s.url || 'https://www.youtube.com/watch?v=' + s.yt });
  if (s?.sp) out.push({ id: 'sp-link', name: 'Spotify', url: s.url || 'https://open.spotify.com/' + s.sp });
  if (q) {
    out.push({ id: 'ytm', name: 'YouTube Music', url: 'https://music.youtube.com/search?q=' + q });
    if (!s?.sp) out.push({ id: 'sp', name: 'Spotify', url: 'https://open.spotify.com/search/' + q });
    out.push({ id: 'am', name: 'Apple Music', url: s?.am || 'https://music.apple.com/search?term=' + q });
    if (!s?.yt) out.push({ id: 'yt', name: 'YouTube', url: 'https://www.youtube.com/results?search_query=' + q });
  } else if (s?.am) out.push({ id: 'am', name: 'Apple Music', url: s.am });
  return out;
}

/** 다른 앱(또는 브라우저)으로 연다. 앱 안에서는 Capacitor 가 바깥 주소를 그 앱으로 넘긴다 */
export function openExternal(url) {
  if (!/^https:\/\//.test(url || '')) return;
  const native = (() => { try { return !!window.Capacitor?.isNativePlatform?.(); } catch { return false; } })();
  if (native) window.location.href = url;
  else window.open(url, '_blank', 'noopener');
}

/* ── 30초 미리듣기 (1.7.9, 사용자 결정 2026-10-29 "안전장치를 두고") ──
   하루콩처럼 검색으로 고른 노래는 Apple 이 주는 30초 미리듣기를 앱 안에서 들려준다.
   안전장치 (Apple Search API 약관: 미리듣기는 홍보용·스토어 배지 곁에·내려받기/저장 금지)
    · 주소만 저장하고 소리는 그때그때 스트리밍한다 (파일을 내려받거나 저장하지 않는다)
    · 누를 때만 튼다 (일기를 열 때 저절로 틀지 않는다)
    · 카드에 'Apple Music에서 듣기' 배지(그 곡 가게 페이지)와 '미리듣기 제공: Apple Music' 표시를 붙인다
    · Apple 주소(https, *.apple.com / *.mzstatic.com)만 받는다 */
export function previewUrl(u) {
  if (typeof u !== 'string') return '';
  try {
    const x = new URL(u);
    if (x.protocol !== 'https:' && x.protocol !== 'http:') return '';
    if (!/(^|\.)(apple\.com|mzstatic\.com)$/i.test(x.hostname)) return '';
    x.protocol = 'https:';
    return x.href.length < 600 ? x.href : '';
  } catch { return ''; }
}

/** 예전에 검색으로 넣은 노래(곡 번호만 있음) → 미리듣기 주소를 다시 찾는다. 없으면 '' */
export async function lookupPreview(it) {
  if (!Number.isFinite(it) || it <= 0) return '';
  try {
    const r = await fetch(`https://itunes.apple.com/lookup?id=${it}&entity=song`);
    if (!r.ok) return '';
    const j = await r.json();
    return previewUrl((j.results || []).find((x) => x.previewUrl)?.previewUrl);
  } catch { return ''; }
}