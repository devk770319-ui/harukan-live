/* ===========================================================
   views/write.js — 쓰기
   설계 원칙
   · 열자마자 커서가 본문에 있다. 아무것도 고르지 않아도 쓸 수 있다.
   · 저장은 [완료]를 눌렀을 때만 한다 (1.4.2, 사용자 요청 — 자동 저장을 버그로 느꼈다).
     저장하지 않고 나가려 하면 묻는다. 대신 쓰던 내용은 '임시 원고'로 따로 적어 두어
     앱이 꺼져도 사라지지 않고, 다음에 같은 글을 열 때 이어 쓸지 묻는다.
   · 빈 글은 저장하지 않는다 → 유령 글이 안 생긴다.
   · 감정·태그·사진은 전부 선택. 쓰기를 막는 단계가 하나도 없다.
   =========================================================== */

import * as store from '../store.js';
import * as native from '../native.js';
import { go, back } from '../app.js';
import {
  $, el, icon, esc, toast, openSheet, closeSheet, confirmSheet, haptic,
  todayKey, fmtDate, moodColor, moodWord, autogrow, addDays, daysBetween, tapToPick,
} from '../ui.js';
import { pickPrompts, GUIDED_SETS, chipGroups, chipIcon } from '../prompts.js';
import { openChipEditor } from '../chipedit.js';
import { makeKeywordExtractor, guessMood } from '../nlp.js';
import { recentMoodAvg } from '../insights.js';
import { t, current as i18nCurrent, locale as i18nLocale } from '../i18n.js';
import * as stickers from '../stickers.js';
import * as analytics from '../analytics.js';
import * as caret from '../caret.js';
import * as wx from '../weather.js';
import * as place from '../place.js';
import * as NB from '../newbadge.js';
import * as PL from '../photolayout.js';
import * as plus from '../plus.js';
import * as M from '../music.js';
import { songCard } from '../songcard.js';
import * as BGM from '../bgm.js';
import * as SHARE from '../sharein.js';

let entry = null;
let dirty = false;          // 마지막 저장 뒤로 바뀐 것이 있다
let draftTimer = null;
let isNew = false;
let draftKey = '';         // 임시 원고 자리: 'id:<글>' 또는 'new:<날짜>'
let fromEntry = false;     // 글 보기 화면의 '고쳐 쓰기'로 들어왔다 → 완료하면 그 화면으로 돌아간다
let otherDraft = null;     // 다른 글의 임시 원고 (덮어쓸 때 그 원고의 사진을 정리한다)
/* 사진: 이번에 새로 넣은 것은 저장하지 않고 나가면 지운다. 원래 있던 사진을 빼면
   저장할 때 지운다(저장하지 않고 나가면 그대로 남아야 하므로). */
let addedPhotos = new Set();
let removedPhotos = new Set();
let photoJobs = Promise.resolve();
let photoBusy = 0;
let promptSalt = 0;
let refs = {};
/* 익명 통계용: 이 화면에 들어올 때의 사진·스티커 개수. 내용은 보내지 않고 '몇 개 붙였나'만 센다 */
let stat = null;
let unguardCaret = null;
/* 미래의 나에게 쓰는 화면 (#/write?capsule=1, 1.7.5). [완료] = 묻어두기 */
let capsule = false;   // 커서가 키보드·툴바에 가리지 않게 (caret.js, 1.7.2)
/* 한글은 글자 하나가 여러 번의 입력으로 조합된다 (ㄱ → 가 → 강).
   조합이 끝나기 전에 화면 배치를 건드리면 안드로이드 IME 가 조합을 다시 시작해
   방금 친 글자가 늦게 들어오거나 튄다. 조합 중에는 배치를 손대지 않는다. */
let composing = false;
/* 태그 추천용 색인. 이 글을 쓰는 동안 나머지 일기는 바뀌지 않으니 한 번만 만든다. */
let extractor = null;

/* ── 저장 ───────────────────────────────────────── */
/* 글을 한 자도 안 썼어도 기분이나 칩을 골랐으면 그것이 그 날의 기록이다.
   쓸 말이 없는 날이 쓸 일이 없는 날은 아니다. 기분 하나 찍고 닫았는데
   아무것도 안 남으면, 정작 기록이 가장 필요한 날들이 통째로 비어버린다.
   달력·통계·되새김은 이미 본문 없는 글을 사진·칩·기분으로 표시할 줄 안다. */
function isEmpty(e) {
  return !(e.body || '').trim()
    && !(e.title || '').trim()
    && !e.photos.length
    && !e.mood
    && !e.chips?.length
    && !e.stickers?.length
    && !e.song;
}

/** 사용자가 바꿀 수 있는 내용만 묶은 비교용 문자열 */
function contentSig(e) {
  return JSON.stringify([e.title || '', e.body || '', e.photos || [], e.mood || null, e.chips || [], e.tags || [],
    e.stickers || [], e.sealedUntil || null, e.mode || '', e.guided || null, e.date, e.photoLayout || null, e.song || null, e.bgm || null]);
}

/** 저장한다. [완료]·묻어두기처럼 사용자가 저장을 고른 자리에서만 부른다. 저장했으면 true */
async function commit() {
  clearTimeout(draftTimer);
  await photoJobs;                               // 넣는 중인 사진까지 다 붙인 뒤에
  if (!entry) return false;
  if (isNew && isEmpty(entry)) { await discard(); return false; }   // 빈 글은 만들지 않는다
  /* 예시 글을 사용자가 고쳤으면 그때부터는 사용자의 글이다 (1.6.5).
     예전엔 예시 표시가 남아 '예시 지우기' 때 고친 내용·넣은 사진까지 함께 지워졌다.
     열어보고 그냥 [완료]만 누른 건 예시 그대로 둔다. */
  if (entry.demo) {
    const orig = store.byId(entry.id);
    if (!orig || contentSig(orig) !== contentSig(entry)) delete entry.demo;
  }
  const wasNew = isNew;
  if (draftCollage) dropDraft();  // 사진을 하나도 안 넣은 빈 틀은 저장하지 않는다
  PL.normalize(entry);          // 사진 자리·순서 정리 (1.7.5)
  await store.put(entry);
  for (const pid of removedPhotos) {
    if (!entry.photos.includes(pid)) { try { await store.deletePhoto(pid); } catch { /* 이미 없음 */ } }
  }
  addedPhotos = new Set();
  removedPhotos = new Set();
  isNew = false;
  dirty = false;
  draftKey = 'id:' + entry.id;
  try { await store.clearDraft(); } catch { /* 무시 */ }
  setStatus(t('저장됨'));
  if (stat && !stat.logged) {
    stat.logged = true;
    /* entry:new 의 value = 지금까지 쓴 내 글 편수(예시 제외). 내용은 보내지 않는다 */
    const nReal = stat.wasNew ? store.all().filter((x) => !x.demo && !x.deletedAt).length : undefined;
    analytics.design(stat.wasNew ? 'entry:new' : 'entry:edit', nReal);
    if (stat.wasNew) {
      analytics.once('funnel:first_entry');
      import('../milestones.js').then((m) => m.report(nReal)).catch(() => {});
      /* 첫 일기를 쓴 직후 한 번: 쉬어 간 날 알림 권한 부탁 (1.7.6). 그 뒤로는 저장할 때마다 다음 알림 날짜만 맞춘다 */
      if (nReal === 1) import('../nudge.js').then((m) => m.offerPermissionOnce()).catch(() => {});
    }
    import('../nudge.js').then((m) => m.refresh()).catch(() => {});
  }
  reportAdds();
  // 새 글을 저장한 직후가 평가를 부탁하기 가장 자연스러운 때다 (1.6.7, review.js 가 때를 고른다)
  if (wasNew) import('../review.js').then((m) => m.maybeAsk()).catch(() => {});
  return true;
}

/** 저장하지 않고 버린다. 이번에 넣은 사진도 지운다 */
async function discard() {
  clearTimeout(draftTimer);
  await photoJobs;
  for (const pid of addedPhotos) { try { await store.deletePhoto(pid); } catch { /* 무시 */ } }
  addedPhotos = new Set();
  removedPhotos = new Set();
  dirty = false;
  try { await store.clearDraft(); } catch { /* 무시 */ }
}

/** 쓰던 내용을 임시 원고로 적어 둔다 (글로 저장하는 것이 아니다 — 목록·달력에 안 나온다) */
async function saveDraftNow() {
  clearTimeout(draftTimer);
  if (!entry || !dirty) return;
  try {
    if (isNew && isEmpty(entry)) { await store.clearDraft(); return; }
    if (otherDraft && otherDraft.key !== draftKey) {
      // 다른 글의 원고를 덮어쓴다 — 그 원고에만 있던 사진은 정리한다
      const used = new Set(store.all().flatMap((e) => e.photos || []));
      for (const pid of otherDraft.added || []) if (!used.has(pid)) { try { await store.deletePhoto(pid); } catch { /* 무시 */ } }
      otherDraft = null;
    }
    await store.saveDraft({ key: draftKey, entry, added: [...addedPhotos], removed: [...removedPhotos], at: Date.now() });
  } catch (e) { console.error('임시 원고', e); }
}

/**
 * 이 화면을 떠나도 되는가. app.js 의 back() 이 화면을 옮기기 전에 부른다.
 * 바뀐 것이 있으면 저장할지 묻는다. 떠나도 되면 true.
 */
export async function beforeLeave() {
  if (photoBusy) await photoJobs;
  if (!entry || !dirty) return true;
  if (isNew && isEmpty(entry)) { await discard(); return true; }
  const pick = await choose(t('저장하지 않고 나갈까요?'), t('쓴 내용은 [완료]를 눌러야 저장돼요.'), [
    { k: 'save', label: t('저장하고 나가기'), icon: 'check' },
    { k: 'drop', label: t('저장하지 않고 나가기'), icon: 'trash', danger: true },
    { k: 'stay', label: t('계속 쓰기'), icon: 'edit' },
  ]);
  analytics.design('write:leave:' + (pick || 'none'));     // save · drop · stay · none(바깥을 눌러 닫음)
  if (pick === 'save') { try { await commit(); } catch (e) { saveFailed(e); return false; } toast(t('저장했어요.')); return true; }
  if (pick === 'drop') { await discard(); return true; }
  return false;                                  // 계속 쓰기 · 바깥을 눌러 닫음 · 뒤로가기
}

/** 가운데 팝업에서 하나를 고른다. 아무것도 안 고르고 닫으면 null */
function choose(title, text, items) {
  return new Promise((resolve) => {
    let picked = false;
    openSheet({
      center: true, title, text,
      items: items.map((it) => ({ ...it, onClick: () => { picked = true; resolve(it.k); } })),
    });
    const root = document.getElementById('sheetRoot');
    const obs = new MutationObserver(() => {
      if (!root.querySelector('.sheet:not(.out)') && !picked) { picked = true; obs.disconnect(); resolve(null); }
      else if (picked) obs.disconnect();
    });
    obs.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
  });
}

/* 이번에 새로 붙인 사진·스티커 개수만 보낸다 (저장할 때) */
function reportAdds() {
  if (!stat?.logged || !entry) return;
  const p = (entry.photos || []).length - stat.photos;
  const s = (entry.stickers || []).length - stat.stickers;
  if (p > 0) { analytics.design('entry:photo_add', p); analytics.once('funnel:first_photo'); }
  if (s > 0) { analytics.design('entry:sticker_add', s); analytics.once('funnel:first_sticker'); }
  stat.photos = (entry.photos || []).length;
  stat.stickers = (entry.stickers || []).length;
}

/** 바뀐 것을 표시한다. 저장은 하지 않는다 — 잠시 뒤 임시 원고에만 적는다 */
function queueSave() {
  dirty = true;
  setStatus(t('저장 전'), true);
  clearTimeout(draftTimer);
  draftTimer = setTimeout(saveDraftNow, 1500);
}

function setStatus(text, saving = false) {
  const n = refs.status;
  if (!n) return;
  n.textContent = text;
  n.classList.toggle('saving', saving);
}

export async function teardown() {
  clearTimeout(suggestTimer);
  /* 묻지 않고 화면이 바뀌는 경우(알림을 눌러 들어온 경우 등)에는 저장하지 않고
     임시 원고로 남긴다. 다음에 이 글을 열면 이어 쓸지 묻는다 */
  if (dirty) await saveDraftNow();
  stat = null;
  window.removeEventListener('beforeunload', onUnload);
  document.removeEventListener('visibilitychange', onHide);
  unguardCaret?.(); unguardCaret = null;
  stopVoice();
  entry = null; refs = {};
}
function onUnload() { if (dirty) saveDraftNow(); }
/* 앱이 뒤로 가면(사진 고르기·전화 등) 저장하지 않고 임시 원고만 적어 둔다 — 그 사이 앱이 꺼져도 남게 */
function onHide() {
  if (document.visibilityState !== 'hidden' || !dirty) return;
  saveDraftNow();
  /* 저장하지 않은 채 앱을 벗어났다(홈 버튼·최근 앱·전화). 이 화면에서 한 번만 센다 */
  if (stat && !stat.hidUnsaved) { stat.hidUnsaved = true; analytics.design('write:hidden_unsaved'); }
}

/** 사진 자리 정보 깊은 복사 (없으면 undefined) */
function copyLayout(l) {
  if (!l || typeof l !== 'object') return undefined;
  const o = {};
  for (const [k, v] of Object.entries(l)) o[k] = { ...v };
  return o;
}

/* ── 렌더 ───────────────────────────────────────── */
export async function render(root, params) {
  const existing = params.id ? store.byId(params.id) : null;
  if (params.id && !existing) { toast(t('글을 찾을 수 없어요.')); go('/home', { replace: true }); return {}; }

  entry = existing ? { ...existing, tags: [...(existing.tags || [])], chips: [...(existing.chips || [])], photos: [...(existing.photos || [])],
                       stickers: (existing.stickers || []).map((s) => ({ ...s })), photoLayout: copyLayout(existing.photoLayout) }
                   : store.newEntry(params.d || todayKey());
  isNew = !existing;
  capsule = !existing && params.capsule === '1';
  if (capsule) NB.used('capsule');
  draftKey = existing ? 'id:' + existing.id : (capsule ? 'capsule:' : 'new:') + (params.d || todayKey());
  fromEntry = params.from === 'entry';
  addedPhotos = new Set();
  removedPhotos = new Set();
  photoJobs = Promise.resolve();
  photoBusy = 0;
  clearTimeout(draftTimer);

  /* 저장하지 않은 임시 원고가 있으면 이어 쓸지 묻는다 */
  let restored = false;
  otherDraft = null;
  try {
    const dr = await store.loadDraft();
    if (dr?.entry && dr.key === draftKey) {
      /* 홈의 '이어 쓰기' 카드로 왔으면 다시 묻지 않는다 */
      const pick = params.resume === '1' ? 'keep' : await choose(t('저장하지 않은 글이 있어요'), t('지난번에 쓰다 만 내용이에요. 이어서 쓸까요?'), [
        { k: 'keep', label: t('이어서 쓰기'), icon: 'edit' },
        { k: 'drop', label: t('버리고 새로 열기'), icon: 'trash', danger: true },
      ]);
      analytics.design('write:draft:' + (pick === 'drop' ? 'drop' : 'keep'));
      if (pick === 'drop') {
        const keep = new Set(existing?.photos || []);
        for (const pid of dr.added || []) if (!keep.has(pid)) { try { await store.deletePhoto(pid); } catch { /* 무시 */ } }
        await store.clearDraft();
      } else {
        const d = dr.entry;
        entry = { ...d, tags: [...(d.tags || [])], chips: [...(d.chips || [])], photos: [...(d.photos || [])],
                  stickers: (d.stickers || []).map((x) => ({ ...x })), photoLayout: copyLayout(d.photoLayout) };
        addedPhotos = new Set(dr.added || []);
        removedPhotos = new Set(dr.removed || []);
        restored = true;
      }
    } else if (dr?.key) {
      otherDraft = dr;
    }
  } catch (e) { console.error('임시 원고 읽기', e); }
  if (!entry.photoLayout) delete entry.photoLayout;
  lastCaret = null;
  pendingCollage = null;
  draftCollage = null;
  stat = { wasNew: isNew, logged: false, photos: entry.photos.length, stickers: (entry.stickers || []).length };
  analytics.once('funnel:first_write_open');
  dirty = restored;
  promptSalt = 0;
  composing = false;
  extractor = null;
  applyModeArea();

  const wrap = el('div', { class: 'write-wrap' });
  root.append(wrap);

  /* 날짜 + 상태 */
  const bar = el('div', { class: 'write-datebar' });
  const dateBtn = el('button', { class: 'chip', type: 'button' }, esc(fmtDate(entry.date, { year: true })));
  dateBtn.addEventListener('click', changeDate);
  refs.status = el('div', { class: 'write-status' + (restored ? ' saving' : '') }, restored ? t('저장 전') : (isNew ? '' : t('저장됨')));
  bar.append(dateBtn, refs.status);
  wrap.append(bar);
  weatherUi(bar);     // 그날 날씨 (1.7.2)
  if (capsule) {
    const cn = el('div', { class: 'note capsule-note' });
    cn.innerHTML = `${icon('lock')}<span>${esc(t('1년 뒤의 나에게 쓰는 편지예요. [완료]를 누르면 열릴 날을 고를 수 있어요.'))}</span>`;
    wrap.append(cn);
  }

  /* 모드 */
  const modes = [
    { k: 'free', n: t('자유롭게'), i: 'edit' },
    { k: 'oneline', n: t('한 줄만'), i: 'list' },
    { k: 'guided', n: t('질문 따라'), i: 'quote' },
  ];
  const modeRow = el('div', { class: 'mode-row' });
  for (const m of modes) {
    const c = el('button', { class: 'chip' + (entry.mode === m.k ? ' on' : ''), type: 'button' },
      icon(m.i) + `<span>${esc(m.n)}</span>`);
    c.addEventListener('click', () => {
      if (entry.mode === m.k) return;
      entry.mode = m.k;
      // 자유 모드에서 쓰던 글이 있으면 첫 답변으로 옮겨준다 (글이 사라지면 안 된다)
      if (m.k === 'guided' && !entry.guided) {
        entry.guided = { set: GUIDED_SETS[0].name, answers: [entry.body || '', '', ''] };
      }
      haptic();
      queueSave();
      rerender();
    });
    modeRow.append(c);
  }
  wrap.append(modeRow);

  /* ── 종이 한 장 (1.4.0, 사용자 요청 2026-10-13) ──
     제목 · 고른 칩 · 사진 · 본문 · 태그가 글 보기 화면과 같은 순서로 놓이고, 그 위에
     스티커를 바로 붙인다. 사진은 첨부 칸이 아니라 종이에 크게 붙는다. 글 고치기와
     스티커 고치기를 따로 하지 않는다 — 이 화면 하나에서 다 한다. */
  refs.page = el('div', { class: 'write-page' });
  refs.content = el('div', { class: 'write-content' });
  refs.pageSong = el('div', { class: 'wp-song' });          // 오늘의 노래 (1.7.9) — 글 보기와 같은 자리(본문 아래·태그 위)
  refs.pageTags = el('div', { class: 'chip-row wp-tags' });
  refs.tagSug = el('div', { class: 'wp-tagsug' });
  /* 일기 쓴 곳·자동 날씨 안내는 본문 바로 아래 (2026-10-31 사용자 의견: 위쪽을 너무 많이 차지한다) */
  refs.placeBar = refs.placeBar || el('div', { class: 'wp-place' });
  refs.page.append(refs.content, refs.placeBar, refs.pageSong, refs.pageTags, refs.tagSug);
  wrap.append(refs.page);
  renderContent();
  renderPageSong();
  renderPageTags();
  /* 공유로 들어온 노래를 이 일기에 (「오늘 일기에 넣기」·「다른 날 고르기」 뒤, 1.7.9) */
  {
    const ps = SHARE.takePending();
    if (ps) setTimeout(() => { applyIncomingSong(ps); }, 450);
  }

  /* 기분 · 칩 고르기 (종이 아래) */
  refs.extras = el('div', { style: 'margin-top:26px' });
  wrap.append(refs.extras);
  renderExtras();

  /* 스티커: 종이 위에서 바로 옮기고 키운다. 서랍은 아래 툴바의 스티커 버튼으로 열고,
     글 칸이나 화면을 누르면 내려간다. 바뀐 것은 글과 같이 자동 저장된다. */
  refs.stk = stickers.mount(refs.page, entry, {
    anchors: stickers.writingAnchors(refs.page),
    interactive: true,
    drawerHost: root,
    onChange: () => queueSave(),
  });
  if (params.stk === '1') setTimeout(() => refs.stk?.openDrawer(), 250);

  /* 아래 툴바 */
  root.append(buildToolbar());

  window.addEventListener('beforeunload', onUnload);
  document.addEventListener('visibilitychange', onHide);
  unguardCaret?.();
  unguardCaret = caret.guard(root);

  /* 1.7.6 (사용자 요청 2026-10-25): 새 일기는 기분부터 고른다 — 기분 칸이 종이 아래에 있어 잊고 지나가는 사람이 많았다.
     고르거나 '기분 기록하지 않기'·닫기를 하면 글 칸으로 간다. 묻어두기(미래의 나에게)·질문 모드·이미 기분이 있는 글은 건너뛴다.
     설정 > 쓰기의 '기분부터 고르기'로 끌 수 있다 */
  const moodFirst = isNew && !capsule && !entry.mood && entry.mode !== 'guided' && store.getSettings().askMood !== false;
  if (moodFirst) {
    analytics.design('write:mood_first:open');
    setTimeout(() => {
      if (!refs.page?.isConnected || document.querySelector('#sheetRoot .sheet')) return;
      openMoodPad(() => { renderExtras(); queueSave(); }, {
        first: true,
        onClose: () => {
          analytics.design('write:mood_first:' + (entry?.mood ? 'picked' : 'skip'));
          /* 1.7.6 (사용자 요청): 기분 → '오늘은 이런 날' → 일기 쓰기 순서로 */
          setTimeout(() => {
            if (!refs.page?.isConnected) return;
            openChipsStep(() => {
              setTimeout(() => {
                if (!refs.page?.isConnected) return;
                (refs.body || refs.title)?.focus();
                const s2 = store.getSettings();
                if (wx.available() && !s2.weatherAsked && !entry?.weather && !document.querySelector('#sheetRoot .sheet')) askWeather();
              }, 260);
            });
          }, 260);
        },
      });
    }, 180);
  } else {
    setTimeout(() => {
      const t = refs.body || refs.title;
      if (isNew) t?.focus();
    }, 90);
  }

  return {
    title: capsule ? t('미래의 나에게') : isNew ? t('새 글') : t('고쳐 쓰기'),
    left: { icon: 'back', label: t('뒤로'), onClick: () => back() },   // 바뀐 게 있으면 back() 이 beforeLeave 로 묻는다
    right: [
      { icon: 'dots', label: t('더보기'), onClick: openMenu },
      { text: t('완료'), label: t('완료'), onClick: done },
    ],
  };
}

