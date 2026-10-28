/* ===========================================================
   fonts.js — 일기 글씨체 10가지 (1.7.6, 사용자 결정 2026-10-25: 모두 무료)
   언어마다 어울리는 무료 글꼴(OFL)을 짝지어 하나의 '하루칸 글씨체'로 묶었다.
   한 묶음 = 라틴(영어·유럽 특수 문자) + 그 언어 글자(한글·일본어·중국어·태국어·아랍어) 글꼴.

   어디에 쓰나: 앱 전체 글씨와 PDF (2026-10-25 사용자 요청: 일기장만이 아니라 앱 전체로).
   어떻게 받나: 고른 글씨체의 '지금 언어' 글꼴만 Google Fonts 에서 받는다. 글자 조각(unicode-range)
   단위로 쓰는 글자만 받아서 가볍다. 한 번 받으면 웹뷰 캐시에 남는다. 일기 내용은 보내지 않는다
   (글꼴 파일을 요청할 뿐). 인터넷이 없으면 기본 글꼴로 보인다.
   =========================================================== */

import * as store from './store.js';
import { current as i18nCurrent } from './i18n.js';

/* scale: 글꼴마다 같은 크기에서도 보이는 크기가 달라서 맞춘다 (한글 글꼴 기준 koScale) */
export const FONT_SETS = [
  { id: 'pencil',  name: '연필 일기',     la: 'Caveat',                 ko: 'Nanum Pen Script',   ja: 'Klee One',           zh: 'Long Cang',     th: 'Sriracha',   ar: 'Aref Ruqaa',       scale: 1.2,  koScale: 1.32 },
  { id: 'mongle',  name: '몽글몽글',      la: 'Patrick Hand',           ko: 'Gaegu',              ja: 'Yomogi',             zh: 'ZCOOL KuaiLe',  th: 'Mali',       ar: 'Marhey',           scale: 1.1,  koScale: 1.12 },
  { id: 'jelly',   name: '동글 젤리',     la: 'Baloo 2',                ko: 'Jua',                ja: 'Kiwi Maru',          zh: 'ZCOOL KuaiLe',  th: 'Itim',       ar: 'Baloo Bhaijaan 2', scale: 1.0,  koScale: 1.0 },
  { id: 'potato',  name: '감자꽃',        la: 'Indie Flower',           ko: 'Gamja Flower',       ja: 'Yusei Magic',        zh: 'Zhi Mang Xing', th: 'Charmonman', ar: 'Lemonada',         scale: 1.1,  koScale: 1.12 },
  { id: 'melody',  name: '멜로디',        la: 'Shadows Into Light Two', ko: 'Hi Melody',          ja: 'Zen Kurenaido',      zh: 'Long Cang',     th: 'Kodchasan',  ar: 'El Messiri',       scale: 1.12, koScale: 1.22 },
  { id: 'twinkle', name: '반짝 하루',     la: 'Itim',                   ko: 'Single Day',         ja: 'Hachi Maru Pop',     zh: 'ZCOOL KuaiLe',  th: 'Itim',       ar: 'Marhey',           scale: 1.05, koScale: 1.06 },
  { id: 'whisper', name: '소곤 이야기',   la: 'Chilanka',               ko: 'Poor Story',         ja: 'Zen Kurenaido',      zh: 'Zhi Mang Xing', th: 'Kodchasan',  ar: 'Harmattan',        scale: 1.05, koScale: 1.06 },
  { id: 'squishy', name: '말랑 동글',     la: 'Grandstander',           ko: 'Dongle',             ja: 'M PLUS Rounded 1c',  zh: 'ZCOOL KuaiLe',  th: 'Itim',       ar: 'Baloo Bhaijaan 2', scale: 1.0,  koScale: 1.45 },
  { id: 'neat',    name: '단정한 손글씨', la: 'Kalam',                  ko: 'Gowun Dodum',        ja: 'Zen Maru Gothic',    zh: 'ZCOOL XiaoWei', th: 'Mali',       ar: 'Tajawal',          scale: 1.0,  koScale: 1.0 },
  { id: 'brush',   name: '붓펜 필기체',   la: 'Dancing Script',         ko: 'Nanum Brush Script', ja: 'Yuji Syuku',         zh: 'Ma Shan Zheng', th: 'Charm',      ar: 'Aref Ruqaa',       scale: 1.12, koScale: 1.28 },
];

