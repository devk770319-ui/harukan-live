/* ===========================================================
   views/passcode.js — 앱 비밀번호(숫자 4자리) 설정 화면
     새로 설정 : 네 자리 입력 → 한 번 더 확인 → 켜기
     변경      : 현재 확인 → 새 네 자리 → 한 번 더 확인
     끄기      : 현재 확인 → 해제
     다시 정하기(reset): 복구 코드로 연 직후 — 새 네 자리 → 한 번 더 확인 (2026-10-30)
   잠금 화면과 같은 키패드를 쓴다. 네 자리를 채우면 자동으로 넘어간다.
   =========================================================== */

import * as store from '../store.js';
import { go, back, enableLock, disableLock } from '../app.js';
import { el, icon, esc, toast, confirmSheet, buildKeypad, setDots, PIN_LEN } from '../ui.js';
import { deriveKey, checkVerifier, ITER_LEGACY } from '../crypto.js';
import { t } from '../i18n.js';

let mode = 'new';        // new | change | off | reset
let fromGuide = false;   // 첫 사용 가이드의 '잠금 설정하기'로 왔다 (1.7.2)
let step = 0;            // change/off 는 0=현재확인, 1=새 입력, 2=확인 / new 는 1,2
let first = '';          // 1단계에서 받은 새 비밀번호
let pin = '';
let busy = false;
let cfg = null;
let refs = {};

export async function render(root, params) {
  cfg = await store.metaGet('lock', null);
  mode = params.m || (cfg ? 'change' : 'new');
  fromGuide = params.from === 'guide';
  if (!cfg && mode !== 'new') mode = 'new';
  step = (mode === 'new' || mode === 'reset') ? 1 : 0;
  first = ''; pin = ''; busy = false;

  const wrap = el('div', { class: 'pc-wrap' });
  wrap.innerHTML =
    `<div class="pc-head">
       <div class="pin-mark" aria-hidden="true"></div>
       <div class="pc-kicker" id="pcKicker"></div>
       <h2 class="pc-title" id="pcTitle"></h2>
       <p class="pc-sub" id="pcSub"></p>
     </div>
     <div class="pin-dots" id="pcDots" role="status"><i></i><i></i><i></i><i></i></div>
     <p class="lock-err" id="pcErr" role="alert" aria-live="assertive"></p>`;
  root.append(wrap);

  refs = { wrap, kicker: wrap.querySelector('#pcKicker'), title: wrap.querySelector('#pcTitle'),
           sub: wrap.querySelector('#pcSub'), dots: wrap.querySelector('#pcDots'),
           err: wrap.querySelector('#pcErr') };

  wrap.append(buildKeypad(onKey));

  const restart = el('button', { class: 'btn btn-ghost btn-block', type: 'button', style: 'margin-top:14px' },
    t('처음부터 다시'));
  restart.addEventListener('click', () => {
    step = (mode === 'new' || mode === 'reset') ? 1 : (mode === 'off' ? 0 : 1);
    first = ''; pin = ''; paint();
  });
  wrap.append(restart);

  wrap.append(el('p', { class: 'pc-note' },
    t('비밀번호는 이 기기 어디에도 그대로 저장되지 않습니다. 잊었을 때는 미리 만들어 둔 복구 코드로만 열 수 있어요. 설정 › 잠금 › 복구 코드에서 만들 수 있습니다.')));

  paint();
  return {
    title: { new: t('비밀번호 설정'), change: t('비밀번호 변경'), off: t('비밀번호 끄기'), reset: t('새 비밀번호 정하기') }[mode],
    left: { icon: 'back', label: t('뒤로'), onClick: back },
  };
}

function copy() {
  if (step === 0) {
    return { k: mode === 'off' ? t('확인') : '1 / 3', t: t('현재 비밀번호를 넣어주세요'),
             s: mode === 'off' ? t('맞으면 잠금을 끕니다.') : '' };
  }
  const total = mode === 'change' ? 3 : 2;
  const idx = mode === 'change' ? step + 1 : step;
  if (step === 1) {
    return { k: `${idx} / ${total}`,
             t: (mode === 'change' || mode === 'reset') ? t('새 비밀번호를 넣어주세요') : t('숫자 네 자리를 정해주세요'),
             s: t('생일이나 1234처럼 쉬운 숫자는 피해주세요.') };
  }
  return { k: `${total} / ${total}`, t: t('한 번 더 넣어주세요'),
           s: t('확인을 위해 같은 숫자를 다시 넣습니다.') };
}

