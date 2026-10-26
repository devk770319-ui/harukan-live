/* ===========================================================
   views/settings.js — 설정
   데이터 주권이 이 앱의 약속이다. 내보내기/가져오기를 유료로
   막지 않고, 잠금도 서버 없이 이 기기에서 끝난다.
   =========================================================== */

import * as store from '../store.js';
import * as native from '../native.js';
import { go, applyTheme, lockNow, scheduleReminder, askExactAlarm } from '../app.js';
import { deriveKey, checkVerifier, ITER_LEGACY } from '../crypto.js';
import {
  el, icon, esc, toast, openSheet, closeSheet, confirmSheet, promptSheet, pinSheet, todayKey, timeInput,
} from '../ui.js';
import * as plus from '../plus.js';
import * as analytics from '../analytics.js';
import * as theme from '../theme.js';
import { bgName } from './decor.js';
import { t, LANGS, fmtClock } from '../i18n.js';
import { applyLanguage } from '../app.js';

export async function render(root) {
  const NBm = await import('../newbadge.js');   // 새 기능 NEW (1.7.8)
  const s = store.getSettings();
  const fontsMod = await import('../fonts.js');

  // 이 화면의 컨트롤들은 스스로 자기 DOM 을 갱신한다.
  // 그래서 저장은 조용히 한다 — emit 하면 조작 도중에 화면이 다시 그려진다.
  const save = (patch) => store.saveSettings(patch, { silent: true });

  /* ── 하루칸 플러스 ─────────────────────────
     맨 위에 둔다. 웹(PWA)에는 광고 자체가 없으므로 네이티브에서만 보인다.
     1.5.0: 구매·복원·체험 설명을 플러스 화면(views/plusview.js)으로 옮기고 여기엔 한 줄만 둔다.
     혜택이 늘어나면서 설정 맨 위가 광고판처럼 길어졌기 때문이다. */
  if (native.isNative()) {
    const isPlus = plus.isPlus();
    const left = isPlus ? null : plus.trialDaysLeft();
    const price = plus.price();
    root.append(group(t('하루칸 플러스'), [
      linkRow(t('하루칸 플러스'),
        isPlus ? t('구매해 주셔서 고맙습니다. 모든 플러스 기능이 열려 있어요.')
               : t('광고 제거 · 일정 무제한 · 배경 꾸미기 · PDF 내보내기 · 위로 스티커 120종을 한 번에.'),
        isPlus ? t('쓰는 중') : left ? t('체험 {n}일 남음', { n: left }) : (price || ''),
        () => go('/plus'), { ico: 'heart', tone: 'orange', pill: isPlus ? '' : 'accent' }),
    ], { ico: 'heart', tone: 'orange' }));
  }

  /* ── 화면 ─────────────────────────────────── */
  root.append(group(t('화면'), [

    segmentedRow(t('테마'), ['auto', 'light', 'dark'], [t('시스템'), t('밝게'), t('어둡게')], s.theme,
      (v) => save({ theme: v }).then(applyTheme),
      theme.forcesDark() ? t('별밤 배경을 쓰는 동안에는 늘 어둡게 보여요.') : ''),
    /* 배경 꾸미기 (1.5.0, 플러스) — 그림 배경·내 사진. 플러스가 아니면 PLUS 알약을 달아
       눌러보기 전에 알린다. 들어가면 미리보기는 된다. */
    /* NEW 표시 (1.6.6) — 배경을 새로 단장했다. 꾸미기 화면을 한 번 열면 사라진다 (settings.bgNewSeen) */
    linkRow(t('배경 꾸미기'), t('그림 배경이나 내 사진으로 화면을 꾸며요.'),
      plus.canUseBackground() ? bgName(s.bgTheme) : 'PLUS',
      () => go('/decor'), { ico: 'spark', tone: 'plum', pill: plus.canUseBackground() ? '' : 'accent', badge: s.bgNewSeen ? '' : 'NEW' }),
    /* 글씨체 하나로 합침 (1.7.6, 사용자 요청 2026-10-25) — 예전에는 '글꼴(고딕/명조)' 줄과
       '글씨체(손글씨)' 줄이 따로 있어 헷갈렸다. 이제 글씨체 창 하나에서 고딕·명조·손글씨를 고른다.
       저장은 그대로: 고딕/명조 = settings.font, 손글씨 = settings.diaryFont (있으면 이것이 이긴다) */
    linkRow(t('글씨체'), t('앱 전체 글씨와 PDF를 손글씨 글꼴로 바꿔요.'), fontLabel(fontsMod, s),
      () => pickDiaryFont(), { ico: 'edit', tone: 'amber', badge: NBm.isNew('font') ? 'NEW' : '' }),
    sliderRow(t('글자 크기'), s.fontSize, 14, 21, (v) => save({ fontSize: v }).then(applyTheme)),
    segmentedRow(t('달력 보기'), ['plain', 'photo'], [t('일반'), t('사진')], s.calendarStyle,
      (v) => {
        // 아직 개발 중이라 항상 통과한다. 잠글 때를 대비해 되돌리는 길까지 만들어 둔다.
        if (v === 'photo' && !plus.canPhotoCalendar()) { plus.showInfo('photo_cal'); return false; }
        return save({ calendarStyle: v });
      },
      t('“일반”은 그날의 기분 색으로 칸을 칠해요. “사진”은 그날 올린 사진으로 칸을 채웁니다. 사진이 없는 날은 기분 색 그대로예요.')),
    linkRow(t('언어'), '', langName(s.language), pickLanguage, { ico: 'type', tone: 'amber' }),
  ], { ico: 'sun', tone: 'amber' }));

  /* ── 쓰기 ─────────────────────────────────── */
  const wxMod = await import('../weather.js');
  /* 켜 두었어도 권한이 사라졌으면 꺼진 것으로 보여 준다 — 다시 켜면 권한을 다시 묻는다 (1.7.6) */
  const wxOn = !!s.weatherAuto && wxMod.available() && (await wxMod.permState()) === 'granted';
  const plMod = await import('../place.js');
  const plOn = !!s.placeAuto && plMod.available() && ['granted', 'approx'].includes(await plMod.permState());
  root.append(group(t('쓰기'), [
    segmentedRow(t('기본 모드'), ['free', 'oneline', 'guided'], [t('자유'), t('한 줄'), t('질문')], s.defaultMode,
      (v) => save({ defaultMode: v })),
    stepperRow(t('주간 목표'), t('주 {n}회', { n: s.weeklyGoal }), s.weeklyGoal, 1, 7,
      (v) => save({ weeklyGoal: v }),
      t('매일 스트릭 대신 주 단위 목표를 씁니다. 하루 놓쳐도 무너지지 않아요.')),
    toggleRow(t('태그 자동 추천'), s.autoTags, t('본문에서 키워드를 뽑아 태그를 제안해요.'),
      (v) => save({ autoTags: v }), { ico: 'tag', tone: 'orange' }),
    ...(wxMod.available() ? [toggleRow(t('날씨 자동 기록'), wxOn, t('일기를 쓸 때 지금 있는 곳의 날씨를 붙여요. 위치는 저장하지 않아요.'),
      async (v) => {
        if (v) {
          /* 1.7.6: 켤 때마다 위치 권한을 다시 묻는다. 안드로이드가 더는 창을 띄우지 않으면(두 번 거절 등)
             폰 설정의 하루칸 권한 화면으로 바로 보낸다 */
          const st = await wxMod.requestPerm();
          analytics.design('weather:settings_perm:' + st);
          if (st !== 'granted') {
            const { confirmSheet } = await import('../ui.js');
            const go = await confirmSheet({
              title: t('위치를 허용해 주세요'),
              text: t('날씨를 가져오려면 위치 권한이 필요해요. 폰 설정에서 하루칸의 위치를 \'앱 사용 중에만 허용\'으로 바꾼 뒤, 다시 켜 주세요.'),
              ok: t('설정 열기'),
            });
            if (go) await wxMod.openSettings('app');
            return false;
          }
          if (!(await wxMod.locationEnabled())) {
            const { confirmSheet } = await import('../ui.js');
            const go = await confirmSheet({ title: t('폰의 위치가 꺼져 있어요'), text: t('날씨를 가져오려면 폰의 위치 기능을 켜 주세요.'), ok: t('설정 열기') });
            if (go) await wxMod.openSettings('location');
          }
        }
        return save({ weatherAuto: v, weatherAsked: true });
      }, { ico: 'sun', tone: 'amber' })] : []),
    ...(plMod.available() ? [toggleRow(t('일기 쓴 장소 기록'), plOn, t('새 일기에 지금 있는 곳(정확한 위치)을 남겨 발견 › 내가 일기 쓴 곳 지도에 모아요. 이 폰에만 저장돼요.'),
      async (v) => {
        if (v) { const { enablePlace } = await import('./map.js'); return (await enablePlace()) ? true : false; }
        return save({ placeAuto: false });
      }, { ico: 'pin', tone: 'orange', badge: NBm.isNew('place') ? 'NEW' : '' })] : []),
    toggleRow(t('기분부터 고르기'), s.askMood !== false, t('새 일기를 열면 기분과 오늘은 이런 날을 먼저 고르고 써요.'),
      (v) => save({ askMood: v }), { ico: 'heart', tone: 'orange' }),
  ], { ico: 'edit', tone: 'orange' }));

  /* ── 알림 ─────────────────────────────────── */
  const nativeApp = native.isNative();
  root.append(group(t('알림'), [
    toggleRow(t('저녁 알림'), s.reminderOn,
      nativeApp
        ? t('매일 {t}에 알려드려요. 그날 이미 썼으면 건너뜁니다. 앱이 꺼져 있어도 옵니다.', { t: fmtClock(s.reminderTime) })
        : t('매일 {t}에 아직 안 썼으면 알려드려요. (웹에서는 앱이 열려 있을 때만 동작해요)', { t: fmtClock(s.reminderTime) }),
      async (v) => {
        if (v) {
          const ok = await native.requestNotifyPermission();
          if (!ok) { toast(t('알림 권한이 거부되었어요.')); return false; }
        }
        await save({ reminderOn: v });
        const r = await scheduleReminder();
        if (v && r === 'need-exact') await askExactAlarm();
        else if (v) toast(t('알림을 켰어요.'));
        return true;
      }, { ico: 'bell', tone: 'amber' }),
    timeRow(t('알림 시간'), s.reminderTime, async (v) => {
      await save({ reminderTime: v });
      await scheduleReminder();
      toast(t('{v}로 바꿨어요.', { v }));
    }, { ico: 'clock', tone: 'amber' }),
    /* 쉬어 간 날 알림 (1.7.6) — 매일 알림이 꺼져 있을 때만 보인다 (켜면 이쪽은 보내지 않는다) */
    nativeApp && !s.reminderOn ? toggleRow(t('쉬어 간 날 알림'), s.nudgeOn !== false,
      t('하루 넘게 쓰지 않으면 저녁에 한 번만 살짝 알려드려요. 일기 내용은 알림에 보이지 않아요.'),
      async (v) => {
        if (v && !(await native.requestNotifyPermission())) { toast(t('알림 권한이 거부되었어요.')); return false; }
        await save({ nudgeOn: v });
        const m = await import('../nudge.js');
        await m.refresh();
        return true;
      }, { ico: 'bell', tone: 'amber' }) : null,
    s.reminderOn ? linkRow(t('알림 테스트'), nativeApp ? t('5초 뒤에 보내봅니다. 앱을 닫고 기다려보세요.') : t('지금 알림을 하나 보내봅니다.'), '',
      async () => { toast(await native.testNotification()); }, { ico: 'spark', tone: 'amber' }) : null,
  ].filter(Boolean), { ico: 'bell', tone: 'amber' }));

  /* ── 잠금 ─────────────────────────────────── */
  const lockCfg = await store.metaGet('lock', null);
  const locked = !!lockCfg;
  const bioOn = await store.metaGet('bio', false);
  const bioAv = locked ? await native.bioAvailable() : { ok: false };

  root.append(group(t('잠금'), [
    toggleRow(t('비밀번호 사용'), locked,
      locked ? t('앱을 열 때 숫자 네 자리를 물어봅니다. 본문·제목·태그·사진이 AES-256으로 암호화돼요.')
             : t('켜면 숫자 네 자리로 잠그고, 일기 내용이 이 기기 안에서 암호화됩니다.'),
      async (v) => {
        go(v ? '/passcode' : '/passcode?m=off');
        return false;                     // 스위치는 설정 화면이 아니라 그 화면에서 바뀐다
      }, { ico: 'lock', tone: 'violet' }),

    locked ? linkRow(t('비밀번호 변경'), t('현재 비밀번호를 확인한 뒤 새로 정합니다.'), '',
      () => go('/passcode?m=change'), { ico: 'refresh', tone: 'violet' }) : null,

    locked ? toggleRow(t('지문으로 열기'), !!bioOn && bioAv.ok,
      bioAv.ok
        ? t('비밀번호 대신 지문으로 빠르게 열 수 있어요. 비밀번호는 그대로 남습니다.')
        : (native.isNative() ? t('이 기기에 등록된 지문이 없어요. 휴대폰 설정에서 먼저 등록해 주세요.')
                             : t('앱(APK)에서만 쓸 수 있어요. 브라우저에서는 지원되지 않습니다.')),
      async (v) => {
        if (!bioAv.ok) { toast(native.isNative() ? t('기기에 등록된 지문이 없어요.') : t('앱에서만 쓸 수 있어요.')); return false; }
        if (!v) { await native.bioForget(); await store.metaSet('bio', false); toast(t('지문 열기를 껐어요.')); return true; }
        const pass = await pinSheet({
          title: t('비밀번호를 한 번 확인할게요'),
          text: t('지문으로 열려면 비밀번호를 기기의 보안 저장소에 넣어둬야 합니다. 앱은 비밀번호를 따로 보관하지 않으니 지금 한 번만 넣어주세요.'),
        });
        if (!pass) return false;
        const key = await deriveKey(pass, lockCfg.salt, lockCfg.iter || ITER_LEGACY);
        if (!(await checkVerifier(key, lockCfg.verifier))) { toast(t('비밀번호가 맞지 않습니다.')); return false; }
        try {
          await native.bioEnroll(pass);
          await store.metaSet('bio', true);
          toast(t('이제 지문으로 열 수 있어요.'));
          return true;
        } catch { toast(t('지문 등록을 취소했어요.')); return false; }
      }, { ico: 'finger', tone: 'violet' }) : null,

    locked ? linkRow(t('지금 잠그기'), '', '', () => lockNow(), { ico: 'eye', tone: 'violet' }) : null,
  ].filter(Boolean), { ico: 'lock', tone: 'violet' }));

  /* ── 데이터 ───────────────────────────────── */
  const u = await store.usage();
  const trashN = store.trashed().length;
  root.append(group(t('내 데이터'), [
    linkRow(t('백업 파일 내보내기'), t('사진까지 포함한 전체를 암호를 걸어 파일 하나로 저장해요. 폰을 바꿀 때 쓰세요.'), '', exportBackup,
      { ico: 'up', tone: 'orange' }),
    /* PDF (1.6.0) — 날짜·월·연도별 카드 모양. 간직하고 인쇄하는 용도라 맨 위 가까이에 */
    linkRow(t('PDF로 내보내기'), t('일기를 카드 모양으로 묶어 하루·한 달·한 해 단위로 PDF를 만들어요. 인쇄해서 간직할 수 있어요.'),
      plus.canExportPdf() ? '' : 'PLUS',     // 플러스 기능 (미리보기는 누구나)
      () => go('/pdf'), { ico: 'book', tone: 'plum', pill: plus.canExportPdf() ? '' : 'accent', badge: NBm.isNew('pdfDesign') ? 'NEW' : '' }),
    linkRow(t('마크다운으로 내보내기'), t('다른 앱이나 메모장에서 읽을 수 있는 텍스트로.'), '', exportMarkdown,
      { ico: 'fileTxt', tone: 'blue' }),
    linkRow(t('백업 파일 가져오기'), t('다른 기기의 하루칸 백업을 합칩니다.'), '', importBackup,
      { ico: 'down', tone: 'green' }),
    linkRow(t('휴지통'), t('지운 글은 30일간 여기 보관돼요.'), trashN ? t('{n}편', { n: trashN }) : t('비어 있음'), () => go('/trash'),
      { ico: 'trash', tone: 'red' }),
    linkRow(t('저장소 사용량'), u ? t('{n}MB 사용 중', { n: (u.used / 1048576).toFixed(1) }) : t('확인 불가'), '', null,
      { ico: 'db', tone: 'blue' }),
  ], { ico: 'folder', tone: 'blue' }));

  /* ── 의견 보내기 (1.7.4) ─────────────────── */
  root.append(group(t('의견'), [
    linkRow(t('의견 보내기'), t('불편한 점이나 있었으면 하는 기능을 알려 주세요. 좋은 의견은 앱에 반영해요.'), '',
      () => go('/feedback'), { ico: 'quote', tone: 'green' }),
  ], { ico: 'heart', tone: 'green' }));

  /* ── 둘러보기 ─────────────────────────────── */
  const demo = await import('../demo.js');
  const demoOn = demo.isLoaded();
  root.append(group(t('둘러보기'), [
    linkRow(t('사용 안내 다시 보기'), t('처음 설치했을 때 본 안내를 다시 봐요.'), '',
      async () => (await import('../guide.js')).show(), { ico: 'book', tone: 'violet' }),
    linkRow(demoOn ? t('예시 데이터 지우기') : t('예시 데이터로 둘러보기'),
      demoOn ? t('예시로 만든 글만 골라서 지웁니다. 직접 쓴 글은 그대로 남아요.')
             : t('지난 1년치 가상의 일기를 넣어 달력·발견 화면이 어떻게 보이는지 미리 봅니다. 언제든 지울 수 있어요.'),
      '', async () => {
        if (demoOn) {
          const n = await demo.unload();
          toast(t('예시 {n}편을 지웠어요.', { n }));
        } else {
          toast(t('예시 데이터를 만드는 중…'));
          const n = await demo.load();
          toast(t('예시 {n}편을 넣었어요. 달력과 발견을 열어보세요.', { n }));
        }
        go('/settings');
      }, { ico: 'db', tone: 'violet' }),
  ], { ico: 'compass', tone: 'violet' }));

  root.append(group('', [
    dangerRow(t('모든 데이터 지우기'), t('되돌릴 수 없어요. 먼저 백업을 받아두세요.'), wipeAll),
  ]));

  /* ── 정보 ─────────────────────────────────── */
  const about = el('div', { class: 'about' });
  about.innerHTML =
    /* 1.4.2 까지는 한국어로 박혀 있었고(번역 안 됨), '광고 없음·서버 없음'처럼 지금과 맞지 않는
       말도 있었다. 사실만 남기고 번역한다 (2026-10-14 번역 검수) */
    `<div style="font-weight:750;color:var(--muted);margin-bottom:6px">${esc(t('하루칸'))} <span class="tnum" data-ver></span></div>
     <div>${esc(t('하루 한 칸. 쓰기만 하고 끝나는 일기가 아니라, 쌓인 칸이 나에 대해 말해주는 일기장.'))}</div>
     <div style="margin-top:12px">${esc(t('계정 없이 쓰는 일기장이에요. 일기와 사진은 이 기기에만 저장됩니다.'))}</div>`
    + (native.isNative() ? '' : `<div style="margin-top:12px;opacity:.8">${esc(t('단축키(데스크톱): N 새 글 · H 홈 · C 달력 · S 찾기 · I 발견'))}</div>`);
  root.append(about);
  window.Capacitor?.Plugins?.App?.getInfo?.()
    .then(async (i) => {
      const v = about.querySelector('[data-ver]');
      if (!v || !i?.version) return;
      const b = await import('../liveupdate.js').then((m) => m.currentBuild()).catch(() => 0);   // 내려받은 내용 묶음 번호 (1.7.8)
      v.textContent = 'v' + i.version + (b ? ` (${b})` : '');
    })
    .catch(() => {});

  return { title: t('설정') };
}

