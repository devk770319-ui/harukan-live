/* ===========================================================
   views/help.js — 도움말: 사용 설명서 · 자주 묻는 질문 · 고객센터 (2026-11-08 사용자 제안, 시안)
   · 홈 상단 [찾기][알림] 옆 ⋮(더보기) 메뉴에서 들어온다 (helpMenu).
   · 설명서마다 3~4단계 짧은 글 + [바로 가기] — 읽고 그 화면을 바로 연다. 그림은 넣지 않는다(14개 언어 관리).
   · 화면 글만 있는 기능이라 패치로 낼 수 있다.
   =========================================================== */
import * as analytics from '../analytics.js';
import { t } from '../i18n.js';
import { back, go } from '../app.js';
import { el, icon, esc, todayKey } from '../ui.js';

/* 사용 설명서 — 순서가 목록 순서 */
export const MANUAL = [
  { id: 'write', ico: 'edit', title: '일기 쓰기', sub: '기분 고르기부터 사진·스티커까지',
    steps: ['아래 가운데 ＋ 버튼을 눌러요.', '오늘 기분을 원 위에서 골라요. 건너뛰어도 괜찮아요.', '자유·한 줄·질문 중 편한 방식으로 써요. 한 줄이면 충분해요.', '사진·스티커·오늘의 노래를 넣고 [완료]를 눌러요.'],
    go: { label: '오늘 일기 쓰기', path: () => `/write?d=${todayKey()}` } },
  { id: 'bg', ico: 'image', title: '바탕화면 바꾸기', sub: '그림 배경이나 내 사진으로',
    steps: ['설정 › 화면 › 배경 꾸미기를 눌러요.', '러블리·사계절·동화 같은 묶음에서 그림을 누르면 미리 입혀 볼 수 있어요.', '내 사진을 쓰려면 \'내 사진\'을 누르고 사진을 골라요. 글이 잘 안 읽히면 \'사진 흐리게\'로 맞춰요.', '배경 꾸미기는 하루칸 플러스 기능이에요. 30일 체험 중에는 무료로 쓸 수 있어요.'],
    go: { label: '배경 꾸미기로 가기', path: '/decor' } },
  { id: 'icon', ico: 'sticker', title: '아래 탭 아이콘 바꾸기', sub: '홈 아래 메뉴 아이콘 모양',
    steps: ['배경 꾸미기 맨 위 \'아래 탭 아이콘\'을 봐요.', '테마 그대로·표정·스티커·동물 친구·색연필 중에서 골라요.', '고르는 순간 아래 메뉴 아이콘이 바로 바뀌어요.'],
    go: { label: '아이콘 고르러 가기', path: '/decor' } },
  { id: 'letter', ico: 'mail', title: '편지 보내기', sub: '친구에게 예쁜 그림 편지로',
    steps: ['홈의 \'편지 쓰기\' 카드를 누르고 \'친구에게\'를 골라요.', '편지지·글씨체·사진·스티커로 꾸며요.', '[보내기]를 누르면 그림 한 장으로 카톡·메시지에 보낼 수 있어요.', '보낸 편지는 \'보낸 편지함\'에 남아요.'],
    go: { label: '편지 쓰러 가기', path: '/letter?new=1' } },
  { id: 'drive', ico: 'cloud', title: '구글 드라이브에 백업하기', sub: '폰을 잃어버려도 일기를 지키는 법',
    steps: ['설정 › 백업·복원으로 가요.', '\'저장 위치\'에서 \'구글 드라이브\'를 고르고 구글 계정을 골라요.', '[지금 백업]을 누르면 내 드라이브의 Harukan 폴더에 저장돼요.', '\'자동 백업\'을 켜면 매일 또는 매주 알아서 백업해요.'],
    go: { label: '백업·복원으로 가기', path: '/backup' } },
  { id: 'restore', ico: 'refresh', title: '백업에서 복원하기', sub: '새 폰으로 옮길 때도',
    steps: ['설정 › 백업·복원으로 가요.', '\'백업 파일에서 복원\' 또는 \'자동 백업에서 복원\'을 눌러요.', '백업할 때 정한 암호를 넣어요.', '새 폰으로 옮길 때는 \'새 폰으로 옮기기\' 안내를 따라 해요. 복원은 하루칸 플러스 기능이에요.'],
    go: { label: '백업·복원으로 가기', path: '/backup' } },
  { id: 'habit', ico: 'check', title: '습관 등록하기', sub: '약 먹기·운동 같은 반복 체크',
    steps: ['아래 \'알림\' 탭에서 \'습관\'을 열어요.', '[습관 추가]를 눌러 이름·횟수·알림 시각을 정해요.', '꼭 챙겨야 하는 습관은 \'중요 알림\'을 켜면 알람 소리로 알려요.', '한 날은 체크해요. 습관 실행표에 쌓여요.'],
    go: { label: '습관으로 가기', path: '/habits' } },
  { id: 'plan', ico: 'cal', title: '일정 등록하기', sub: '날짜·시간·알림, 반복 할 일',
    steps: ['아래 \'알림\' 탭을 눌러요.', '[＋ 일정 추가]를 눌러 날짜·시간·알림을 정해요.', '매일 하는 일은 반복으로 정할 수 있어요.', '끝낸 일정은 동그라미를 눌러 체크해요.'],
    go: { label: '일정으로 가기', path: '/plans' } },
  { id: 'lock', ico: 'lock', title: '비밀번호·지문 잠금', sub: '나만 열어 보는 일기장',
    steps: ['설정 › 잠금 › \'비밀번호 사용\'을 켜요.', '숫자 4자리를 정하고 복구 코드를 꼭 적어 두세요.', '지문으로 열기도 켤 수 있어요.', '자동 잠금으로 다른 앱에 다녀오면 다시 잠가요.'],
    go: { label: '설정으로 가기', path: '/settings' } },
  { id: 'widget', ico: 'home', title: '홈 화면 위젯', sub: '오늘의 한 칸·습관을 홈 화면에',
    steps: ['설정 › 화면 › \'홈 화면 위젯\'을 눌러요.', '놓고 싶은 위젯을 골라 홈 화면에 놓아요.', '습관 위젯에서는 앱을 열지 않고 바로 체크할 수 있어요.'],
    go: { label: '설정으로 가기', path: '/settings' } },
  { id: 'song', ico: 'music', title: '오늘의 노래 넣기', sub: '그날 들은 노래를 일기에',
    steps: ['일기 쓰기 화면의 음표 버튼을 눌러요.', '노래를 검색하거나 유튜브 뮤직 링크를 붙여 넣어요.', '유튜브 뮤직에서 [공유] › [하루칸]을 눌러도 들어와요.', '넣은 노래는 발견 › 내가 고른 음악에 모여요.'],
    go: { label: '내가 고른 음악 보기', path: '/songs' } },
];

