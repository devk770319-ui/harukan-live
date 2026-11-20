/* ===========================================================
   prompts.js — 빈 화면 공포를 없애는 질문들
   "무엇을 써야 할지 모르겠다"가 일기를 그만두는 가장 흔한 이유다.
   시간대·요일·최근 기분·최근 주제에 맞춰 질문을 고른다.
   =========================================================== */

/** ctx: morning|day|evening|night / mon|fri|weekend / low|high / back(오랜만) / any */
import { t } from './i18n.js';
const BANK = [
  // 하루 회고 — 언제나
  { t: 'any', q: '오늘 가장 오래 머문 장면 하나를 떠올려 볼까요?' },
  { t: 'any', q: '오늘 하루를 한 문장으로 요약한다면?' },
  { t: 'any', q: '오늘 나를 웃게 한 건 아주 작은 것이라도 무엇이었나요?' },
  { t: 'any', q: '오늘 가장 힘이 들어갔던 순간은 언제였나요?' },
  { t: 'any', q: '오늘 만난 사람 중 한 명을 골라, 그 사람에 대해 써볼까요?' },
  { t: 'any', q: '오늘 먹은 것 중 기억에 남는 게 있나요?' },
  { t: 'any', q: '오늘 처음 해본 일이 있었나요? 아주 사소해도 좋아요.' },
  { t: 'any', q: '지금 몸은 어떤 상태인가요? 어깨, 눈, 위장 같은 것들.' },
  { t: 'any', q: '오늘 들었던 말 중 마음에 남은 한마디가 있나요?' },
  { t: 'any', q: '오늘 미룬 일이 있다면, 왜 미뤘을까요?' },
  { t: 'any', q: '오늘 잘한 일 하나만 스스로 칭찬해 준다면?' },
  { t: 'any', q: '오늘 본 것 중에 예뻤던 것을 하나 적어볼까요?' },
  { t: 'any', q: '오늘 돈이나 시간을 어디에 썼나요? 후회는 없나요?' },
  { t: 'any', q: '요즘 가장 자주 하는 생각은 무엇인가요?' },
  { t: 'any', q: '지금 창밖 혹은 주변은 어떤 모습인가요?' },
  { t: 'any', q: '오늘 나에게 필요했지만 없었던 것은 무엇인가요?' },
  { t: 'any', q: '오늘 하루에 제목을 붙인다면 뭐라고 붙일까요?' },
  { t: 'any', q: '오늘 대화 중에 하지 못하고 삼킨 말이 있나요?' },

  // 아침
  { t: 'morning', q: '오늘 하루, 딱 하나만 잘 된다면 뭐였으면 좋겠어요?' },
  { t: 'morning', q: '어젯밤 잠은 어땠나요? 지금 컨디션은요?' },
  { t: 'morning', q: '오늘 조금 걱정되는 일이 있다면 미리 적어둘까요?' },
  { t: 'morning', q: '오늘의 나에게 한마디 해준다면?' },

  // 낮
  { t: 'day', q: '지금까지의 하루는 어떤가요? 반쯤 온 지점에서.' },
  { t: 'day', q: '지금 머릿속에서 가장 시끄러운 생각은 무엇인가요?' },
  { t: 'day', q: '잠깐 멈춘 김에 — 지금 숨은 편한가요?' },

  // 저녁
  { t: 'evening', q: '오늘 하루를 덮기 전에, 놓아주고 싶은 감정이 있나요?' },
  { t: 'evening', q: '오늘 중 다시 살아보고 싶은 5분이 있다면 언제인가요?' },
  { t: 'evening', q: '오늘 나를 도와준 사람이나 물건이 있었나요?' },
  { t: 'evening', q: '오늘 하루 중 사라져도 괜찮았을 시간은 언제였나요?' },

  // 밤
  { t: 'night', q: '지금 잠들기 전, 가장 신경 쓰이는 게 무엇인가요?' },
  { t: 'night', q: '내일의 나를 조금 편하게 해줄 수 있는 게 뭐가 있을까요?' },
  { t: 'night', q: '오늘 하루, 몇 점을 주고 싶나요? 그 이유는요?' },
  { t: 'night', q: '오늘 고맙다고 말하고 싶은 대상이 있나요? 나 자신이어도 좋아요.' },

  // 요일
  { t: 'mon', q: '이번 주가 시작됐어요. 이번 주엔 무엇이 달랐으면 하나요?' },
  { t: 'mon', q: '주말과 오늘 사이, 마음의 온도가 얼마나 바뀌었나요?' },
  { t: 'fri', q: '이번 주를 돌아보면, 무엇이 가장 기억에 남나요?' },
  { t: 'fri', q: '이번 주의 나를 한 단어로 표현한다면?' },
  { t: 'weekend', q: '이번 주말, 나를 위해 한 일이 있나요?' },
  { t: 'weekend', q: '쉬는 게 잘 쉬어지나요? 아니면 자꾸 뭔가 하게 되나요?' },

  // 기분이 낮을 때 — 캐묻지 않고, 부담을 낮춘다
  { t: 'low', q: '괜찮지 않아도 괜찮아요. 지금 마음을 딱 한 줄만 적어볼까요?' },
  { t: 'low', q: '지금 힘든 것 중에 내가 바꿀 수 있는 건 얼마나 되나요?' },
  { t: 'low', q: '오늘 그래도 해낸 일 하나만 찾아볼까요? 밥 먹은 것도 포함해서요.' },
  { t: 'low', q: '이 마음을 누군가에게 말한다면, 누구에게 말하고 싶나요?' },
  { t: 'low', q: '지금 나에게 가장 필요한 건 잠, 밥, 사람, 혼자 중에 뭘까요?' },

  // 기분이 좋을 때 — 기억을 붙잡아 둔다
  { t: 'high', q: '이 기분을 나중에 다시 꺼내볼 수 있게, 자세히 적어둘까요?' },
  { t: 'high', q: '오늘이 좋았던 이유를 세 가지로 나눠본다면?' },
  { t: 'high', q: '이 좋은 흐름을 만든 건 무엇이었을까요?' },

  // 오랜만에 돌아왔을 때
  { t: 'back', q: '오랜만이에요. 그동안 어떻게 지냈는지 아주 간단히만 적어볼까요?' },
  { t: 'back', q: '그동안 가장 크게 달라진 건 무엇인가요?' },
  { t: 'back', q: '한동안 쓰지 않았던 이유가 있을까요? 그것부터 써도 좋아요.' },

  // 깊은 질문 — 가끔
  { t: 'deep', q: '요즘 나는 무엇을 두려워하고 있나요?' },
  { t: 'deep', q: '1년 뒤의 내가 지금의 나를 본다면 뭐라고 할까요?' },
  { t: 'deep', q: '최근에 마음이 바뀐 생각이 있나요?' },
  { t: 'deep', q: '지금 내 삶에서 가장 많은 에너지를 먹는 건 무엇인가요?' },
  { t: 'deep', q: '누구에게도 말하지 않은 것 중, 여기에 적어도 될 만한 게 있나요?' },
  { t: 'deep', q: '내가 반복하고 있는 패턴이 보이나요?' },
];