/* ── 행 만들기 ──────────────────────────────────────
   opts = { ico: 아이콘 이름, tone: 'orange'|'amber'|'green'|'blue'|'violet'|'plum'|'red' }
   선두 아이콘만 의미색을 갖는다 (BRIEF §4-6 결정).
   ------------------------------------------------ */

/* ── 언어 선택 ────────────────────────────────── */
function langName(v) {
  if (!v || v === 'auto') return t('시스템 언어');
  return LANGS.find((l) => l.code === v)?.name || v;
}

/* 고딕·명조는 손글씨 묶음이 아니라서 고르기 창에서만 쓰는 표식 */
const FONT_SANS = '', FONT_SERIF = '__serif';
function fontLabel(F, s) {
  const id = F.currentId();
  if (id) return t(F.setOf(id).name);
  return s.font === 'serif' ? t('명조') : t('고딕');
}

/** 일기 글씨체 고르기: 지금 언어로 된 예문을 그 글꼴로 보여 주고 고른다.
 *  맨 위 두 칸은 고딕(기본)·명조, 그 아래가 손글씨 묶음 */
async function pickDiaryFont() {
  import('../newbadge.js').then((m) => m.used('font'));
  const F = await import('../fonts.js');
  const analytics = await import('../analytics.js');
  await store.saveSettings({ diaryFontSeen: true }, { silent: true });
  const cur = F.currentId() || (store.getSettings().font === 'serif' ? FONT_SERIF : FONT_SANS);
  const box = el('div', { class: 'font-pick' });
  const sample = t('오늘은 바다에 다녀왔다. 바람이 시원했다.');
  const opt = (id, name) => {
    const b = el('button', { class: 'font-opt' + (id === cur ? ' on' : ''), type: 'button' });
    b.append(el('span', { class: 'fo-name' }, esc(name)));
    const sm = el('span', { class: 'fo-sample' }, esc(sample));
    const hand = id && id !== FONT_SERIF;
    if (hand) { sm.style.fontFamily = F.stackFor(id); sm.style.fontSize = (1.18 * F.scaleFor(id)).toFixed(2) + 'rem'; sm.style.lineHeight = '1.45'; F.load(id, undefined, sample).catch(() => {}); }
    else if (id === FONT_SERIF) { sm.style.fontFamily = '"Noto Serif KR", "Nanum Myeongjo", Batang, Georgia, serif'; }
    else { sm.style.fontFamily = '"Noto Sans KR", "Pretendard Variable", system-ui, sans-serif'; }
    b.append(sm);
    b.addEventListener('click', async () => {
      closeSheet();
      /* 고딕·명조를 고르면 손글씨를 끄고 settings.font 를 바꾼다. 손글씨는 diaryFont 만 바꾼다 */
      const patch = hand ? { diaryFont: id } : { diaryFont: '', font: id === FONT_SERIF ? 'serif' : 'sans' };
      await store.saveSettings(patch);                  // 설정 화면이 다시 그려진다
      analytics.design('font:pick:' + (hand ? id : (id === FONT_SERIF ? 'serif' : 'default')));
      applyTheme();                                     // data-font(고딕/명조)와 손글씨(fonts.apply)를 함께 다시 건다
      toast(hand ? t('글씨체를 바꿨어요. 처음 한 번은 글꼴을 내려받아요.') : t('글씨체를 바꿨어요.'));
    });
    return b;
  };
  box.append(opt(FONT_SANS, t('고딕')));
  box.append(opt(FONT_SERIF, t('명조')));
  for (const f of F.FONT_SETS) box.append(opt(f.id, t(f.name)));
  openSheet({ title: t('글씨체'), text: t('처음 고를 때 글꼴을 내려받아요(인터넷이 필요해요). 일기 내용은 보내지 않아요.'), content: box });
}