function paint() {
  const c = copy();
  refs.kicker.textContent = c.k;
  refs.title.textContent = c.t;
  refs.sub.textContent = c.s;
  refs.sub.hidden = !c.s;
  refs.err.textContent = '';
  setDots(refs.dots, pin.length);
}

function wrong(msg) {
  refs.err.textContent = msg;
  setDots(refs.dots, PIN_LEN, { shake: true });
  setTimeout(() => { pin = ''; setDots(refs.dots, 0); }, 420);
}

async function onKey(k) {
  if (busy) return;
  if (k === 'back') { pin = pin.slice(0, -1); setDots(refs.dots, pin.length); refs.err.textContent = ''; return; }
  if (pin.length >= PIN_LEN) return;
  pin += k;
  refs.err.textContent = '';
  setDots(refs.dots, pin.length);
  if (pin.length < PIN_LEN) return;

  /* 현재 비밀번호 확인 */
  if (step === 0) {
    busy = true; refs.err.textContent = t('확인 중…');
    const key = await deriveKey(pin, cfg.salt, cfg.iter || ITER_LEGACY);
    const ok = await checkVerifier(key, cfg.verifier);
    busy = false;
    if (!ok) { wrong(t('비밀번호가 맞지 않아요.')); return; }
    refs.err.textContent = '';   // 맞았다 — '확인 중…'을 지운다 (물어보는 창 뒤에 남아 있었다)
    if (mode === 'off') {
      const yes = await confirmSheet({
        title: t('비밀번호를 끌까요?'),
        text: t('일기가 암호화 없이 저장됩니다. 이 기기를 다른 사람과 함께 쓴다면 켜 두는 편이 안전해요.'),
        ok: t('끄기'), danger: true,
      });
      if (!yes) { back(); return; }
      await disableLock();
      toast(t('비밀번호를 껐어요.'));
      go('/settings', { replace: true });
      return;
    }
    pin = ''; step = 1; paint(); return;
  }

  /* 새 비밀번호 입력 */
  if (step === 1) {
    if (/^(\d)\1{3}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
      wrong(t('너무 쉬운 숫자예요. 다른 걸로 정해주세요.'));
      return;
    }
    first = pin; pin = ''; step = 2; paint(); return;
  }

  /* 확인 입력 */
  if (pin !== first) { wrong(t('두 번 넣은 숫자가 달라요. 다시 해주세요.')); step = 1; first = ''; setTimeout(paint, 430); return; }
  busy = true;
  refs.err.textContent = t('암호화하는 중…');
  try {
    await enableLock(first);
    toast(mode === 'change' || mode === 'reset' ? t('비밀번호를 바꿨어요.') : t('비밀번호를 켰습니다. 꼭 기억해 주세요.'));
    /* 처음 켤 때 복구 코드를 바로 권한다 (2026-10-30) — 방금 정한 비밀번호로 만든다 */
    if (mode === 'new') {
      const yes = await confirmSheet({
        title: t('복구 코드를 만들어 둘까요?'),
        text: t('비밀번호를 잊었을 때 이 코드로 열고 새로 정할 수 있어요. 서버나 이메일 없이 이 기기에서만 동작합니다.'),
        ok: t('만들기'),
      });
      if (yes) await (await import('../recovery.js')).createFlow(first);
      else await store.metaSet('recOffer', true);
    }
    if (mode === 'reset') { go('/home', { replace: true }); return; }
    if (fromGuide) {   // 첫 사용 가이드에서 왔으면 홈으로 가서 ③장부터 이어서 (1.7.2)
      go('/home', { replace: true });
      import('../guide.js').then((g) => g.show({ start: 2 }));
      return;
    }
    go('/settings', { replace: true });
  } catch (e) {
    console.error(e);
    busy = false;
    wrong(t('설정에 실패했어요. 다시 시도해 주세요.'));
  }
}
