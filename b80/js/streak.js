/* ===========================================================
   streak.js — 연속 기록 알림·축하, 주간 정리 카드 (2026-11-07 사용자 지시)
   "3일째·5일째에 맞춤 알림('3일 연속 썼어요' 같은 연속 기록 보상), 일주일 기록 요약 보여 주기"
   배경(광고분석): 설치 다음 날 30~35% 가 돌아오는데 7일째에는 7~12% — 3~7일차 이탈을 줄인다.

   · 알림 수는 늘리지 않는다. 매일 알림(켠 사람만)의 그날 문구를 바꿀 뿐이다.
     - 어제까지 2일 연속 → 오늘 알림 "오늘 쓰면 3일 연속이에요"
     - 어제까지 4일 연속 → 오늘 알림 "오늘 쓰면 5일 연속이에요"
     - 설치 7일째 → "첫 일주일 기록을 정리했어요" (누르면 발견의 이번 주 리포트)
     오늘 이미 썼으면 그날 알림 자체가 없다(native.refreshDailyReminders).
   · 축하는 작게: 오늘 글을 새로 저장해 3·5·7일 연속이 되면 위쪽에 작은 카드가 잠깐 떴다 사라진다.
     같은 연속 구간에서 같은 숫자는 한 번만.
   · 주간 정리 카드: 설치 7일째 하루, 그리고 매주 일요일 17시부터 그날 끝까지 홈 맨 위에.
     누르면 발견의 이번 주 리포트로. 한 번 열면 그 주(또는 첫 주)에는 다시 안 뜬다.
   · 예시 데이터(demo)는 세지 않는다.
   =========================================================== */

import * as store from './store.js';
import * as analytics from './analytics.js';
import { t } from './i18n.js';
import { todayKey, addDays, weekStart, el, icon, esc } from './ui.js';

const keyOf = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

function realDays() {
  const s = new Set();
  for (const e of store.live()) if (!e.demo && !e.deletedAt) s.add(e.date);
  return s;
}

/** key 날짜(포함)에서 거꾸로 이어 쓴 날 수 */
export function runEndingAt(key, days = realDays()) {
  let n = 0;
  for (let k = key; days.has(k); k = addDays(k, -1)) n++;
  return n;
}

/** 설치(체험 시작) 날짜 */
function installKey() {
  const ts = store.getSettings().trialStartedAt;
  return ts ? keyOf(new Date(ts)) : null;
}
/** 설치 7일째 (설치한 날 + 7) */
export function firstWeekKey() {
  const k = installKey();
  return k ? addDays(k, 7) : null;
}

function onceLS(k) {
  try { if (localStorage.getItem(k)) return false; localStorage.setItem(k, '1'); return true; } catch { return false; }
}

/**
 * 매일 알림 그날 문구. 해당 없으면 null.
 * @param {Date} at 알림 시각
 * @returns {{ body: string, extra: object } | null}
 */
export function notifFor(at) {
  try {
    const key = keyOf(at);
    const days = realDays();
    if (key === firstWeekKey()) {
      const from = addDays(key, -7);
      if ([...days].some((d) => d >= from && d < key)) {
        if (onceLS('hk.wkSched:' + key)) analytics.design('weekly:notif:sched');
        return { body: t('첫 일주일 기록을 정리했어요. 나의 한 주를 확인해 보세요.'), extra: { weekly: 1 } };
      }
    }
    const run = runEndingAt(addDays(key, -1), days);
    const kind = run === 2 ? 'd3' : run === 4 ? 'd5' : null;
    if (!kind) return null;
    if (onceLS(`hk.stkSched:${key}:${kind}`)) analytics.design(`streak:notif:${kind}:sched`);
    return {
      body: kind === 'd3' ? t('오늘 쓰면 3일 연속이에요. 한 줄이면 충분해요.') : t('오늘 쓰면 5일 연속이에요. 이 흐름 그대로 이어가요.'),
      extra: { streak: kind },
    };
  } catch { return null; }
}