async function pickLanguage() {
  const s = store.getSettings();
  openSheet({
    title: t('언어'),
    items: [
      { label: t('시스템 언어'), icon: s.language === 'auto' ? 'check' : undefined,
        onClick: () => setLanguage('auto') },
      ...LANGS.filter((l) => l.code !== 'auto').map((l) => ({
        label: l.name, icon: s.language === l.code ? 'check' : undefined,
        onClick: () => setLanguage(l.code),
      })),
    ],
  });
}

async function setLanguage(v) {
  await store.saveSettings({ language: v }, { silent: true });
  await applyLanguage(v);          // 사전 로드 + 고정 문구 + 현재 화면 다시 그리기
}

/* 하루칸 플러스 구매·복원은 1.5.0 부터 plus.js (confirmBuy / restore) 가 맡는다.
   설정과 플러스 화면이 같은 흐름을 쓴다 (views/plusview.js). */

function group(label, rows, opts = {}) {
  const g = el('div', { class: 'set-group' });
  if (label) {
    const lab = el('div', { class: 'set-label' + (opts.tone ? ' ico-' + opts.tone : '') });
    lab.style.color = opts.tone ? 'var(--ico)' : '';
    lab.innerHTML = (opts.ico ? icon(opts.ico) : '') + `<span>${esc(label)}</span>`;
    g.append(lab);
  }
  const list = el('div', { class: 'set-list' });
  for (const r of rows) if (r) list.append(r);
  g.append(list);
  return g;
}

