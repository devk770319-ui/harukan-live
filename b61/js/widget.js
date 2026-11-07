/* ===========================================================
   widget.js — 홈 화면 위젯에 넘길 것 (1.8.4, 2026-11-06 사용자 지시: "위젯 작업을 진행해줘")
   네이티브(HkWidgets.java)는 그리기만 하고, 무엇을 보일지는 전부 여기서 정한다 → 문구·규칙은 웹 패치로 고칠 수 있다.
   · 오늘부터 7일치: 날짜 글자, 오늘의 질문, 되새김(1년 전 오늘 등), 습관(그날 해야 하는 것과 기준값)
   · 글을 쓴 날(최근 400일)과 기분 색 — 이번 주 칸·1년의 칸
   · 잠금이 켜져 있으면: 일기 내용·사진·기분 색을 넣지 않는다 (위젯은 잠금 화면 없이 보인다). 잠겨서 열쇠가 없으면 아예 안 보낸다.
   · 습관은 플러스 전용 — 못 쓰면 habitsOk:false (위젯은 안내만)
   · 위젯에서 누른 습관 체크는 네이티브 대기열에 쌓인다 → applyActions() 가 실제 기록에 넣는다 (켤 때·돌아올 때)
   · 기분만 눌러 칸을 채우는 위젯은 만들지 않는다 (사용자 2026-10-30 '기분만 남기기' 거부)
   =========================================================== */
import * as store from './store.js';
import * as i18n from './i18n.js';
import { t } from './i18n.js';
import { todayKey, addDays, fmtDate, daysBetween, parseKey, moodColor } from './ui.js';
import { pickPrompts } from './prompts.js';
import { buildRecalls } from './recall.js';

const P = () => window.Capacitor?.Plugins?.HkWidget;
const isNative = () => !!window.Capacitor?.isNativePlatform?.();
export function available() { return isNative() && !!P()?.update; }

function withTimeout(p, ms) { return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]); }

/* ── 기분 색 → #rrggbb (안드로이드 Color.parseColor 용) ── */
function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => Math.round(255 * (l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1))))).toString(16).padStart(2, '0');
  return '#' + f(0) + f(8) + f(4);
}
function moodHex(mood) {
  if (!mood) return '';
  const m = /hsl\(\s*([\d.]+)\s+([\d.]+)%\s+([\d.]+)%/.exec(moodColor(mood, { light: 50 + ((mood.e ?? 0) + 1) / 2 * 14 }));
  return m ? hslHex(+m[1], +m[2], +m[3]) : '';
}

/* ── 사진 줄이기 (되새김) ── */
async function thumb(dataUrl, max = 480) {
  if (!dataUrl) return '';
  try {
    const img = new Image();
    img.src = dataUrl;
    await img.decode();
    const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * r)); c.height = Math.max(1, Math.round(img.naturalHeight * r));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    return c.toDataURL('image/jpeg', 0.78);   // 웹뷰에서 toBlob 은 느리다 (1.6.4)
  } catch { return ''; }
}
const sentPhotos = new Set();   // 네이티브가 이미 파일로 가진 사진 — 다시 보내지 않는다
const retried = new Set();      // 빠진 사진을 다시 보낸 적 있는 것 (끝없이 되풀이하지 않게)

/* ── 습관 한 줄 ── */
function remsOf(h) {
  return (h.reminders || []).slice().sort().map((x) => { const [hh, mm] = String(x).split(':').map(Number); return Number.isFinite(hh) ? hh * 60 + (mm || 0) : null; })
    .filter((x) => x != null);
}
function habitItem(C, h, day) {
  const g = h.goal || { kind: 'check' };
  const kind = ['check', 'count', 'quantity', 'limit'].includes(g.kind) ? g.kind : 'check';
  const unit = C.unitOf(h);
  const dayUnit = kind === 'limit' ? true : unit === 'day';
  const v = C.valueOn(h, day);
  const it = { id: h.id, name: h.name || '', icon: h.icon || '•', kind, v, dayUnit, skip: C.isSkip(h, day) };
  const ps = C.periodState(h, day, day);
  if (kind === 'limit') {
    it.max = g.max ?? 0;
    it.other = (ps.total || 0) - v;
    it.fmt = t('{a}/{b} 이하', { b: `${g.max ?? 0}${g.unit || ''}` }).replace('{a}', '{x}');
  } else if (!dayUnit) {
    it.need = ps.need || h.schedule?.n || 1;
    it.other = (ps.done || 0) - (C.dayDone(h, day) ? 1 : 0);
    it.fmt = (unit === 'week' ? t('이번 주 {a}/{b}') : t('이번 달 {a}/{b}')).replace('{b}', String(it.need)).replace('{a}', '{x}');
    it.target = g.target || 1;
  } else if (kind === 'count' || kind === 'quantity') {
    it.target = g.target || 1;
    it.fmt = `{x}/${(g.target || 1).toLocaleString(i18n.locale())}${kind === 'quantity' ? (g.unit || '') : ''}`;
  }
  const rems = remsOf(h);
  if (rems.length) {
    it.rem = rems;
    it.remT = rems.map((m) => i18n.fmtClock(`${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`));
  }
  return it;
}