/* 자주 묻는 질문 */
export const FAQ = [
  { id: 'notif', q: '알림이 제때 안 와요', a: '폰의 배터리 절약 기능이 하루칸을 잠재우면 알림이 늦거나 빠질 수 있어요. 어느 폰이든 먼저 하루칸 앱 정보 › 배터리를 \'제한 없음\'(또는 \'최적화 안 함\')으로 바꿔 주세요.', brand: true },
  { id: 'where', q: '일기는 어디에 저장되나요?', a: '이 폰 안에만 저장돼요. 하루칸에는 서버가 없어서 개발자도 일기를 볼 수 없어요. 그래서 앱을 지우거나 폰을 잃어버리면 되살릴 수 없으니 백업을 꼭 해 두세요.' },
  { id: 'forgot', q: '비밀번호를 잊었어요', a: '잠금 화면의 \'비밀번호를 잊으셨나요?\'를 눌러 복구 코드로 열 수 있어요. 복구 코드도 없으면 일기는 암호화되어 있어서 아무도 열 수 없어요.' },
  { id: 'phone', q: '폰을 바꾸려면 어떻게 하나요?', a: '지금 폰에서 백업 파일을 만들거나 구글 드라이브에 백업한 뒤, 새 폰의 하루칸에서 복원해요. 복원은 하루칸 플러스 기능이에요.', go: { label: '백업·복원으로 가기', path: '/backup' } },
  { id: 'ads', q: '광고를 없애려면요?', a: '하루칸 플러스를 쓰면 광고가 사라져요. 일기를 쓰거나 고치는 동안에는 원래 광고가 나오지 않아요.', go: { label: '하루칸 플러스 보기', path: '/plus' } },
  { id: 'cancel', q: '월 이용권은 어디서 해지하나요?', a: '플러스 화면의 [정기 결제 관리 (Play 스토어)]를 누르거나, Play 스토어 › 결제 및 정기 결제에서 해지할 수 있어요. 해지해도 결제한 기간 끝까지 쓸 수 있어요.', go: { label: '플러스 화면으로 가기', path: '/plus' } },
  { id: 'trial', q: '30일 체험이 끝나면 어떻게 되나요?', a: '일기는 무료로 계속 쓸 수 있어요. 체험 동안 쓰던 플러스 기능(그림 배경·사진 달력 등)만 잠기고, 써 둔 일기와 사진은 그대로 남아요.' },
];

