/* ===========================================================
   newbadge.js — 새 기능 NEW 표시 (1.7.8, 사용자 요청 2026-10-26)

   "신규 기능을 사용자가 사용하지 않은 경우에는 NEW 를 계속 노출" —
   기능마다 한 번이라도 '쓰면' 그 기능의 NEW 가 모두 사라진다. 안 쓰면 계속 남는다.
   기록: settings.featureUsed = { map: 시각, place: 시각, … } (이 폰에만)

   붙는 자리
    map      발견 탭 · 발견의 '내가 일기 쓴 곳' 카드          → 지도 화면을 열면
    place    설정 탭 · 설정 '일기 쓴 장소 기록' · 쓰기 '+ 장소' → 장소를 한 번 남기면
    font     설정 탭 · 설정 '글씨체'                          → 글씨체 고르기 창을 열면
    cheer    쓰기 스티커 버튼 · 스티커 서랍의 캐릭터 탭         → 위로 스티커 탭을 열면
    song     쓰기 음표 버튼 (오늘의 노래, 1.7.9)                → 노래를 한 번 넣으면
    voice    쓰기 마이크 버튼                                 → 음성 입력을 한 번 하면
    collage  사진 추가 창의 '사진 묶음'                        → 사진 묶음을 만들면
    capsule  홈 '미래의 나에게 편지 쓰기'                       → 편지 쓰기 화면을 열면
    pdfDesign 설정 'PDF로 내보내기'                            → PDF 화면을 열면
    habit    알림 탭 · 펼침 메뉴 '습관' (패치 13)                  → 습관 화면을 열면
    textbox  쓰기 스티커 버튼 · 스티커 서랍 '＋ 글자 상자'        → 글자 상자를 한 번 붙이면
    fairy    설정 탭 · 설정 '배경 꾸미기' · 꾸미기 '동화' 칸 (2026-11-01) → 동화 테마를 입혀 보거나 아이콘을 고르면
    season   설정 탭 · 설정 '배경 꾸미기' · 꾸미기 '사계절' 칸 (2026-11-02) → 사계절 테마를 입혀 보면
    lovely   설정 탭 · 설정 '배경 꾸미기' · 꾸미기 '러블리·아늑한 그림·고양이' 칸 (2026-11-04) → 새 테마 6종 중 하나를 입혀 보면
    tabicons 설정 탭 · 설정 '배경 꾸미기' · 꾸미기 '아래 탭 아이콘' 칸 (2026-11-04) → 아이콘 모양을 한 번 고르면
    recovery 설정 '복구 코드' (잠금을 켠 사람만 보임)            → 복구 코드를 만들면
    backup   설정 탭 · 설정 '백업·복원' (2026-11-05)              → 백업·복원 화면을 열면
    letter   홈 '편지 쓰기' 카드 (2026-11-05, 친구에게 편지 무료)   → 기간형: 처음 보인 날부터 3일 동안 늘 보인다 (열어 봐도 안 사라짐, 사용자 2026-11-05 '설치 후 3일간')
    autolock 설정 '자동 잠금' (잠금을 켠 사람만 보임, 2026-11-05 '바로' 잠금 강조) → 자동 잠금 창을 열면
   글자는 모든 언어에서 'NEW' 그대로.
   =========================================================== */
import * as store from './store.js';

const used0 = () => store.getSettings().featureUsed || {};

/* 기간형 NEW (2026-11-05): 키마다 며칠 동안 보일지. 처음 isNew 를 물은 시각을 settings.featureSeen[id] 에 적고,
   그때부터 days 일이 지나면 사라진다. 열어 봐도(used) 기간 안에는 계속 보인다 */
export const DAYS = { letter: 3 };
const seen0 = () => store.getSettings().featureSeen || {};
function timedNew(id) {
  const days = DAYS[id];
  if (!days) return null;
  const seen = seen0();
  let at = seen[id];
  if (!at) {
    at = Date.now();
    store.saveSettings({ featureSeen: { ...seen, [id]: at } }, { silent: true }).catch(() => {});
  }
  return Date.now() - at < days * 864e5;
}

function nativeApp() { try { return !!window.Capacitor?.isNativePlatform?.(); } catch { return false; } }

export function isNew(id) {
  const s = store.getSettings();
  if (id === 'font' && s.diaryFontSeen) return false;              // 1.7.6 의 글씨체 NEW 를 이미 지운 사람
  if (id === 'place' && s.placeAuto) return false;                  // 이미 켠 사람
  if ((id === 'place' || id === 'voice') && !nativeApp()) return false;   // 앱에서만 되는 기능
  const timed = timedNew(id);
  if (timed !== null) return timed;                                  // 기간형은 쓴 적과 관계없이 기간으로만
  return !used0()[id];
}

/** 그 기능을 썼다 — NEW 를 모두 지운다 */
export function used(id) {
  if (!used0()[id]) {
    store.saveSettings({ featureUsed: { ...used0(), [id]: Date.now() } }, { silent: true }).catch(() => {});
  }
  if (DAYS[id]) { paintTabs(); return; }                             // 기간형은 써도 기간이 끝날 때까지 남는다
  for (const n of document.querySelectorAll(`[data-new="${id}"]`)) {
    n.parentElement?.classList.remove('has-new');
    n.remove();
  }
  paintTabs();
}

/** 버튼 모서리의 작은 NEW (아이콘 버튼용) */
export function corner(btn, id) {
  if (btn && isNew(id) && !btn.querySelector(`[data-new="${id}"]`)) {
    btn.classList.add('has-new');
    const s = document.createElement('span');
    s.className = 'new-badge';
    s.dataset.new = id;
    s.setAttribute('aria-hidden', 'true');
    s.textContent = 'NEW';
    btn.append(s);
  }
  return btn;
}

/** 글 옆에 붙는 NEW 알약 (HTML) */
export function pill(id) {
  return isNew(id) ? `<span class="new-pill" data-new="${id}" aria-hidden="true">NEW</span>` : '';
}

/* 아래 탭: 그 탭 안에 아직 안 써 본 새 기능이 있으면 NEW */
const TAB = { insights: ['map'], settings: ['font', 'place', 'fairy', 'season', 'lovely', 'tabicons', 'backup'], plans: ['habit'] };
export function paintTabs() {
  for (const [tab, ids] of Object.entries(TAB)) {
    const a = document.querySelector(`.tab[data-tab="${tab}"]`);
    if (!a) continue;
    const want = ids.some(isNew);
    const has = a.querySelector('.tab-new');
    if (want && !has) {
      a.classList.add('has-new');
      const s = document.createElement('span');
      s.className = 'new-badge tab-new';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = 'NEW';
      a.append(s);
    } else if (!want && has) {
      has.remove();
      a.classList.remove('has-new');
    }
  }
}