/* ── 축하 ──────────────────────────────────────── */
const REWARD = [3, 5, 7];

/** 오늘 날짜 글을 새로 저장한 직후 (write.js). 3·5·7일 연속이면 작은 축하 카드 */
export async function afterSave(entry) {
  try {
    const today = todayKey();
    if (!entry || entry.demo || entry.date !== today) return;
    const run = runEndingAt(today);
    if (!REWARD.includes(run)) return;
    const id = `${addDays(today, -(run - 1))}:${run}`;          // 이 연속 구간의 시작일 + 숫자
    const shown = await store.metaGet('streakRewards', []);
    if (shown.includes(id)) return;
    await store.metaSet('streakRewards', [...shown, id].slice(-30));
    analytics.design('streak:reward:' + run);
    setTimeout(() => celebrate(run), 700);                      // 글 보기 화면으로 넘어간 뒤에
  } catch { /* 축하는 못 해도 그만 */ }
}

export function celebrate(n) {
  document.querySelector('.streak-pop')?.remove();
  const p = el('div', { class: 'streak-pop', role: 'status' });
  p.innerHTML =
    `<div class="streak-pop-ico">${icon('leaf')}</div>
     <div class="streak-pop-tx"><div class="streak-pop-t">${esc(t('{n}일 연속으로 썼어요', { n }))}</div>
       <div class="streak-pop-s">${esc(t('내일도 한 칸이면 {n}일째예요.', { n: n + 1 }))}</div></div>`;
  const close = () => { p.classList.remove('on'); setTimeout(() => p.remove(), 300); };
  p.addEventListener('click', close);
  document.body.append(p);
  requestAnimationFrame(() => p.classList.add('on'));
  setTimeout(close, 3600);
}

/* ── 주간 정리 카드 (홈) ───────────────────────── */
/** 지금 띄울 카드: { id, first } 또는 null */
export async function weeklyCardState(now = new Date()) {
  const today = keyOf(now);
  const ws = weekStart(today);
  const days = realDays();
  const inWeek = [...days].filter((d) => d >= ws && d <= addDays(ws, 6)).length;
  if (!inWeek) return null;
  const seen = await store.metaGet('weeklyCardSeen', []);
  const fw = firstWeekKey();
  if (fw && today === fw && !seen.includes('first')) return { id: 'first', first: true };
  if (fw && today === fw) return null;   // 설치 7일째가 일요일 저녁이면 첫 주 카드만 (열자마자 '이번 주' 카드가 또 뜨지 않게, 2026-11-08)
  if (now.getDay() === 0 && now.getHours() >= 17 && !seen.includes(ws)) return { id: ws, first: false };
  return null;
}

/** 홈에 붙일 카드 (없으면 null) */
export async function weeklyCard() {
  try {
    const st = await weeklyCardState();
    if (!st) return null;
    const ws = weekStart(todayKey());
    const n = store.live().filter((e) => !e.demo && e.date >= ws && e.date <= addDays(ws, 6)).length;
    const c = el('button', { class: 'card weekly-card', type: 'button' });
    c.innerHTML =
      `<div class="weekly-card-ico">${icon('chart')}</div>
       <div class="weekly-card-txt"><div class="weekly-card-t">${esc(st.first ? t('첫 일주일 기록을 정리했어요') : t('이번 주 기록을 정리했어요'))}</div>
         <div class="weekly-card-s">${esc(t('이번 주 {n}편', { n }))} · ${esc(t('리포트 보기'))}</div></div>
       <div class="weekly-card-r">${icon('chev')}</div>`;
    if (onceLS(`hk.wkShown:${st.id}:${todayKey()}`)) analytics.design('weekly:card:shown');
    c.addEventListener('click', async () => {
      analytics.design('weekly:card:open');
      const seen = await store.metaGet('weeklyCardSeen', []);
      await store.metaSet('weeklyCardSeen', [...seen, st.id].slice(-20));
      const { go } = await import('./app.js');
      go('/insights?week=1');
    });
    return c;
  } catch { return null; }
}