/* 알림이 늦을 때 제조사마다 더 해야 할 것 (2026-11-08 사용자: '삼성 폰이 아닌 경우는? 외국 사람들은 대부분 다른 폰') */
export const BRANDS = [
  { id: 'samsung', name: '삼성 갤럭시', tip: '설정 › 배터리 › 백그라운드 사용 한도에서 하루칸이 \'절전 상태 앱\'이나 \'깊은 절전 앱\'에 있으면 빼 주세요.' },
  { id: 'xiaomi', name: '샤오미 · 레드미 · 포코', tip: '하루칸 앱 정보에서 \'자동 시작\'을 켜고, 배터리 절약을 \'제한 없음\'으로 바꿔 주세요.' },
  { id: 'oppo', name: '오포 · 리얼미 · 원플러스', tip: '하루칸 앱 정보 › 배터리에서 \'백그라운드 활동 허용\'과 \'자동 실행 허용\'을 켜 주세요.' },
  { id: 'vivo', name: '비보 · 아이쿠', tip: '설정 › 배터리 › 백그라운드 전력 소비 관리에서 하루칸을 \'허용\'으로 바꿔 주세요.' },
  { id: 'huawei', name: '화웨이 · 아너', tip: '설정 › 배터리 › 앱 실행에서 하루칸을 \'수동 관리\'로 바꾸고 세 가지를 모두 켜 주세요.' },
  { id: 'other', name: '픽셀 · 모토로라 · 그 밖의 폰', tip: '하루칸 앱 정보 › 배터리 › \'제한 없음\'이면 충분해요.' },
];
/** 이 폰의 제조사 (모델 이름으로 짐작, 모르면 'other') */
export async function deviceBrand() {
  let model = '';
  try { model = (await navigator.userAgentData?.getHighEntropyValues?.(['model']))?.model || ''; } catch { /* */ }
  if (!model) { const m = /Android [\d.]+; ([^;)]+?)(?: Build|\))/.exec(navigator.userAgent || ''); model = m ? m[1] : ''; }
  const ua = model + ' ' + (navigator.userAgent || '');
  if (/\bSM-|samsung|galaxy/i.test(ua)) return 'samsung';
  if (/redmi|poco|xiaomi|\bMI \d|\bM2\d{3}|\b2\d{3,7}[A-Z][A-Z0-9]{1,6}\b/i.test(ua)) return 'xiaomi';
  if (/\bCPH\d|\bRMX\d|oppo|realme|oneplus|\b(IN|KB|LE|NE|PJ)\d{4}/i.test(ua)) return 'oppo';
  if (/vivo|iqoo|\bV2\d{3}|\bI2\d{3}/i.test(ua)) return 'vivo';
  if (/huawei|honor|-(AL|L|LX|TL|NX)\d/i.test(ua)) return 'huawei';
  return 'other';
}