/* ── 스냅샷 만들기 ── */
async function build() {
  const today = todayKey();
  const s = store.getSettings();
  const lockOn = !!(await store.metaGet('lock', null));
  if (lockOn && !store.hasCryptoKey()) return null;   // 잠겨서 못 읽는 상태 — 이전 스냅샷을 그대로 둔다

  const all = store.live();
  const real = all.filter((e) => !e.demo);
  const entries = real;   // 예시(둘러보기) 글은 위젯에 넣지 않는다 — 남의 글처럼 보인다 (2026-11-06 리뷰 사례)

  /* 글 쓴 날 + 기분 색 (최근 400일) */
  const from = addDays(today, -400);
  const written = {};
  for (const e of entries.slice().reverse()) {   // 오래된 것부터 → 같은 날 여러 편이면 마지막(최신) 기분이 남는다
    if (e.date < from || e.date > today) continue;
    const col = lockOn ? '' : moodHex(e.mood);
    if (!(e.date in written) || col) written[e.date] = col || written[e.date] || '';
  }

  /* 오늘의 질문 문맥 (홈과 같은 방식) */
  let recentMoodAvg = null;
  try { recentMoodAvg = (await import('./insights.js')).recentMoodAvg(entries); } catch { /* */ }
  const lastDate = entries[0]?.date || null;

  /* 습관 */
  let H = null, C = null, habitsOk = true;
  try {
    H = await import('./habits.js'); C = await import('./habitcore.js');
    await H.load();
    if (H.isLockedOut()) return null;
    const plus = await import('./plus.js');
    habitsOk = plus.canUseHabits(H.active());
  } catch (e) { console.error('위젯 습관', e); H = null; }

  /* 일정 (오늘 할 일 위젯, 2026-11-06) — 날짜별로, 반복 일정의 앞으로 회차까지 */
  let PL = null;
  try { PL = await import('./plans.js'); await PL.loadAll(); } catch (e) { console.error('위젯 일정', e); PL = null; }
  const planItems = (k) => {
    if (!PL) return [];
    try {
      return PL.occurrences(k, k).map((p) => {
        const [hh, mm] = String(p.time || '').split(':').map(Number);
        const min = p.time && Number.isFinite(hh) ? hh * 60 + (mm || 0) : -1;
        return { id: p.id, title: p.title || t('일정'), done: !!p.done && !p.virtual, min, timeT: min >= 0 ? i18n.fmtClock(p.time) : '' };
      });
    } catch { return []; }
  };

  const days = {};
  const photos = {};
  for (let i = 0; i < 7; i++) {
    const k = addDays(today, i);
    const d = { date: fmtDate(k, { year: false, weekday: true }) };
    d.q = pickPrompts({ dateKey: k, daysSinceLast: lastDate ? Math.max(0, daysBetween(lastDate, k)) : null, recentMoodAvg, nth: entries.length + 1 })[0] || '';
    if (!lockOn) {
      const r = buildRecalls(entries, k).find((x) => x.kind === 'anniv' || x.kind === 'milestone');
      if (r) {
        const e = r.entry;
        const dt = parseKey(e.date);
        d.recall = {
          label: `${r.label} · ${dt.getFullYear()}.${String(dt.getMonth() + 1).padStart(2, '0')}.${String(dt.getDate()).padStart(2, '0')}`,
          text: (e.body || e.title || '').replace(/\s+/g, ' ').trim().slice(0, 160),
          entryId: e.id,
        };
        const pid = e.photos?.[0];
        if (pid) {
          d.recall.photo = pid;
          if (!(pid in photos)) photos[pid] = sentPhotos.has(pid) ? '' : await thumb(await store.getPhoto(pid).catch(() => null));
        }
      }
    }
    if (H && habitsOk) {
      try { d.habits = H.split(k).due.map((h) => habitItem(C, h, k)); } catch (e) { console.error('위젯 습관 줄', e); d.habits = []; }
    } else d.habits = [];
    d.plans = planItems(k);
    days[k] = d;
  }

  /* 요일 (월요일부터) */
  const wd = i18n.weekdayShort();
  const wdMon = [...wd.slice(1), wd[0]];

  return {
    v: 1, at: Date.now(), lang: i18n.current(), locked: lockOn, habitsOk,
    weeklyGoal: s.weeklyGoal || 4, wd: wdMon, written, days, photos, dflt: '#C25A6E',
    str: {
      brand: t('하루칸'),
      write: '+ ' + t('한 칸 쓰기'),
      writeMore: '+ ' + t('한 편 더'),
      filled: t('오늘 한 칸을 채웠어요'),
      weekGoal: t('이번 주 목표'),
      yearTitle: t('{y}년의 칸'),
      yearCount: t('{n}칸 채움'),
      yearFoot: t('하루 한 칸, 1년이 채워지고 있어요'),
      recallTitle: t('1년 전 오늘'),
      recallOpen: t('그날 일기 보기') + ' ›',
      recallEmpty: t('아직 돌아볼 지난 일기가 없어요. 오늘 한 칸을 쓰면 내년 오늘 여기서 다시 만나요.'),
      recallLocked: t('잠금이 켜져 있어서 일기 내용은 앱에서만 보여요.'),
      openLink: t('열기') + ' ›',
      habitsTitle: t('오늘의 습관'),
      habitsAllDone: t('오늘 습관 {n}개를 다 했어요'),
      habitsAllDoneShort: t('오늘 할 습관을 다 했어요!'),
      habitsNext: t('다음 · {t} {name}'),
      habitsNextNoTime: t('다음 · {name}'),
      tomorrowFirst: t('내일 첫 습관 · {t} {name}'),
      tomorrowFirstNoTime: t('내일 첫 습관 · {name}'),
      habitsNone: t('오늘 할 습관이 없어요'),
      habitsNoneSub: t('눌러서 습관을 만들어 보세요'),
      habitsPlus: t('습관은 하루칸 플러스 기능이에요'),
      habitsPlusSub: t('만들어 둔 습관과 기록은 그대로 있어요. 눌러서 플러스 보기'),
      habitsPlusShort: t('플러스 기능이에요'),
      skipped: t('건너뜀'),
      stale: t('하루칸을 열면 위젯이 새로 고쳐져요'),
      agendaTitle: t('오늘 할 일'),
      agendaLeft: t('남은 {n}개'),
      agendaPlan: t('일정'),
      agendaHabit: t('습관'),
      agendaAllDay: t('종일'),
      agendaAnytime: t('오늘 안에'),
      agendaDone: t('완료'),
      agendaOpenPlan: '',   // 일정 카드는 › 버튼이 이미 있어 글자를 넣지 않는다 (좁은 2×2 에서 '일정 보…'로 잘렸다)
      agendaEmpty: t('오늘은 남은 일정도 습관도 없어요. 눌러서 일정을 더해 보세요.'),
    },
  };
}

