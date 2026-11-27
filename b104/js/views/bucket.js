/* ===========================================================
   views/bucket.js — 버킷리스트·디데이 (2026-11-27, 서버 없이 폰 안에만 · 무료)
   · 디데이: 이름 + 날짜. '매년 반복'(생일·기념일)이면 다음에 오는 그날까지. 지난 날짜면 D+n(그날부터 n+1일째)
   · 버킷리스트: 하고 싶은 일 한 줄. 동그라미를 누르면 '이뤘어요'(날짜 남김). 목표 날짜를 넣으면 D-n
   · 들어오는 길: 발견 화면 '버킷리스트·디데이' 카드
   =========================================================== */
import * as B from '../bucket.js';
import * as analytics from '../analytics.js';
import * as NB from '../newbadge.js';
import { t } from '../i18n.js';
import { back, go } from '../app.js';
import { el, esc, icon, openSheet, closeSheet, toast, confirmSheet, fmtDate } from '../ui.js';

const today = () => B.todayStr();

export async function render(root) {
  await B.load();
  NB.used('bucket');
  analytics.design('bucket:open', B.all().length);
  const head = { title: t('버킷리스트·디데이'), left: { icon: 'back', onClick: back } };
  const redraw = () => { root.innerHTML = ''; paint(root, redraw); };
  paint(root, redraw);
  return head;
}

function paint(root, redraw) {
  /* ── 디데이 ── */
  const ds = el('section', { class: 'bkt-sec' });
  ds.append(el('div', { class: 'bkt-h' }, `<b>${esc(t('디데이'))}</b><span>${esc(t('기다리는 날, 기념하는 날'))}</span>`));
  const days = B.days().sort((a, b) => order(a) - order(b));
  if (!days.length) ds.append(el('div', { class: 'bkt-empty' }, esc(t('여행 가는 날, 시험, 생일, 사귄 날처럼 세고 싶은 날을 넣어 보세요.'))));
  const grid = el('div', { class: 'bkt-days' });
  for (const it of days) grid.append(dayCard(it, redraw));
  if (days.length) ds.append(grid);
  const addDay = el('button', { class: 'bkt-add', type: 'button' }, `${icon('plus')}<span>${esc(t('디데이 추가'))}</span>`);
  addDay.addEventListener('click', () => editSheet({ kind: 'day' }, redraw));
  ds.append(addDay);
  root.append(ds);

  /* ── 버킷리스트 ── */
  const gs = el('section', { class: 'bkt-sec' });
  const goals = B.goals();
  const todo = goals.filter((x) => !x.done).sort((a, b) => (a.date || '9999') < (b.date || '9999') ? -1 : (a.date || '9999') > (b.date || '9999') ? 1 : a.createdAt - b.createdAt);
  const done = goals.filter((x) => x.done).sort((a, b) => (b.doneAt || 0) - (a.doneAt || 0));
  gs.append(el('div', { class: 'bkt-h' }, `<b>${esc(t('버킷리스트'))}</b><span>${esc(t('이룬 것 {a} / 전체 {b}', { a: done.length, b: goals.length }))}</span>`));
  /* 바로 적는 줄 */
  const form = el('form', { class: 'bkt-new' });
  const inp = el('input', { class: 'bkt-inp', type: 'text', maxlength: '60', placeholder: t('하고 싶은 일을 적어 보세요'), enterkeyhint: 'done', 'aria-label': t('하고 싶은 일') });
  const addB = el('button', { class: 'bkt-new-b', type: 'submit' }, esc(t('추가')));
  form.append(inp, addB);
  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = inp.value.trim();
    if (!v) { inp.focus(); return; }
    const it = await B.add('goal', v);
    if (!it) return;
    analytics.design('bucket:add:goal');
    redraw();
    requestAnimationFrame(() => root.querySelector('.bkt-inp')?.focus());
  });
  gs.append(form);
  if (!goals.length) gs.append(el('div', { class: 'bkt-empty' }, esc(t('예: 바다 보며 일기 쓰기, 혼자 여행 가기, 책 열 권 읽기'))));
  const ul = el('div', { class: 'bkt-list' });
  for (const it of todo) ul.append(goalRow(it, redraw));
  if (todo.length) gs.append(ul);
  if (done.length) {
    const det = el('details', { class: 'bkt-done' });
    det.innerHTML = `<summary>${esc(t('이룬 것 {n}개', { n: done.length }))}</summary>`;
    const dl = el('div', { class: 'bkt-list' });
    for (const it of done) dl.append(goalRow(it, redraw));
    det.append(dl);
    gs.append(det);
  }
  root.append(gs);
}

/* 디데이 순서: 다가오는 날(가까운 순) 먼저, 그다음 지난 날(최근 순) */
function order(it) {
  const c = B.countOf(it, today());
  if (!c) return 1e9;
  return 'left' in c ? c.left : 1e6 + c.since;
}

