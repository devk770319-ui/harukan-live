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
   글자는 모든 언어에서 'NEW' 그대로.
   =========================================================== */
import * as store from './store.js';

const used0 = () => store.getSettings().featureUsed || {};

function nativeApp() { try { return !!window.Capacitor?.isNativePlatform?.(); } catch { return false; } }

export function isNew(id) {
  const s = store.getSettings();
  if (id === 'font' && s.diaryFontSeen) return false;              // 1.7.6 의 글씨체 NEW 를 이미 지운 사람
  if (id === 'place' && s.placeAuto) return false;                  // 이미 켠 사람
  if ((id === 'place' || id === 'voice') && !nativeApp()) return false;   // 앱에서만 되는 기능
  return !used0()[id];
}

/** 그 기능을 썼다 — NEW 를 모두 지운다 */
export function used(id) {
  if (!used0()[id]) {
    store.saveSettings({ featureUsed: { ...used0(), [id]: Date.now() } }, { silent: true }).catch(() => {});
  }
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
const TAB = { insights: ['map'], settings: ['font', 'place'] };
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