/* 앱 언어 → 그 언어 글자 글꼴 칸 (라틴 문자만 쓰는 언어는 라틴 글꼴만) */
const SCRIPT = { ko: 'ko', ja: 'ja', zh: 'zh', th: 'th', ar: 'ar' };

export function setOf(id) { return FONT_SETS.find((f) => f.id === id) || null; }
export function currentId() { const id = store.getSettings().diaryFont; return setOf(id) ? id : ''; }

/** 이 글씨체를 이 언어로 쓸 때의 글꼴 이름들 (앞이 먼저) */
export function familiesFor(id, lang = i18nCurrent()) {
  const f = setOf(id);
  if (!f) return [];
  const sc = SCRIPT[lang];
  return sc ? [f.la, f[sc]] : [f.la];
}
/* 받지 못한 글자는 원래 앱 글꼴로 (--sans 를 덮어쓰므로 변수가 아니라 이름으로 적는다) */
const BASE = '"Noto Sans KR", "Pretendard Variable", Pretendard, -apple-system, system-ui, Roboto, "Segoe UI", sans-serif';
/** CSS font-family 값 (못 받았으면 기본 글꼴로 넘어간다) */
export function stackFor(id, lang = i18nCurrent()) {
  const fam = familiesFor(id, lang);
  return fam.length ? fam.map((x) => `"${x}"`).join(', ') + ', ' + BASE : '';
}
/** 캔버스(PDF)용 — CSS 변수를 못 쓰니 기본 글꼴 이름을 이어 붙인다 */
export function canvasStack(id, lang = i18nCurrent(), fallback = 'sans-serif') {
  const fam = familiesFor(id, lang);
  return fam.length ? fam.map((x) => `"${x}"`).join(', ') + ', ' + fallback : '';
}
export function scaleFor(id, lang = i18nCurrent()) {
  const f = setOf(id);
  if (!f) return 1;
  return lang === 'ko' ? f.koScale : f.scale;
}

/* ── 받기 ── */
const linked = new Set();
function linkFamilies(fams) {
  const need = fams.filter((x) => !linked.has(x));
  if (!need.length) return;
  need.forEach((x) => linked.add(x));
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = 'https://fonts.googleapis.com/css2?' + need.map((x) => 'family=' + x.replace(/ /g, '+')).join('&') + '&display=swap';
  l.dataset.diaryFont = '1';
  document.head.append(l);
}

/** 글꼴을 받아 둔다 (sample 글자가 들어 있는 조각까지). 실패해도 조용히 기본 글꼴 */
export async function load(id, lang = i18nCurrent(), sample = '') {
  const fam = familiesFor(id, lang);
  if (!fam.length) return false;
  linkFamilies(fam);
  const text = sample || (lang === 'ko' ? '오늘 하루 가나다 Aa' : lang === 'ja' ? '今日 あいう Aa' : lang === 'zh' ? '今天 你好 Aa' : lang === 'th' ? 'วันนี้ Aa' : lang === 'ar' ? 'اليوم Aa' : 'Today Aa ąęłśćğşı');
  try {
    await Promise.race([
      Promise.all(fam.map((x) => document.fonts.load(`24px "${x}"`, text))),
      new Promise((r) => setTimeout(r, 6000)),
    ]);
    return fam.every((x) => document.fonts.check(`24px "${x}"`, text));
  } catch { return false; }
}

/** 지금 설정을 화면에 입힌다 (부팅 · 언어 바꿈 · 글씨체 바꿈) */
export function apply() {
  const id = currentId();
  const root = document.documentElement;
  const props = ['--diary-font', '--sans', '--font-body', '--serif', '--dscale-ui', '--dscale-txt'];
  if (!id) {
    delete root.dataset.dfont;
    for (const p of props) root.style.removeProperty(p);
    return;
  }
  const stack = stackFor(id);
  const sc = scaleFor(id);
  const ui = Math.min(1.15, sc);                // 화면 전체는 조금만 (버튼·글자가 칸을 넘지 않게)
  root.dataset.dfont = id;
  root.style.setProperty('--diary-font', stack);
  root.style.setProperty('--sans', stack);
  root.style.setProperty('--font-body', stack);
  root.style.setProperty('--serif', stack);
  root.style.setProperty('--dscale-ui', String(ui));
  root.style.setProperty('--dscale-txt', (sc / ui).toFixed(3));
  load(id).catch(() => {});
}