function dayCard(it, redraw) {
  const c = B.countOf(it, today());
  const b = el('button', { class: 'bkt-day' + (c && 'since' in c ? ' past' : '') + (c && c.left === 0 ? ' today' : ''), type: 'button' });
  const sub = !c ? '' : 'left' in c
    ? (it.yearly ? t('매년 {d}', { d: fmtDate(it.date, { year: false }) }) : fmtDate(c.target))
    : t('{n}일째', { n: c.since + 1 }) + ' · ' + fmtDate(it.date);
  b.innerHTML = `<span class="bkt-d">${esc(B.dLabel(it, today()))}</span><span class="bkt-t">${esc(it.title)}</span><span class="bkt-s">${esc(sub)}</span>`;
  b.addEventListener('click', () => editSheet(it, redraw));
  return b;
}

function goalRow(it, redraw) {
  const row = el('div', { class: 'bkt-row' + (it.done ? ' done' : '') });
  const chk = el('button', { class: 'bkt-chk', type: 'button', 'aria-label': it.done ? t('이루지 않은 것으로') : t('이뤘어요'), 'aria-pressed': it.done ? 'true' : 'false' }, it.done ? icon('check') : '');
  chk.addEventListener('click', async () => {
    const was = !!it.done;                    // update 가 같은 항목을 바꾸므로 먼저 적어 둔다
    await B.update(it.id, { done: !was });
    analytics.design(was ? 'bucket:undone' : 'bucket:done');
    if (!was) toast(t('이뤘어요! 오늘 일기에 남겨 보세요.'));
    redraw();
  });
  const tx = el('button', { class: 'bkt-tx', type: 'button' });
  const meta = it.done && it.doneAt ? t('{d}에 이룸', { d: fmtDate(dateKey(it.doneAt)) }) : it.date ? `${B.dLabel(it, today())} · ${fmtDate(it.date)}` : '';
  tx.innerHTML = `<span class="bkt-tt">${esc(it.title)}</span>${meta ? `<span class="bkt-meta">${esc(meta)}</span>` : ''}`;
  tx.addEventListener('click', () => editSheet(it, redraw));
  row.append(chk, tx);
  return row;
}
const dateKey = (ms) => B.todayStr(new Date(ms));

/** 만들기·고치기 창. it 에 id 가 없으면 새로 만든다 */
function editSheet(it, redraw) {
  const isNew = !it.id, kind = it.kind;
  const box = el('form', { class: 'bkt-form' });
  const name = el('input', { class: 'bkt-f-name', type: 'text', maxlength: '60', value: it.title || '', placeholder: kind === 'day' ? t('예: 제주 여행') : t('하고 싶은 일'), 'aria-label': t('이름') });
  const date = el('input', { class: 'bkt-f-date', type: 'date', value: it.date || (kind === 'day' ? today() : ''), 'aria-label': t('날짜') });
  box.append(el('label', { class: 'bkt-f-l' }, esc(t('이름'))), name, el('label', { class: 'bkt-f-l' }, esc(kind === 'day' ? t('날짜') : t('목표 날짜 (없어도 돼요)'))), date);
  let yearly = null;
  if (kind === 'day') {
    const lab = el('label', { class: 'bkt-f-yr' });
    yearly = el('input', { type: 'checkbox' }); yearly.checked = !!it.yearly;
    lab.append(yearly, el('span', {}, esc(t('매년 반복 (생일·기념일)'))));
    box.append(lab);
  }
  const btns = el('div', { class: 'bkt-f-btns' });
  const ok = el('button', { class: 'btn btn-primary', type: 'submit' }, esc(isNew ? t('추가') : t('저장')));
  btns.append(ok);
  if (!isNew) {
    const del = el('button', { class: 'btn bkt-f-del', type: 'button' }, esc(t('지우기')));
    del.addEventListener('click', async () => {
      closeSheet();
      const yes = await confirmSheet({ title: t('「{a}」를 지울까요?', { a: it.title }), ok: t('지우기'), danger: true });
      if (!yes) return;
      await B.remove(it.id);
      analytics.design('bucket:delete:' + kind);
      redraw();
    });
    btns.append(del);
  }
  box.append(btns);
  box.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const v = name.value.trim();
    if (!v) { name.focus(); toast(t('이름을 적어 주세요.')); return; }
    if (kind === 'day' && !date.value) { toast(t('날짜를 골라 주세요.')); return; }
    if (isNew) {
      const r = await B.add(kind, v, { date: date.value || null, yearly: !!yearly?.checked });
      if (!r) { toast(t('날짜를 골라 주세요.')); return; }
      analytics.design('bucket:add:' + kind);
    } else {
      await B.update(it.id, { title: v, date: date.value || null, ...(yearly ? { yearly: yearly.checked } : {}) });
    }
    closeSheet();
    redraw();
  });
  openSheet({ title: isNew ? (kind === 'day' ? t('디데이 추가') : t('버킷리스트 추가')) : (kind === 'day' ? t('디데이 고치기') : t('버킷리스트 고치기')), content: box });
  if (isNew) setTimeout(() => name.focus(), 250);
}

/** 발견 화면 카드 */
export function card() {
  const b = el('button', { class: 'ins-map span-all', type: 'button' });
  b.innerHTML = `<span class="ic">${icon('compass')}</span><span class="tx"><b>${esc(t('버킷리스트·디데이'))}${NB.pill('bucket')}</b><span>${esc(t('하고 싶은 일과 기다리는 날을 모아 봐요'))}</span></span><span aria-hidden="true">›</span>`;
  b.addEventListener('click', () => go('/bucket'));
  return b;
}
