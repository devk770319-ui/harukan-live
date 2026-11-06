/* ===========================================================
   recovery.js — 복구 코드 만들기·쓰기 화면 (2026-10-30 사용자 지시)
   · createFlow(pin) : 코드를 한 번 보여 주고(복사·나에게 보내기), 마지막 네 자리를 다시 넣어
                       적어 둔 걸 확인한 뒤에야 저장한다. 확인 전에 닫으면 아무것도 바뀌지 않는다.
   · openWithCode()  : 잠금 화면 '비밀번호를 잊으셨나요?' → 코드 → 비밀번호를 되찾아 돌려준다.
   열쇠 계산은 crypto.js (recoveryCreate / recoveryOpen / recoveryRewrap).
   =========================================================== */
import * as store from './store.js';
import * as analytics from './analytics.js';
import { t } from './i18n.js';
import { newRecoveryCode, formatRecoveryCode, normalizeRecoveryCode, cleanRecoveryInput, recoveryCreate, recoveryOpen } from './crypto.js';

export async function hasRecovery() { return !!(await store.metaGet('lock', null))?.rec; }
export async function recoveryDate() { return (await store.metaGet('lock', null))?.rec?.at || 0; }

async function copyText(s) {
  try { await navigator.clipboard.writeText(s); return true; } catch { /* 아래로 */ }
  try {
    const ta = document.createElement('textarea'); ta.value = s; ta.style.cssText = 'position:fixed;opacity:0';
    document.body.append(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok;
  } catch { return false; }
}

async function shareText(title, text) {
  const S = window.Capacitor?.Plugins?.Share;
  try { if (S) { await S.share({ title, text, dialogTitle: title }); return true; } } catch { return false; }
  try { if (navigator.share) { await navigator.share({ title, text }); return true; } } catch { return false; }
  return false;
}

/**
 * 복구 코드를 새로 만든다. pin = 지금 비밀번호(맞는 것으로 확인된 것).
 * @returns {Promise<boolean>} 저장했으면 true
 */
export async function createFlow(pin) {
  const { el, esc, openSheet, closeSheet, promptSheet, toast } = await import('./ui.js');
  const code = newRecoveryCode();
  const shown = formatRecoveryCode(code);
  analytics.design('recovery:show');

  const step1 = await new Promise((resolve) => {
    let done = false;
    const box = el('div', { class: 'rec-box' });
    box.append(el('div', { class: 'rec-code', dir: 'ltr' }, esc(shown)));
    box.append(el('p', { class: 'rec-warn' }, esc(t('이 코드는 지금 한 번만 보여 드려요. 종이에 적거나, 메모나 메일에 보관해 주세요. 코드를 아는 사람은 일기를 열 수 있으니 다른 사람에게 보여 주지 마세요.'))));
    const row = el('div', { class: 'btn-row rec-row' });
    const bCopy = el('button', { class: 'btn btn-ghost', type: 'button' }, esc(t('복사')));
    const bSend = el('button', { class: 'btn btn-ghost', type: 'button' }, esc(t('나에게 보내기')));
    row.append(bCopy, bSend);
    const bDone = el('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:12px' }, esc(t('적어 뒀어요')));
    box.append(row, bDone);
    bCopy.addEventListener('click', async () => { toast((await copyText(shown)) ? t('복사했어요.') : t('복사하지 못했어요. 직접 적어 주세요.')); analytics.design('recovery:copy'); });
    bSend.addEventListener('click', async () => {
      analytics.design('recovery:send');
      const ok = await shareText(t('하루칸 복구 코드'), t('하루칸 복구 코드: {c}\n비밀번호를 잊었을 때 잠금 화면의 “비밀번호를 잊으셨나요?”에서 이 코드를 넣으세요. 다른 사람에게 보여 주지 마세요.', { c: shown }));
      if (!ok) toast(t('보내지 못했어요. 복사해서 붙여 넣어 주세요.'));
    });
    bDone.addEventListener('click', () => { done = true; closeSheet(); resolve(true); });
    openSheet({ title: t('복구 코드'), content: box, onClose: () => { if (!done) resolve(false); } });
  });
  if (!step1) { analytics.design('recovery:skip'); toast(t('복구 코드를 만들지 않았어요. 설정 › 잠금에서 언제든 만들 수 있어요.')); return false; }

  /* 적어 둔 걸 확인 — 마지막 네 자리. 코드를 통째로 붙여 넣어도, 한글 자판으로 쳤어도 받는다
     (2026-10-30 폰에서 사용자가 통째로 붙여 넣었는데 계속 '다르다'고 나왔다). 취소할 때까지 다시 받는다 */
  for (;;) {
    const v = await promptSheet({
      title: t('적어 둔 코드를 확인할게요'),
      text: t('복구 코드의 마지막 네 자리를 넣어 주세요.'),
      placeholder: '••••', ok: t('확인'),
    });
    if (v == null) { toast(t('복구 코드를 만들지 않았어요. 설정 › 잠금에서 언제든 만들 수 있어요.')); return false; }
    const typed = cleanRecoveryInput(v);
    if (typed === code.slice(-4) || typed === code) {
      const cfg = await store.metaGet('lock', null);
      if (!cfg) return false;
      cfg.rec = await recoveryCreate(code, pin);
      await store.metaSet('lock', cfg);
      analytics.design('recovery:created');
      toast(t('복구 코드를 만들었어요. 잘 보관해 주세요.'));
      return true;
    }
    toast(t('마지막 네 자리가 달라요. 다시 확인해 주세요: {c}', { c: shown }));
  }
}

/**
 * 잠금 화면에서: 복구 코드를 받아 비밀번호를 되찾는다.
 * @returns {Promise<string|null>} 되찾은 비밀번호
 */
export async function openWithCode() {
  const { promptSheet, toast } = await import('./ui.js');
  const cfg = await store.metaGet('lock', null);
  if (!cfg?.rec) return null;
  for (;;) {
    const v = await promptSheet({
      title: t('복구 코드를 넣어 주세요'),
      text: t('복구 코드 16자리예요. 대시(-)나 띄어쓰기는 빼도 돼요.'),
      placeholder: 'XXXX-XXXX-XXXX-XXXX', ok: t('열기'),
    });
    if (v == null) return null;
    const code = normalizeRecoveryCode(v);
    if (!code) { toast(t('16자리 코드를 다시 확인해 주세요.')); continue; }
    toast(t('확인 중…'));
    const pin = await recoveryOpen(cfg.rec, code);
    if (pin) { analytics.design('recovery:used'); return pin; }
    analytics.design('recovery:wrong');
    toast(t('복구 코드가 맞지 않아요.'));
  }
}