/** 쓰기 모드마다 강조 색조가 다르다 (자유=주황 · 한 줄만=녹 · 질문 따라=보라) */
function applyModeArea() {
  document.documentElement.dataset.area =
    entry?.mode === 'oneline' ? 'write-oneline'
    : entry?.mode === 'guided' ? 'write-guided'
    : 'write';
}

function rerender() {
  applyModeArea();
  // 모드 전환 시 본문 영역만 다시 그린다
  const modeRow = $('.mode-row');
  if (modeRow) [...modeRow.children].forEach((c, i) =>
    c.classList.toggle('on', ['free', 'oneline', 'guided'][i] === entry.mode));
  renderContent();
  renderExtras();
}

/* 스티커 서랍 열고 닫기. 스티커는 이 종이 위에 바로 붙는다 */
function openStickers() {
  if (!refs.stk) return;
  if (refs.stk.isOpen()) refs.stk.closeDrawer(); else refs.stk.openDrawer();
}

/* 저장 실패는 조용히 지나가면 안 된다 — 사용자는 눌렀는데 아무 일도 없다고 느끼고 떠난다.
   저장 공간이 모자란 저가 기기 등에서 IndexedDB 쓰기가 실패할 수 있다 */
function saveFailed(e) {
  console.error('저장 실패', e);
  const name = String(e?.name || 'Error').replace(/[^A-Za-z0-9_]/g, '').slice(0, 40) || 'Error';
  analytics.design('entry:save_fail:' + name);
  toast(t('저장하지 못했어요. 다시 눌러 주세요.'));
}

async function done() {
  if (!entry) return;
  analytics.design('write:done_tap');
  if (photoBusy) { toast(t('사진을 넣는 중이에요. 잠시만요.')); await photoJobs; }
  if (capsule) {
    /* 미래의 나에게: [완료]는 저장이 아니라 묻어두기다 (열릴 날 고르기 → 저장 → 홈) */
    if (isEmpty(entry)) { toast(t('묻어둘 내용을 먼저 적어주세요.')); return; }
    bury();
    return;
  }
  if (isNew && isEmpty(entry)) { analytics.design('write:done_empty'); await discard(); toast(t('빈 글은 저장하지 않았어요.')); back(); return; }
  try { await commit(); } catch (e) { saveFailed(e); return; }
  haptic(14);
  toast(t('저장했어요.'));
  /* 글 보기에서 고쳐 쓰러 왔으면 그 화면으로 돌아간다(기록이 쌓이지 않게).
     새로 쓴 글이면 이 쓰기 화면 자리를 글 보기로 바꾼다 */
  if (fromEntry) back();
  else go(`/entry/${entry.id}`, { replace: true });
}

/* ── 본문 영역 ──────────────────────────────────── */
function renderContent() {
  const c = refs.content;
  c.innerHTML = '';
  refs.flow = null;

  /* 종이 맨 위 = 글 보기 화면의 머리 자리. 자유 모드는 제목 칸, 나머지는 빈 줄 */
  if (entry.mode !== 'free') c.append(el('div', { class: 'wp-head' }));

  if (entry.mode === 'free') {
    refs.title = el('input', {
      class: 'title-in', type: 'text', placeholder: t('제목 (없어도 돼요)'), value: entry.title || '',
      'aria-label': t('제목'),
    });
    refs.title.addEventListener('input', () => { entry.title = refs.title.value; queueSave(); });
    bindComposition(refs.title, () => queueSave());
    refs.title.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); refs.body.focus(); } });
    c.append(refs.title);
  }

  /* 고른 칩 · 사진 — 글 보기 화면과 같은 자리. 사진은 종이에 크게 붙는다 */
  refs.pageChips = el('div', { class: 'chip-row wp-chips' });
  refs.pagePhotos = el('div', { class: 'wp-photos' });
  c.append(refs.pageChips, refs.pagePhotos);
  renderPageChips();
  renderPagePhotos();

  if (entry.mode === 'guided') return renderGuided(c);

  // 프롬프트 카드 (본문이 비어 있을 때만 — 다 쓰고 나면 방해가 된다)
  refs.prompt = null;
  if (entry.mode === 'free' && !(entry.body || '').trim()) {
    const p = el('div', { class: 'prompt-card' });
    refs.prompt = p;
    const q = el('div', { class: 'prompt-q' }, esc(currentPrompt()));
    const r = el('button', { class: 'prompt-refresh', type: 'button', 'aria-label': t('다른 질문') }, icon('refresh'));
    r.addEventListener('click', () => { promptSalt++; q.textContent = currentPrompt(); haptic(); });
    p.append(q, r);
    c.append(p);
  }

  /* 글 사이 사진이 있으면 글 칸 여러 개와 사진으로 (1.7.5). 없으면 예전 그대로 글 칸 하나 */
  if (PL.hasInline(entry) || draftInline()) { renderFlow(c); return; }

  refs.body = el('textarea', {
    class: 'body-in' + (entry.mode === 'oneline' ? ' oneline' : ''),
    placeholder: entry.mode === 'oneline' ? t('오늘을 한 줄로.') : t('오늘은 어땠나요?'),
    'aria-label': t('본문'), rows: '3',
  });
  refs.body.value = entry.body || '';
  const onBody = () => {
    if (!entry || !refs.body) return;      // 화면이 바뀐 뒤 늦게 온 blur (조합 중 저장)
    entry.body = refs.body.value;
    queueSave();                 // 조합 중에도 저장은 예약한다 — 마지막 글자를 잃지 않게
    autogrow(refs.body);         // 다음 프레임에 한 번만 (조합을 방해하지 않는다)
    updateCount();
    if (composing) return;       // 태그 추천은 글자가 완성된 뒤에만
    queueSuggest();
  };
  refs.body.addEventListener('input', onBody);
  bindComposition(refs.body, onBody);
  refs.body.addEventListener('blur', dropPromptIfWritten);
  if (entry.mode === 'free') trackCaret(refs.body);
  c.append(refs.body);
  requestAnimationFrame(() => autogrow(refs.body, true));
}

function renderGuided(c) {
  if (!entry.guided) entry.guided = { set: GUIDED_SETS[0].name, answers: ['', '', ''] };
  const set = GUIDED_SETS.find((g) => g.name === entry.guided.set) || GUIDED_SETS[0];

  const picker = el('div', { class: 'mode-row', style: 'margin-bottom:18px' });
  for (const g of GUIDED_SETS) {
    const b = el('button', { class: 'chip' + (g.name === set.name ? ' on' : ''), type: 'button' }, esc(t(g.name)));
    b.addEventListener('click', () => {
      // 질문 묶음만 바꾸고 답변은 그대로 둔다 (쓰던 글을 지우지 않는다)
      entry.guided = { set: g.name, answers: entry.guided.answers.slice(0, 3) };
      syncGuidedBody(); queueSave(); renderContent();
    });
    picker.append(b);
  }
  c.append(picker);

  set.qs.forEach((q, i) => {
    const box = el('div', { class: 'guided-q' });
    box.append(el('div', { class: 'guided-q-label' }, esc(`${i + 1}. ${t(q)}`)));
    const ta = el('textarea', { class: 'body-in', rows: '2', style: 'min-height:0', placeholder: '…', 'aria-label': t(q) });
    ta.value = entry.guided.answers[i] || '';
    const onAns = () => {
      entry.guided.answers[i] = ta.value;
      syncGuidedBody(); queueSave();
      autogrow(ta); updateCount();
      if (composing) return;
      queueSuggest();
    };
    ta.addEventListener('input', onAns);
    bindComposition(ta, onAns);
    box.append(ta);
    c.append(box);
    requestAnimationFrame(() => autogrow(ta, true));
    if (i === 0) refs.body = ta;
  });
}

/** 가이드 답변을 본문으로 합쳐 둔다 — 검색·통계가 똑같이 동작하도록 */
function syncGuidedBody() {
  const set = GUIDED_SETS.find((g) => g.name === entry.guided.set) || GUIDED_SETS[0];
  entry.body = set.qs
    .map((q, i) => (entry.guided.answers[i]?.trim() ? `${t(q)}\n${entry.guided.answers[i].trim()}` : ''))
    .filter(Boolean).join('\n\n');
  if (!entry.title) entry.title = '';
}

/* 조합 중에는 배치를 건드리는 일만 미룬다.
   entry 갱신과 저장 예약은 그대로 해서 글자를 잃지 않는다. */
function bindComposition(node, onDone) {
  node.addEventListener('compositionstart', () => { composing = true; });
  node.addEventListener('compositionend', () => { composing = false; onDone(); });
  node.addEventListener('blur', () => { if (composing) { composing = false; onDone(); } });
}

function currentPrompt() {
  if (capsule) return t('1년 뒤의 나에게 하고 싶은 말이 있나요?');
  const list = pickPrompts({
    dateKey: entry.date,
    salt: promptSalt,
    recentMoodAvg: recentMoodAvg(store.live()),
    nth: store.live().length + 1,
  });
  return list[promptSalt % list.length];
}

/* ── 감정 / 칩 / 사진 / 태그 ────────────────────── */
function renderExtras() {
  const x = refs.extras;
  x.innerHTML = '';

  /* 감정 */
  const moodCard = el('button', { class: 'card', type: 'button', style: 'width:100%;text-align:left' });
  const paint = () => {
    moodCard.innerHTML =
      `<div class="mood-mini">
         <div class="mood-mini-swatch" style="background:${entry.mood ? moodColor(entry.mood) : 'var(--card-2)'}"></div>
         <div class="mood-mini-txt">
           <div class="mood-mini-word">${entry.mood ? esc(t('{기분} 하루', { 기분: moodWord(entry.mood) })) : t('오늘의 기분은?')}</div>
           <div class="mood-mini-sub">${entry.mood ? t('탭해서 다시 고르기') : t('안 골라도 괜찮아요 · 탭해서 고르기')}</div>
         </div>
         <span class="mood-mini-arrow">${icon('chev')}</span>
       </div>`;
  };
  paint();
  moodCard.addEventListener('click', () => openMoodPad(() => { paint(); queueSave(); }));
  x.append(moodCard);

  /* 본문에서 기분이 짐작되면 살짝 제안 (타이핑이 멈추면 갱신) */
  refs.moodSug = el('div');
  x.append(refs.moodSug);

  /* 체크 칩 */
  const chipCard = el('div', { class: 'card', style: 'margin-top:12px' });
  const chipHead = el('div', { class: 'section-title chips-head', style: 'margin-bottom:10px' }, `<span>${esc(t('오늘은 이런 날'))}</span>`);
  const chipEdit = el('button', { class: 'chips-edit', type: 'button' }, icon('edit') + `<span>${esc(t('편집'))}</span>`);
  chipEdit.addEventListener('click', () => openChipEditor(() => renderExtras()));
  chipHead.append(chipEdit);
  chipCard.append(chipHead);
  const S0 = store.getSettings();
  for (const g of chipGroups(S0)) {
    const row = el('div', { class: 'chip-row', style: 'margin-bottom:8px' });
    for (const ch of g.chips) {
      const on = entry.chips.includes(ch);
      const ci = chipIcon(ch, S0);
      const b = el('button', { class: 'chip' + (on ? ' on' : ''), type: 'button' },
        (ci ? icon(ci) : '') + `<span>${esc(t(ch))}</span>`);   // 저장은 한국어 원형, 표시만 번역
      b.addEventListener('click', () => {
        const i = entry.chips.indexOf(ch);
        if (i >= 0) entry.chips.splice(i, 1); else entry.chips.push(ch);
        b.classList.toggle('on');
        renderPageChips();          // 종이 위 칩 줄도 같이
        haptic(); queueSave();
      });
      row.append(b);
    }
    chipCard.append(row);
  }
  chipCard.append(el('div', { class: 'note', style: 'margin-top:2px' },
    t('한 번 탭해두면 나중에 “운동한 날의 기분” 같은 걸 찾아드려요.')));
  x.append(chipCard);

  /* 사진과 태그는 이제 종이 위에 있다 (renderPagePhotos · renderPageTags) */

  refreshSuggest();
}

/* 질문 카드는 빈 글을 열 때만 뜨는데, 다 쓰고 나서도 남아 있으면 사진과 본문 사이에 끼어
   종이가 어색해진다. 글자를 치는 동안에는 배치를 건드리지 않고(한글 조합이 깨진다), 글 칸을
   떠날 때나 사진을 넣을 때 조용히 걷는다. */
function dropPromptIfWritten() {
  if (!refs.prompt || composing || !(entry.body || '').trim()) return;
  refs.prompt.remove();
  refs.prompt = null;
}

/* ── 종이 위의 칩 · 사진 · 태그 ── */
/** 고른 칩을 종이 위에 보여준다 (글 보기 화면과 같은 자리). 고르는 건 아래 카드에서 */
function renderPageChips() {
  const row = refs.pageChips;
  if (!row) return;
  row.innerHTML = '';
  row.hidden = !entry.chips.length;
  for (const ch of entry.chips) row.append(el('span', { class: 'chip on' }, esc(t(ch))));
}

/** 사진은 종이에 붙는다. ✕ 로 떼면 그 사진에 붙인 스티커도 같이 떼어진다.
    1.7.5: 여기(본문 위 묶음)에는 자리를 정하지 않은 사진만 놓는다. 글 사이 사진은 본문 흐름(renderFlow)에. */
function renderPagePhotos() {
  const box = refs.pagePhotos;
  if (!box) return;
  box.innerHTML = '';
  const top = splitView().top;
  box.hidden = !top.length;
  photoChunks(box, top);
}

/** 사진 한 장 (✕ 빼기 · ⋯ 크기와 자리). 몇 번째 사진인지는 누를 때 다시 센다 — 순서가 바뀔 수 있다 */
function photoEl(pid) {
  const ph = el('div', { class: 'wp-photo ph-' + PL.sizeOf(entry, pid), 'data-pid': pid, style: PL.boxStyle(entry, pid) });
  const img = el('img', { alt: t('첨부 사진'), draggable: 'false' });
  const del = el('button', { class: 'photo-del', type: 'button', 'aria-label': t('사진 삭제') }, '✕');
  del.addEventListener('click', () => removePhoto(pid));
  const opt = el('button', { class: 'photo-opt', type: 'button', 'aria-label': t('사진 크기와 자리') }, icon('dots'));
  opt.addEventListener('click', () => openPhotoMenu(pid));
  ph.append(img, opt, del);
  PL.applyRot(img, PL.rotOf(entry, pid), 1);     // 회전 (1.7.9)
  store.fillImage(img, pid);
  wirePhotoGestures(ph, img, pid);
  return ph;
}

/** 사진 상자에 지금 크기·좌우 자리를 다시 입힌다 (다시 그리지 않고) */
function applyBox(pid) {
  const node = refs.page?.querySelector(`.wp-photo[data-pid="${CSS.escape(pid)}"]:not(.wp-cell)`);
  if (!node) return;
  node.classList.remove('ph-s', 'ph-m', 'ph-l');
  node.classList.add('ph-' + PL.sizeOf(entry, pid));
  node.style.cssText = PL.boxStyle(entry, pid);
  node.querySelector('.ph-rs')?.classList.toggle('left', PL.alignOf(entry, pid) === 'r');
  const img = node.querySelector('img');
  if (img) PL.applyRot(img, PL.rotOf(entry, pid), 1);
}

/* ── 사진을 손으로 다루기 (1.7.9, 사용자 의견: "스티커처럼 크기를 조절하고 싶다") ──
   · 두 손가락으로 벌리고 오므리면 크기 (30~100%).
   · 길게 눌러 끌면 자리: 위아래는 줄 사이(자유 모드), 옆으로는 왼쪽·가운데·오른쪽(꽉 찬 사진은 없음).
   · 한 손가락으로 그냥 밀면 예전처럼 화면이 넘어간다. 그래서 터치 이벤트로 받고, 두 손가락이거나
     길게 누른 뒤에만 화면 넘김을 막는다. 두 번째 손가락은 사진 밖에 닿을 수 있어 문서 전체에서 듣는다.
   · 크기는 photoLayout.w(자유 값)와 size(가장 가까운 s/m/l — 옛 버전 앱용)로 함께 저장된다. */
const HOLD_MS = 420;
function scrollerOf(node) {
  for (let n = node?.parentElement; n && n !== document.body; n = n.parentElement) {
    const oy = getComputedStyle(n).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1) return n;
  }
  return document.scrollingElement || document.documentElement;
}