/** 가이드 모드: 세 개의 질문에 차례로 답하기 */
export const GUIDED_SETS = [
  { name: '하루 정리', qs: ['오늘 있었던 일 중 하나를 골라 써주세요.', '그때 어떤 기분이 들었나요?', '내일은 어떻게 하고 싶나요?'] },
  { name: '감사 세 가지', qs: ['오늘 고마웠던 것 하나.', '두 번째.', '세 번째. 아주 작아도 괜찮아요.'] },
  { name: '회고', qs: ['좋았던 것 (Keep)', '아쉬웠던 것 (Problem)', '다음에 해볼 것 (Try)'] },
  { name: '마음 풀기', qs: ['지금 가장 무거운 게 무엇인가요?', '그게 왜 무거울까요?', '그중 내가 지금 할 수 있는 건?'] },
  { name: '사람 기록', qs: ['오늘 만난 사람은 누구였나요?', '그 사람과 무슨 이야기를 했나요?', '그 사람에 대해 새로 알게 된 것은?'] },
];

/** 체크 칩 — 한 번 탭으로 맥락을 남긴다. 나중에 상관관계 분석의 재료가 된다. */
export const CHIP_GROUPS = [
  /* 1.7.6 (사용자 요청 2026-10-25): 그날의 마음을 한 번에 — 생활 속 하루를 담는 칩 */
  { name: '마음', chips: ['행복한 하루', '소중한 하루', '힘든 하루', '지친 하루', '망한 하루', '나에게 위로', '사랑하는 연인과 함께'] },
  { name: '몸', chips: ['잘 잤다', '못 잤다', '운동함', '아팠다', '술 마심', '카페인 많이'] },
  { name: '하루', chips: ['일 많았다', '야근', '공부함', '푹 쉬었다', '밖에 나감', '집에만'] },
  { name: '사람', chips: ['사람 만남', '혼자 있음', '가족과', '다퉜다'] },
  { name: '기타', chips: ['새로운 시도', '돈 썼다', '잘 먹었다', '자연을 봄'] },
];
export const ALL_CHIPS = CHIP_GROUPS.flatMap((g) => g.chips);

