/* ===========================================================
   views/feedback.js — 의견 보내기 화면 (#/feedback, 1.7.4)
   설정 → 의견 보내기, 공지 팝업의 '의견 보내기' 버튼에서 들어온다.
   =========================================================== */

import * as fb from '../feedback.js';
import { t } from '../i18n.js';
import { back } from '../app.js';
import { el, esc, icon, toast } from '../ui.js';
import * as caret from '../caret.js';
import * as analytics from '../analytics.js';

/* 번역 검사 도구(check-i18n)가 키를 찾도록 t('…') 를 그대로 쓴다 */
const kindLabel = (k) => ({ idea: t('기능 제안'), problem: t('불편한 점'), praise: t('칭찬'), other: t('기타') })[k];
const KIND_ICON = { idea: 'spark', problem: 'info', praise: 'heart', other: 'quote' };

let unguard = null;

export async function render(root) {
  analytics.design('feedback:view');
  let kind = 'idea';

  const intro = el('div', { class: 'card fb-intro' });
  intro.innerHTML =
    `<div class="fb-intro-ico">${icon('quote')}</div>
     <div><div class="fb-intro-title">${esc(t('하루칸을 함께 만들어요'))}</div>
     <div class="fb-intro-text">${esc(t('불편한 점이나 있었으면 하는 기능을 알려 주세요. 모든 의견을 직접 읽고, 좋은 의견은 다음 업데이트에 반영해요.'))}</div></div>`;

  const box = el('div', { class: 'card fb-form' });

  /* 종류 */
  const kinds = el('div', { class: 'chip-row fb-kinds' });
  for (const k of fb.KINDS) {
    const b = el('button', { class: 'chip' + (k === kind ? ' on' : ''), type: 'button', 'data-k': k },
      `${icon(KIND_ICON[k])}<span>${esc(kindLabel(k))}</span>`);
    b.addEventListener('click', () => {
      kind = k;
      kinds.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c.dataset.k === k));
    });
    kinds.append(b);
  }

  /* 의견 글 */
  const msg = el('textarea', {
    class: 'lock-input fb-text', rows: '6', maxlength: String(fb.MAX_LEN),
    placeholder: t('예) 일기를 쓸 때 음악도 기록할 수 있으면 좋겠어요.'),
  });
  const count = el('div', { class: 'fb-count tnum' }, `0 / ${fb.MAX_LEN}`);

  /* 답장 이메일 (선택) */
  const email = el('input', {
    class: 'lock-input', type: 'email', inputmode: 'email', autocomplete: 'email',
    placeholder: t('이메일 (선택)'), style: 'text-align:start',
  });
  const emailHint = el('div', { class: 'fb-hint' }, esc(t('답장을 받고 싶을 때만 적어 주세요.')));

  const send = el('button', { class: 'btn btn-primary fb-send', type: 'button' }, esc(t('의견 보내기')));
  const sync = () => {
    const n = msg.value.trim().length;
    count.textContent = `${msg.value.length} / ${fb.MAX_LEN}`;
    send.disabled = n < 2;
  };
  msg.addEventListener('input', () => { sync(); msg.style.height = 'auto'; msg.style.height = Math.min(msg.scrollHeight + 2, 360) + 'px'; });
  sync();

  const privacy = el('div', { class: 'fb-privacy' });
  privacy.innerHTML = `${icon('lock')}<span>${esc(t('일기와 사진은 보내지 않아요. 여기 쓴 글과 앱 버전·언어·기기 종류만 하루칸 개발자에게 전송돼요.'))}</span>`;

  send.addEventListener('click', async () => {
    const m = msg.value.trim();
    if (m.length < 2) return;
    const em = email.value.trim();
    if (em && !fb.looksLikeEmail(em)) { toast(t('이메일 주소를 다시 확인해 주세요.')); email.focus(); return; }
    send.disabled = true;
    send.textContent = t('보내는 중…');
    const r = await fb.send({ kind, message: m, email: em });
    send.textContent = t('의견 보내기');
    analytics.design('feedback:send:' + r);
    if (r === 'ok') {
      msg.value = ''; email.value = ''; sync();
      done(root);
      return;
    }
    send.disabled = false;
    toast(r === 'tooSoon' ? t('조금 전에 보냈어요. 1분 뒤에 다시 보내 주세요.')
      : r === 'offline' ? t('인터넷에 연결되어 있지 않아요. 연결한 뒤 다시 보내 주세요.')
      : r === 'off' ? t('지금은 의견을 보낼 수 없어요. 잠시 뒤 다시 시도해 주세요.')
      : t('보내지 못했어요. 잠시 뒤 다시 보내 주세요.'));
  });

  const field = (label, ...nodes) => {
    const f = el('div', { class: 'fb-field' });
    f.append(el('label', { class: 'plan-label' }, esc(label)), ...nodes);
    return f;
  };
  box.append(
    field(t('어떤 의견인가요?'), kinds),
    field(t('의견'), msg, count),
    field(t('답장 받을 이메일'), email, emailHint),
    privacy,
    send,
  );
  root.append(intro, box);

  unguard?.();
  unguard = caret.guard(root);
  return {
    title: t('의견 보내기'),
    left: { icon: 'back', onClick: back },
  };
}

/** 화면을 떠날 때 (app.js doRoute) */
export function teardown() { unguard?.(); unguard = null; }

/** 보낸 뒤: 고마움 화면 */
function done(root) {
  root.innerHTML = '';
  const c = el('div', { class: 'card fb-done' });
  c.innerHTML =
    `<div class="fb-done-ico">${icon('heart')}</div>
     <div class="fb-done-title">${esc(t('의견 고마워요!'))}</div>
     <div class="fb-done-text">${esc(t('보내 주신 의견은 꼼꼼히 읽어볼게요. 좋은 의견은 다음 업데이트에 반영할게요.'))}</div>`;
  const ok = el('button', { class: 'btn btn-primary', type: 'button', style: 'margin-top:16px;width:100%' }, esc(t('확인')));
  ok.addEventListener('click', () => back());
  c.append(ok);
  root.append(c);
}