/* ── ⋮ 더보기 메뉴 (홈 상단) ─────────────────── */
let menuEl = null;
function closeMenu() { if (menuEl) { menuEl.remove(); menuEl = null; } document.removeEventListener('pointerdown', outside, true); }
function outside(e) { if (menuEl && !menuEl.contains(e.target)) closeMenu(); }
export function openMenu(btn) {
  if (menuEl) { closeMenu(); return; }
  analytics.design('help:menu');
  const r = btn.getBoundingClientRect();
  menuEl = el('div', { class: 'more-menu', role: 'menu' });
  menuEl.style.top = `${Math.round(r.bottom + 6)}px`;
  menuEl.style.right = `${Math.max(8, Math.round(innerWidth - r.right))}px`;
  const items = [
    ['book', t('사용 설명서'), () => go('/help')],
    ['quote', t('자주 묻는 질문'), () => go('/help?tab=faq')],
    ['users', t('고객센터'), () => go('/help?tab=contact')],
    null,
    ['spark', t('처음 안내 다시 보기'), async () => (await import('../guide.js')).show()],
  ];
  for (const it of items) {
    if (!it) { menuEl.append(el('div', { class: 'more-sep' })); continue; }
    const b = el('button', { class: 'more-item', type: 'button', role: 'menuitem' }, `${icon(it[0])}<span>${esc(it[1])}</span>`);
    b.addEventListener('click', () => { closeMenu(); it[2](); });
    menuEl.append(b);
  }
  document.body.append(menuEl);
  setTimeout(() => document.addEventListener('pointerdown', outside, true), 0);
}

/* ── 화면 ──────────────────────────────────── */
export async function render(root, params = {}) {
  closeMenu();
  /* 설명서 한 장 */
  if (params.a) {
    const m = MANUAL.find((x) => x.id === params.a);
    if (m) return article(root, m);
  }
  const tab = ['faq', 'contact'].includes(params.tab) ? params.tab : 'manual';
  analytics.design('help:' + tab);

  const seg = el('div', { class: 'segmented help-seg' });
  for (const [k, label] of [['manual', t('사용 설명서')], ['faq', t('자주 묻는 질문')], ['contact', t('고객센터')]]) {
    const b = el('button', { type: 'button', class: k === tab ? 'on' : '' }, esc(label));
    b.addEventListener('click', () => { if (k !== tab) go(k === 'manual' ? '/help' : `/help?tab=${k}`, { replace: true }); });
    seg.append(b);
  }
  root.append(seg);

  if (tab === 'manual') {
    const box = el('div', { class: 'card help-list' });
    for (const m of MANUAL) {
      const b = el('button', { class: 'help-row', type: 'button' },
        `<span class="help-ico">${icon(m.ico)}</span><span class="help-tx"><b>${esc(t(m.title))}</b><span>${esc(t(m.sub))}</span></span><span class="help-chev">${icon('chev')}</span>`);
      b.addEventListener('click', () => go(`/help?a=${m.id}`));
      box.append(b);
    }
    root.append(box);
  } else if (tab === 'faq') {
    const box = el('div', { class: 'card help-list' });
    for (const f of FAQ) {
      const item = el('div', { class: 'faq-item' });
      const q = el('button', { class: 'faq-q', type: 'button', 'aria-expanded': 'false' }, `<span>${esc(t(f.q))}</span>${icon('chevD')}`);
      const a = el('div', { class: 'faq-a', hidden: true }, `<p>${esc(t(f.a))}</p>`);
      if (f.brand) {
        deviceBrand().then((bid) => {
          const mine = BRANDS.find((b) => b.id === bid) || BRANDS[BRANDS.length - 1];
          const box = el('div', { class: 'faq-brand' }, `<div class="faq-brand-t">${esc(t('이 폰({n})에서는', { n: t(mine.name) }))}</div><p>${esc(t(mine.tip))}</p>`);
          const more = el('details', { class: 'faq-brands' });
          more.append(el('summary', {}, esc(t('다른 폰 보기'))));
          for (const b of BRANDS) if (b.id !== mine.id) more.append(el('div', { class: 'faq-brand-row' }, `<b>${esc(t(b.name))}</b><span>${esc(t(b.tip))}</span>`));
          const open = el('button', { class: 'btn help-go', type: 'button' }, esc(t('하루칸 앱 정보 열기')) + ' ›');
          open.addEventListener('click', async () => { (await import('../weather.js')).openSettings('app'); });
          a.append(box, open, more);
        });
      }
      if (f.go) {
        const g = el('button', { class: 'btn help-go', type: 'button' }, esc(t(f.go.label)) + ' ›');
        g.addEventListener('click', () => go(f.go.path));
        a.append(g);
      }
      q.addEventListener('click', () => { const open = a.hidden; a.hidden = !open; q.setAttribute('aria-expanded', String(open)); item.classList.toggle('open', open); if (open) analytics.design('help:faq:' + f.id); });
      item.append(q, a);
      box.append(item);
    }
    root.append(box);
  } else {
    const c = el('div', { class: 'card help-contact' });
    c.innerHTML = `<div class="help-ct-t">${esc(t('무엇이든 알려 주세요'))}</div>`
      + `<p class="help-ct-s">${esc(t('불편한 점, 있었으면 하는 기능, 궁금한 점을 보내 주시면 꼭 읽고 앱에 반영해요. 답장을 받고 싶으면 이메일을 함께 적어 주세요.'))}</p>`;
    const b = el('button', { class: 'btn btn-primary btn-block', type: 'button' }, esc(t('의견 보내기')));
    b.addEventListener('click', () => go('/feedback'));
    c.append(b);
    root.append(c);
    root.append(el('div', { class: 'note', style: 'margin:14px 6px' }, esc(t('먼저 자주 묻는 질문을 보면 더 빨리 해결될 수 있어요.'))));
  }
  return { title: t('도움말'), left: { icon: 'back', onClick: back } };
}

