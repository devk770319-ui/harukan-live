/* ===========================================================
   guide.js — 첫 사용 가이드 5장 (1.7.2, 사용자 요청 · 시안 그대로 / ⑤는 1.7.4)
   ① 내 일기는 내 폰에만  ② 지문·비밀번호 잠금  ③ 일기 쓰는 방법  ④ 사진이 달력에  ⑤ 의견 보내기
   · 새로 설치한 사람에게 처음 한 번 (app.js finishBoot). 설정 > 둘러보기에서 다시 볼 수 있다.
   · ②의 "잠금 설정하기"는 비밀번호 정하기로 가고, 다 정하면 ③부터 이어서 보여준다 (passcode.js).
   =========================================================== */

import * as store from './store.js';
import { esc } from './ui.js';
import { t } from './i18n.js';
import * as analytics from './analytics.js';

const FLOWER = '<svg viewBox="0 0 32 32" fill="none" stroke="#c9825a" stroke-width="2" aria-hidden="true"><circle cx="16" cy="16" r="3.4"/><path d="M16 12.6c-2.6-6 5.2-6 0 0zM19.4 16c6-2.6 6 5.2 0 0zM16 19.4c2.6 6-5.2 6 0 0zM12.6 16c-6 2.6-6-5.2 0 0z"/><path d="M16 12.6c-2.6-6 5.2-6 0 0zM19.4 16c6-2.6 6 5.2 0 0zM16 19.4c2.6 6-5.2 6 0 0zM12.6 16c-6 2.6-6-5.2 0 0z" transform="rotate(45 16 16)"/></svg>';
const HEART = '<svg viewBox="0 0 32 32" fill="none" stroke="#c9825a" stroke-width="2" stroke-linejoin="round" aria-hidden="true"><path d="M16 26s-10-6.2-10-13a5.6 5.6 0 0 1 10-3.4A5.6 5.6 0 0 1 26 13c0 6.8-10 13-10 13z" transform="rotate(12 16 16)"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17l9-10"/></svg>';
const PHONE = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="2.5" width="12" height="19" rx="2.6"/><path d="M10.5 18.5h3"/></svg>';

/** {b}…{/b} 를 굵은 글씨로 */
const rich = (s) => esc(s).replace(/\{b\}/g, '<b>').replace(/\{\/b\}/g, '</b>').replace(/\n/g, '<br>');

function pages() {
  return [
    { title: t('내 일기는 내 폰에만'), art: 'g1', big: true,
      head: t('어디에도 올리지 않아요.'),
      text: t('일기와 사진은 {b}이 폰 안에만{/b} 저장돼요.') + '\n' + t('서버에 없으니 나 말고는 아무도 못 봐요.'),
      extra: `<div class="ob-badges"><span class="ob-badge">${CHECK}${esc(t('가입 없음'))}</span><span class="ob-badge">${CHECK}${esc(t('서버 없음'))}</span><span class="ob-badge">${CHECK}${esc(t('나만 보기'))}</span></div>`,
      btn: t('좋아요, 계속') },
    { title: t('나만 여는 일기장'), art: 'g2',
      head: t('지문 한 번이면 열려요.'),
      text: t('숫자 네 자리와 지문으로 앱을 잠가요.') + '\n' + t('잠그면 일기와 사진이 {b}AES-256으로 암호화{/b}돼요.'),
      btn: t('잠금 설정하기'), sub: t('나중에'), lock: true },
    { title: t('하루 한 칸'), art: 'g3',
      head: t('한 줄이면 충분해요.'),
      extra: `<div class="ob-steps">
        <div class="ob-step"><i>1</i><span>${rich(t('아래 {b}＋{/b} 를 눌러 쓰기'))}</span></div>
        <div class="ob-step"><i>2</i><span>${esc(t('오늘 기분 고르기'))}</span><small>${esc(t('선택'))}</small></div>
        <div class="ob-step"><i>3</i><span>${esc(t('사진·태그·스티커 붙이기'))}</span><small>${esc(t('선택'))}</small></div></div>`,
      btn: t('계속') },
    { title: t('사진으로 채우는 달력'), art: 'g4',
      head: t('사진을 넣으면 달력이 앨범이 돼요.'),
      text: t('그날 넣은 사진이 달력 칸을 채워요.') + '\n' + t('한 달을 한눈에, 사진으로 돌아봐요.'),
      btn: t('계속') },
    /* ⑤ 의견 보내기 (1.7.4, 사용자 요청) */
    { title: t('함께 만드는 하루칸'), art: 'g5',
      head: t('여러분의 의견이 기능이 돼요.'),
      text: t('설정 > 의견 보내기에서 불편한 점이나 원하는 기능을 알려 주세요.') + '\n' + t('좋은 의견은 {b}앱에 기능으로 반영{/b}돼요.'),
      btn: t('지금 시작하기') },
  ];
}