function baseRow(title, sub, opts = {}) {
  const row = el('div', { class: 'set-row' });
  if (opts.ico) {
    row.append(el('div', { class: 'set-ico' + (opts.tone ? ' ico-' + opts.tone : '') }, icon(opts.ico)));
  }
  const main = el('div', { class: 'set-row-main' });
  main.append(el('div', { class: 'set-row-title' }, esc(title) + (opts.badge ? ` <span class="new-pill">${esc(opts.badge)}</span>` : '')));
  if (sub) main.append(el('div', { class: 'set-row-sub' }, esc(sub)));
  row.append(main);
  return { row, main };
}

function linkRow(title, sub, value, onClick, opts = {}) {
  const { row } = baseRow(title, sub, opts);
  if (value) {
    row.append(opts.pill
      ? el('div', { class: 'set-pill pill-' + opts.pill }, esc(value))
      : el('div', { class: 'set-row-val' }, esc(value)));
  }
  if (onClick) {
    row.innerHTML += icon('chev', 'chev');
    row.style.cursor = 'pointer';
    row.addEventListener('click', onClick);
  }
  return row;
}

function dangerRow(title, sub, onClick) {
  const r = linkRow(title, sub, '', onClick, { ico: 'trash', tone: 'red' });
  r.classList.add('danger');
  return r;
}

