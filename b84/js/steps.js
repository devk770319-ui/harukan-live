/* ===========================================================
   steps.js — 걸음 수 (1.8.5, 2026-11-08 사용자: "삼성헬스나 구글과 연동 또는 폰의 걸음 센서를 이용할 수 있게.
   걸음 수 직접 적기는 필요 없다")
   · 네이티브 Steps 부품(StepsPlugin.java): 헬스 커넥트(안드로이드 14+ — 삼성 헬스·구글 핏 등이 넣은 걸음)와
     폰 걸음 센서(켠 뒤부터 셈). 둘 다 되면 더 큰 값을 쓴다(한쪽이 빠뜨린 걸음이 있을 수 있어서).
   · 설정 › '걸음 수 가져오기'를 켠 사람만. 부품이 없는 옛 앱·웹에서는 아무것도 안 보인다.
   · 날마다의 걸음은 meta 'stepsDaily' { 'YYYY-MM-DD': n } 에 적어 두고(이 폰 안, 백업에 함께), 글 보기·발견에서 쓴다.
   · 어디에도 보내지 않는다. 통계에는 '켰다/끔'과 연결 방식만 보낸다.
   =========================================================== */
import * as store from './store.js';
import * as analytics from './analytics.js';
import { todayKey } from './ui.js';

function P() { return window.Capacitor?.isNativePlatform?.() ? window.Capacitor?.Plugins?.Steps || null : null; }
function withTimeout(p, ms = 8000) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

export function available() { return !!P(); }
export function isOn() { return available() && !!store.getSettings().stepsOn; }

export async function status() {
  const p = P();
  if (!p) return null;
  try { return await withTimeout(p.status()); } catch { return null; }
}

/** 권한을 묻기 전에 무엇을 왜 읽는지 먼저 알린다 (2026-11-09: 1.8.5 헬스 커넥트 심사 거부 — 인앱 공개·설명 보강). 계속을 누르면 true */
export async function disclose() {
  const { confirmSheet } = await import('./ui.js');
  const { t } = await import('./i18n.js');
  const ok = await confirmSheet({ title: t('걸음 수를 가져오기 전에'), text: t('하루칸은 헬스 커넥트에서 걸음 수만 읽어 홈 화면과 그날 일기에 기록해요. 다른 건강 정보는 읽지 않고, 헬스 커넥트에 아무것도 쓰지 않아요. 헬스 앱이 없으면 폰의 걸음 센서로 셉니다. 걸음 수는 이 폰에만 저장되고 어디에도 보내지 않아요. 설정에서 언제든 끌 수 있어요.'), ok: t('계속') });
  analytics.design('steps:disclose:' + (ok ? 'ok' : 'cancel'));
  return !!ok;
}

/**
 * 켜기: 헬스 커넥트(되면) → 폰 센서(있으면) 순서로 권한을 묻는다.
 * @returns {Promise<'ok'|'denied'|'none'>}  none = 이 폰에서는 걸음을 셀 방법이 없음
 */
export async function connect() {
  const p = P();
  if (!p) return 'none';
  let st = await status();
  if (!st) return 'none';
  if (!st.hc && !st.sensor) return 'none';
  /* 권한 창은 앱 밖 화면이라 다녀오면 '다시 잠금'이 걸렸다 (테스트폰 2026-11-08) — 일부러 보낸 길로 표시 */
  const out = () => { try { window.__hkOutAt = Date.now(); window.__hkPermFlow = Date.now(); } catch { /* */ } };
  try { if (st.hc && !st.hcGranted) { out(); await withTimeout(p.request({ kind: 'health' }), 120000); } } catch { /* */ }
  try { if (st.sensor) { out(); await withTimeout(p.request({ kind: 'activity' }), 120000); } } catch { /* */ }   // 이미 허용이면 센서 기준만 잡는다
  setTimeout(() => { window.__hkPermFlow = 0; }, 3000);   // 돌아오는 신호가 늦게 와도 잠그지 않게 조금 뒤에 푼다
  st = await status();
  const ok = !!(st && (st.hcGranted || (st.sensor && st.sensorGranted)));
  analytics.design('steps:connect:' + (ok ? (st.hcGranted ? (st.sensorGranted ? 'both' : 'hc') : 'sensor') : 'denied'));
  if (ok) await store.saveSettings({ stepsOn: true }, { silent: true });   // 다시 그리면 이어서 띄우는 안내 창이 닫힌다
  return ok ? 'ok' : 'denied';
}