/** 칩마다 붙는 작은 아이콘 (js/ui.js 의 아이콘 이름) */
export const CHIP_ICONS = {
  '잘 잤다': 'moon', '못 잤다': 'moon', '운동함': 'dumbbell', '아팠다': 'pill',
  '술 마심': 'wine', '카페인 많이': 'coffee',
  '일 많았다': 'book', '야근': 'clock', '공부함': 'book', '푹 쉬었다': 'sun',
  '밖에 나감': 'compass', '집에만': 'home',
  '사람 만남': 'users', '혼자 있음': 'mood', '가족과': 'heart', '다퉜다': 'close',
  '새로운 시도': 'spark', '돈 썼다': 'tag', '잘 먹었다': 'coffee', '자연을 봄': 'leaf',
  '행복한 하루': 'sun', '소중한 하루': 'spark', '힘든 하루': 'flame', '지친 하루': 'moon',
  '망한 하루': 'close', '나에게 위로': 'mood', '사랑하는 연인과 함께': 'heart',
};

/* ── 결정론적 셔플 (같은 날엔 같은 질문, 다음 날엔 바뀜) ── */
export function seedFrom(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function rngFrom(seed) {
  let s = seed || 1;
  return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; };
}

function timeTag(d = new Date()) {
  const h = d.getHours();
  if (h < 11) return 'morning';
  if (h < 17) return 'day';
  if (h < 22) return 'evening';
  return 'night';
}
function dayTag(d = new Date()) {
  const w = d.getDay();
  if (w === 0 || w === 6) return 'weekend';
  if (w === 1) return 'mon';
  if (w === 5) return 'fri';
  return null;
}

/**
 * 상황에 맞는 질문 목록을 우선순위대로 반환.
 * @param {{recentMoodAvg:number|null, daysSinceLast:number|null, dateKey:string, nth:number}} ctx
 */
export function pickPrompts(ctx = {}) {
  const tags = new Set(['any', timeTag()]);
  const dt = dayTag();
  if (dt) tags.add(dt);
  if (ctx.daysSinceLast != null && ctx.daysSinceLast >= 7) tags.add('back');
  if (ctx.recentMoodAvg != null) {
    if (ctx.recentMoodAvg <= -0.2) tags.add('low');
    if (ctx.recentMoodAvg >= 0.35) tags.add('high');
  }
  // 20번째 글마다 한 번씩 깊은 질문을 섞는다
  if (ctx.nth && ctx.nth % 5 === 0) tags.add('deep');

  const weight = (t) => ({ back: 100, low: 60, high: 45, deep: 40, morning: 30, night: 30, evening: 28, day: 22, mon: 25, fri: 25, weekend: 20, any: 10 }[t] || 5);
  const rnd = rngFrom(seedFrom(ctx.dateKey || '') + (ctx.salt || 0));
  return BANK
    .filter((p) => tags.has(p.t))
    .map((p) => ({ ...p, s: weight(p.t) + rnd() * 22 }))
    .sort((a, b) => b.s - a.s)
    .map((p) => t(p.q));
}