function toggleRow(title, on, sub, onChange, opts = {}) {
  const { row } = baseRow(title, sub, opts);
  const sw = el('div', { class: 'switch' + (on ? ' on' : ''), role: 'switch', 'aria-checked': String(on) });
  row.append(sw);
  row.style.cursor = 'pointer';
  row.addEventListener('click', async () => {
    const next = !sw.classList.contains('on');
    const ok = await onChange(next);
    if (ok === false) return;
    sw.classList.toggle('on', next);
    sw.setAttribute('aria-checked', String(next));
  });
  return row;
}

/** @param sub 설명 한 줄 (선택). onChange 가 false 를 돌려주면 고른 것을 되돌린다. */
function segmentedRow(title, values, labels, cur, onChange, sub = '') {
  const row = el('div', { class: 'set-row', style: 'flex-direction:column;align-items:stretch;gap:10px' });
  row.append(el('div', { class: 'set-row-title' }, esc(title)));
  const seg = el('div', { class: 'segmented' });
  let on = cur;
  const paint = () => [...seg.children].forEach((c, i) => c.classList.toggle('on', values[i] === on));
  values.forEach((v, i) => {
    const b = el('button', { class: v === cur ? 'on' : '', type: 'button' }, esc(labels[i]));
    b.addEventListener('click', async () => {
      const prev = on;
      on = v;
      paint();
      // 막힌 선택지를 눌렀으면 눌린 채로 두지 않는다 — 켜진 줄 알고 화면을 보러 간다
      if (await onChange(v) === false) { on = prev; paint(); }
    });
    seg.append(b);
  });
  row.append(seg);
  if (sub) row.append(el('div', { class: 'set-row-sub' }, esc(sub)));
  return row;
}