export async function disconnect() {
  analytics.design('steps:off');
  await store.saveSettings({ stepsOn: false }, { silent: true });
}

export async function openHealthSettings() {
  try { window.__hkOutAt = Date.now(); await P()?.openHealthSettings(); return true; } catch { return false; }
}
export async function openSamsungHealth() {
  try { window.__hkOutAt = Date.now(); await P()?.openSamsungHealth(); return true; } catch { return false; }
}

/** 삼성 헬스가 있는데 헬스 커넥트로 걸음이 안 들어오면(동기화 꺼짐) 안내가 필요하다 */
export async function needsShealthSync() {
  const st = await status();
  if (!st?.shealth || !st.hcGranted) return false;
  try { const r = await withTimeout(P().today()); return !(r?.hc > 0); } catch { return false; }
}

/* ── 날마다의 걸음 (meta) ───────────────────── */
let daily = null;
async function loadDaily() {
  if (!daily) daily = (await store.metaGet('stepsDaily', null)) || {};
  return daily;
}
async function saveDaily(add) {
  const d = await loadDaily();
  let changed = false;
  for (const [k, v] of Object.entries(add)) if (typeof v === 'number' && v >= 0 && d[k] !== v) { d[k] = v; changed = true; }
  if (changed) {
    /* 2년치만 남긴다 */
    const keys = Object.keys(d).sort();
    while (keys.length > 730) delete d[keys.shift()];
    await store.metaSet('stepsDaily', d);
  }
}
/** 이미 적어 둔 그날 걸음 (없으면 null) — 그리는 쪽에서 바로 쓴다 */
export async function dayCached(key) {
  const d = await loadDaily();
  return typeof d[key] === 'number' ? d[key] : null;
}
export async function allCached() { return { ...(await loadDaily()) }; }

let todayAt = 0, todayVal = null;
/** 오늘 걸음 (30초 동안은 같은 값) */
export async function today() {
  if (!isOn()) return null;
  if (Date.now() - todayAt < 30000) return todayVal;
  try {
    const r = await withTimeout(P().today());
    todayVal = typeof r?.steps === 'number' ? r.steps : null;
    todayAt = Date.now();
    if (todayVal != null) await saveDaily({ [todayKey()]: todayVal });
  } catch { /* */ }
  return todayVal;
}

let syncedAt = 0;
/** 지난 n일 걸음을 받아 적어 둔다 (하루에 몇 번만) */
export async function sync(n = 60) {
  if (!isOn()) return null;
  if (Date.now() - syncedAt < 10 * 60000) return loadDaily();
  try {
    const r = await withTimeout(P().days({ n }), 15000);
    const add = {};
    for (const x of r?.days || []) add[x.date] = x.steps;
    await saveDaily(add);
    syncedAt = Date.now();
  } catch { /* */ }
  return loadDaily();
}

/** 발 모양 작은 아이콘 (아이콘 묶음에 없어서 여기 둔다) */
export const FOOT = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.2 3.5c1.6 0 2.6 1.9 2.4 4.3-.2 2.3-1.3 4-2.8 4s-2.6-1.7-2.5-4c.1-2.4 1.3-4.3 2.9-4.3zM7.6 14.2c1.4.1 2.4.9 2.3 2.2-.1 1.4-1.2 2.3-2.6 2.2-1.4-.1-2.3-1.1-2.2-2.4.1-1.2 1.1-2.1 2.5-2zM16 6.5c1.6.1 2.7 2 2.5 4.3-.2 2.3-1.4 4-2.9 3.9s-2.5-1.9-2.4-4.2c.1-2.4 1.2-4.1 2.8-4zM16.4 16.8c1.4.1 2.3 1 2.2 2.3-.1 1.3-1.2 2.2-2.6 2.1-1.4-.1-2.3-1-2.2-2.3.1-1.3 1.2-2.2 2.6-2.1z"/></svg>';