let open = null;
let onBackKey = null;   // 하드웨어 뒤로가기: 앞 장으로, 첫 장이면 닫기

/** start: 몇 번째 장부터 (0~3) */
export function show({ start = 0 } = {}) {
  if (open) return;
  const P = pages();
  const root = document.createElement('div');
  root.className = 'ob-root';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `<div class="ob-track">${P.map((p, i) => `
    <section class="ob" data-i="${i}">
      <div class="ob-top">${FLOWER}<h2 class="ob-title">${esc(p.title)}</h2>${HEART}</div>
      <div class="ob-tags">${esc(t('일기 · 사진 · 기분 · 나만 보기'))}</div>
      <div class="ob-art"><img src="img/guide/${p.art}.webp" alt="" draggable="false"></div>
      ${p.big ? `<div class="ob-big">${PHONE}${esc(t('모든 기록이 이 폰 안에만'))}</div>` : ''}
      <div class="ob-head">${esc(p.head)}</div>
      ${p.text ? `<div class="ob-text">${rich(p.text)}</div>` : ''}
      ${p.extra || ''}
      <button class="ob-btn" type="button" data-act="${p.lock ? 'lock' : (i === P.length - 1 ? 'done' : 'next')}">${esc(p.btn)}</button>
      <button class="ob-sub" type="button" data-act="next" ${p.sub ? '' : 'hidden'}>${esc(p.sub || '')}</button>
    </section>`).join('')}</div>
    <div class="ob-foot"><button class="ob-skip" type="button" data-act="skip">${esc(t('건너뛰기'))}</button>
      <div class="ob-dots">${P.map(() => '<span></span>').join('')}</div></div>`;
  document.body.append(root);
  open = root;
  document.documentElement.classList.add('ob-open');

  const track = root.querySelector('.ob-track');
  const dots = [...root.querySelectorAll('.ob-dots span')];
  const skip = root.querySelector('.ob-skip');
  let idx = 0;
  const paint = () => {
    dots.forEach((d, i) => d.classList.toggle('on', i === idx));
    skip.style.visibility = idx === P.length - 1 ? 'hidden' : '';
  };
  const goTo = (i, smooth = true) => {
    idx = Math.max(0, Math.min(P.length - 1, i));
    const w = track.clientWidth;
    const rtl = getComputedStyle(track).direction === 'rtl';
    track.scrollTo({ left: (rtl ? -1 : 1) * idx * w, behavior: smooth ? 'smooth' : 'auto' });
    paint();
    analytics.design('guide:page' + (idx + 1));
  };
  track.addEventListener('scroll', () => {
    const w = track.clientWidth || 1;
    const i = Math.round(Math.abs(track.scrollLeft) / w);
    if (i !== idx) { idx = i; paint(); }
  }, { passive: true });

  root.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    const act = b.dataset.act;
    if (act === 'next') goTo(idx + 1);
    else if (act === 'skip') { analytics.design('guide:skip' + (idx + 1)); finish(); }
    else if (act === 'done') { analytics.design('guide:done'); finish(); }
    else if (act === 'lock') {
      analytics.design('guide:lock');
      finish('lock');
      const { go } = await import('./app.js');
      go('/passcode?m=new&from=guide');
    }
  });
  onBackKey = () => { if (idx > 0) goTo(idx - 1); else { analytics.design('guide:back'); finish(); } };
  requestAnimationFrame(() => goTo(start, false));

  function finish(why) {
    if (!open) return;
    store.saveSettings({ guideSeen: true }, { silent: true }).catch(() => {});
    /* 가이드가 끝나면 권한 한 번에 (1.7.8). 잠금 설정으로 가는 길이면 가이드가 다시 이어지니 그때 */
    if (why !== 'lock') import('./permsetup.js').then((m) => setTimeout(() => m.maybeShow(), 260)).catch(() => {});
    root.classList.add('out');
    document.documentElement.classList.remove('ob-open');
    setTimeout(() => root.remove(), 220);
    open = null;
    onBackKey = null;
  }
}

export function isOpen() { return !!open; }
/** 하드웨어 뒤로가기를 가이드가 받았으면 true */
export function handleBack() { if (!open || !onBackKey) return false; onBackKey(); return true; }