function sliderRow(title, cur, min, max, onChange) {
  const row = el('div', { class: 'set-row', style: 'flex-direction:column;align-items:stretch;gap:8px' });
  const head = el('div', { style: 'display:flex;justify-content:space-between;align-items:baseline' });
  head.append(el('div', { class: 'set-row-title' }, esc(title)));
  const val = el('div', { class: 'set-row-val' }, cur + 'px');
  head.append(val);
  const inp = el('input', { type: 'range', min, max, step: '1', value: cur, style: 'width:100%;accent-color:var(--accent)' });
  inp.addEventListener('input', () => { val.textContent = inp.value + 'px'; onChange(Number(inp.value)); });
  row.append(head, inp);
  return row;
}

function stepperRow(title, valueText, cur, min, max, onChange, sub) {
  const { row } = baseRow(title, sub);
  const box = el('div', { style: 'display:flex;align-items:center;gap:8px' });
  const v = el('div', { class: 'set-row-val', style: 'min-width:54px;text-align:center' }, valueText);
  const mk = (delta, label) => {
    const b = el('button', { class: 'chip', type: 'button', style: 'width:34px;justify-content:center;padding:0' }, label);
    b.addEventListener('click', () => {
      cur = Math.max(min, Math.min(max, cur + delta));
      v.textContent = t('주 {n}회', { n: cur });
      onChange(cur);
    });
    return b;
  };
  box.append(mk(-1, '−'), v, mk(1, '+'));
  row.append(box);
  return row;
}