export { build as _build };   // 시험용 (에뮬레이터에서 상태를 바꿔 그려 본다)

/* ── 보내기 (모아서 한 번) ── */
let timer = null, running = false, again = false, lastDay = null;
export function sync(delay = 1200) {
  if (!available()) return;
  clearTimeout(timer);
  timer = setTimeout(run, delay);
}
async function run() {
  if (running) { again = true; return; }
  running = true;
  try {
    const snap = await build();
    if (!snap) return;
    const keep = Object.keys(snap.photos || {});
    const r = await withTimeout(P().update({ snap: JSON.stringify(snap) }), 8000);
    /* 네이티브가 실제로 가진 사진에 맞춘다. 빈 값으로 보낸 사진이 없으면(잠금을 켰다 끈 뒤 등) 한 번 더 보낸다 */
    const have = Array.isArray(r?.have) ? new Set(r.have) : new Set(keep);
    sentPhotos.clear();
    for (const id of keep) if (have.has(id.replace(/[^A-Za-z0-9_-]/g, '_'))) { sentPhotos.add(id); retried.delete(id); }
    const miss = keep.filter((id) => !sentPhotos.has(id) && !retried.has(id));
    if (miss.length) { for (const id of miss) retried.add(id); again = true; }   // 사진마다 한 번만 다시
    lastDay = todayKey();
  } catch (e) { console.error('위젯 보내기', e); }
  finally {
    running = false;
    if (again) { again = false; sync(300); }
  }
}

