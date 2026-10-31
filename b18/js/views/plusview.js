/* ===========================================================
   views/plusview.js — 하루칸 플러스 (1.5.0)
   설정 맨 위의 '하루칸 플러스' 한 줄에서 들어온다.

   예전에는 설정 화면 안에 구매·복원·체험 설명이 줄줄이 붙어 있었다.
   혜택이 늘어나면서(스티커, 배경 꾸미기) 설정이 광고판처럼 길어져서
   한 화면으로 모았다. 여기서 보여주는 것:
     ① 지금 상태 (쓰는 중 / 체험 n일 남음 / 가격 한 번만)
     ② 플러스로 열리는 것 — 바로 써볼 수 있는 것은 눌러서 그 화면으로 간다
     ③ 원래 무료인 것 — 사는 것과 섞이면 오해를 준다
     ④ 구매 · 구매 다시 적용
   =========================================================== */

import * as plus from '../plus.js';
import * as native from '../native.js';
import * as analytics from '../analytics.js';
import { go, back } from '../app.js';
import { el, icon, esc } from '../ui.js';
import { t } from '../i18n.js';
import { bgName } from './decor.js';
import * as store from '../store.js';

export async function render(root) {
  analytics.design('plus:view:screen');
  const isPlus = plus.isPlus();
  const nativeApp = native.isNative();
  const trialLeft = nativeApp && !isPlus ? plus.trialDaysLeft() : null;
  const price = plus.price();

  /* ① 상태 */
  const hero = el('div', { class: 'plus-hero' });
  let headline, sub;
  if (!nativeApp) {
    headline = t('웹에서는 모두 열려 있어요');
    sub = t('플러스는 안드로이드 앱에서 살 수 있어요. 웹에는 광고도 결제도 없습니다.');
  } else if (isPlus) {
    headline = t('플러스를 쓰고 계세요');
    sub = t('구매해 주셔서 고맙습니다. 광고 없이, 일정도 개수 제한 없이 쓰실 수 있어요.') + ' ' + t('위로 스티커 120종까지 모두 쓸 수 있어요.');
  } else if (trialLeft) {
    headline = t('무료 체험') + ' · ' + t('{n}일 남았어요', { n: trialLeft });
    sub = t('지금은 하루칸 플러스의 모든 기능을 무료로 쓰고 계세요. 체험이 끝나도 자동으로 결제되지 않아요. 카드도 등록하지 않았습니다.');
  } else {
    headline = price ? `${price} · ${t('한 번만')}` : t('하루칸 플러스');
    sub = t('구독이 아니에요. 매달 나가는 돈이 없습니다.');
  }
  hero.innerHTML =
    `<div class="plus-hero-kicker">${icon('heart')}<span>${esc(t('하루칸 플러스'))}</span></div>
     <div class="plus-hero-title">${esc(headline)}</div>
     <div class="plus-hero-sub">${esc(sub)}</div>`;
  root.append(hero);

  /* 체험 중이면 끝났을 때 무엇이 달라지는지 미리 말해 둔다 — 모르고 만나면 빼앗긴 것 같다 */
  if (trialLeft) {
    const g = el('div', { class: 'note', style: 'margin:12px 6px 0' });
    g.innerHTML = `<b>${esc(t('무엇이 달라지나요?'))}</b><br>`
      + esc(t('체험이 끝나면 배너 광고가 생기고 일정은 {n}개까지만 넣을 수 있어요. 지금까지 넣어둔 일정은 그대로 남습니다.', { n: plus.planCeiling() })
        + ' ' + t('배경 꾸미기·PDF 내보내기·위로 스티커도 체험 동안만 쓸 수 있어요. 붙여둔 스티커는 그대로 남고, 배경은 기본으로 돌아가요.')
        + ' ' + t('사진 묶음·사진 달력도 체험 동안만 쓸 수 있어요. 이미 만든 사진 묶음은 그대로 보여요.'));
    root.append(g);
  }

  /* ② 플러스로 열리는 것 */
  const cur = store.getSettings().bgTheme || 'none';
  root.append(group(t('플러스로 열리는 것'), [
    row(t('배경 꾸미기'), t('꽃·보석으로 꾸민 미니멀 배경 10종과 내 사진으로 화면을 꾸며요.'),
      { ico: 'spark', tone: 'plum', badge: 'NEW',
        value: plus.canUseBackground() && cur !== 'none' ? bgName(cur) : '',
        onClick: () => go('/decor') }),
    row(t('PDF로 내보내기'), t('일기를 PDF로 묶어 인쇄하고 간직해요. 디자인 5가지 중에서 골라요.'),
      { ico: 'book', tone: 'plum', badge: 'NEW', onClick: () => go('/pdf') }),
    row(t('사진 묶음'), t('여러 장을 한 틀에 모아요'),
      { ico: 'image', tone: 'orange', badge: 'NEW' }),
    row(t('사진 달력'), t('달력 칸을 그날 찍은 사진으로 채워요.'),
      { ico: 'cal', tone: 'blue', badge: 'NEW', onClick: () => go('/calendar') }),
    row(t('위로 스티커'), t('위로 스티커 120종을 쓸 수 있어요. 기본·계절·동물·테이프 스티커 56종은 무료예요.'),
      { ico: 'sticker', tone: 'orange', badge: 'NEW' }),
    row(t('일정 개수 제한 없음'), t('무료로는 끝나지 않은 일정을 {n}개까지 둘 수 있어요.', { n: plus.FREE_PLAN_LIMIT }),
      { ico: 'list', tone: 'blue', onClick: () => go('/plans') }),
    row(t('배너 광고 없음'), t('배너 광고가 모든 화면에서 사라져요.'),
      { ico: 'eye', tone: 'green' }),
  ]));

  /* 스티커 플러스(따로 파는 상품)는 1.6.6 에서 없앰다 — 스티커는 전부 하루칸 플러스에 들어 있다 */

  /* ③ 원래 무료 */
  root.append(el('div', { class: 'note', style: 'margin:12px 6px 0' },
    esc(t('일기 쓰기·사진 넣기(글 사이 자리·크기)·스티커 56종·잠금·백업은 원래부터 전부 무료예요. 30일 무료 체험 동안은 위의 플러스 기능을 모두 써 볼 수 있어요.'))));

  /* ④ 구매 */
  if (nativeApp && !isPlus) {
    const buy = el('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:22px' },
      icon('heart') + `<span>${esc(price ? t('{p}으로 사기', { p: price }) : t('구매하기'))}</span>`);
    buy.addEventListener('click', () => plus.confirmBuy('plus_screen'));
    root.append(buy);
  }
  if (nativeApp) {
    root.append(group('', [
      row(t('구매 다시 적용'), t('이미 구매했는데 적용되지 않았다면 (기기 변경·재설치) 눌러주세요. 일기 데이터 복원과는 관계없어요.'),
        { ico: 'refresh', tone: 'orange', onClick: () => plus.restore() }),
    ]));
  }

  return { title: t('하루칸 플러스'), left: { icon: 'back', onClick: back } };
}

function group(label, rows) {
  const g = el('div', { class: 'set-group' });
  if (label) g.append(el('div', { class: 'set-label' }, `<span>${esc(label)}</span>`));
  const list = el('div', { class: 'set-list' });
  for (const r of rows) list.append(r);
  g.append(list);
  return g;
}

function row(title, sub, { ico, tone, badge, value, onClick } = {}) {
  const r = el('div', { class: 'set-row' });
  r.innerHTML =
    `<div class="set-ico ico-${tone}">${icon(ico)}</div>
     <div class="set-row-main">
       <div class="set-row-title">${esc(title)}${badge ? ` <span class="new-pill">${esc(badge)}</span>` : ''}</div>
       <div class="set-row-sub">${esc(sub)}</div>
     </div>`
    + (value ? `<div class="set-row-val">${esc(value)}</div>` : '')
    + (onClick ? icon('chev', 'chev') : '');
  if (onClick) { r.style.cursor = 'pointer'; r.addEventListener('click', onClick); }
  return r;
}