function timeRow(title, cur, onChange, opts = {}) {
  const { row } = baseRow(title, '', opts);
  const { wrap, input: inp } = timeInput(cur, {
    faceClass: 'set-time',
    faceStyle: 'display:inline-block;background:var(--hue-amber-bg);color:var(--hue-amber-2);'
         + 'border-radius:var(--radius-pill);padding:6px 12px;font-weight:700;font-size:.82rem',
  });
  inp.addEventListener('change', () => { if (inp.value) onChange(inp.value); });
  row.append(wrap);
  return row;
}

/* ── 데이터 동작 ────────────────────────────────── */

/**
 * 백업 암호를 두 번 받는다. 이 암호를 잊으면 백업 파일은 못 연다 —
 * 앱 잠금과 같은 이유로 복구 수단이 없으므로 확인 입력을 반드시 거친다.
 * @returns {Promise<string|null>}
 */
async function askNewBackupPassword() {
  const p1 = await promptSheet({
    title: t('백업 암호 정하기'),
    text: t('이 암호로 백업 파일을 잠급니다. 앱 비밀번호와 달라도 돼요. 잊으면 백업을 열 수 없으니 꼭 기억해 두세요.'),
    placeholder: t('4자 이상'),
    ok: t('다음'),
    type: 'password',
  });
  if (!p1) return null;
  if (p1.length < 4) { toast(t('4자 이상으로 정해주세요.')); return null; }
  const p2 = await promptSheet({
    title: t('한 번 더 입력'),
    text: t('같은 암호를 다시 입력해 주세요.'),
    placeholder: t('백업 암호'),
    ok: t('확인'),
    type: 'password',
  });
  if (p2 === null) return null;
  if (p1 !== p2) { toast(t('두 암호가 서로 달라요.')); return null; }
  return p1;
}

async function exportBackup() {
  const backup = await import('../backup.js');
  const est = await backup.estimate();
  if (!est.entries) { toast(t('내보낼 글이 없어요.')); return; }

  const pw = await askNewBackupPassword();
  if (!pw) return;

  toast(t('백업 파일을 만드는 중…'));
  try {
    const data = await backup.createEncrypted(pw, { includePhotos: true });
    const name = `harukan-backup-${todayKey()}.json`;
    const res = await backup.saveFile(name, JSON.stringify(data));
    await store.saveSettings({ lastBackupAt: Date.now() }, { silent: true });

    if (res.where === 'native') {
      // 저장은 됐다. 이제 다른 폰으로 옮길 수 있게 공유 창을 띄운다.
      const ok = await confirmSheet({
        title: t('{n}편을 저장했어요.', { n: data.summary.entries }),
        text: t('문서 폴더에 “{name}” 으로 저장했습니다. 새 폰으로 옮기려면 드라이브나 메일로 보내두세요.', { name: res.path || name }),
        ok: t('다른 앱으로 보내기'),
      });
      if (ok) await backup.shareFile(res.uri, t('하루칸 백업'));
    } else {
      toast(t('{n}편을 파일로 저장했어요.', { n: data.summary.entries }));
    }
  } catch (e) {
    console.error(e);
    // 실패했으면 절대 성공했다고 말하지 않는다
    toast(t('백업 파일을 저장하지 못했어요. 저장 공간을 확인해 주세요.'));
  }
}

async function exportMarkdown() {
  const backup = await import('../backup.js');
  const md = store.toMarkdown(store.realLive());   // 예시 글은 빼고 (1.6.5)
  const name = `harukan-${todayKey()}.md`;
  try {
    const res = await backup.saveFile(name, md, 'text/markdown');
    if (res.where === 'native') {
      const ok = await confirmSheet({
        title: t('마크다운으로 내보냈어요.'),
        text: t('문서 폴더에 “{name}” 으로 저장했습니다. 이 파일은 암호가 걸려 있지 않아요.', { name: res.path || name }),
        ok: t('다른 앱으로 보내기'),
      });
      if (ok) await backup.shareFile(res.uri, t('하루칸 일기'));
    } else {
      toast(t('마크다운으로 내보냈어요.'));
    }
  } catch (e) {
    console.error(e);
    toast(t('파일을 저장하지 못했어요. 저장 공간을 확인해 주세요.'));
  }
}

async function importBackup() {
  const backup = await import('../backup.js');
  const picked = await backup.pickFile();
  if (!picked) return;

  let data;
  try { data = JSON.parse(picked.text); }
  catch { toast(t('파일을 읽지 못했어요. 하루칸 백업 파일이 맞나요?')); return; }

  const kind = backup.detect(data);
  if (!kind) { toast(t('파일을 읽지 못했어요. 하루칸 백업 파일이 맞나요?')); return; }

  try {
    if (kind === backup.KIND_RAW) return await restoreRaw(data);
    if (kind === backup.KIND_ENC) return await restoreEncrypted(backup, data);
    return await restorePlain(data);                      // 옛 평문 백업
  } catch (e) {
    console.error(e);
    toast(e?.message || t('가져오지 못했어요.'));
  }
}