function article(root, m) {
  analytics.design('help:a:' + m.id);
  const c = el('div', { class: 'card help-art' });
  c.innerHTML = `<div class="help-art-h"><span class="help-ico">${icon(m.ico)}</span><div><div class="help-art-t">${esc(t(m.title))}</div><div class="help-art-s">${esc(t(m.sub))}</div></div></div>`;
  const ol = el('ol', { class: 'help-steps' });
  m.steps.forEach((s, i) => ol.append(el('li', {}, `<span class="help-n">${i + 1}</span><span>${esc(t(s))}</span>`)));
  c.append(ol);
  root.append(c);
  if (m.go) {
    const b = el('button', { class: 'btn btn-primary btn-block help-go-main', type: 'button' }, esc(t(m.go.label)));
    b.addEventListener('click', () => { analytics.design('help:go:' + m.id); go(typeof m.go.path === 'function' ? m.go.path() : m.go.path); });
    root.append(b);
  }
  /* 다른 설명서 두세 개 */
  const others = MANUAL.filter((x) => x.id !== m.id).slice(0, 3);
  root.append(el('div', { class: 'section-title', style: 'margin:22px 4px 8px' }, `<span>${esc(t('다른 설명서'))}</span>`));
  const box = el('div', { class: 'card help-list' });
  for (const o of others) {
    const b = el('button', { class: 'help-row', type: 'button' }, `<span class="help-ico">${icon(o.ico)}</span><span class="help-tx"><b>${esc(t(o.title))}</b><span>${esc(t(o.sub))}</span></span><span class="help-chev">${icon('chev')}</span>`);
    b.addEventListener('click', () => go(`/help?a=${o.id}`, { replace: true }));
    box.append(b);
  }
  root.append(box);
  return { title: t('사용 설명서'), left: { icon: 'back', onClick: back } };
}
