/* ──────────────────────────────────────────────────────────────
   campaign.js — 새 기능 안내 그림 알림 (1.8.1, 2026-11-05 사용자: "편지 쓰기 기능 알림을 이미지를 첨부해서 보내고 싶다")

   서버(푸시)가 없다. 앱이 패치를 받은 뒤, 정해 둔 시각에 폰 안에서 그림 알림을 하나 건다 (RichNotify 플러그인 → BigPictureStyle).
   · 한 사람에게 캠페인마다 한 번만 (meta 'campaign:<id>')
   · 알림 권한이 있고, 앱을 두 번 넘게 연 사람에게만
   · 플러그인이 없는 앱(1.8.0 이하)에는 아무것도 하지 않는다 — 그림 없는 글자 알림으로 대신하지 않는다 (사용자 뜻)
   · 알림을 누르면 route 로 간다 (MainActivity → takeRoute)
   ────────────────────────────────────────────────────────────── */
import * as store from './store.js';
import * as native from './native.js';
import * as analytics from './analytics.js';
import { t } from './i18n.js';

/** 캠페인 목록. image 는 www 안 경로(앱이 base64 로 읽어 네이티브에 넘긴다, ≤1MB) */
export const CAMPAIGNS = [
  {
    id: 'letter-2026-11', minNative: 49, image: 'campaign/letter.jpg', route: '/letter?new=1',
    title: () => t('친구에게 편지를 써 보세요'),
    body: () => t('사진·스티커·손글씨로 쓴 편지를 그림 한 장으로 보내요. 홈의 \'편지 쓰기\'에서.'),
    /* 처음 본 다음 날 저녁 7:30 */
    when: (now) => { const d = new Date(now); d.setDate(d.getDate() + 1); d.setHours(19, 30, 0, 0); return d.getTime(); },
    minOpens: 2,
  },
];

function RN() { return window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.RichNotify : null; }
export function available() { return !!RN()?.scheduleAt; }

async function nativeBuild() {
  try { const A = window.Capacitor?.Plugins?.App; if (A?.getInfo) { const i = await A.getInfo(); const b = +i.build; if (Number.isFinite(b)) return b; } } catch { /* */ }
  return 0;
}

async function imageBase64(path) {
  const res = await fetch(path);
  if (!res.ok) throw new Error('image ' + res.status);
  const blob = await res.blob();
  if (blob.size > 1_000_000) throw new Error('image too big');
  return await new Promise((ok, no) => { const fr = new FileReader(); fr.onerror = () => no(new Error('read')); fr.onload = () => ok(String(fr.result)); fr.readAsDataURL(blob); });
}

/** 앱을 켤 때 한 번. 아직 안 건 캠페인을 건다 */
export async function schedulePending({ now = Date.now() } = {}) {
  if (!available()) return [];
  const opens = (+(await store.metaGet('opens', 0))) || 0;
  let perm = 'denied';
  try { perm = await native.notifyPermission(); } catch { perm = 'denied'; }
  const build = await nativeBuild();
  const done = [];
  for (const c of CAMPAIGNS) {
    const key = 'campaign:' + c.id;
    if (await store.metaGet(key, null)) continue;
    if (build && c.minNative && build < c.minNative) continue;
    if (perm !== 'granted') continue;
    if (opens < (c.minOpens || 0)) continue;
    try {
      const img = await imageBase64(c.image);
      const at = c.when(now);
      await RN().scheduleAt({ id: idOf(c.id), at, title: c.title(), body: c.body(), bigText: c.body(), route: c.route, imageBase64: img });
      await store.metaSet(key, { at, scheduledAt: now });
      analytics.design('campaign:' + c.id.split('-')[0] + ':scheduled');
      done.push(c.id);
    } catch (e) { console.error('캠페인 알림 예약 실패', c.id, e); }
  }
  return done;
}

export function idOf(id) { let h = 0; for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) & 0xffff; return 7100 + (h % 400); }

/** 앱이 열릴 때마다 — 열린 횟수를 센다 (minOpens 용) */
export async function countOpen() {
  const n = ((+(await store.metaGet('opens', 0))) || 0) + 1;
  await store.metaSet('opens', n);
  return n;
}

/** 그림 알림을 눌러 열렸으면 그 길로 간다. 돌아오는 값: route 또는 null */
export async function takeRoute() {
  const P = RN(); if (!P?.takeRoute) return null;
  try { const r = await P.takeRoute(); const route = r?.route || null; if (route) analytics.design('campaign:letter:tap'); return route; } catch { return null; }
}