/** 암호화된 백업 — 암호를 받아 풀고 합친다 */
async function restoreEncrypted(backup, data) {
  const n = data.summary?.entries ?? 0;
  const pw = await promptSheet({
    title: t('백업 암호를 입력하세요'),
    text: t('{n}편이 들어 있어요. 이 백업을 만들 때 정한 암호가 필요합니다.', { n }),
    placeholder: t('백업 암호'),
    ok: t('열기'),
    type: 'password',
  });
  if (!pw) return;

  toast(t('여는 중…'));
  const inner = await backup.decrypt(data, pw);
  if (!inner) { toast(t('암호가 맞지 않아요.')); return; }

  const ok = await confirmSheet({
    title: t('가져올까요?'),
    text: t('{n}편이 들어 있어요. 같은 글은 건너뛰고 없는 글만 추가합니다. 지금 데이터는 지워지지 않아요.',
      { n: (inner.entries || []).length }),
    ok: t('가져오기'),
  });
  if (!ok) return;
  const r = await store.importJSON(inner, { mode: 'merge' });
  toast(t('{n}편을 가져왔어요. (중복 {m}편 제외)', { n: r.added, m: r.skipped }));
}

/** 옛 평문 백업 (version 1) — 그대로 받아준다 */
async function restorePlain(data) {
  const ok = await confirmSheet({
    title: t('가져올까요?'),
    text: t('{n}편이 들어 있어요. 같은 글은 건너뛰고 없는 글만 추가합니다. 지금 데이터는 지워지지 않아요.',
      { n: (data.entries || []).length }),
    ok: t('가져오기'),
  });
  if (!ok) return;
  const r = await store.importJSON(data, { mode: 'merge' });
  toast(t('{n}편을 가져왔어요. (중복 {m}편 제외)', { n: r.added, m: r.skipped }));
}

/**
 * 원본(raw) 백업 되돌리기 — 비밀번호를 잊었을 때 빼둔 그 파일.
 * 암호화된 레코드를 통째로 되돌리므로 지금 데이터를 덮어쓴다.
 * 되돌린 뒤에는 그때 쓰던 비밀번호로 열어야 한다.
 */
async function restoreRaw(data) {
  const n = (data.entries || []).length;
  const ok = await confirmSheet({
    title: t('원본 백업을 되돌릴까요?'),
    text: t('{n}편이 들어 있어요. 이 파일은 그때 쓰던 비밀번호로 잠겨 있습니다. 되돌리면 지금 이 기기의 글과 잠금 설정을 덮어씁니다.', { n }),
    ok: t('되돌리기'),
    danger: true,
  });
  if (!ok) return;
  const r = await store.importRaw(data);
  await confirmSheet({
    title: t('되돌렸어요.'),
    text: t('글 {n}편을 되돌렸습니다. 앱을 다시 시작하면 그때 쓰던 비밀번호로 열 수 있어요.', { n: r.entries }),
    ok: t('확인'),
  });
  location.reload();
}

async function wipeAll() {
  const ok = await confirmSheet({
    title: t('정말 모두 지울까요?'),
    text: t('글, 사진, 설정이 전부 사라집니다. 되돌릴 수 없어요.'),
    ok: t('지우기'), danger: true,
  });
  if (!ok) return;
  const typed = await promptSheet({
    title: t('한 번 더 확인'),
    text: t('확인을 위해 “{단어}”라고 입력해 주세요.', { 단어: t('삭제') }),
    placeholder: t('삭제'), ok: t('영구 삭제'),
  });
  if (typed?.trim() !== t('삭제')) { toast(t('취소했어요.')); return; }
  for (const e of store.all().slice()) await store.hardDelete(e.id);
  await store.metaDel('lock');
  // 배경으로 고른 내 사진도 사진이다 — '글, 사진, 설정이 전부 사라집니다' 에 맞게 같이 지운다
  await theme.clearPhoto();
  if (store.getSettings().bgTheme === 'photo') await store.saveSettings({ bgTheme: 'none' }, { silent: true });
  applyTheme();
  store.setCryptoKey(null);
  toast(t('모두 지웠습니다.'));
  go('/home');
}

/* ── 정확 알람 권한 안내 ────────────────────────
   안드로이드 13+ 는 "정해진 시각에 울리는 알림"에 별도 권한을 요구한다.
   그냥 시스템 화면으로 튕겨보내면 사용자가 왜 이게 뜨는지 모르므로 먼저 설명한다. */
/* askExactAlarm 은 app.js 로 옮겼다 — 일정 알림도 같은 안내를 써야 하는데,
   화면 파일에 갇혀 있으면 다른 화면에서 못 쓴다. */

/* 비밀번호 설정·변경·끄기는 전용 화면(views/passcode.js)에서 처리한다.
   한 번 입력 → 다시 확인하는 흐름이 시트로는 제대로 안 나온다. */