/** 위젯에서 누른 습관 체크를 실제 기록에 넣는다. 넣은 개수 */
/* 두 단계로 한다 (에뮬레이터에서 앱으로 돌아올 때 네이티브 응답이 몇 초씩 늦어 시간초과로 대기열을 잃는 것을 봄):
   지우지 않고 보기(peek) → 기록에 넣기 → 넣은 것까지 지우기(ack). 넣은 것은 meta 'widgetApplied' 에 적어 두 번 넣지 않는다 */
let applying = null;
export function applyActions() {
  if (!applying) applying = applyNow().finally(() => { applying = null; });
  return applying;
}
async function applyNow() {
  if (!available() || !(P().peekActions || P().takeActions)) return 0;
  /* 잠겨서 습관을 못 읽으면 꺼내지 않는다 — 대기열에 그대로 두고 잠금을 푼 뒤에 */
  const lockOn = !!(await store.metaGet('lock', null));
  if (lockOn && !store.hasCryptoKey()) return 0;
  const peek = !!P().peekActions;
  let items = [];
  try { items = (await withTimeout(peek ? P().peekActions() : P().takeActions(), 15000))?.items || []; } catch { return 0; }
  if (!items.length) return 0;
  const H = await import('./habits.js');
  await H.load();
  if (H.isLockedOut()) return 0;
  const applied = new Set(await store.metaGet('widgetApplied', []));
  let n = 0, maxAt = 0;
  for (const a of items) {
    maxAt = Math.max(maxAt, Number(a?.at) || 0);
    const key = `${a?.habit}|${a?.day}|${a?.at}`;
    if (applied.has(key)) continue;
    applied.add(key);
    if (!a?.habit || !a.day || !H.byId(a.habit)) continue;
    try { await H.tap(a.habit, a.day); n++; } catch (e) { console.error('위젯 체크 반영', e); }
  }
  await store.metaSet('widgetApplied', [...applied].slice(-300));
  if (peek) { try { await withTimeout(P().ackActions({ before: maxAt }), 15000); } catch { /* 다음에 다시 보더라도 위 목록 덕에 두 번 넣지 않는다 */ } }
  sync(200);
  if (n) {
    try { (await import('./analytics.js')).design('widget:habit_tap', n); } catch { /* */ }
    try { (await import('./app.js')).syncHabitReminders(); } catch { /* */ }
  }
  return n;
}

/** 위젯을 눌러 열렸으면 그 화면 경로 (한 번만) */
export async function takeRoute() {
  if (!available() || !P().takeRoute) return null;
  try { return (await withTimeout(P().takeRoute(), 15000))?.route || null; } catch { return null; }
}

/** 놓인 위젯 수 {today, week, year, recall, habits, ring} — 분석용 */
export async function placed() {
  if (!available() || !P().placed) return null;
  try { return await withTimeout(P().placed(), 2000); } catch { return null; }
}

export async function canPin() {
  if (!available() || !P().canPin) return false;
  try { return !!(await withTimeout(P().canPin(), 2000))?.ok; } catch { return false; }
}
export async function pin(kind) {
  if (!available() || !P().pin) return false;
  try { return !!(await withTimeout(P().pin({ kind }), 4000))?.ok; } catch { return false; }
}

