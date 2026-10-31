/* ===========================================================
   demo.js — 둘러보기용 예시 데이터
   빈 앱에서는 '되새김'도 '발견'도 보여줄 게 없다.
   그래서 1년치 가상의 일기를 넣어보고, 한 번에 지울 수 있게 했다.
   실제 글에는 손대지 않는다 (demo 표시가 붙은 것만 지운다).
   =========================================================== */

import * as store from './store.js';
import { todayKey } from './ui.js';
import * as i18n from './i18n.js';
import { DEMO_I18N } from './demo-i18n.js';

const SEEDS = [
  ['아침에 늦잠을 잤다. 그래도 커피 한 잔 내려서 창가에 앉아 있으니 좀 살 것 같았다. 오늘은 회의가 세 개나 있어서 정신이 없었다.', ['일 많았다', '못 잤다'], ['회사', '커피'], -0.3, 0.4],
  ['퇴근하고 한강까지 걸었다. 바람이 시원해서 계속 걷고 싶었다. 운동을 하니까 확실히 머리가 맑아진다.', ['운동함', '밖에 나감'], ['운동', '한강'], 0.7, 0.3],
  ['엄마한테 전화가 왔다. 별 말 없이 밥은 먹었냐고만 물어보셨는데 이상하게 오래 기억에 남는다.', ['가족과'], ['엄마', '전화'], 0.5, -0.3],
  ['프로젝트 마감이 다가온다. 잠을 제대로 못 자서 계속 머리가 아프다. 이번 주만 버티면 된다고 스스로를 달랬다.', ['일 많았다', '야근', '못 잤다'], ['회사', '마감'], -0.65, 0.5],
  ['아무것도 하지 않고 하루를 보냈다. 죄책감이 들다가, 이런 날도 필요하다고 생각을 고쳐먹었다.', ['푹 쉬었다', '집에만'], ['휴식'], 0.2, -0.6],
  ['오랜만에 친구를 만났다. 세 시간 넘게 이야기했는데 시간 가는 줄 몰랐다. 사람을 만나는 게 이렇게 좋은 거였나.', ['사람 만남', '밖에 나감'], ['친구'], 0.8, 0.5],
  ['새벽까지 잠이 안 왔다. 별 이유도 없이 불안했다. 이런 밤이 가끔 온다.', ['못 잤다', '혼자 있음'], ['불면', '불안'], -0.7, 0.4],
  ['점심에 먹은 국수가 정말 맛있었다. 별거 아닌데 하루가 괜찮아졌다.', ['잘 먹었다'], ['음식'], 0.45, 0.0],
  ['운동을 다시 시작했다. 삼십 분 뛰었는데 숨이 턱까지 찼다. 그래도 끝나고 나니 개운했다.', ['운동함'], ['운동'], 0.6, 0.55],
  ['회사에서 좀 다퉜다. 내가 예민했던 것 같기도 하고, 아닌 것 같기도 하다. 계속 곱씹게 된다.', ['다퉜다', '일 많았다'], ['회사', '갈등'], -0.6, 0.35],
  ['책을 한 권 다 읽었다. 마지막 장을 덮고 한참 앉아 있었다. 좋은 문장이 많았다.', ['푹 쉬었다', '혼자 있음'], ['책', '독서'], 0.55, -0.4],
  ['비가 왔다. 우산 없이 걷다가 그냥 다 젖었는데 오히려 웃겼다.', ['밖에 나감', '자연을 봄'], ['비', '산책'], 0.4, 0.3],
  ['술을 좀 많이 마셨다. 즐거웠는데 다음 날이 걱정된다.', ['술 마심', '사람 만남'], ['술', '친구'], 0.3, 0.6],
  ['하루 종일 코드를 봤다. 버그 하나를 세 시간 만에 잡았을 때 기분이 좋았다.', ['일 많았다', '공부함'], ['개발', '일'], 0.35, 0.4],
  ['몸살이 났다. 하루 종일 누워 있었다. 아프면 사람이 한없이 약해진다.', ['아팠다', '집에만'], ['건강'], -0.75, -0.7],
  ['새로운 카페를 발견했다. 조용하고 커피도 맛있어서 앞으로 자주 올 것 같다.', ['새로운 시도', '돈 썼다', '밖에 나감'], ['카페', '커피'], 0.6, 0.15],
  ['아무 이유 없이 마음이 가라앉는다. 특별히 나쁜 일은 없었는데 그냥 그렇다.', ['혼자 있음'], ['우울'], -0.5, -0.55],
  ['일찍 자고 일찍 일어났더니 하루가 두 배로 길게 느껴졌다. 계속 이러고 싶다.', ['잘 잤다'], ['아침', '루틴'], 0.65, 0.2],
  ['산에 다녀왔다. 정상에서 본 풍경이 아직도 눈에 남는다. 힘들었지만 잘 갔다고 생각한다.', ['운동함', '밖에 나감', '자연을 봄'], ['등산', '자연'], 0.85, 0.5],
  ['가계부를 정리했다. 생각보다 많이 썼다. 다음 달은 좀 줄여야겠다.', ['돈 썼다'], ['돈', '가계부'], -0.2, -0.1],
];