export { BANK };

/* ── '오늘은 이런 날' 칩 바꾸기 (1.7.9, 사용자 결정 2026-10-29 "만들고 무료로") ──
   settings.chipPrefs = { hidden: [기본 칩 이름…], custom: [{ n: 이름, i: 아이콘, g: 묶음 이름 }…], order: { 묶음: [이름…] } }
   · 기본 칩은 숨기기만 한다(지우지 않음). 이미 쓴 일기에 붙은 칩은 숨겨도 그대로 보인다.
   · 내 칩 이름은 사용자가 쓴 글이라 번역하지 않는다 (t() 에 없으면 그대로 나온다).
   · 묶음은 기본 5개 + '내 칩'. 순서는 묶음 안에서 바꾼다. */
export const MINE_GROUP = '내 칩';
export const CHIP_PICK_ICONS = ['spark', 'heart', 'sun', 'moon', 'leaf', 'coffee', 'book', 'dumbbell', 'users', 'home',
  'compass', 'music', 'camera', 'pin', 'tag', 'clock', 'mood', 'flame', 'wine', 'pill', 'edit', 'bell'];
export const CHIP_NAME_MAX = 12;
export const CHIP_CUSTOM_MAX = 40;

function prefsOf(s) {
  const p = (s && s.chipPrefs) || {};
  return {
    hidden: Array.isArray(p.hidden) ? p.hidden.filter((x) => typeof x === 'string') : [],
    custom: Array.isArray(p.custom) ? p.custom.filter((x) => x && typeof x.n === 'string' && x.n.trim()) : [],
    order: p.order && typeof p.order === 'object' ? p.order : {},
  };
}
/** 편집 화면용: 모든 묶음과 칩(숨긴 것 포함). [{ name, mine, chips: [{ n, custom, hidden, i }] }] */
export function chipGroupsAll(s) {
  const p = prefsOf(s);
  const hidden = new Set(p.hidden);
  const groups = [{ name: MINE_GROUP, mine: true, chips: [] }, ...CHIP_GROUPS.map((g) => ({ name: g.name, chips: g.chips.map((n) => ({ n, i: CHIP_ICONS[n] || '' })) }))];
  for (const c of p.custom) {
    const g = groups.find((x) => x.name === c.g) || groups[0];
    if (!g.chips.some((x) => x.n === c.n)) g.chips.push({ n: c.n, i: c.i || 'spark', custom: true });
  }
  for (const g of groups) {
    const o = Array.isArray(p.order[g.name]) ? p.order[g.name] : null;
    if (o) g.chips.sort((a, b) => { const ia = o.indexOf(a.n), ib = o.indexOf(b.n); return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib); });
    for (const c of g.chips) c.hidden = !c.custom && hidden.has(c.n);
  }
  return groups;
}
/** 고르기 화면용: 숨긴 칩을 뺀 묶음. 빈 묶음은 빠진다. [{ name, mine, chips: [이름…] }] */
export function chipGroups(s) {
  return chipGroupsAll(s).map((g) => ({ name: g.name, mine: !!g.mine, chips: g.chips.filter((c) => !c.hidden).map((c) => c.n) }))
    .filter((g) => g.chips.length);
}
/** 칩 아이콘 (내 칩이면 고른 아이콘) */
export function chipIcon(name, s) {
  const c = prefsOf(s).custom.find((x) => x.n === name);
  return (c && c.i) || CHIP_ICONS[name] || '';
}
/** 분석에 쓸 칩 전부 (기본 + 내 칩, 숨긴 기본 칩 포함 — 지난 일기에 붙어 있을 수 있다) */
export function allChips(s) {
  return [...new Set([...ALL_CHIPS, ...prefsOf(s).custom.map((c) => c.n)])];
}