function wirePhotoGestures(ph, img, pid) {
  let pinch = null, hold = null, drag = null, live = false, raf = 0;
  const dist = (a, b) => Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  const restick = () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; refs.stk?.refresh?.(); }); };
  ph.addEventListener('contextmenu', (ev) => ev.preventDefault());

  const clearHold = () => { if (hold) { clearTimeout(hold.timer); hold = null; } };
  const onScroll = () => clearHold();
  const attach = () => {
    if (live) return;
    live = true;
    document.addEventListener('touchstart', onDocStart, { passive: false, capture: true });
    document.addEventListener('touchmove', onMove, { passive: false, capture: true });
    document.addEventListener('touchend', onEnd, { capture: true });
    document.addEventListener('touchcancel', onEnd, { capture: true });
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
  };
  const detach = () => {
    live = false;
    document.removeEventListener('touchstart', onDocStart, { capture: true });
    document.removeEventListener('touchmove', onMove, { capture: true });
    document.removeEventListener('touchend', onEnd, { capture: true });
    document.removeEventListener('touchcancel', onEnd, { capture: true });
    window.removeEventListener('scroll', onScroll, { capture: true });
  };

  const startPinch = (a, b) => {
    clearHold();
    if (pinch) return;
    if (drag) { if (drag.ptr) finishDrag(true); else return; }      // 고른 사진을 끌다가 두 번째 손가락 → 크기 조절로
    const badge = el('div', { class: 'ph-size' });
    ph.append(badge);
    pinch = { d0: Math.max(24, dist(a, b)), a0: Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX),
      w0: PL.widthOf(entry, pid), r0: PL.rotOf(entry, pid), w: null, r: null, badge };
    badge.textContent = sizeLabel(pinch.w0, pinch.r0);
    ph.classList.add('pinching');
  };
  const endPinch = () => {
    const p = pinch;
    pinch = null;
    p.badge.remove();
    ph.classList.remove('pinching');
    if ((p.w === null && p.r === null) || !entry) return;
    const L = layoutOf(pid);
    if (p.w !== null) PL.setWidth(L, p.w);
    if (p.r !== null) { if (p.r) L.r = p.r; else delete L.r; }
    PL.normalize(entry);
    analytics.design('write:photo_pinch:' + PL.sizeOf(entry, pid) + (p.r ? ':rot' : ''));
    queueSave();
    applyBox(pid);
    refs.stk?.refresh?.();
  };

  ph.addEventListener('touchstart', (ev) => {
    if (ev.target.closest('.photo-del, .photo-opt') || drag || !entry) return;
    attach();
    if (ev.touches.length >= 2) { startPinch(ev.touches[0], ev.touches[1]); return; }
    if (ph.classList.contains('sel')) return;                         // 고른 사진은 바로 끌기 (아래 포인터)
    const t0 = ev.changedTouches[0];
    clearHold();
    hold = { id: t0.identifier, x: t0.clientX, y: t0.clientY };
    hold.timer = setTimeout(() => { const h = hold; hold = null; if (h && !pinch) startDrag(h); }, HOLD_MS);
  }, { passive: true });

  /* 두 번째 손가락 (사진 밖에 닿아도 된다) */
  function onDocStart(ev) {
    if (ph.contains(ev.target) && ev.touches.length < 2) return;      // 사진 자체의 처음 손가락은 위에서
    if (ev.touches.length >= 2 && !pinch && !drag) startPinch(ev.touches[0], ev.touches[1]);
  }
  function onMove(ev) {
    if (pinch && ev.touches.length >= 2) {
      if (ev.cancelable) ev.preventDefault();
      const a = ev.touches[0], b = ev.touches[1];
      const w = PL.clampW(pinch.w0 * dist(a, b) / pinch.d0);
      /* 두 손가락을 비틀면 회전 (0·±90·180 근처는 딱 맞춘다) */
      const r = PL.snapRot(pinch.r0 + ((Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) - pinch.a0) * 180) / Math.PI);
      if (w !== pinch.w || r !== (pinch.r ?? pinch.r0)) {
        pinch.w = w;
        if (r !== pinch.r0 || pinch.r !== null) pinch.r = r;
        ph.style.width = (w * 100).toFixed(1) + '%';
        PL.applyRot(img, pinch.r ?? pinch.r0, 1);
        pinch.badge.textContent = sizeLabel(w, pinch.r ?? pinch.r0);
        restick();
      }
      return;
    }
    if (drag) {
      const tt = [...ev.touches].find((x) => x.identifier === drag.id);
      if (!tt) return;
      if (ev.cancelable) ev.preventDefault();
      moveDrag(tt.clientX, tt.clientY);
      return;
    }
    if (hold) {
      const tt = [...ev.touches].find((x) => x.identifier === hold.id);
      if (!tt || Math.hypot(tt.clientX - hold.x, tt.clientY - hold.y) > 8) clearHold();
    }
  }
  function onEnd(ev) {
    if (pinch && ev.touches.length < 2) endPinch();
    if (drag && !drag.ptr && ![...ev.touches].some((x) => x.identifier === drag.id)) finishDrag(ev.type === 'touchcancel');
    if (hold && ![...ev.touches].some((x) => x.identifier === hold.id)) clearHold();
    if (!ev.touches.length) detach();
  }

  /* ── 스티커처럼: 눌러서 고르고, 고른 사진은 바로 끌어 옮긴다 (2026-10-27 사용자 요청) ── */
  let pdrag = null, lastDrag = 0;
  ph.addEventListener('click', (ev) => {
    if (ev.target.closest('.photo-del, .photo-opt, .ph-rs')) return;
    if (Date.now() - lastDrag < 400) return;
    selectPhoto(pid);
  });
  ph.addEventListener('pointerdown', (ev) => {
    if (!ph.classList.contains('sel') || ev.target.closest('.photo-del, .photo-opt, .ph-rs') || drag || pinch || !entry) return;
    if (ev.pointerType === 'mouse' && ev.button !== 0) return;
    try { ph.setPointerCapture(ev.pointerId); } catch { /* 이미 끝난 누름 */ }
    pdrag = { pid: ev.pointerId, x: ev.clientX, y: ev.clientY, started: false };
  });
  ph.addEventListener('pointermove', (ev) => {
    if (!pdrag || ev.pointerId !== pdrag.pid || pinch) return;
    if (!pdrag.started) {
      if (Math.hypot(ev.clientX - pdrag.x, ev.clientY - pdrag.y) < 6) return;
      pdrag.started = true;
      startDrag({ id: 'ptr', x: pdrag.x, y: pdrag.y }, true);
    }
    if (drag?.ptr) moveDrag(ev.clientX, ev.clientY);
  });
  const pEnd = (ev) => {
    if (!pdrag || ev.pointerId !== pdrag.pid) return;
    const st = pdrag.started;
    pdrag = null;
    if (st && drag?.ptr) { lastDrag = Date.now(); finishDrag(ev.type === 'pointercancel'); }
  };
  ph.addEventListener('pointerup', pEnd);
  ph.addEventListener('pointercancel', pEnd);

  /* ── 길게 눌러 끌기 (고르지 않은 사진) · 고른 사진 끌기 ── */
  function startDrag(h, ptr = false) {
    if (!entry || !ph.isConnected) return;
    if (!ptr) haptic(14);
    const r = ph.getBoundingClientRect();
    const box = ph.parentElement.getBoundingClientRect();
    const sc = scrollerOf(ph);
    const gw = Math.min(r.width, window.innerWidth * 0.4);
    const gh = r.height * (gw / Math.max(1, r.width));
    const ghost = el('div', { class: 'ph-ghost', style: `width:${gw}px;height:${gh}px` });
    const gi = img.cloneNode();
    gi.removeAttribute('style');            // 회전·여백은 떠 있는 사진에는 빼고
    ghost.append(gi);
    const line = el('div', { class: 'ph-drop', style: `width:${r.width}px` });
    document.body.append(ghost, line);
    ph.classList.add('dragging');
    drag = {
      id: h.id, ptr, ghost, line, gw, gh, w: r.width, full: PL.widthOf(entry, pid) >= 1,
      left: box.left, cw: box.width, sc,
      slots: PL.inlineOn(entry) ? measureSlots(sc) : [],
      cur: PL.atOf(entry, pid), al: PL.alignOf(entry, pid), slot: null, x: h.x, y: h.y, run: true,
    };
    moveDrag(h.x, h.y);
    /* 화면 위·아래 끝에 가까이 가면 저절로 넘긴다 */
    const tick = () => {
      if (!drag || !drag.run) return;
      const vh = window.visualViewport?.height || window.innerHeight;
      const dy = drag.y < 80 ? -Math.ceil((80 - drag.y) / 6) : drag.y > vh - 90 ? Math.ceil((drag.y - (vh - 90)) / 6) : 0;
      if (dy) { drag.sc.scrollTop += dy; moveDrag(drag.x, drag.y); }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }
  function moveDrag(x, y) {
    const d = drag;
    d.x = x; d.y = y;
    /* 떠 있는 사진은 손가락 위쪽에, 화면 밖으로 나가지 않게 (손가락에 가려 놓을 자리 줄이 안 보이지 않도록) */
    const gx = Math.min(window.innerWidth - d.gw - 8, Math.max(8, x - d.gw / 2));
    const gy = Math.max(8, y - d.gh - 28);
    d.ghost.style.transform = `translate(${Math.round(gx)}px,${Math.round(gy)}px)`;
    if (!d.full) {
      const f = (x - d.left) / Math.max(1, d.cw);
      d.al = f < 1 / 3 ? 'l' : f > 2 / 3 ? 'r' : 'c';
    }
    const st = d.sc.scrollTop;
    let best = null;
    for (const s of d.slots) if (!best || Math.abs(s.y - st - y) < Math.abs(best.y - st - y)) best = s;
    d.slot = best;
    const lx = d.full ? d.left : d.al === 'l' ? d.left : d.al === 'r' ? d.left + d.cw - d.w : d.left + (d.cw - d.w) / 2;
    const ly = best ? best.y - st : ph.getBoundingClientRect().top - 6;
    d.line.style.transform = `translate(${Math.round(lx)}px,${Math.round(ly - 2)}px)`;
  }
  function finishDrag(cancel) {
    const d = drag;
    drag = null;
    d.run = false;
    d.ghost.remove();
    d.line.remove();
    ph.classList.remove('dragging');
    if (cancel || !entry) return;
    const L = layoutOf(pid);
    let changed = false, moved = false;
    if (!d.full && d.al !== PL.alignOf(entry, pid)) { if (d.al === 'c') delete L.al; else L.al = d.al; changed = true; }
    if (d.slot && d.slot.at !== d.cur) { placePhoto(pid, d.slot.at); changed = moved = true; }
    PL.normalize(entry);
    if (!changed) return;
    analytics.design(moved ? 'write:photo_drag:move' : 'write:photo_drag:align');
    queueSave();
    if (moved) {
      const wasSel = d.ptr || ph.classList.contains('sel');
      renderContent();
      refs.stk?.rebuild();
      refs.page?.querySelector(`.wp-photo[data-pid="${CSS.escape(pid)}"]`)?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      if (wasSel) selectPhoto(pid);           // 옮긴 뒤에도 고른 상태 그대로 — 이어서 크기를 맞출 수 있게
    } else {
      applyBox(pid);
      refs.stk?.refresh?.();
    }
  }
}

/* ── 사진 고르기 (스티커와 같은 모양: 점선 테두리 + 모서리 손잡이) ──
   누르면 고른다 → 모서리 손잡이를 끌면 크기, 사진을 끌면 자리. 다른 곳을 누르면 풀린다.
   손잡이는 고정된 쪽의 반대편에 둔다: 왼쪽·가운데 정렬은 오른쪽 아래, 오른쪽 정렬은 왼쪽 아래. */
let selPid = null;
let selOff = null;
const RS_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/></svg>';
function selectPhoto(pid) {
  refs.page?.querySelectorAll('.wp-photo.sel').forEach((n) => { n.classList.remove('sel'); n.querySelector('.ph-rs')?.remove(); });
  selOff?.();
  selOff = null;
  selPid = null;
  if (!pid || !entry) return;
  const ph = refs.page?.querySelector(`.wp-photo[data-pid="${CSS.escape(pid)}"]:not(.wp-cell)`);
  if (!ph) return;
  selPid = pid;
  ph.classList.add('sel');
  const h = el('button', { class: 'ph-rs', type: 'button', 'aria-label': t('크기') }, RS_SVG);
  ph.append(h);
  placeHandle(ph, pid);
  wireResize(h, ph, pid);
  analytics.design('write:photo_select');
  /* 다른 곳을 누르면 풀린다 (시트·스티커 서랍 안은 그대로) */
  const off = (ev) => {
    if (!ph.isConnected) { cleanup(); return; }
    if (ph.contains(ev.target) || ev.target.closest?.('#sheetRoot, .stk-drawer')) return;
    selectPhoto(null);
  };
  const cleanup = () => document.removeEventListener('pointerdown', off, true);
  document.addEventListener('pointerdown', off, true);
  selOff = cleanup;
}
function placeHandle(ph, pid) {
  ph.querySelector('.ph-rs')?.classList.toggle('left', PL.alignOf(entry, pid) === 'r');
}

/** 모서리 손잡이: 끌어서 너비를 정한다 (고정된 쪽에서 손가락까지, 가운데 정렬은 가운데에서 두 배) */
/** 크기·기울기 표시: "62%" 또는 "62% · 15°" */
function sizeLabel(w, r) {
  return Math.round(w * 100) + '%' + (r ? ' · ' + Math.round(r) + '°' : '');
}

/** 모서리 손잡이: 스티커와 같이 가운데를 축으로 끌면 크기와 방향이 같이 바뀜다 (한 손으로 되게).
    가운데에서 멀어지면 커지고, 빙 돌리면 기울어진다. 0·±90·180° 근처는 딱 맞춘다. */
function wireResize(h, ph, pid) {
  h.addEventListener('click', (ev) => ev.stopPropagation());
  h.addEventListener('pointerdown', (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (!entry) return;
    const img = ph.querySelector('img');
    const rc = ph.getBoundingClientRect();
    const c = { x: rc.left + rc.width / 2, y: rc.top + rc.height / 2 };
    const d0 = Math.max(20, Math.hypot(ev.clientX - c.x, ev.clientY - c.y));
    const a0 = Math.atan2(ev.clientY - c.y, ev.clientX - c.x);
    const w0 = PL.widthOf(entry, pid), r0 = PL.rotOf(entry, pid);
    try { h.setPointerCapture(ev.pointerId); } catch { /* 이미 끝난 누름 */ }
    const badge = el('div', { class: 'ph-size' });
    badge.textContent = sizeLabel(w0, r0);
    ph.append(badge);
    ph.classList.add('pinching');
    let w = null, r = r0, raf = 0;
    const move = (e2) => {
      const dx = e2.clientX - c.x, dy = e2.clientY - c.y;
      w = PL.clampW(w0 * Math.hypot(dx, dy) / d0);
      r = PL.snapRot(r0 + ((Math.atan2(dy, dx) - a0) * 180) / Math.PI);
      ph.style.width = (w * 100).toFixed(1) + '%';
      if (img) PL.applyRot(img, r, 1);
      badge.textContent = sizeLabel(w, r);
      if (!raf) raf = requestAnimationFrame(() => { raf = 0; refs.stk?.refresh?.(); });
    };
    const up = () => {
      h.removeEventListener('pointermove', move);
      h.removeEventListener('pointerup', up);
      h.removeEventListener('pointercancel', up);
      badge.remove();
      ph.classList.remove('pinching');
      if (w === null || !entry) return;
      const L = layoutOf(pid);
      PL.setWidth(L, w);
      if (r) L.r = r; else delete L.r;
      PL.normalize(entry);
      analytics.design('write:photo_handle:' + PL.sizeOf(entry, pid) + (r ? ':rot' : ''));
      queueSave();
      applyBox(pid);
      placeHandle(ph, pid);
      refs.stk?.refresh?.();
    };
    h.addEventListener('pointermove', move);
    h.addEventListener('pointerup', up);
    h.addEventListener('pointercancel', up);
  });
}

/** 글 칸 안 줄바꿈 자리들의 화면 높이 (글 칸과 같은 모양의 안 보이는 사본으로 잔다) */
function lineBottoms(ta, text, ks) {
  if (!ks.length) return [];
  const cs = getComputedStyle(ta);
  const m = document.createElement('div');
  for (const p of ['boxSizing', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft', 'borderTopWidth', 'borderRightWidth',
    'borderBottomWidth', 'borderLeftWidth', 'borderStyle', 'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing',
    'lineHeight', 'textTransform', 'wordSpacing', 'textIndent', 'tabSize', 'wordBreak', 'fontFeatureSettings']) m.style[p] = cs[p];
  Object.assign(m.style, { position: 'absolute', visibility: 'hidden', left: '-9999px', top: '0', height: 'auto',
    whiteSpace: 'pre-wrap', overflowWrap: 'break-word', width: ta.offsetWidth + 'px' });
  const marks = [];
  let last = 0;
  for (const k of ks) {
    m.append(document.createTextNode(text.slice(last, k)));
    const s = document.createElement('span');
    s.textContent = '\u200b';
    m.append(s);
    marks.push(s);
    last = k;
  }
  document.body.append(m);
  const bt = parseFloat(cs.borderTopWidth) || 0;
  const ys = marks.map((s) => s.offsetTop + s.offsetHeight + bt - ta.scrollTop);
  m.remove();
  return ys;
}

/** 사진을 놓을 수 있는 자리와 그 높이 [{ at, y }] — y 는 스크롤을 더한 값(끌는 동안 화면이 넘어가도 맞게) */
function measureSlots(sc) {
  const st = sc.scrollTop;
  const body = entry.body || '';
  const valid = new Set(photoSlots());
  const out = [];
  const seen = new Set();
  const push = (at, y) => { if (!valid.has(at) || seen.has(at)) return; seen.add(at); out.push({ at, y: y + st }); };
  const pp = refs.pagePhotos;
  const first = refs.flow || refs.body;
  if (pp && !pp.hidden) push(null, pp.getBoundingClientRect().bottom);
  else if (first) push(null, first.getBoundingClientRect().top - 4);
  const textSlots = (ta, text, start, isLast) => {
    const ks = [];
    for (let k = 0; k < text.length; k++) if (text[k] === '\n') ks.push(k);
    const top = ta.getBoundingClientRect().top;
    lineBottoms(ta, text, ks).forEach((y, j) => push(start + ks[j], top + y));
    if (isLast && body.length && !body.endsWith('\n')) push(body.length, ta.getBoundingClientRect().bottom);
  };
  if (refs.flow) {
    const { flow } = splitView();
    const kids = [...refs.flow.children];
    let cur = 0;
    flow.forEach((seg, i) => {
      const node = kids[i];
      if (!node) return;
      if (seg.photos) {
        push(seg.at, node.getBoundingClientRect().bottom);
        cur = seg.at + (body[seg.at] === '\n' ? 1 : 0);
        return;
      }
      if (node.tagName === 'TEXTAREA') textSlots(node, seg.text, cur, i === flow.length - 1);
      cur += seg.text.length;
    });
  } else if (refs.body?.tagName === 'TEXTAREA') {
    textSlots(refs.body, body, 0, true);
  }
  return out;
}