/* ── 설정 '홈 화면 위젯' 창 — 고르면 홈 화면에 바로 놓기(런처가 지원할 때) ── */
export const KINDS = [
  { k: 'today', name: () => t('오늘의 한 칸'), sub: () => t('오늘의 질문과 바로 쓰기'), size: '2×2', ico: 'edit' },
  { k: 'week', name: () => t('이번 주 칸'), sub: () => t('이번 주 일곱 칸과 주 목표'), size: '4×1', ico: 'cal' },
  { k: 'year', name: () => t('1년의 칸'), sub: () => t('하루 한 칸, 1년을 채워 가요'), size: '4×3', ico: 'spark' },
  { k: 'recall', name: () => t('1년 전 오늘'), sub: () => t('지난 이맘때 쓴 일기 한 장면'), size: '4×2', ico: 'clock' },
  { k: 'habits', name: () => t('오늘의 습관'), sub: () => t('홈 화면에서 바로 체크하는 습관'), size: '4×2', ico: 'check', habit: true },
  { k: 'agenda', name: () => t('오늘 할 일'), sub: () => t('일정과 습관을 시각 순서로 한 칸씩, 밀어서 넘겨 봐요'), size: '2×2', ico: 'cal' },
  { k: 'ring', name: () => t('습관 진행'), sub: () => t('몇 개 했는지와 다음 습관'), size: '2×2', ico: 'heart', habit: true },
];
export async function showPicker() {
  const ui = await import('./ui.js');
  const an = await import('./analytics.js');
  import('./newbadge.js').then((m) => m.used('widget')).catch(() => {});
  an.design('widget:picker:open');
  const can = await canPin();
  let habitsOk = true;
  try { const H = await import('./habits.js'); await H.load(); habitsOk = (await import('./plus.js')).canUseHabits(H.active()); } catch { /* */ }
  const lockOn = !!(await store.metaGet('lock', null));
  const manual = t('홈 화면의 빈 곳을 길게 누른 뒤 ‘위젯’에서 하루칸을 골라 놓아 주세요.');
  ui.openSheet({
    title: t('홈 화면 위젯'),
    text: (can ? t('고르면 홈 화면에 바로 놓을 수 있어요.') : manual)
      + (lockOn ? ' ' + t('잠금이 켜져 있어서 위젯에는 일기 내용과 사진이 보이지 않아요.') : ''),
    items: KINDS.map((x) => ({
      label: x.name() + (x.habit && !habitsOk ? ' · PLUS' : ''),
      sub: `${x.sub()} · ${x.size}`,
      icon: x.ico,
      onClick: async () => {
        an.design('widget:picker:' + x.k);
        if (!can) { ui.toast(manual); return; }
        const ok = await pin(x.k);
        if (!ok) ui.toast(manual);
      },
    })),
  });
}

/** 모든 데이터 지우기 때 */
export async function clear() {
  if (!available() || !P().clear) return;
  try { await withTimeout(P().clear(), 3000); } catch { /* */ }
}

/* ── 연결 (app.js finishBoot 에서 한 번) ── */
let inited = false;
export async function init() {
  if (inited || !available()) return;
  inited = true;
  try { await applyActions(); } catch { /* */ }
  sync(800);
  store.subscribe(() => sync());
  import('./habits.js').then((H) => H.subscribe(() => sync())).catch(() => {});
  import('./plans.js').then((PLm) => PLm.subscribe(() => sync())).catch(() => {});   // 일정 (오늘 할 일 위젯)
  i18n.onChange?.(() => sync(300));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') { clearTimeout(timer); run(); return; }   // 나갈 때 바로 — 홈 화면 위젯이 지금 상태로
    applyActions().then((n) => { if (n || lastDay !== todayKey()) sync(300); }).catch(() => {});
  });
  /* 분석: 위젯을 놓은 사람 (하루 한 번) */
  setTimeout(async () => {
    try {
      const p = await placed();
      if (!p) return;
      const kinds = Object.entries(p).filter(([, n]) => n > 0).map(([k]) => k);
      const key = 'widgetPlacedDay';
      if (kinds.length && (await store.metaGet(key, '')) !== todayKey()) {
        await store.metaSet(key, todayKey());
        const an = await import('./analytics.js');
        an.design('widget:placed', kinds.length);
        for (const k of kinds) an.design('widget:placed:' + k);
      }
    } catch { /* */ }
  }, 8000);
}