const TITLES = ['보통의 하루', '조금 나은 날', '기록', '버티는 중', '좋았던 하루', ''];

export function isLoaded() {
  return store.all().some((e) => e.demo);
}

/** 지난 400일에 걸쳐 가상의 일기를 만든다 */
export async function load() {
  if (isLoaded()) return 0;
  const D = 86400000;
  const base = new Date();
  /* 앱 언어로 넣는다 (ko 는 원문 그대로). 넣을 때의 언어로 고정된다 — 나중에 언어를 바꿔도 이미 넣은 글은 그대로 */
  const L = DEMO_I18N[i18n.current()] || null;
  const tagOf = (k) => (L && L.tags[k]) || k;
  let made = 0;
  for (let i = 400; i >= 1; i--) {
    const p = i > 250 ? 0.22 : i > 120 ? 0.42 : 0.62;
    if (Math.random() > p) continue;
    const d = new Date(base.getTime() - i * D);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (store.hasEntryOn(key)) continue;
    const si = Math.floor(Math.random() * SEEDS.length);
    const s = SEEDS[si];
    const e = store.newEntry(key, Math.random() < 0.15 ? 'oneline' : 'free');
    const jit = () => (Math.random() - 0.5) * 0.35;
    const m = d.getMonth();
    const season = (m === 0 || m === 1 || m === 11) ? -0.14 : 0.05;   // 겨울엔 조금 낮게
    const body = L ? L.body[si] : s[0];
    const tail = L ? L.tail : '내일은 조금 더 나았으면 좋겠다.';
    e.body = body + (Math.random() < 0.35 ? ' ' + tail : '');   // tail 은 KO_TAIL/L.tail — adoptEdited 가 알아본다
    e.chips = s[1].slice();                 // 칩은 한국어 원형 그대로 — 화면에서 t() 로 번역된다
    e.tags = s[2].map(tagOf);
    e.mood = {
      v: Math.max(-1, Math.min(1, s[3] + jit() + season)),
      e: Math.max(-1, Math.min(1, s[4] + jit())),
    };
    e.title = (L ? L.titles : TITLES)[Math.floor(Math.random() * TITLES.length)];
    e.createdAt = new Date(d).setHours(19 + Math.floor(Math.random() * 4), Math.floor(Math.random() * 60));
    e.updatedAt = e.createdAt;
    e.demo = true;
    // 몇 편은 보관 표시를 해 둔다 — 보관함이 빈 채로 보이면 기능을 알아채기 어렵다
    if (Math.random() < 0.04) e.bookmarkedAt = e.createdAt + 3600_000;
    await store.put(e);
    made++;
  }
  return made;
}

/* ── 예전 버전에서 사용자가 고친 예시 글 지키기 (1.6.6) ─────────────
   1.6.5 까지는 예시 글을 고쳐도 예시 표시가 남았다. 1.6.6 부터 예시 표시 글은 백업·PDF·마크다운에서
   빠지므로, 그대로 두면 사용자가 고쳐 쓴 내용이 백업에서 사라진다.
   내용이 넣었을 때 그대로가 아닌 예시 글은 사용자 글로 돌려놓는다 (예시 표시를 낙니다).
   애매하면 사용자 글 쪽으로 본다 — 잘못 돌려도 '예시 지우기'에서 한 편이 남을 뿐 잃는 건 없다. */
const KO_TAIL = '내일은 조금 더 나았으면 좋겠다.';
function pristineCheck() {
  const bodies = new Set(SEEDS.map((s) => s[0]));
  const titles = new Set(TITLES);
  const tags = new Set(SEEDS.flatMap((s) => s[2]));
  const chips = new Set(SEEDS.flatMap((s) => s[1]));
  const tails = [KO_TAIL];
  for (const L of Object.values(DEMO_I18N)) {
    L.body.forEach((b) => bodies.add(b));
    L.titles.forEach((x) => titles.add(x));
    Object.values(L.tags).forEach((x) => tags.add(x));
    tails.push(L.tail);
  }
  return (e) => {
    if ((e.photos || []).length || (e.stickers || []).length || e.sealedUntil || e.guided) return false;
    if (!titles.has(e.title || '')) return false;
    if (!(e.tags || []).every((x) => tags.has(x))) return false;
    if (!(e.chips || []).every((x) => chips.has(x))) return false;
    let b = e.body || '';
    for (const tl of tails) if (b.endsWith(' ' + tl)) { b = b.slice(0, -(tl.length + 1)); break; }
    return bodies.has(b);
  };
}

/** 고친 흔적이 있는 예시 글을 사용자 글로 돌린다. 돌린 편수 */
export async function adoptEdited() {
  const list = store.all().filter((e) => e.demo);
  if (!list.length) return 0;
  const pristine = pristineCheck();
  let n = 0;
  for (const e of list) {
    if (pristine(e)) continue;
    delete e.demo;
    await store.put(e, { silent: true, touch: false });
    n++;
  }
  return n;
}

/** 예시 데이터만 골라서 완전히 삭제 */
export async function unload() {
  await adoptEdited();                     // 고친 예시 글은 지우지 않는다
  const targets = store.all().filter((e) => e.demo);
  for (const e of targets) await store.hardDelete(e.id);
  return targets.length;
}

export { todayKey };