async function removePhoto(pid) {
  const k0 = entry.photos.indexOf(pid);
  if (k0 < 0) return;
  /* 사진이 크게 붙고 그 위에 스티커를 옮기다 보면 ✕ 를 잘못 누르기 쉽다. 한 번 묻는다 */
  const onIt = (entry.stickers || []).some((s) => s.a === 'photo' && (s.i | 0) === k0);
  const ok = await confirmSheet({
    title: t('사진을 뺄까요?'),
    text: onIt ? t('이 사진에 붙인 스티커도 같이 떼어져요.') : '',
    ok: t('빼기'), danger: true,
  });
  if (!ok || !entry) return;
  const k = entry.photos.indexOf(pid);
  if (k < 0) return;
  const wasInline = PL.atOf(entry, pid) !== null;
  /* 묶음의 마지막 사진을 빼면 빈 틀로 남긴다 — 다른 사진을 '+' 로 다시 넣을 수 있게 */
  const cid0 = PL.cidOf(entry, pid);
  if (cid0 && PL.membersOf(entry, cid0).length === 1) {
    draftCollage = { cid: cid0, t: entry.collages[cid0].t, at: PL.atOf(entry, pid) };
    delete entry.collages[cid0];
  }
  entry.photos = entry.photos.filter((p) => p !== pid);
  if (entry.photoLayout) delete entry.photoLayout[pid];
  // 그 사진에 붙인 스티커는 사진과 함께 떼고, 뒤 사진에 붙은 건 번호를 당긴다
  entry.stickers = (entry.stickers || [])
    .filter((s) => !(s.a === 'photo' && (s.i | 0) === k))
    .map((s) => (s.a === 'photo' && (s.i | 0) > k ? { ...s, i: (s.i | 0) - 1 } : s));
  if (addedPhotos.has(pid)) { addedPhotos.delete(pid); try { await store.deletePhoto(pid); } catch { /* 무시 */ } }
  else removedPhotos.add(pid);
  queueSave();
  if (wasInline || draftCollage) renderContent(); else renderPagePhotos();
  refs.stk?.rebuild();
}

/* ── 사진 크기와 자리 (1.7.5) ──────────────────────
   크기: 작게 · 중간 · 크게. 자리: 위로 · 아래로 — 한 번에 한 줄씩 옮긴다.
   맨 위 묶음 → 첫 줄 끝 → 둘째 줄 끝 … → 글 맨 끝. 같은 자리의 사진끼리는 순서를 바꾼다. */
function layoutOf(pid) {
  entry.photoLayout = entry.photoLayout || {};
  return (entry.photoLayout[pid] = entry.photoLayout[pid] || {});
}

/** 사진이 설 수 있는 자리: null(맨 위) · 본문의 줄바꿈 위치들 · (끝에 줄바꿈이 없으면) 글 맨 끝 */
function photoSlots() {
  const body = entry.body || '';
  const s = [null];
  for (let i = 0; i < body.length; i++) if (body[i] === '\n') s.push(i);
  if (body.length && !body.endsWith('\n')) s.push(body.length);
  return s;
}

/** 같은 자리(묶음)에 있는 사진들 — 화면 순서대로 */
function groupOf(pid) {
  const at = PL.atOf(entry, pid);
  return entry.photos.filter((p) => PL.atOf(entry, p) === at);
}

/** 두 사진의 순서를 맞바꾼다 (스티커 번호도 같이) */
function swapPhotos(a, b) {
  const i = entry.photos.indexOf(a), j = entry.photos.indexOf(b);
  if (i < 0 || j < 0) return;
  entry.photos[i] = b; entry.photos[j] = a;
  entry.stickers = (entry.stickers || []).map((s) => {
    if (s.a !== 'photo') return s;
    if ((s.i | 0) === i) return { ...s, i: j };
    if ((s.i | 0) === j) return { ...s, i: i };
    return s;
  });
}

/** 사진을 자리 at(null = 맨 위)으로. 글 맨 끝이면 줄바꿈을 하나 붙인다 */
function placePhoto(pid, at) {
  const body = entry.body || '';
  if (at !== null && at >= body.length) {
    entry.body = body + '\n';
    at = body.length;
  }
  const L = layoutOf(pid);
  if (at === null) delete L.at; else L.at = at;
  PL.normalize(entry);
}

function canMove(pid, dir) {
  if (!PL.inlineOn(entry)) {
    const k = entry.photos.indexOf(pid);
    return dir < 0 ? k > 0 : k < entry.photos.length - 1;
  }
  const g = groupOf(pid), gi = g.indexOf(pid);
  if (dir < 0 && gi > 0) return true;
  if (dir > 0 && gi < g.length - 1) return true;
  const slots = photoSlots();
  const si = slots.indexOf(PL.atOf(entry, pid));
  return dir < 0 ? si > 0 : si >= 0 && si < slots.length - 1;
}

function movePhoto(pid, dir) {
  if (!canMove(pid, dir)) return false;
  if (!PL.inlineOn(entry)) {
    /* 한 줄·질문 모드: 사진은 모두 맨 위 — 순서만 바꾼다 */
    const k = entry.photos.indexOf(pid);
    swapPhotos(pid, entry.photos[k + dir]);
  } else {
    const g = groupOf(pid), gi = g.indexOf(pid);
    if (g[gi + dir] !== undefined) swapPhotos(pid, g[gi + dir]);
    else {
      const slots = photoSlots();
      const si = slots.indexOf(PL.atOf(entry, pid));
      placePhoto(pid, slots[si + dir]);
      /* 새 자리의 묶음에서는 들어온 쪽 끝에 선다 (위로 왔으면 맨 뒤, 아래로 갔으면 맨 앞) — normalize 가 원래 순서대로 줄 세우므로 저절로 그렇게 된다 */
    }
  }
  PL.normalize(entry);
  return true;
}

function openPhotoMenu(pid) {
  if (!entry?.photos.includes(pid)) return;
  analytics.design('write:photo_menu');
  const box = el('div');
  const sizes = el('div', { class: 'pl-sizes' });
  const names = { s: t('작게'), m: t('중간'), l: t('크게') };
  /* 단계 버튼은 자유 크기(1.7.9)가 그 단계 값과 같을 때만 켜진다 */
  const exact = () => { const w = PL.widthOf(entry, pid); return PL.SIZES.find((s) => Math.abs(PL.SIZE_SCALE[s] - w) < 0.005) || ''; };
  const range = el('input', { class: 'pl-range', type: 'range', min: String(PL.MIN_W * 100), max: '100', step: '1', 'aria-label': t('크기') });
  const pct = el('span', { class: 'pl-pct' });
  const aligns = el('div', { class: 'pl-sizes pl-aligns' });
  const alNames = { l: t('왼쪽'), c: t('가운데'), r: t('오른쪽') };
  const paintSizes = () => {
    const ex = exact();
    sizes.querySelectorAll('.btn').forEach((b) => b.classList.toggle('on', b.dataset.s === ex));
    const w = PL.widthOf(entry, pid);
    range.value = String(Math.round(w * 100));
    pct.textContent = Math.round(w * 100) + '%';
    const al = PL.alignOf(entry, pid);
    aligns.querySelectorAll('.btn').forEach((b) => { b.classList.toggle('on', b.dataset.a === al); b.disabled = w >= 1; });
    rots?.querySelector('[data-r="zero"]')?.classList.toggle('on', PL.rotOf(entry, pid) === 0);
  };
  const changed = (tag) => {
    PL.normalize(entry);
    analytics.design(tag);
    queueSave();
    paintSizes();
    applyBox(pid);
    refs.stk?.refresh?.();
  };
  for (const s of PL.SIZES) {
    const b = el('button', { class: 'btn', type: 'button', 'data-s': s }, esc(names[s]));
    b.addEventListener('click', () => {
      const L = layoutOf(pid);
      delete L.w;
      PL.setWidth(L, PL.SIZE_SCALE[s]);
      changed('write:photo_size:' + s);
    });
    sizes.append(b);
  }
  range.addEventListener('input', () => {
    PL.setWidth(layoutOf(pid), Number(range.value) / 100);
    PL.normalize(entry);
    paintSizes();
    applyBox(pid);
    refs.stk?.refresh?.();
  });
  range.addEventListener('change', () => changed('write:photo_size:range'));
  for (const a of PL.ALIGNS) {
    const b = el('button', { class: 'btn', type: 'button', 'data-a': a }, esc(alNames[a]));
    b.addEventListener('click', () => {
      const L = layoutOf(pid);
      if (a === 'c') delete L.al; else L.al = a;
      changed('write:photo_align:' + a);
    });
    aligns.append(b);
  }
  /* 회전 (1.7.9): 90°씩 돌리기 · 똑바로. 자유 각도는 모서리 손잡이나 두 손가락으로 */
  const rots = el('div', { class: 'pl-sizes pl-rots' });
  const rotTo = (r, tag) => {
    const L = layoutOf(pid);
    const v = PL.normRot(r);
    if (v) L.r = v; else delete L.r;
    changed('write:photo_rot:' + tag);
  };
  for (const [tag, label, fn] of [
    ['l90', t('왼쪽으로 90°'), () => PL.rotOf(entry, pid) - 90],
    ['r90', t('오른쪽으로 90°'), () => PL.rotOf(entry, pid) + 90],
    ['zero', t('똑바로'), () => 0],
  ]) {
    const b = el('button', { class: 'btn', type: 'button', 'data-r': tag }, esc(label));
    b.addEventListener('click', () => rotTo(fn(), tag));
    rots.append(b);
  }
  paintSizes();
  const moves = el('div', { class: 'pl-moves' });
  const up = el('button', { class: 'btn', type: 'button' }, icon('up') + ' ' + esc(t('위로')));
  const down = el('button', { class: 'btn', type: 'button' }, icon('down') + ' ' + esc(t('아래로')));
  const paintMoves = () => { up.disabled = !canMove(pid, -1); down.disabled = !canMove(pid, 1); };
  const go1 = (dir) => {
    if (!movePhoto(pid, dir)) return;
    analytics.design('write:photo_move');
    queueSave();
    renderContent();
    refs.stk?.rebuild();
    paintMoves();
    refs.page?.querySelector(`.wp-photo[data-pid="${CSS.escape(pid)}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  };
  up.addEventListener('click', () => go1(-1));
  down.addEventListener('click', () => go1(1));
  paintMoves();
  moves.append(up, down);
  const rangeBox = el('div', { class: 'pl-rangebox' });
  rangeBox.append(range, pct);
  box.append(
    el('div', { class: 'plan-label pl-head' }, esc(t('크기'))), sizes,
    rangeBox,
    el('div', { class: 'plan-label', style: 'margin-bottom:8px' }, esc(t('정렬'))), aligns,
    el('div', { class: 'plan-label', style: 'margin-bottom:8px' }, esc(t('회전'))), rots,
    el('div', { class: 'plan-label', style: 'margin-bottom:8px' }, esc(t('자리'))), moves,
    el('div', { class: 'muted pl-tip' }, esc(t('사진을 누르면 테두리가 생겨요. 모서리 손잡이를 끌면 크기와 방향이, 사진을 끌면 자리가 바뀌어요.'))),
  );
  if (!PL.inlineOn(entry)) box.append(el('div', { class: 'muted', style: 'font-size:.82rem;margin-top:10px' }, esc(t('글 사이에 사진을 넣으려면 \'자유롭게\' 모드로 쓰세요.'))));
  const rm = el('button', { class: 'btn', type: 'button', style: 'width:100%;margin-top:16px;color:var(--bad)' }, esc(t('사진 빼기')));
  rm.addEventListener('click', () => { closeSheet(); removePhoto(pid); });
  box.append(rm);
  openSheet({ title: t('사진 크기와 자리'), text: PL.inlineOn(entry) ? t('글을 쓰다가 사진을 넣으면 커서가 있던 자리에 들어가요.') : '', content: box });
  /* 시트가 첫 버튼('작게')에 초점을 줘서 두 개가 골라진 것처럼 보였다 → 지금 크기에 초점 */
  setTimeout(() => (sizes.querySelector('.btn.on') || range).focus({ preventScroll: true }), 60);
}

/* ── 글 사이 사진이 있는 본문 (1.7.5) ──────────────
   글 칸(textarea) → 사진 묶음 → 글 칸 → … 으로 놓는다. 글 칸을 고칠 때마다 본문과 사진 자리를 다시 맞춘다
   (photolayout.join). 사진이 하나도 글 사이에 없으면 예전처럼 글 칸 하나만 쓴다 (renderContent). */
function renderFlow(c) {
  const { flow } = splitView();
  const wrap = el('div', { class: 'wp-flow' });
  refs.flow = wrap;
  let first = null;
  flow.forEach((seg, i) => {
    if (seg.photos) {
      const g = el('div', { class: 'wp-photos', 'data-group': '1' });
      photoChunks(g, seg.photos);
      wrap.append(g);
      return;
    }
    const ta = el('textarea', {
      class: 'body-in', rows: '1', 'aria-label': t('본문'),
      placeholder: i === 0 ? t('오늘은 어땠나요?') : '',
    });
    ta.value = seg.text;
    const onIn = () => {
      if (!entry || !refs.flow) return;
      syncFlow();
      autogrow(ta);
      if (composing) return;
      queueSuggest();
    };
    ta.addEventListener('input', onIn);
    bindComposition(ta, onIn);
    ta.addEventListener('blur', dropPromptIfWritten);
    ta.addEventListener('focus', () => { refs.body = ta; });
    /* 글 칸 맨 앞에서 지우기를 누르면 앞 글 칸 끝으로 (사진은 지우지 않는다 — 사진은 ✕ 로) */
    ta.addEventListener('keydown', (ev) => {
      if (ev.key !== 'Backspace' || ta.selectionStart !== 0 || ta.selectionEnd !== 0) return;
      const tas = [...wrap.querySelectorAll('textarea.body-in')];
      const prev = tas[tas.indexOf(ta) - 1];
      if (!prev) return;
      ev.preventDefault();
      prev.focus();
      prev.setSelectionRange(prev.value.length, prev.value.length);
    });
    trackCaret(ta);
    wrap.append(ta);
    if (!first) first = ta;
    requestAnimationFrame(() => autogrow(ta, true));
  });
  refs.body = first;
  c.append(wrap);
}

/** 글 칸들과 사진 묶음으로 본문과 사진 자리를 다시 만든다 */
function syncFlow() {
  if (!refs.flow) return;
  const texts = [], groups = [];
  for (const n of refs.flow.children) {
    if (n.tagName === 'TEXTAREA') texts.push(n.value);
    else if (n.dataset.group) groups.push([...n.querySelectorAll('.wp-photo, .wp-collage[data-draft]')].map((p) => (p.dataset.draft ? DRAFT : p.dataset.pid)));
  }
  const { body, at } = PL.join(texts, groups);
  entry.body = body;
  for (const [pid, a] of Object.entries(at)) {
    if (pid === DRAFT) { if (draftCollage) draftCollage.at = a; continue; }   // 빈 묶음도 글을 따라 움직인다
    layoutOf(pid).at = a;
  }
  queueSave();
  updateCount();
}

/* 마지막으로 커서가 있던 자리 — 사진을 넣으면 거기에 넣는다 */
let lastCaret = null;
function trackCaret(ta) {
  const rec = () => { lastCaret = { ta, pos: ta.selectionStart ?? ta.value.length }; };
  ta.addEventListener('focus', rec);
  ta.addEventListener('click', rec);
  ta.addEventListener('keyup', rec);
  ta.addEventListener('input', rec);
}

/** 커서 자리 → 본문 전체에서의 글자 위치. 쓸 수 없으면 null */
function caretOffset() {
  if (!lastCaret || !lastCaret.ta?.isConnected || !PL.inlineOn(entry)) return null;
  if (!(entry.body || '').trim()) return null;
  const { ta, pos } = lastCaret;
  if (!refs.flow) return Math.min(pos, (entry.body || '').length);
  let off = 0;
  for (const n of refs.flow.children) {
    if (n === ta) return off + Math.min(pos, ta.value.length);
    if (n.tagName === 'TEXTAREA') off += n.value.length + 1;     // 글 칸 뒤 줄바꿈 하나
  }
  return null;
}

/** 사진 여러 장을 본문 글자 위치 g 에 넣는다. 줄 가운데면 줄을 나눈다 */
function insertPhotosAt(pids, g) {
  const at = slotFor(g);
  for (const pid of pids) layoutOf(pid).at = at;
  PL.normalize(entry);
}

/** 본문 글자 위치 g 를 사진이 설 수 있는 자리(줄바꿈 위치)로 바꾼다. 줄 가운데면 줄을 나눈다 */
function slotFor(g) {
  let body = entry.body || '';
  let at;
  const shift = (from, by) => {
    for (const p of entry.photos) {
      const L = entry.photoLayout?.[p];
      if (L && Number.isFinite(L.at) && L.at >= from) L.at += by;
    }
  };
  if (body[g] === '\n') at = g;                                   // 줄 끝
  else if (g >= body.length) {                                     // 글 맨 끝
    if (body.endsWith('\n')) at = body.length - 1;
    else { body += '\n'; at = g; }
  } else if (g > 0 && body[g - 1] === '\n') at = g - 1;           // 줄 맨 앞 → 앞 줄 끝
  else {                                                           // 줄 가운데(또는 글 맨 앞) → 줄을 나눈다
    shift(g, 1);
    body = body.slice(0, g) + '\n' + body.slice(g);
    at = g;
  }
  entry.body = body;
  return at;
}

/* ── 사진 묶음(콜라주) (1.7.5, 사용자 제안 2026-10-24) ─────────────────
   만들기: 사진 추가 → '사진 묶음' → 틀 고르기 → 커서 자리에 빈 틀이 놓이고 칸마다 '+'
           → '+' 를 누를 때마다 사진 한 장이 그 칸에 들어간다 (사용자 요청 2026-10-24: 몇 장 골라야 할지 몰랐다).
   칸 누르기 → 고르기(테두리) → 끌어서 보이는 부분 옮기기 · ✕ 로 그 사진만 빼기 (그 칸은 다시 '+').
   묶음 ⋮ → 틀 바꾸기 · 순서 바꾸기 · 위로/아래로 · 묶음 풀기 · 모두 빼기.
   사진이 한 장도 없는 빈 틀(draftCollage)은 이 화면에만 있고 저장되지 않는다. 첫 사진이 들어가면 진짜 묶음이 된다. */
let pendingCollage = null;          // { cid, k:칸, at:시각 } 그 칸 채우기 | { t, at:시각 } (옛 방식) 새 묶음
let draftCollage = null;            // { cid, t, at:글자 위치|null } 아직 사진이 없는 빈 틀
const DRAFT = '__draft_collage__';

/** 빈 틀까지 넣어 화면 순서를 나눈다 */
function splitView() {
  return PL.split(entry, draftCollage ? [{ pid: DRAFT, at: draftCollage.at }] : []);
}
const draftInline = () => !!draftCollage && PL.inlineOn(entry) && Number.isFinite(draftCollage.at);

function photoChunks(container, pids) {
  for (const ch of PL.chunks(entry, pids)) {
    if (ch.pid === DRAFT) { if (draftCollage) container.append(collageEl({ cid: draftCollage.cid, t: draftCollage.t, pids: [] }, true)); continue; }
    container.append(ch.cid ? collageEl(ch) : photoEl(ch.pid));
  }
}

function collageEl(ch, draft = false) {
  const T = PL.TEMPLATES[ch.t];
  /* 틀 비율은 폭에 대한 padding 으로 (aspect-ratio 는 .wp-flow(flex) 안에서 무시됐다) */
  const box = el('div', { class: 'wp-collage', 'data-cid': ch.cid, style: `padding-top:${(T.ratio * 100).toFixed(3)}%` });
  if (draft) box.dataset.draft = '1';
  const grid = el('div', { class: 'cl-grid', style: `grid-template-columns:repeat(${T.cols},1fr);grid-template-rows:repeat(${T.rows},1fr)` });
  box.append(grid);
  T.cells.forEach(([c, r, cs, rs], i) => {
    const pos = `grid-column:${c + 1}/span ${cs};grid-row:${r + 1}/span ${rs}`;
    const pid = ch.pids[i];
    if (!pid) {
      const b = el('button', { class: 'wp-cell-empty', type: 'button', style: pos, 'aria-label': t('사진 더하기') }, icon('plus'));
      b.addEventListener('click', () => addToCollage(ch.cid, i));
      grid.append(b);
      return;
    }
    const cell = el('div', { class: 'wp-photo wp-cell', 'data-pid': pid, style: pos });
    const img = el('img', { alt: t('첨부 사진'), draggable: 'false' });
    const f = PL.focusOf(entry, pid);
    img.style.objectPosition = `${(f.x * 100).toFixed(1)}% ${(f.y * 100).toFixed(1)}%`;
    const del = el('button', { class: 'photo-del', type: 'button', 'aria-label': t('사진 삭제') }, '✕');
    del.addEventListener('click', (ev) => { ev.stopPropagation(); removePhoto(pid); });
    cell.append(img, del);
    store.fillImage(img, pid);
    panFocus(cell, img, pid);
    grid.append(cell);
  });
  const opt = el('button', { class: 'photo-opt', type: 'button', 'aria-label': t('사진 묶음') }, icon('dots'));
  opt.addEventListener('click', () => (draft ? openDraftMenu() : openCollageMenu(ch.cid)));
  box.append(opt);
  return box;
}

/** 칸을 누르면 고른 상태(테두리). 고른 칸을 끌면 보이는 부분이 옮겨진다. 다른 곳을 누르면 풀린다 */
function panFocus(cell, img, pid) {
  let st = null;
  cell.addEventListener('click', (ev) => {
    if (ev.target.closest('.photo-del')) return;
    if (cell.dataset.moved) { delete cell.dataset.moved; return; }
    const on = !cell.classList.contains('editing');
    refs.page?.querySelectorAll('.wp-cell.editing').forEach((n) => n.classList.remove('editing'));
    if (on) { cell.classList.add('editing'); toast(t('사진을 끌어 보이는 부분을 옮길 수 있어요.')); }
  });
  cell.addEventListener('pointerdown', (ev) => {
    if (!cell.classList.contains('editing') || ev.target.closest('.photo-del')) return;
    const r = cell.getBoundingClientRect();
    const nw = img.naturalWidth || 1, nh = img.naturalHeight || 1;
    const s = Math.max(r.width / nw, r.height / nh);
    const f = PL.focusOf(entry, pid);
    st = { x: ev.clientX, y: ev.clientY, fx: f.x, fy: f.y, ox: nw * s - r.width, oy: nh * s - r.height, moved: false };
    try { cell.setPointerCapture?.(ev.pointerId); } catch { /* 이미 끝난 누름 — 붙잡지 않고 이어간다 */ }
    ev.preventDefault();
    ev.stopPropagation();
  });
  cell.addEventListener('pointermove', (ev) => {
    if (!st) return;
    const dx = ev.clientX - st.x, dy = ev.clientY - st.y;
    if (Math.abs(dx) + Math.abs(dy) > 4) st.moved = true;
    const fx = st.ox > 1 ? Math.min(1, Math.max(0, st.fx - dx / st.ox)) : st.fx;
    const fy = st.oy > 1 ? Math.min(1, Math.max(0, st.fy - dy / st.oy)) : st.fy;
    img.style.objectPosition = `${(fx * 100).toFixed(1)}% ${(fy * 100).toFixed(1)}%`;
    st.nfx = fx; st.nfy = fy;
    ev.stopPropagation();
  });
  const end = () => {
    if (!st) return;
    if (st.moved && st.nfx !== undefined) {
      const L = layoutOf(pid);
      L.fx = Math.round(st.nfx * 1000) / 1000;
      L.fy = Math.round(st.nfy * 1000) / 1000;
      cell.dataset.moved = '1';
      queueSave();
    }
    st = null;
  };
  cell.addEventListener('pointerup', end);
  cell.addEventListener('pointercancel', end);
}

/** 사진 줄 순서를 새 순서로 (스티커 번호도 사진을 따라간다) */
function reorderPhotos(order) {
  const old = entry.photos;
  const ni = new Map(order.map((p, k) => [p, k]));
  entry.stickers = (entry.stickers || []).map((s) => {
    if (s.a !== 'photo') return s;
    const p = old[s.i | 0];
    return p !== undefined && ni.has(p) ? { ...s, i: ni.get(p) } : s;
  });
  entry.photos = order;
}

function collageAt(cid) {
  const m = PL.membersOf(entry, cid);
  return m.length ? PL.atOf(entry, m[0]) : null;
}

function canMoveCollage(cid, dir) {
  if (!PL.inlineOn(entry)) return false;
  const slots = photoSlots();
  const si = slots.indexOf(collageAt(cid));
  return dir < 0 ? si > 0 : si >= 0 && si < slots.length - 1;
}

function moveCollage(cid, dir) {
  if (!canMoveCollage(cid, dir)) return false;
  const slots = photoSlots();
  let at = slots[slots.indexOf(collageAt(cid)) + dir];
  const body = entry.body || '';
  if (at !== null && at >= body.length) { entry.body = body + '\n'; at = body.length; }
  for (const p of PL.membersOf(entry, cid)) { const L = layoutOf(p); if (at === null) delete L.at; else L.at = at; }
  PL.normalize(entry);
  return true;
}

function templateThumb(tid) {
  const T = PL.TEMPLATES[tid];
  const cells = T.cells.map(([c, r, cs, rs]) => `<i style="grid-column:${c + 1}/span ${cs};grid-row:${r + 1}/span ${rs}"></i>`).join('');
  return `<span class="cl-thumb" style="grid-template-columns:repeat(${T.cols},1fr);grid-template-rows:repeat(${T.rows},1fr);aspect-ratio:${(1 / T.ratio).toFixed(3)}">${cells}</span>`;
}

const templateName = (tid) => ({
  two: t('2장 나란히'), big2: t('큰 1장 + 작은 2장'), grid4: t('4칸'), tri: t('3장 세로'), top3: t('위 1장 + 아래 3장'), six: t('6칸'),
})[tid];

/** 틀 고르기 창. onPick(틀 이름) */
function chooseTemplate(title, current, onPick) {
  const box = el('div', { class: 'cl-pick' });
  for (const tid of PL.TEMPLATE_IDS) {
    const b = el('button', { class: 'cl-opt' + (tid === current ? ' on' : ''), type: 'button', 'data-t': tid },
      `${templateThumb(tid)}<span>${esc(templateName(tid))}</span>`);
    b.addEventListener('click', () => { closeSheet(); setTimeout(() => onPick(tid), 60); });
    box.append(b);
  }
  openSheet({ title, text: t('여러 장을 한 틀에 모아요'), content: box });
  setTimeout(() => (box.querySelector('.cl-opt.on') || box.querySelector('.cl-opt'))?.focus({ preventScroll: true }), 60);
}

/** 새 사진 묶음: 틀 고르기 → 커서 자리(없으면 맨 위)에 빈 틀. 칸의 '+' 로 한 장씩 */
function newCollage() {
  NB.used('collage');
  analytics.design('write:collage_new');
  chooseTemplate(t('사진 묶음'), null, (tid) => {
    if (!entry) return;
    const g = caretOffset();
    const len0 = (entry.body || '').length;
    const at = g !== null ? slotFor(g) : null;
    /* nl: 빈 틀 자리를 만들려고 줄바꿈을 하나 넣었다 → 사진 없이 빼면 되돌린다 */
    draftCollage = { cid: PL.newCollageId(), t: tid, at, nl: at !== null && (entry.body || '').length > len0 };
    renderContent();
    refs.stk?.rebuild();
    refs.page?.querySelector('.wp-collage[data-draft]')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    toast(t('칸의 +를 눌러 사진을 한 장씩 넣어요.'));
  });
}

/** 칸 하나 채우기: 사진 한 장만 고른다 */
function addToCollage(cid, k) {
  pendingCollage = { cid, k, at: Date.now() };
  pickFromAlbum({ single: true });
}

/** 사진 없는 빈 틀을 치운다. 틀 자리를 만들려고 넣었던 줄바꿈도 되돌린다 */
function dropDraft() {
  const d = draftCollage;
  draftCollage = null;
  if (!d || !Number.isFinite(d.at) || !entry) return;
  const body = entry.body || '';
  if (!d.nl && d.at !== body.length - 1) return;     // 끝에 남은 줄바꿈은 언제나 치운다
  if (body[d.at] !== '\n' || entry.photos.some((p) => PL.atOf(entry, p) === d.at)) return;
  entry.body = body.slice(0, d.at) + body.slice(d.at + 1);
  for (const p of entry.photos) {
    const L = entry.photoLayout?.[p];
    if (L && Number.isFinite(L.at) && L.at > d.at) L.at -= 1;
  }
  queueSave();
}

/** 빈 틀의 ⋮ : 틀 바꾸기 · 빼기 */
function openDraftMenu() {
  if (!draftCollage) return;
  const box = el('div');
  const btn = (label, ic, fn, extra = '') => {
    const b = el('button', { class: 'btn', type: 'button', style: 'width:100%;margin-top:8px;' + extra }, icon(ic) + ' ' + esc(label));
    b.addEventListener('click', fn);
    return b;
  };
  box.append(btn(t('틀 바꾸기'), 'image', () => {
    closeSheet();
    setTimeout(() => chooseTemplate(t('틀 바꾸기'), draftCollage?.t, (tid) => {
      if (!draftCollage) return;
      draftCollage.t = tid;
      renderContent();
      refs.stk?.rebuild();
    }), 60);
  }));
  box.append(btn(t('빼기'), 'trash', () => {
    closeSheet();
    dropDraft();
    renderContent();
    refs.stk?.rebuild();
  }, 'color:var(--bad)'));
  openSheet({ title: t('사진 묶음'), text: t('칸의 +를 눌러 사진을 한 장씩 넣어요.'), content: box });
}

function openCollageMenu(cid) {
  if (!entry?.collages?.[cid]) return;
  analytics.design('write:collage_menu');
  const box = el('div');
  const btn = (label, ic, fn, extra = '') => {
    const b = el('button', { class: 'btn', type: 'button', style: 'width:100%;margin-top:8px;' + extra }, (ic ? icon(ic) + ' ' : '') + esc(label));
    b.addEventListener('click', fn);
    return b;
  };
  const redraw = () => { queueSave(); renderContent(); refs.stk?.rebuild(); };
  box.append(btn(t('틀 바꾸기'), 'image', () => {
    closeSheet();
    setTimeout(() => chooseTemplate(t('틀 바꾸기'), entry.collages[cid]?.t, (tid) => {
      entry.collages[cid].t = tid;
      PL.normalize(entry);              // 칸보다 많은 사진은 낱장으로 나온다
      analytics.design('write:collage_template:' + tid);
      redraw();
    }), 60);
  }));
  box.append(btn(t('사진 순서 바꾸기'), 'refresh', () => {
    const mem = PL.membersOf(entry, cid);
    if (mem.length < 2) return;
    /* 사진이 든 칸끼리 한 칸씩 돌린다 (빈 칸은 그대로 비어 있다) */
    const ks = mem.map((p) => PL.slotOf(entry, p));
    mem.forEach((p, j) => { layoutOf(p).k = ks[(j + 1) % ks.length]; });
    PL.normalize(entry);
    redraw();
  }));
  const moves = el('div', { class: 'pl-moves', style: 'margin-top:8px' });
  const up = el('button', { class: 'btn', type: 'button' }, icon('up') + ' ' + esc(t('위로')));
  const down = el('button', { class: 'btn', type: 'button' }, icon('down') + ' ' + esc(t('아래로')));
  const paint = () => { up.disabled = !canMoveCollage(cid, -1); down.disabled = !canMoveCollage(cid, 1); };
  up.addEventListener('click', () => { if (moveCollage(cid, -1)) { redraw(); paint(); } });
  down.addEventListener('click', () => { if (moveCollage(cid, 1)) { redraw(); paint(); } });
  paint();
  moves.append(up, down);
  box.append(moves);
  box.append(btn(t('묶음 풀기'), 'list', () => {
    for (const p of PL.membersOf(entry, cid)) delete layoutOf(p).c;
    delete entry.collages[cid];
    PL.normalize(entry);
    closeSheet();
    redraw();
  }));
  box.append(btn(t('사진 모두 빼기'), 'trash', async () => {
    closeSheet();
    const ok = await confirmSheet({ title: t('사진 묶음을 뺄까요?'), text: t('이 묶음의 사진이 모두 빠져요.'), ok: t('빼기'), danger: true });
    if (!ok || !entry) return;
    for (const p of PL.membersOf(entry, cid)) {
      const k = entry.photos.indexOf(p);
      entry.photos = entry.photos.filter((x) => x !== p);
      delete entry.photoLayout?.[p];
      entry.stickers = (entry.stickers || [])
        .filter((s) => !(s.a === 'photo' && (s.i | 0) === k))
        .map((s) => (s.a === 'photo' && (s.i | 0) > k ? { ...s, i: (s.i | 0) - 1 } : s));
      if (addedPhotos.has(p)) { addedPhotos.delete(p); try { await store.deletePhoto(p); } catch { /* 무시 */ } }
      else removedPhotos.add(p);
    }
    delete entry.collages?.[cid];
    PL.normalize(entry);
    redraw();
  }, 'color:var(--bad)'));
  openSheet({ title: t('사진 묶음'), text: t('칸을 누른 뒤 끌면 보이는 부분을 옮길 수 있어요.'), content: box });
}

/** addPhotos 끝에서: 방금 넣은 사진을 묶음으로 (새 묶음 / 빈 칸 채우기). 처리했으면 true */
function applyPendingCollage(newPids) {
  const pc = pendingCollage;
  pendingCollage = null;
  if (!pc || Date.now() - pc.at > 5 * 60 * 1000 || !newPids.length) return false;
  entry.photoLayout = entry.photoLayout || {};
  if (pc.cid) {
    let at;
    if (entry.collages?.[pc.cid]) at = collageAt(pc.cid);
    else if (draftCollage?.cid === pc.cid) {
      /* 빈 틀에 첫 사진 → 진짜 묶음이 된다 */
      entry.collages = { ...(entry.collages || {}), [pc.cid]: { t: draftCollage.t } };
      at = PL.inlineOn(entry) && Number.isFinite(draftCollage.at) ? draftCollage.at : null;
      analytics.design('write:collage_made:' + draftCollage.t);
      draftCollage = null;
    } else return false;
    newPids.forEach((p, j) => {
      const L = layoutOf(p);
      L.c = pc.cid;
      if (j === 0 && Number.isInteger(pc.k)) L.k = pc.k; else delete L.k;    // 나머지는 빈 칸에 차례로 (fixCollages)
      if (at === null) delete L.at; else L.at = at;
    });
  } else {
    const cid = PL.newCollageId();
    entry.collages = { ...(entry.collages || {}), [cid]: { t: pc.t } };
    for (const p of newPids.slice(0, PL.TEMPLATES[pc.t].n)) layoutOf(p).c = cid;
    analytics.design('write:collage_made:' + pc.t, newPids.length);
  }
  PL.normalize(entry);
  return true;
}

/** 태그 줄 (종이 맨 아래, 글 보기 화면과 같은 자리). 탭하면 빠지고 + 로 더한다 */
/* ── 오늘의 노래 (1.7.9, 사용자 결정 2026-10-28: 하루콩식 검색 + Day One식 링크) ── */
function renderPageSong() {
  const box = refs.pageSong;
  if (!box) return;
  box.innerHTML = '';
  box.hidden = !entry.song && !BGM.trackOf(entry.bgm);
  /* 배경음악 (1.7.9): 일기를 열면 창 없이 흐르는 곡 */
  if (BGM.trackOf(entry.bgm)) {
    const row = el('div', { class: 'bgm-row' });
    const pl = el('button', { class: 'bgm-play', type: 'button', 'aria-label': t('들어 보기') }, icon('play'));
    const paint = () => { const s = BGM.state(); const on = s.playing && s.id === entry?.bgm; pl.classList.toggle('on', on); pl.innerHTML = on ? '<span class="bgm-pause"></span>' : icon('play'); };
    pl.addEventListener('click', (ev) => { ev.stopPropagation(); BGM.toggle(entry.bgm); });
    const tx = el('button', { class: 'bgm-tx', type: 'button' }, `<span class="k">${esc(t('배경음악'))}</span><span class="n">${esc(BGM.nameOf(entry.bgm))}</span>`);
    tx.addEventListener('click', openSongSheet);
    const x = el('button', { class: 'sc-del', type: 'button', 'aria-label': t('배경음악 빼기') }, '✕');
    x.addEventListener('click', (ev) => { ev.stopPropagation(); BGM.stop(); setBgm(null); });
    row.append(pl, tx, x);
    box.append(row);
    const un = BGM.subscribe(() => { if (!row.isConnected) { un(); return; } paint(); });
    paint();
  }
  if (entry.song) {
    box.append(songCard(entry.song, {
      onEdit: openSongSheet,
      onRemove: () => { setSong(null); },
    }));
  }
  refs.stk?.refresh?.();
}

/** 다른 앱에서 공유한 노래를 지금 쓰는 일기에 (이미 다른 노래가 있으면 바꿀지 묻는다) */
async function applyIncomingSong(song) {
  if (!entry || !song) return false;
  const cur = entry.song;
  if (cur && (cur.url || cur.t) !== (song.url || song.t)) {
    const ok = await confirmSheet({
      title: t('이 일기에는 이미 노래가 있어요'),
      text: t('「{a}」를 「{b}」로 바꿀까요?', { a: M.label(cur) || cur.url || '', b: M.label(song) || song.url || '' }),
      ok: t('바꾸기'),
    });
    if (!ok || !entry) return true;
  }
  setSong(song);
  NB.used('song');
  toast(t('이 일기에 노래를 넣었어요.'));
  requestAnimationFrame(() => refs.pageSong?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
  return true;
}

/** sharein.js 가 부른다: 쓰기 화면이 열려 있으면 그 일기에 넣고 true */
export async function acceptSharedSong(song) {
  if (!entry || !refs.page?.isConnected || !/^#\/write/.test(location.hash)) return false;
  closeSheet();
  return applyIncomingSong(song);
}

function setBgm(id) {
  if (!entry) return;
  if (BGM.trackOf(id)) entry.bgm = id; else delete entry.bgm;
  queueSave();
  renderPageSong();
}

function setSong(s) {
  if (!entry) return;
  if (s) entry.song = s; else delete entry.song;
  queueSave();
  renderPageSong();
  refs.stk?.refresh?.();
}

function openSongSheet() {
  if (!entry) return;
  analytics.design('song:sheet');
  const box = el('div', { class: 'song-sheet' });
  let ctl = null, timer = 0, lastQ = '';

  /* 배경음악 (1.7.9): 하루칸이 직접 그린 고르기 칸 (2026-10-29 사용자: "구글 선택 박스 말고 자체적으로").
     칸을 누르면 아래로 목록이 펼쳐지고, 고르면 바로 미리 들려주며 접힌다. ▶ 로 다시 듣기·멈추기 */
  const bgmBox = el('div', { class: 'ss-bgm' });
  bgmBox.append(el('div', { class: 'plan-label' }, esc(t('배경음악'))),
    el('div', { class: 'muted ss-hint' }, esc(t('일기를 열면 이 음악이 잔잔하게 흘러요. 다른 앱으로 가지 않아요.'))));
  let bgmCur = BGM.trackOf(entry.bgm) ? entry.bgm : '';
  const field = el('button', { class: 'ss-in bgm-field', type: 'button', 'aria-haspopup': 'listbox', 'aria-expanded': 'false', 'aria-label': t('배경음악') });
  const menu = el('div', { class: 'bgm-menu', role: 'listbox', hidden: true });
  const opts = [{ id: '', name: t('없음') }, ...BGM.TRACKS.map((x) => ({ id: x.id, name: t(x.name) }))];
  for (const o of opts) {
    const it = el('button', { class: 'bgm-opt', type: 'button', role: 'option', 'data-id': o.id },
      `<span class="bgm-opt-ico">${o.id ? icon('music') : ''}</span><span class="bgm-opt-n">${esc(o.name)}</span><span class="bgm-opt-ck"></span>`);
    it.addEventListener('click', () => {
      bgmCur = o.id;
      if (!o.id) { BGM.stop(); setBgm(null); analytics.design('bgm:remove'); }
      else { setBgm(o.id); BGM.play(o.id); NB.used('song'); analytics.design('bgm:pick:' + o.id); }
      openMenu(false);
      paintGrid();
    });
    menu.append(it);
  }
  const openMenu = (on) => {
    menu.hidden = !on;
    field.classList.toggle('open', on);
    field.setAttribute('aria-expanded', on ? 'true' : 'false');
    if (on) menu.querySelector('.bgm-opt.on')?.scrollIntoView({ block: 'nearest' });
  };
  field.addEventListener('click', () => openMenu(menu.hidden));
  const pv = el('button', { class: 'bgm-play', type: 'button', 'aria-label': t('들어 보기') }, icon('play'));
  const paintGrid = () => {
    const st = BGM.state();
    const on = !!bgmCur && st.playing && st.id === bgmCur;
    field.innerHTML = `<span class="bgm-field-n${bgmCur ? '' : ' none'}">${esc(bgmCur ? BGM.nameOf(bgmCur) : t('없음'))}</span><span class="bgm-chev"></span>`;
    for (const it of menu.children) {
      const sel1 = it.dataset.id === bgmCur;
      it.classList.toggle('on', sel1);
      it.setAttribute('aria-selected', sel1 ? 'true' : 'false');
      it.classList.toggle('playing', !!it.dataset.id && st.playing && st.id === it.dataset.id);
    }
    pv.innerHTML = on ? '<span class="bgm-pause"></span>' : icon('play');
    pv.disabled = !bgmCur;
  };
  pv.addEventListener('click', () => { if (bgmCur) BGM.toggle(bgmCur); });
  const unBgm = BGM.subscribe(paintGrid);
  paintGrid();
  const bgmRow = el('div', { class: 'ss-row bgm-pick' });
  bgmRow.append(field, pv);
  bgmBox.append(bgmRow, menu);
  /* 배경음악은 창 아래쪽에 (2026-10-29 사용자: "기본 음악은 하단으로") — 노래 넣기가 먼저 보이게 */
  box.append(el('div', { class: 'plan-label ss-songhead top' }, esc(t('오늘의 노래'))));

  /* 검색 */
  const form = el('form', { class: 'ss-search' });
  const q = el('input', { type: 'search', class: 'ss-in', placeholder: t('노래 제목이나 가수를 검색하세요'), 'aria-label': t('검색'), enterkeyhint: 'search' });
  const go1 = el('button', { class: 'btn btn-primary', type: 'submit' }, esc(t('검색')));
  form.append(q, go1);
  const status = el('div', { class: 'ss-status muted' });
  const list = el('div', { class: 'ss-list' });
  const credit = el('div', { class: 'ss-credit muted', hidden: true }, esc(t('노래 정보: Apple Music')));

  /* 검색은 '노래를 찾는 단계' (2026-10-28 사용자): 고르면 저장하지 않고 YouTube Music 을 그 노래로 연다.
     거기서 [공유] → [하루칸] 을 누르면 이 일기에 유튜브 링크로 들어와 일기 안에서 바로 들을 수 있다.
     (공유 기능이 없는 옛 앱은 링크 복사 후 돌아오면 「복사한 노래 넣기」) */
  /* YouTube Music 으로 보냈다가 돌아오면 링크 칸에 커서를 둔다 — 키보드의 '복사한 내용' 제안을 누르면 바로 들어간다.
     (안드로이드 앱 안 웹 화면은 클립보드를 직접 읽지 못한다: readText 거부 확인 2026-10-29) */
  let wentYT = false;
  /* 2026-10-29 사용자 결정: 하루콩처럼 검색으로 고른 노래는 바로 넣고, 하루칸 안에서 30초 미리듣기(광고 없음).
     전곡은 카드의 'YouTube Music에서 전곡'이나 아래 링크 칸(유튜브 뮤직 [노래] → 링크 복사)으로 */
  const pick = async (r) => {
    analytics.design('song:search:pick');
    const s = await M.fromResult(r);
    if (!s || !entry) return;
    setSong(s);
    NB.used('song');
    closeSheet();
    toast(s.pv ? t('노래를 넣었어요. [미리듣기]로 30초 들을 수 있어요.') : t('노래를 넣었어요.'));
  };
  const run = async () => {
    const term = q.value.trim();
    if (!term || term === lastQ) return;
    lastQ = term;
    ctl?.abort();
    ctl = new AbortController();
    status.textContent = t('검색 중…');
    list.innerHTML = '';
    credit.hidden = true;
    try {
      const res = await M.search(term, { signal: ctl.signal });
      if (term !== q.value.trim()) return;
      status.textContent = res.length ? '' : t('찾은 노래가 없어요. 다른 말로 검색하거나 직접 적어 보세요.');
      credit.hidden = !res.length;
      for (const r of res) {
        const b = el('button', { class: 'ss-item', type: 'button' });
        const art = el('div', { class: 'ss-art' });
        if (r.artUrl) art.append(el('img', { src: r.artUrl, alt: '', decoding: 'async' }));
        const tx = el('div', { class: 'ss-tx' });
        tx.append(el('div', { class: 'ss-t' }, esc(r.t)), el('div', { class: 'ss-a' }, esc([r.a, r.al].filter(Boolean).join(' · '))));
        b.append(art, tx);
        b.addEventListener('click', () => pick(r));
        /* 미리듣기가 있는 곡은 표시 */
        if (r.pv) b.append(el('span', { class: 'ss-pv', 'aria-hidden': 'true' }, esc(t('30초'))));
        list.append(b);
      }
      analytics.design('song:search:' + (res.length ? 'ok' : 'empty'));
    } catch (e) {
      if (e?.name === 'AbortError') return;
      lastQ = '';
      status.textContent = t('검색하지 못했어요. 인터넷 연결을 확인해 주세요.');
      analytics.design('song:search:error');
    }
  };
  form.addEventListener('submit', (ev) => { ev.preventDefault(); clearTimeout(timer); q.blur(); run(); });
  /* 글자를 치다 멈추면 저절로 찾는다 (검색 횟수 제한이 있어 잠깐 기다렸다가) */
  q.addEventListener('input', () => {
    clearTimeout(timer);
    if (q.value.trim().length >= 2) timer = setTimeout(run, 800);
  });

  /* 링크로 넣기 */
  const linkBox = el('div', { class: 'ss-link' });
  const li = el('input', { type: 'url', class: 'ss-in', placeholder: 'https://', 'aria-label': t('링크로 넣기'), inputmode: 'url' });
  const lb = el('button', { class: 'btn', type: 'button' }, esc(t('넣기')));
  const lrow = el('div', { class: 'ss-row' });
  /* 붙여넣기 버튼: 복사해 둔 링크를 한 번에 (폰이 막으면 길게 눌러 붙여넣기 안내) */
  const pb = el('button', { class: 'btn', type: 'button' }, esc(t('붙여넣기')));
  pb.addEventListener('click', async () => {
    const txt = await readClip({ native: true });
    if (txt && M.parseLink(txt)) { li.value = txt; analytics.design('song:paste:ok'); lb.click(); return; }
    if (txt) { li.value = txt; analytics.design('song:paste:text'); toast(t('알아볼 수 없는 링크예요.')); return; }
    /* 앱 안 웹 화면은 클립보드를 읽지 못한다 → 칸을 강조하고 커서를 둔다 (키보드의 '복사한 내용' 제안이나 길게 눌러 붙여넣기) */
    else { li.placeholder = t('길게 눌러 붙여넣기'); lrow.classList.add('attn'); li.focus(); analytics.design('song:paste:blocked'); }
  });
  lrow.append(li, pb, lb);
  const ytAll = el('button', { class: 'btn ss-ytall', type: 'button' }, esc(t('YouTube에서 찾기')));
  ytAll.addEventListener('click', () => (wentYT = true) && ytFind(q.value.trim() || M.label(entry?.song || {}).replace(' · ', ' ')));
  linkBox.append(el('div', { class: 'plan-label' }, esc(t('링크로 넣기'))),
    el('div', { class: 'muted ss-hint' }, esc(t('YouTube Music 재생 화면 위쪽에서 [노래]를 고르고 [공유] → [링크 복사]를 누른 뒤 돌아와서 여기에 붙여 넣으세요. [동영상]이면 뮤직비디오가 나와요.'))), lrow, ytAll);
  lb.addEventListener('click', async () => {
    const p = M.parseLink(li.value);
    if (!p) { toast(t('알아볼 수 없는 링크예요.')); return; }
    lb.disabled = true;
    status.textContent = t('노래 정보를 가져오는 중…');
    const s = await M.fromLink(p);
    lb.disabled = false;
    if (!s || !entry) { toast(t('알아볼 수 없는 링크예요.')); return; }
    setSong(s);
    NB.used('song');
    analytics.design('song:add:' + p.kind);
    closeSheet();
  });
  /* 붙여 넣는 순간 알아볼 수 있는 링크면 바로 넣는다 ([넣기]를 따로 누르지 않아도) */
  li.addEventListener('input', () => {
    if (lb.disabled) return;
    if (M.parseLink(li.value)) { analytics.design('song:paste:auto'); lb.click(); }
  });

  /* '직접 적기'는 뚜다 (2026-10-28 사용자: "직접 넣으면 음악이 나오는 게 아니잖아") —
     노래는 들을 수 있어야 한다. 검색·링크·공유로만 넣는다. 예전에 직접 적은 노래는 그대로 보이고 [듣기]는 앱 고르기 */
  const searchHint = el('div', { class: 'muted ss-hint ss-searchhint' },
    esc(t('노래를 고르면 이 일기에 들어가고, 하루칸 안에서 30초 미리 들을 수 있어요. 전곡을 넣고 싶으면 아래 링크 칸을 써 주세요.')));
  box.append(form, searchHint, status, list, credit, linkBox);

  /* 복사해 둔 노래 링크 · 공유해 둔 노래(보관함) — 창 맨 위에 (1.7.9) */
  const topBox = el('div', { class: 'ss-top' });
  box.prepend(topBox);
  let clipShown = '';
  const checkClip = async (native = false) => {
    const txt = await readClip({ native });
    const p = txt && M.parseLink(txt);
    if (!p || p.url === clipShown || p.url === entry?.song?.url) return;
    clipShown = p.url;
    topBox.querySelector('.ss-clip')?.remove();
    const chip = el('button', { class: 'ss-clip', type: 'button' }, `${icon('music')}<span>${esc(t('복사한 노래 넣기'))}</span><small>${esc(p.url)}</small>`);
    chip.addEventListener('click', async () => {
      chip.disabled = true;
      const s = await M.fromLink(p);
      if (!s || !entry) { chip.disabled = false; toast(t('알아볼 수 없는 링크예요.')); return; }
      setSong(s); NB.used('song'); analytics.design('song:add:clip:' + p.kind); closeSheet();
    });
    topBox.prepend(chip);
  };
  checkClip();
  const onVis = () => {
    if (document.hidden || !topBox.isConnected) return;
    checkClip(wentYT);
    if (wentYT && !li.value) {
      wentYT = false;
      setTimeout(() => {
        if (!li.isConnected) return;
        /* 토스트는 링크 칸을 가린다 → 칸 자체를 강조하고 칸 안에 안내 */
        li.placeholder = t('길게 눌러 붙여넣기');
        lrow.classList.add('attn');
        li.scrollIntoView({ block: 'center' });
        li.focus();
        /* 키보드가 올라오면 칸이 가려진다 → 화면이 줄어든 뒤 다시 보이게 */
        const lift = () => li.isConnected && li.scrollIntoView({ block: 'center', behavior: 'smooth' });
        window.visualViewport?.addEventListener('resize', lift, { once: true });
        setTimeout(lift, 500); setTimeout(lift, 900);
      }, 350);
    }
  };
  document.addEventListener('visibilitychange', onVis);
  SHARE.inboxList().then((items) => {
    if (!items.length || !topBox.isConnected) return;
    const sec = el('div', { class: 'ss-inbox' });
    sec.append(el('div', { class: 'plan-label' }, esc(t('공유해 둔 노래'))));
    for (const it of items.slice(0, 10)) {
      const row = el('div', { class: 'ss-itemrow' });
      const b = el('button', { class: 'ss-item', type: 'button' });
      const art = el('div', { class: 'ss-art' });
      if (it.s.art) art.append(el('img', { src: it.s.art, alt: '' }));
      const tx = el('div', { class: 'ss-tx' });
      tx.append(el('div', { class: 'ss-t' }, esc(it.s.t || it.s.url || '')), el('div', { class: 'ss-a' }, esc(it.s.a || '')));
      b.append(art, tx);
      b.addEventListener('click', async () => { setSong(it.s); NB.used('song'); await SHARE.inboxRemove(it.at); analytics.design('song:add:inbox'); closeSheet(); });
      const x = el('button', { class: 'sc-del', type: 'button', 'aria-label': t('보관함에서 빼기') }, '✕');
      x.addEventListener('click', async () => { await SHARE.inboxRemove(it.at); row.remove(); if (!sec.querySelector('.ss-itemrow')) sec.remove(); });
      row.append(b, x);
      sec.append(row);
    }
    topBox.append(sec);
  });
  box.append(bgmBox);
  if (entry.song) {
    const rm = el('button', { class: 'btn', type: 'button', style: 'width:100%;margin-top:14px;color:var(--bad)' }, esc(t('노래 빼기')));
    rm.addEventListener('click', () => { setSong(null); closeSheet(); });
    box.append(rm);
  }
  /* [완료] (2026-10-29 사용자: "음악을 넣을 때 완료 버튼을 만들어줘") — 고른 노래·배경음악은 이미 저장돼 있다. 창을 닫는다 */
  const done = el('button', { class: 'btn btn-primary ss-done', type: 'button' }, esc(t('완료')));
  done.addEventListener('click', () => { analytics.design('song:sheet:done'); closeSheet(); });
  box.append(done);
  openSheet({ title: t('음악'), content: box, onClose: () => { clearTimeout(timer); ctl?.abort(); unBgm(); BGM.stop(); document.removeEventListener('visibilitychange', onVis); } });
}

/** 복사해 둔 글 (못 읽으면 '').
    앱 안 웹 화면은 클립보드를 직접 못 읽는다 → 앱 본체(Clip 부품, 1.7.9 스토어 업데이트부터)로 읽는다.
    native=true 는 사용자가 [붙여넣기]를 눌렀거나 YouTube Music 에서 막 돌아왔을 때만 (안드로이드가 '붙여넣음' 알림을 띄우므로 아무 때나 읽지 않는다) */
async function readClip({ native = false } = {}) {
  const C = window.Capacitor;
  if (native && C?.isNativePlatform?.() && C.isPluginAvailable?.('Clip')) {
    try { const r = await C.Plugins.Clip.read(); return ((r && r.text) || '').trim(); } catch { /* 아래로 */ }
  }
  try { return ((await navigator.clipboard?.readText?.()) || '').trim(); } catch { return ''; }
}

/** YouTube Music 을 그 노래 검색으로 연다 (공유로 돌아오면 지금 쓰는 일기에 들어온다) */
function ytFind(query) {
  const qq = (query || '').trim();
  analytics.design('song:ytfind');
  M.openExternal(qq ? 'https://music.youtube.com/search?q=' + encodeURIComponent(qq) : 'https://music.youtube.com/');
}

function renderPageTags() {
  const row = refs.pageTags;
  if (!row) return;
  row.innerHTML = '';
  for (const tg of entry.tags) {
    const b = el('button', { class: 'chip on', type: 'button' }, `#${esc(tg)} ✕`);
    b.addEventListener('click', () => { entry.tags = entry.tags.filter((z) => z !== tg); queueSave(); renderPageTags(); refreshSuggest(); });
    row.append(b);
  }
  const addT = el('button', { class: 'chip', type: 'button' }, icon('plus') + `<span>${t('태그')}</span>`);
  addT.addEventListener('click', addTag);
  row.append(addT);
}

/* 타이핑이 멈추면 태그·기분 추천만 다시 계산한다 (본문은 건드리지 않는다) */
let suggestTimer = null;
function queueSuggest() {
  clearTimeout(suggestTimer);
  suggestTimer = setTimeout(refreshSuggest, 900);
}

function refreshSuggest() {
  // 기분 추측·태그 추출은 한국어 형태소 규칙 기반이라 다른 언어에선 끈다
  if (i18nCurrent() !== 'ko') return;
  const text = `${entry?.title || ''} ${entry?.body || ''}`;

  if (refs.moodSug) {
    refs.moodSug.innerHTML = '';
    const g = entry.mood ? null : guessMood(entry.body || '');
    if (g) {
      const sug = el('div', { class: 'tagsug', style: 'margin-top:9px' });
      sug.append(el('span', { class: 'tagsug-label' }, t('혹시')));
      const b = el('button', { class: 'chip', type: 'button' },
        `<span class="mood-dot" style="background:${moodColor(g)}"></span>${esc(t('{기분} 하루', { 기분: moodWord(g) }))}`);
      b.addEventListener('click', () => { entry.mood = g; queueSave(); haptic(); renderExtras(); });
      sug.append(b);
      refs.moodSug.append(sug);
    }
  }

  if (refs.tagSug) {
    refs.tagSug.innerHTML = '';
    if (!store.getSettings().autoTags || text.replace(/\s/g, '').length < 8) return;
    // 일기 전체로 색인을 만드는 일이라 글이 쌓일수록 비싸진다.
    // 쓰는 동안 다른 글은 바뀌지 않으니 이 글을 쓰는 내내 한 번만 만든다.
    if (!extractor) {
      const corpus = store.live().map((e) => `${e.title || ''} ${e.body || ''}`);
      extractor = makeKeywordExtractor(corpus.length ? corpus : ['']);
    }
    const sug = extractor(text, 8).filter((w) => !entry.tags.includes(w)).slice(0, 4);
    if (!sug.length) return;
    const sr = el('div', { class: 'tagsug' });
    sr.append(el('span', { class: 'tagsug-label' }, t('추천')));
    for (const w of sug) {
      const b = el('button', { class: 'chip', type: 'button' }, `#${esc(w)}`);
      b.addEventListener('click', () => { entry.tags.push(w); queueSave(); haptic(); renderPageTags(); refreshSuggest(); });
      sr.append(b);
    }
    refs.tagSug.append(sr);
  }
}

/* 사진 버튼 → '앨범에서 선택 / 카메라로 촬영' 고르기 (1.7.2, 사용자 요청) */
function pickPhotos() {
  const box = el('div', { class: 'pick-src' });
  const row = (k, ic, title, sub, fn, lock = false) => {
    const b = el('button', { class: 'pick-src-item', type: 'button', 'data-k': k },
      `<span class="pick-src-ico ${k}">${icon(ic)}</span>
       <span class="pick-src-txt"><span class="pick-src-title">${esc(title)}${k === 'collage' ? NB.pill('collage') : ''}${lock ? ' <span class="decor-plus-badge">PLUS</span>' : ''}</span><span class="pick-src-sub">${esc(sub)}</span></span>
       <span class="pick-src-chev">${icon('chev')}</span>`);
    b.addEventListener('click', () => { closeSheet(); setTimeout(fn, 60); });
    return b;
  };
  box.append(
    row('album', 'image', t('앨범에서 선택'), t('갤러리에서 사진을 골라요'), pickFromAlbum),
    row('camera', 'camera', t('카메라로 촬영'), t('지금 바로 찍어서 추가해요'), takePhoto),
    /* 사진 묶음은 플러스 (체험 중에는 열림) — 잠겨 있으면 플러스 안내로 */
    row('collage', 'image', t('사진 묶음'), t('여러 장을 한 틀에 모아요'),
      () => (plus.canCollage() ? newCollage() : (analytics.design('write:collage_locked'), plus.showInfo('collage'))), !plus.canCollage()),
  );
  openSheet({ center: true, title: t('사진 추가'), text: t('어떤 방법으로 사진을 넣을까요?'), content: box });
}

/* 카메라로 한 장 — 앱에서는 시스템 카메라 앱, 웹에서는 capture 입력칸 */
function takePhoto() {
  analytics.design('write:photo_src:camera');
  if (native.canPickNative()) {
    native.capturePhoto().then((r) => {
      if (!r || !r.photos.length) { if (r?.failed) toast(t('사진 하나를 넣지 못했어요.')); return; }
      photoJobs = photoJobs.then(() => addPhotos(r.photos));
    }).catch((e) => {
      console.error('카메라', e);
      toast(t('카메라를 열지 못했어요.'));
    });
    return;
  }
  const inp = el('input', { type: 'file', accept: 'image/*', capture: 'environment', style: 'display:none' });
  document.body.append(inp);
  inp.addEventListener('change', () => {
    const files = [...inp.files];
    inp.remove();
    if (files.length) photoJobs = photoJobs.then(() => addPhotos(files));
  });
  inp.click();
}

function pickFromAlbum(opts) {
  const single = !!opts?.single;      // 묶음의 칸 하나 채우기 (1.7.5)
  analytics.design('write:photo_src:album');
  /* 1.5.1: 앱에서는 시스템 사진 선택기를 직접 띄운다 (native.pickPhotos 설명 참고).
     웹뷰의 고르기 창이 한 번 꼬이면 앱을 끄기 전까지 사진 버튼이 먹통이 됐다 */
  if (native.canPickNative()) {
    native.pickPhotos({ multiple: !single }).then((r) => {
      if (!r || !r.photos.length) {
        pendingCollage = null;          // 고르다 그만두면 묶음 만들기도 취소
        if (r?.failed) toast(t('사진 하나를 넣지 못했어요.'));
        return;
      }
      photoJobs = photoJobs.then(() => addPhotos(r.photos));
      if (r.failed) toast(t('사진 하나를 넣지 못했어요.'));
    }).catch((e) => {
      console.error('사진 선택기', e);
      toast(t('사진을 넣지 못했어요. 다른 사진으로 해 보세요.'));
    });
    return;
  }
  const inp = el('input', { type: 'file', accept: 'image/*', multiple: !single, style: 'display:none' });
  document.body.append(inp);
  inp.addEventListener('change', () => {
    const files = [...inp.files];
    inp.remove();
    if (!files.length) return;
    /* 사진 한 장을 줄여 넣는 데 1초쯤 걸린다. 예전에는 그 사이 [완료]나 뒤로가기를 누르면
       화면이 먼저 닫혀 사진이 붙지 않았다(1.4.1 '사진이 가끔 안 들어감'). 이제는 차례로
       줄을 세우고, 저장·나가기는 이 줄이 끝날 때까지 기다린다 */
    photoJobs = photoJobs.then(() => addPhotos(files));
  });
  inp.click();
}

async function addPhotos(files) {
  const target = entry;
  if (!target) return;
  /* 1.7.5: 글을 쓰던 중이면 커서가 있던 자리에 넣는다. 아니면 예전처럼 본문 위 묶음에 */
  const at = caretOffset();
  const newPids = [];
  photoBusy++;
  toast(i18nCurrent() === 'ko' ? `사진 ${files.length}장 넣는 중…` : `${t('사진')} +${files.length} …`);
  const box = refs.pagePhotos;
  const holders = files.map(() => el('div', { class: 'wp-photo wp-photo-loading' }));
  if (box) { box.hidden = false; box.append(...holders); holders[0]?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  let failed = 0, added = 0;
  try {
    for (const f of files) {
      try {
        // 앱의 사진 선택기는 이미 줄인 dataURL 을, 웹은 파일을 준다
        const d = typeof f === 'string' ? f : await store.fileToDataUrl(f);
        const pid = await store.putPhoto(d);
        if (entry !== target) { try { await store.deletePhoto(pid); } catch { /* 무시 */ } continue; }   // 화면이 바뀜
        target.photos.push(pid);
        newPids.push(pid);
        addedPhotos.add(pid);
        added++;
        holders.shift()?.remove();
        renderPagePhotos();
        if (box) box.append(...holders);
      } catch (e) {
        failed++;
        holders.shift()?.remove();
        console.error('사진 넣기 실패', f?.type, f?.size, e?.message || e);
        analytics.design('photo:fail');
      }
    }
  } finally {
    photoBusy--;
    for (const h of holders) h.remove();
  }
  if (entry !== target) return;
  if (added) {
    queueSave();
    dropPromptIfWritten();
    /* 빈 칸 채우기면 묶음 자리에 붙인다. 아니면 커서 자리(있을 때)에 넣고, 새 묶음이면 묶는다 */
    const fill = !!pendingCollage?.cid;
    const inline = !fill && at !== null && newPids.length && PL.inlineOn(entry);
    if (inline) { insertPhotosAt(newPids, at); analytics.design('write:photo_inline', newPids.length); }
    const made = applyPendingCollage(newPids);
    if (inline || made) {
      renderContent();
      refs.stk?.rebuild();
      refs.page?.querySelector(`.wp-photo[data-pid="${CSS.escape(newPids[0])}"]`)?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } else {
      renderPagePhotos();
      refs.stk?.refresh?.();
      // 방금 붙인 사진이 보이도록 그쪽으로
      refs.pagePhotos?.lastElementChild?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  } else if (box) box.hidden = !entry.photos.length;
  if (failed) toast(t('사진 하나를 넣지 못했어요.'));
}

async function addTag() {
  const { promptSheet } = await import('../ui.js');
  const v = await promptSheet({ title: t('태그 추가'), placeholder: t('예: 운동, 회사, 엄마'), ok: t('추가') });
  if (!v) return;
  for (const t of v.split(/[,\s#]+/).map((s) => s.trim()).filter(Boolean)) {
    if (!entry.tags.includes(t)) entry.tags.push(t);
  }
  queueSave(); renderPageTags(); refreshSuggest();
}

/* ── 감정 패드 ──────────────────────────────────── */
function hsl2rgb(h, s, l) {
  s /= 100; l /= 100;
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(Math.min(k(n) - 3, 9 - k(n)), 1));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** 새 일기 두 번째 단계: '오늘은 이런 날' 칩을 고르고 [일기 쓰기] (1.7.6) */
function openChipsStep(done) {
  analytics.design('write:chips_step:open');
  const box = el('div', { class: 'chips-step' });
  const S0 = store.getSettings();
  for (const g of chipGroups(S0)) {
    box.append(el('div', { class: 'chips-step-g' }, esc(t(g.name))));
    const row = el('div', { class: 'chip-row' });
    for (const ch of g.chips) {
      const ci = chipIcon(ch, S0);
      const b = el('button', { class: 'chip' + (entry.chips.includes(ch) ? ' on' : ''), type: 'button' },
        (ci ? icon(ci) : '') + `<span>${esc(t(ch))}</span>`);
      b.addEventListener('click', () => {
        const i = entry.chips.indexOf(ch);
        if (i >= 0) entry.chips.splice(i, 1); else entry.chips.push(ch);
        b.classList.toggle('on');
        haptic(); queueSave();
      });
      row.append(b);
    }
    box.append(row);
  }
  const go = el('button', { class: 'btn btn-primary btn-block', type: 'button', style: 'margin-top:14px' }, icon('edit') + `<span>${esc(t('일기 쓰기'))}</span>`);
  go.addEventListener('click', () => closeSheet());
  /* 칩 편집 (1.7.9): 편집 창을 닫으면 이 고르기 창으로 돌아온다 */
  let editing = false;
  const ed = el('button', { class: 'btn btn-ghost btn-block chips-step-edit', type: 'button' }, icon('edit') + `<span>${esc(t('칩 편집'))}</span>`);
  ed.addEventListener('click', () => { editing = true; openChipEditor(() => openChipsStep(done)); });
  box.append(go, ed);
  openSheet({
    title: t('오늘은 이런 날'),
    text: t('해당하는 걸 골라 주세요. 여러 개 골라도 되고, 건너뛰어도 괜찮아요.'),
    content: box,
    onClose: () => {
      if (editing) return;               // 편집 창으로 넘어감 — 일기 쓰기로 가지 않는다
      analytics.design('write:chips_step:' + (entry?.chips?.length ? 'picked' : 'skip'), entry?.chips?.length || 0);
      renderPageChips(); renderExtras();
      done?.();
    },
  });
}

export function openMoodPad(onChange, { first = false, onClose = null } = {}) {
  const box = el('div');
  const wrap = el('div', { class: 'moodpad-wrap' });
  const pad = el('div', { class: 'moodpad' });
  const cv = el('canvas', { width: '110', height: '110' });
  const knob = el('div', { class: 'moodpad-knob' });
  pad.append(cv, knob);
  pad.append(
    el('div', { class: 'moodpad-axis t' }, t('들뜸 · 각성')),
    el('div', { class: 'moodpad-axis b' }, t('가라앉음')),
    el('div', { class: 'moodpad-axis l' }, t('불쾌')),
    el('div', { class: 'moodpad-axis r' }, t('유쾌')),
  );
  const read = el('div', { class: 'moodpad-read' });
  const clearBtn = el('button', { class: 'btn btn-ghost btn-block', type: 'button', style: 'margin-top:14px' },
    t('기분 기록하지 않기'));
  wrap.append(pad, read);
  box.append(wrap, clearBtn);

  /* 색 필드 그리기 */
  const N = 110, ctx = cv.getContext('2d');
  const img = ctx.createImageData(N, N);
  const dark = document.documentElement.dataset.theme === 'dark';
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const v = (x / (N - 1)) * 2 - 1;
      const e = 1 - (y / (N - 1)) * 2;
      const r = Math.hypot(v, e);
      const i = (y * N + x) * 4;
      if (r > 1.02) { img.data[i + 3] = 0; continue; }
      const hue = 6 + Math.pow((v + 1) / 2, 1.3) * 148;   // ui.js moodColor() 와 같은 식
      const sat = 22 + Math.min(1, r) * 52;
      const lit = dark ? 40 + (e + 1) / 2 * 16 : 56 + (e + 1) / 2 * 14;
      const [R, G, B] = hsl2rgb(hue, sat, lit);
      img.data[i] = R; img.data[i + 1] = G; img.data[i + 2] = B;
      img.data[i + 3] = r > 0.98 ? 255 * (1.02 - r) / 0.04 : 255;
    }
  }
  ctx.putImageData(img, 0, 0);

  let mood = entry.mood ? { ...entry.mood } : null;
  function paint() {
    if (mood) {
      knob.style.display = '';
      knob.style.left = ((mood.v + 1) / 2 * 100) + '%';
      knob.style.top = ((1 - (mood.e + 1) / 2) * 100) + '%';
      knob.style.background = moodColor(mood);
      read.innerHTML =
        `<div class="moodpad-word">${esc(t('{기분} 하루', { 기분: moodWord(mood) }))}</div>
         <div class="moodpad-sub">${t('기분 {v} · 에너지 {e}', { v: (mood.v * 50).toFixed(0), e: (mood.e * 50).toFixed(0) })}</div>`;
    } else {
      knob.style.display = 'none';
      read.innerHTML = `<div class="moodpad-word" style="color:var(--muted-2)">${t('원 위를 눌러보세요')}</div>
                        <div class="moodpad-sub">${t('좌우는 기분, 위아래는 에너지')}</div>`;
    }
  }
  paint();

  const setFrom = (ev) => {
    const r = pad.getBoundingClientRect();
    let v = ((ev.clientX - r.left) / r.width) * 2 - 1;
    let e = 1 - ((ev.clientY - r.top) / r.height) * 2;
    const len = Math.hypot(v, e);
    if (len > 1) { v /= len; e /= len; }
    mood = { v: +v.toFixed(3), e: +e.toFixed(3) };
    paint();
  };
  let dragging = false;
  pad.addEventListener('pointerdown', (ev) => {
    dragging = true; try { pad.setPointerCapture(ev.pointerId); } catch { /* 이미 끝난 누름 */ } setFrom(ev); haptic(6);
  });
  pad.addEventListener('pointermove', (ev) => { if (dragging) setFrom(ev); });
  pad.addEventListener('pointerup', () => {
    dragging = false;
    entry.mood = mood; onChange?.(); haptic(12);
    // 고른 색이 잠깐 보인 뒤 스르륵 내려간다 — 다시 고치고 싶으면 카드를 또 누르면 된다
    setTimeout(closeSheet, 300);
  });
  pad.addEventListener('pointercancel', () => { dragging = false; });

  clearBtn.addEventListener('click', () => { entry.mood = null; onChange?.(); closeSheet(); });

  openSheet({
    title: first ? t('오늘 기분부터 골라 볼까요?') : t('오늘의 기분'),
    text: first ? t('원 위를 눌러 지금 기분을 고르면 바로 일기를 쓸 수 있어요. 나중에 바꿀 수 있어요.')
      : t('가로는 기분(불쾌↔유쾌), 세로는 에너지(가라앉음↔들뜸)예요. 색 5개로 못 담던 결을 좌표로 남깁니다.'),
    content: box, onClose,
  });
}


/* ── 날씨 (1.7.2) ────────────────────────────────
   새 글을 열면 그 시각·그 자리의 날씨를 날짜 옆에 붙인다. 처음 한 번은 켤지 묻는다.
   누르면 바꾸거나 뺄 수 있다. 인터넷·위치가 없으면 조용히 날씨 없이 쓴다. */
let wxLoading = false;
let wxWarned = false;        // 날씨를 못 가져온 이유는 앱을 켤 때마다 한 번만 말한다
function weatherUi(bar) {
  refs.wxBar = bar;
  wxLoading = false;
  placeLoading = false;
  paintWeather();
  const s = store.getSettings();
  /* 일기 쓴 곳 (1.7.8): 새 일기를 오늘 날짜로 열었을 때만 그 자리를 남긴다 (지난 날짜 일기에 지금 위치를 넣지 않는다) */
  if (isNew && !entry.place && s.placeAuto && place.available() && entry.date === todayKey()) fillPlace();
  if (!isNew || entry.weather || !wx.available()) return;
  if (s.weatherAuto) fillWeather();
  else if (!s.weatherAsked) setTimeout(() => { if (refs.wxBar?.isConnected && !document.querySelector('#sheetRoot .sheet')) askWeather(); }, 600);
}

function paintWeather() {
  const bar = refs.wxBar;
  if (!bar) return;
  bar.querySelectorAll('.wx-chip, .wx-place, .wx-br').forEach((n) => n.remove());
  if (!refs.placeBar) refs.placeBar = el('div', { class: 'wp-place' });   // 본문 아래 자리 (쓰기 종이를 그리기 전이면 먼저 만들어 둔다)
  const pbar = refs.placeBar;
  pbar.innerHTML = '';
  bar.append(el('span', { class: 'wx-br' }));
  const w = entry?.weather;
  const chip = el('button', { class: 'wx-chip' + (w ? '' : ' ghost'), type: 'button' });
  if (w) {
    const deg = w.t != null ? w.t : (w.hi != null ? w.hi : null);
    chip.innerHTML = wx.wxSvg(w.k, 30) + `<span>${esc(wx.nameOf(w.k))}</span>` + (deg != null ? `<span class="d">${deg}°</span>` : '');
    chip.setAttribute('aria-label', t('날씨') + ': ' + wx.nameOf(w.k));
  } else if (wxLoading) {
    chip.innerHTML = `<span class="wx-spin"></span><span>${esc(t('날씨 가져오는 중…'))}</span>`;
  } else {
    chip.innerHTML = `<span class="wx-plus">+</span><span>${esc(t('날씨'))}</span>`;
  }
  chip.addEventListener('click', onWeatherChip);
  bar.append(chip);
  /* 장소 칩 (1.7.8) */
  if (place.available()) {
    const p = entry?.place;
    const pc = el('button', { class: 'wx-chip pl-chip' + (p ? '' : ' ghost'), type: 'button' });
    if (p) {
      pc.innerHTML = `<svg class="pl-ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg><span>${esc(place.label(p))}</span>`;
      pc.setAttribute('aria-label', t('일기 쓴 곳') + ': ' + place.fullLabel(p));
    } else if (placeLoading) {
      pc.innerHTML = `<span class="wx-spin"></span><span>${esc(t('장소 찾는 중…'))}</span>`;
    } else {
      pc.innerHTML = `<span class="wx-plus">+</span><span>${esc(t('장소'))}</span>` + NB.pill('place');
    }
    pc.addEventListener('click', onPlaceChip);
    pbar.append(pc);
  }
  if (w?.auto && w.place) {
    const pl = el('div', { class: 'wx-place' });
    pl.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.4"/></svg>'
      + `<span>${esc(t('{place} · {time} 날씨를 자동으로 넣었어요', { place: w.place, time: fmtClock(w.at) }))}</span>`;
    pbar.append(pl);
  }
}
/* ── 일기 쓴 곳 (1.7.8) ───────────────────────── */
let placeLoading = false;
async function fillPlace() {
  const target = entry;
  if (!target || placeLoading) return;
  placeLoading = true; paintWeather();
  let p = null;
  try { p = await place.capture(); } catch { p = null; }
  placeLoading = false;
  if (entry !== target) return;
  if (p && !target.place) {
    target.place = p;
    NB.used('place');
    analytics.design('place:auto:' + (p.approx ? 'approx' : 'precise'));
    if (!isEmpty(target)) queueSave();
  } else if (!p) analytics.design('place:auto_fail');
  paintWeather();
}
async function onPlaceChip() {
  if (placeLoading) return;
  const p = entry?.place;
  if (!p) {
    const st = await place.permState();
    /* 1.7.9: 정확한 위치는 처음 화면에서 묻지 않고, 장소를 고를 때 안내 → 권한 창.
       날씨 때문에 대략적 위치만 있는 사람도, 처음 한 번은 안내하고 정확한 위치를 묻는다 */
    if ((st !== 'granted' && st !== 'approx') || (st === 'approx' && !store.getSettings().placeAsked)) {
      const { enablePlace } = await import('./map.js');
      if (!(await enablePlace())) return;
    }
    await fillPlace();
    if (!entry?.place) toast(t('지금 있는 곳을 찾지 못했어요. 폰의 위치가 켜져 있는지 확인해 주세요.'));
    return;
  }
  openSheet({
    title: place.fullLabel(p) || t('일기 쓴 곳'),
    text: p.approx ? t('대략적인 위치예요 (동네 단위).') : (p.acc ? t('오차 약 {n}m', { n: p.acc }) : ''),
    items: [
      { label: t('지금 있는 곳으로 바꾸기'), icon: 'pin', onClick: async () => { entry.place = null; paintWeather(); await fillPlace(); } },
      { label: t('장소 빼기'), icon: 'trash', danger: true, onClick: () => { entry.place = null; analytics.design('place:remove'); queueSave(); paintWeather(); } },
    ],
  });
}

function fmtClock(ts) {
  try { return new Date(ts).toLocaleTimeString(i18nLocale(), { hour: 'numeric', minute: '2-digit' }); } catch { return ''; }
}

/* 1.7.6 (사용자 요청 2026-10-25): 날씨는 위치 권한을 허용해야 쓴다.
   날씨가 아직 없을 때 칩을 누르면 → 권한이 없으면 권한부터 묻고(막혀 있으면 폰 설정으로) → 허용되면 그 자리 날씨를 가져온다.
   이미 날씨가 있으면 예전처럼 바꾸기·빼기 창. 권한은 있는데 위치·인터넷 문제로 못 가져오면 직접 고르기 창 */
async function onWeatherChip() {
  if (entry?.weather || !wx.available()) { openWeatherPicker(); return; }
  if (wxLoading) return;
  if (!(await ensureWeatherPerm())) return;
  await fillWeather();
  if (!entry?.weather) openWeatherPicker();
}

/** 위치 권한을 받는다. 시스템 창이 막혀 있으면 폰 설정의 하루칸 권한 화면으로 안내한다. 허용됐으면 true */
async function ensureWeatherPerm() {
  if ((await wx.permState()) === 'granted') return true;
  const st = await wx.requestPerm();
  analytics.design('weather:chip_perm:' + st);
  if (st === 'granted') {
    await store.saveSettings({ weatherAuto: true, weatherAsked: true }, { silent: true });
    return true;
  }
  const { confirmSheet } = await import('../ui.js');
  const go = await confirmSheet({
    title: t('위치를 허용해 주세요'),
    text: t("날씨를 넣으려면 위치 권한이 필요해요. 폰 설정에서 하루칸의 위치를 '앱 사용 중에만 허용'으로 바꿔 주세요."),
    ok: t('설정 열기'),
  });
  if (go) { wxBackFromSettings = true; await wx.openSettings('app'); }
  return false;
}

/* 폰 설정에서 위치를 허용하고 돌아오면 바로 날씨를 가져온다 */
let wxBackFromSettings = false;
document.addEventListener('visibilitychange', async () => {
  if (document.visibilityState !== 'visible' || !wxBackFromSettings) return;
  wxBackFromSettings = false;
  if (!entry || entry.weather || !refs.wxBar?.isConnected) return;
  if ((await wx.permState()) !== 'granted') return;
  await store.saveSettings({ weatherAuto: true, weatherAsked: true }, { silent: true });
  analytics.design('weather:perm_from_settings');
  fillWeather();
});

async function fillWeather() {
  const target = entry;
  if (!target || wxLoading) return;
  wxLoading = true; paintWeather();
  let w = null;
  try { w = await wx.fetchFor(target.date); } catch { w = null; }
  wxLoading = false;
  if (entry !== target) return;
  if (w && !target.weather) {
    target.weather = w;
    analytics.design('weather:auto:' + w.k.replace('>', '_to_'));
    if (!isEmpty(target)) queueSave();
  } else if (!w) {
    analytics.design('weather:auto_fail:' + (wx.lastFail || 'unknown'));
    /* 권한이 꺼져 있으면 한 번은 알려 준다 (예전엔 조용히 날씨만 빠져 '이 폰은 날씨가 안 된다'고 느꼈다) */
    if ((wx.lastFail === 'perm' || wx.lastFail === 'off') && !wxWarned) {
      wxWarned = true;
      toast(wx.lastFail === 'perm'
        ? t('위치 권한이 꺼져 있어 날씨를 못 가져왔어요. 날씨 칸을 누르면 다시 허용할 수 있어요.')
        : t('폰의 위치가 꺼져 있어 날씨를 못 가져왔어요.'));
    }
  }
  paintWeather();
}

/* 처음 한 번만 묻는다 — "켜기"를 누르면 안드로이드 위치 권한 창이 뜬다 */
function askWeather() {
  analytics.design('weather:ask');
  const box = el('div');
  box.innerHTML = `<div class="wx-ask-art">${wx.wxSvg('clear', 52)}${wx.wxSvg('partly', 60)}${wx.wxSvg('rain', 52)}${wx.wxSvg('snow', 46)}</div>
    <div class="sheet-text" style="margin-bottom:14px">${esc(t('일기를 쓰는 시간에 지금 있는 곳의 날씨를 가져와 일기에 붙여 둘게요.'))}<br>${esc(t('위치는 날씨를 찾는 데만 쓰고 저장하지 않아요. 동네 이름만 남겨요.'))}</div>`;
  const row = el('div', { class: 'wxp-btns' });
  const later = el('button', { class: 'btn', type: 'button' }, esc(t('나중에')));
  const on = el('button', { class: 'btn btn-primary', type: 'button' }, esc(t('날씨 켜기')));
  row.append(later, on);
  box.append(row);
  later.addEventListener('click', async () => {
    closeSheet();
    analytics.design('weather:ask_later');
    await store.saveSettings({ weatherAsked: true }, { silent: true });
  });
  on.addEventListener('click', async () => {
    closeSheet();
    await store.saveSettings({ weatherAsked: true }, { silent: true });
    const ok = await ensureWeatherPerm();
    analytics.design('weather:perm:' + (ok ? 'granted' : 'denied'));
    if (ok) { await store.saveSettings({ weatherAuto: true }, { silent: true }); fillWeather(); }
  });
  openSheet({ center: true, title: t('일기에 날씨를 자동으로 넣을까요?'), content: box });
}

/* 날씨 바꾸기 — 하나를 고르거나, '아침 → 지금'으로 바뀐 날을 고르거나, 뺀다 */
function openWeatherPicker() {
  const KINDS = ['clear', 'partly', 'cloudy', 'rain', 'cloudrain', 'shower', 'snow', 'sleet', 'thunder', 'fog'];
  const cur = entry.weather?.k || '';
  let [a, b] = cur.includes('>') ? cur.split('>') : [cur || null, cur || null];
  let slot = null;     // null: 하나로 고르기 · 'a' 아침 · 'b' 지금
  const box = el('div');
  const grid = el('div', { class: 'wxp-grid' });
  const two = el('div', { class: 'wxp-two' });
  const paint = () => {
    const sel = slot === 'a' ? a : slot === 'b' ? b : (a === b ? a : null);
    grid.querySelectorAll('.wxp-it').forEach((it) => it.classList.toggle('on', it.dataset.k === sel));
    two.innerHTML = '';
    const mk = (which, k, label) => {
      const s = el('button', { class: 'wxp-sel' + (slot === which ? ' on' : ''), type: 'button' },
        (k ? wx.wxSvg(k, 34) : '<span class="wxp-empty"></span>') + `<span><small>${esc(label)}</small>${esc(k ? wx.nameOf(k) : t('고르기'))}</span>`);
      s.addEventListener('click', () => { slot = slot === which ? null : which; paint(); });
      return s;
    };
    two.append(mk('a', a, t('아침')), el('span', { class: 'wxp-arrow' }, document.documentElement.dir === 'rtl' ? '←' : '→'), mk('b', b, t('지금')));
  };
  for (const k of KINDS) {
    const it = el('button', { class: 'wxp-it', type: 'button', 'data-k': k }, wx.wxSvg(k, 38) + `<span>${esc(wx.nameOf(k))}</span>`);
    it.addEventListener('click', () => {
      if (slot === 'a') a = k; else if (slot === 'b') b = k; else { a = k; b = k; }
      paint();
    });
    grid.append(it);
  }
  box.append(el('div', { class: 'wxp-sec' }, esc(t('오늘 하루 날씨'))), grid,
    el('div', { class: 'wxp-sec' }, esc(t('날씨가 바뀐 날'))), two);
  const row = el('div', { class: 'wxp-btns' });
  const del = el('button', { class: 'btn', type: 'button' }, esc(t('날씨 빼기')));
  const ok = el('button', { class: 'btn btn-primary', type: 'button' }, esc(t('확인')));
  row.append(del, ok);
  box.append(row);
  del.addEventListener('click', () => { closeSheet(); entry.weather = null; analytics.design('weather:remove'); queueSave(); paintWeather(); });
  ok.addEventListener('click', () => {
    closeSheet();
    if (!a && !b) return;
    const k = (a && b && a !== b) ? `${a}>${b}` : (a || b);
    if (k === entry.weather?.k) return;
    const prev = entry.weather || {};
    entry.weather = { ...prev, k, auto: false, at: prev.at || Date.now() };
    if (!prev.place) delete entry.weather.place;
    analytics.design('weather:pick');
    queueSave();
    paintWeather();
  });
  paint();
  const w = entry.weather;
  const text = w?.auto && w.place ? t('{place} · {time} 기준으로 넣었어요. 다르면 골라 주세요.', { place: w.place, time: fmtClock(w.at) })
    : t('그날 날씨를 골라 주세요.');
  openSheet({ title: t('날씨 바꾸기'), text, content: box });
}

/* ── 툴바 ───────────────────────────────────────── */
function buildToolbar() {
  const bar = el('div', { class: 'writebar' });
  const mk = (ic, label, fn, id) => {
    const b = el('button', { class: 'icon-btn', type: 'button', 'aria-label': label }, icon(ic));
    b.addEventListener('click', fn);
    if (id) refs[id] = b;
    return b;
  };
  bar.append(
    mk('mood', t('기분'), () => openMoodPad(() => { renderExtras(); queueSave(); })),
    mk('camera', t('사진'), pickPhotos),
    NB.corner(mk('mic', t('음성 입력'), toggleVoice, 'micBtn'), 'voice'),
    NB.corner(mk('music', t('오늘의 노래'), openSongSheet, 'songBtn'), 'song'),
    mk('tag', t('태그'), addTag),
    (() => {   // 열고 닫기를 스스로 하는 버튼이라 '화면을 누르면 닫힘'에서 빠진다
      const b = mk('sticker', t('스티커 붙이기'), openStickers);
      b.dataset.stkToggle = '1';
      return stickers.paintNew(b);
    })(),
  );
  bar.append(el('div', { class: 'spacer' }));
  refs.count = el('div', { class: 'wb-count' });
  bar.append(refs.count);
  const okBtn = el('button', { class: 'btn btn-primary btn-sm', type: 'button' }, t('완료'));
  okBtn.addEventListener('click', done);
  bar.append(okBtn);
  updateCount(bar);
  return bar;
}

function updateCount() {
  if (!refs.count) return;
  const n = store.countWords(entry.body || '');
  refs.count.textContent = n ? t('{n}자', { n }) : '';
  /* 툴바가 좁으면 언어에 따라 단위가 잘린다('46 car…'). 잘릴 바에야 숫자만 둔다 */
  const fit = () => { if (refs.count && n && refs.count.scrollWidth > refs.count.clientWidth + 1) refs.count.textContent = n.toLocaleString(); };
  fit(); requestAnimationFrame(fit);      // 글꼴·배치가 끝난 다음 프레임에 한 번 더 잰다
}

/* ── 음성 입력 ──────────────────────────────────── */
let rec = null;
function stopVoice() { try { rec?.stop(); } catch {} rec = null; refs.micBtn?.classList.remove('rec'); }

/** 말로 받은 글을 본문 끝에 붙인다 */
function appendVoice(add) {
  add = (add || '').trim();
  if (!add || !entry) return;
  if (refs.flow) {
    const tas = refs.flow.querySelectorAll('textarea.body-in');
    const last = tas[tas.length - 1];
    if (last) { last.value += (last.value && !/\s$/.test(last.value) ? ' ' : '') + add; autogrow(last, true); syncFlow(); }
    return;
  }
  const sep = entry.body && !/\s$/.test(entry.body) ? ' ' : '';
  entry.body = (entry.body || '') + sep + add;
  if (refs.body && entry.mode !== 'guided') { refs.body.value = entry.body; autogrow(refs.body, true); }
  updateCount(); queueSave();
}

/** 앱(안드로이드): 마이크 권한 → 폰의 음성 인식 창 → 받은 글을 붙인다 (1.7.6) */
async function voiceNative() {
  if (voiceBusy) return;
  voiceBusy = true;
  try {
    let st = await native.speechPerm();
    if (st !== 'granted') {
      st = await native.speechRequest();
      analytics.design('voice:perm:' + st);
      if (st !== 'granted') {
        const go = await confirmSheet({
          title: t('마이크 권한을 허용해 주세요'),
          text: t('말로 일기를 쓰려면 마이크 권한이 필요해요. 폰 설정에서 하루칸의 마이크를 허용해 주세요.'),
          ok: t('설정 열기'),
        });
        if (go) await wx.openSettings('app');
        return;
      }
    }
    if (!(await native.speechAvailable())) { toast(t('이 폰에서는 음성 입력을 쓸 수 없어요. Google 음성 인식이 필요해요.')); analytics.design('voice:unavailable'); return; }
    refs.micBtn?.classList.add('rec');
    analytics.design('voice:start');
    const text = await native.speechListen(i18nLocale(), t('말해 보세요'));
    if (text) { appendVoice(text); analytics.design('voice:ok'); }
  } catch (e) {
    const m = String(e?.message || e || '');
    if (m !== '0' && !/cancel/i.test(m)) { toast(t('음성 인식 오류')); analytics.design('voice:error'); }   // '0' = 사용자가 창을 닫음
  } finally {
    voiceBusy = false;
    refs.micBtn?.classList.remove('rec');
  }
}
let voiceBusy = false;

function toggleVoice() {
  NB.used('voice');
  if (native.speechNative()) { voiceNative(); return; }
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) { toast(t('이 브라우저는 음성 입력을 지원하지 않아요.')); return; }
  if (rec) { stopVoice(); toast(t('음성 입력을 멈췄어요.')); return; }

  rec = new SR();
  rec.lang = i18nLocale();          // 예전엔 늘 한국어로 들었다
  rec.continuous = true;
  rec.interimResults = false;
  const startLen = (entry.body || '').length;
  rec.onresult = (ev) => {
    let add = '';
    for (let i = ev.resultIndex; i < ev.results.length; i++) {
      if (ev.results[i].isFinal) add += ev.results[i][0].transcript;
    }
    appendVoice(add);
  };
  rec.onerror = (e) => { toast(e.error === 'not-allowed' ? t('마이크 권한이 필요해요.') : t('음성 인식 오류')); stopVoice(); };
  rec.onend = () => { if (rec) stopVoice(); };
  try { rec.start(); refs.micBtn.classList.add('rec'); toast(t('듣고 있어요. 말해보세요.')); }
  catch { stopVoice(); }
}

/* ── 메뉴 ───────────────────────────────────────── */
function openMenu() {
  openSheet({
    title: t('이 글'),
    items: [
      { label: t('날짜 바꾸기'), sub: fmtDate(entry.date, { year: true }), icon: 'cal', onClick: changeDate },
      entry.sealedUntil
        ? { label: t('묻어둔 것 되돌리기'),
            sub: t('{d}에 열릴 예정이에요', { d: fmtDate(entry.sealedUntil, { year: true }) }),
            icon: 'undo',
            onClick: async () => {
              entry.sealedUntil = null;
              dirty = true;
              await commit();
              const { syncSealedReminders } = await import('../app.js');
              await syncSealedReminders();      // 걸어둔 알림도 같이 거둔다
              rerender();
              toast(t('다시 꺼냈어요.'));
            } }
        : { label: t('미래의 나에게 묻어두기'), sub: t('정한 날까지 아무도 못 봐요'), icon: 'lock', onClick: bury },
      { label: t('휴지통으로 보내기'), icon: 'trash', danger: true, onClick: async () => {
        if (isNew && isEmpty(entry)) { back(); return; }
        const ok = await confirmSheet({
          title: t('휴지통으로 보낼까요?'), text: t('30일 동안 휴지통에 보관돼요. 그 안에는 언제든 되살릴 수 있습니다.'),
          ok: t('보내기'), danger: true,
        });
        if (!ok) return;
        await discard();                 // 저장 안 한 고침·이번에 넣은 사진은 버린다
        if (!isNew) await store.softDelete(entry.id);
        toast(t('휴지통으로 보냈어요.'), { action: t('실행 취소'), onAction: () => store.restore(entry.id) });
        go('/home', { replace: true });
      } },
    ],
  });
}

/**
 * 미래의 나에게 묻어두기.
 * 항아리에 넣어 땅에 묻던 그 방식 그대로다 — 묻는 순간부터 정한 날까지는
 * 쓴 사람도 못 읽는다. 언제든 들춰볼 수 있으면 묻은 게 아니다.
 */
function bury() {
  const box = el('div');
  const today = todayKey();

  const inp = tapToPick(el('input', {
    type: 'date', class: 'lock-input', value: addDays(today, 365),
    min: addDays(today, 1), style: 'text-align:start',
  }));

  /* 날짜를 손으로 고르게만 하면 대부분 내일로 잡는다. 그러면 묻는 맛이 없다.
     자주 쓸 만한 간격을 먼저 내민다. */
  const quick = el('div', { class: 'chip-row', style: 'margin:10px 0 4px' });
  /* t() 를 변수로 부르면 번역 검사기가 못 본다. 여기서는 그대로 적는다. */
  for (const [label, days] of [[t('100일 뒤'), 100], [t('1년 뒤'), 365],
                               [t('3년 뒤'), 365 * 3], [t('10년 뒤'), 365 * 10]]) {
    const b = el('button', { class: 'chip', type: 'button' }, esc(label));
    b.addEventListener('click', () => {
      inp.value = addDays(today, days);
      for (const o of quick.children) o.classList.remove('on');
      b.classList.add('on');
      paintWhen();
    });
    quick.append(b);
  }

  const when = el('div', { class: 'note', style: 'margin-top:10px' });
  const paintWhen = () => {
    if (!inp.value || inp.value <= today) { when.textContent = t('내일 이후로 골라주세요.'); return; }
    when.textContent = t('{d}에 열립니다 · {n}일 뒤',
      { d: fmtDate(inp.value, { year: true }), n: daysBetween(today, inp.value).toLocaleString() });
  };
  inp.addEventListener('change', () => {
    for (const o of quick.children) o.classList.remove('on');
    paintWhen();
  });
  quick.children[1]?.classList.add('on');
  paintWhen();

  const row = el('div', { class: 'btn-row', style: 'margin-top:16px' });
  const cancel = el('button', { class: 'btn', type: 'button' }, t('취소'));
  const ok = el('button', { class: 'btn btn-primary', type: 'button' }, icon('lock') + `<span>${t('묻어두기')}</span>`);
  row.append(cancel, ok);
  box.append(inp, quick, when, row);

  const close = openSheet({
    title: t('미래의 나에게'),
    text: t('정한 날이 올 때까지 이 글은 목록에도, 달력에도, 검색에도 나오지 않아요. 그날이 되면 저절로 돌아옵니다.'),
    content: box,
  });
  cancel.addEventListener('click', () => close());

  ok.addEventListener('click', async () => {
    if (!inp.value || inp.value <= today) { toast(t('내일 이후로 골라주세요.')); return; }
    if (isEmpty(entry)) { toast(t('묻어둘 내용을 먼저 적어주세요.')); return; }
    entry.sealedUntil = inp.value;
    dirty = true;
    await commit();                      // 묻는 건 되돌리기 어려우니 바로 저장한다
    close();

    /* 그날 알림을 건다. 권한이 없으면 그 자리에서 묻는다 — 사용자가 방금
       "3년 뒤에 만나자"고 정한 참이라 왜 묻는지 안다. 앱 켤 때마다 묻는
       것과는 전혀 다르다. */
    const { syncSealedReminders, askExactAlarm } = await import('../app.js');
    if (native.isNative() && (await native.requestNotifyPermission())) {
      const r = await syncSealedReminders();
      if (r === 'need-exact' && await askExactAlarm()) await syncSealedReminders();
    }
    toast(t('묻었어요. {d}에 만나요.', { d: fmtDate(inp.value, { year: true }) }));
    go('/home', { replace: true });      // 묻자마자 그 글을 계속 보고 있으면 묻은 것 같지 않다
  });
}

async function changeDate() {
  const box = el('div');
  const inp = tapToPick(el('input', { type: 'date', class: 'lock-input', value: entry.date, style: 'text-align:left' }));
  const row = el('div', { class: 'btn-row', style: 'margin-top:12px' });
  const ok = el('button', { class: 'btn btn-primary' }, t('바꾸기'));
  ok.addEventListener('click', () => {
    if (inp.value) {
      entry.date = inp.value;
      queueSave();
      /* 자동으로 넣은 날씨는 바꾼 날짜의 날씨로 다시 가져온다 */
      if (entry.weather?.auto) { entry.weather = null; fillWeather(); }
      closeSheet();
      const b = $('.write-datebar .chip');
      if (b) b.textContent = fmtDate(entry.date, { year: true });
      toast(t('날짜를 바꿨어요.'));
    }
  });
  row.append(ok);
  box.append(inp, row);
  openSheet({ title: t('날짜 바꾸기'), text: t('어제 일을 오늘 써도 괜찮아요. 밀린 날짜를 채워 넣을 때 쓰세요.'), content: box });
}
