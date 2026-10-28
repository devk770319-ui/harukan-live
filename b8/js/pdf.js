/* ===========================================================
   pdf.js — 일기를 카드 모양 PDF 로 (1.6.0, 2026-10-18 사용자 요청)
   "나중에 추억하도록" 하루·한 달·한 해 단위로 묶어 인쇄할 수 있는 PDF 를 만든다.

   어떻게 만드나
   · 페이지마다 캔버스(A4, 150dpi = 1240×1754)에 직접 그린 뒤 JPEG 으로 굳혀
     PDF 한 쪽에 한 장씩 넣는다. PDF 라이브러리나 한글 글꼴 파일(수 MB)을 앱에 넣지
     않아도 폰에 있는 글꼴로 한글·이모지가 그대로 나온다. 대신 글자를 긁어 복사할 수는
     없다 — 간직하고 인쇄하는 용도라 그쪽을 택했다.
   · 카드 하나가 한 쪽보다 길면 본문 줄 단위로 다음 쪽에 이어서 그린다.
   · 묻어둔 글(아직 열리지 않은)과 휴지통 글은 넣지 않는다 (store.live()).
   =========================================================== */

import * as store from './store.js';
import { moodColor, moodWord, fmtDate, parseKey } from './ui.js';
import { src as stickerSrc } from './stickers.js';
import * as PL from './photolayout.js';
import { t, monthTitle, locale } from './i18n.js';
import { theme, tape } from './pdfthemes.js';
import * as fontsMod from './fonts.js';

export const PAGE_W = 1240;
export const PAGE_H = 1754;
const M = 84;                     // 바깥 여백
const PHOTO_MAX_ONE = 1080;       // 사진 한 장의 최대 높이 (세로 사진도 잘리지 않게, 1.7.3)
const PHOTO_MAX_TWO = 720;        // 두 장 한 줄의 최대 높이
const PAD = 46;                   // 카드 안쪽 여백
const GAP = 34;                   // 카드 사이
const FOOT = 70;                  // 아래 쪽번호 자리

/* 디자인 (1.7.5) — build() 가 opts.theme 으로 바꾼다. 기본은 예전 카드 */
let TH = theme('card');
let C = TH.C;
const SERIF = '"Noto Serif KR", "Noto Serif CJK KR", "Nanum Myeongjo", "Source Han Serif K", Batang, serif';

function fontFamily() {
  /* 일기 글씨체를 골랐으면 그 글꼴로 (1.7.6). 받지 못했으면 아래 기본 글꼴로 넘어간다 */
  const dfont = fontsMod.currentId();
  if (dfont) return fontsMod.canvasStack(dfont, undefined, '"Noto Sans KR", "Pretendard Variable", "Noto Sans CJK KR", sans-serif');
  const serif = store.getSettings().font === 'serif';
  return serif
    ? '"Noto Serif KR", "Nanum Myeongjo", "Noto Serif CJK KR", Batang, serif'
    : '"Noto Sans KR", "Pretendard Variable", Pretendard, "Noto Sans CJK KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
}
/* 손글씨 일기 글씨체는 같은 크기에서 작게 보여 조금 키운다 (줄 높이 안에서 넘치지 않게 1.2배까지) */
const dScale = () => (fontsMod.currentId() ? Math.min(1.2, fontsMod.scaleFor(fontsMod.currentId())) : 1);
const F = (size, weight = 400) => `${fontsMod.currentId() ? 400 : weight} ${Math.round(size * dScale())}px ${fontFamily()}`;
/** 날짜·제목 글꼴 — 명조 디자인(미니멀)은 명조로 */
const FH = (size, weight = 400) => (TH.serifHead ? `${weight} ${size}px ${SERIF}` : F(size, weight));

/* ── 고를 수 있는 묶음 ─────────────────────────────── */

/** 내보낼 수 있는 글 (휴지통·묻어둔 글 제외), 오래된 순 */
export function exportable() {
  return store.realLive().slice().reverse();   // 예시(둘러보기) 글은 빼고 (1.6.5)
}

/**
 * 단위별로 고를 수 있는 묶음 목록 (최신순)
 * @param {'day'|'month'|'year'} unit
 * @returns {{key:string, label:string, count:number}[]}
 */
export function periods(unit) {
  const map = new Map();
  for (const e of exportable()) {
    const key = unit === 'year' ? e.date.slice(0, 4) : unit === 'month' ? e.date.slice(0, 7) : e.date;
    map.set(key, (map.get(key) || 0) + 1);
  }
  return [...map.entries()].sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([key, count]) => ({ key, count, label: periodLabel(unit, key) }));
}

export function periodLabel(unit, key) {
  if (unit === 'year') {
    try { return new Intl.DateTimeFormat(locale(), { year: 'numeric' }).format(new Date(Number(key), 0, 1)); }
    catch { return key; }
  }
  if (unit === 'month') { const [y, m] = key.split('-').map(Number); return monthTitle(y, m); }
  return fmtDate(key, { year: true });
}

export function entriesFor(unit, key) {
  return exportable().filter((e) => e.date.startsWith(key));
}

/* ── 글자 줄바꿈 ────────────────────────────────── */

/** 한 문단을 폭에 맞게 줄로 나눈다. 띄어쓰기 단위로 끊고, 한 낱말이 폭보다 길면 글자 단위로 */
function wrap(ctx, text, width) {
  const out = [];
  for (const para of String(text).split('\n')) {
    if (!para.trim()) { out.push(''); continue; }
    const words = para.split(/(\s+)/);
    let line = '';
    for (const w of words) {
      const next = line + w;
      if (ctx.measureText(next).width <= width) { line = next; continue; }
      if (line.trim()) { out.push(line.trimEnd()); line = w.trimStart(); }
      else line = w;
      // 낱말 하나가 줄보다 길면 글자 단위로 자른다
      while (ctx.measureText(line).width > width) {
        let i = line.length;
        while (i > 1 && ctx.measureText(line.slice(0, i)).width > width) i--;
        out.push(line.slice(0, i));
        line = line.slice(i);
      }
    }
    if (line.trim()) out.push(line.trimEnd());
  }
  // 끝에 붙은 빈 줄은 버린다
  while (out.length && !out[out.length - 1]) out.pop();
  return out;
}

/* ── 그림 불러오기 ───────────────────────────────── */
function loadImg(url) {
  return new Promise((res) => {
    if (!url) return res(null);
    const im = new Image();
    im.onload = () => res(im);
    im.onerror = () => res(null);
    im.src = url;
  });
}

/* ── 카드 한 장을 '블록' 들로 나눈다 ───────────────────
   블록 = 쪽을 넘길 때 쪼갤 수 있는 최소 단위. 본문은 줄마다 블록이다. */
async function cardBlocks(ctx, e, inner, { photos = true } = {}) {
  const blocks = [];
  // 머리: 큰 날짜 숫자 + 날짜·요일 + 기분
  blocks.push({ kind: 'head', h: 112, e });
  if (e.title) {
    ctx.font = FH(42, 800);
    for (const ln of wrap(ctx, e.title, inner)) blocks.push({ kind: 'title', h: 58, text: ln });
    blocks.push({ kind: 'space', h: 10 });
  }
  if (e.chips?.length) {
    ctx.font = F(24, 700);
    const chips = e.chips.map((c) => t(c));
    // 칩을 줄 단위로 배치
    let row = [], w = 0;
    const rows = [];
    for (const c of chips) {
      const cw = ctx.measureText(c).width + 36;
      if (w + cw > inner && row.length) { rows.push(row); row = []; w = 0; }
      row.push({ text: c, w: cw }); w += cw + 10;
    }
    if (row.length) rows.push(row);
    for (const r of rows) blocks.push({ kind: 'chips', h: 56, row: r });
    blocks.push({ kind: 'space', h: 12 });
  }
  /* 1.7.5: 자리·크기를 정한 사진이 있으면 글과 사진을 쓴 순서대로 놓는다 (inlineBlocks). 없으면 예전 그대로 */
  if (photos && e.photos?.length && (PL.hasInline(e) || PL.hasSizes(e) || PL.hasCollages(e))) {
    await inlineBlocks(ctx, e, inner, blocks);
  } else if (photos && e.photos?.length) {
    /* 1.7.3: 사진을 자르지 않고 원본 비율 그대로 넣는다 (사용자 요청 — 예전엔 칸에 맞춰 위아래를 잘랐다).
       모든 사진을 넣는다(예전엔 4장까지). 한 장은 크게, 여러 장은 두 장씩 한 줄로, 줄 높이는 더 긴 사진에 맞춘다 */
    const imgs = (await Promise.all(e.photos.map(async (id) => loadImg(await store.getPhoto(id))))).filter(Boolean);
    if (imgs.length === 1) {
      const im = imgs[0];
      const h = Math.min(PHOTO_MAX_ONE, Math.round(inner * im.height / im.width));
      blocks.push({ kind: 'photos', h: h + 22, imgs, layout: 'one', ph: h });
    } else if (imgs.length) {
      const cell = (inner - 16) / 2;
      for (let i = 0; i < imgs.length; i += 2) {
        const pair = imgs.slice(i, i + 2);
        const ph = Math.min(PHOTO_MAX_TWO, Math.round(Math.max(...pair.map((im) => cell * im.height / im.width))));
        blocks.push({ kind: 'photos', h: ph + 16, imgs: pair, layout: 'two', ph });
      }
      blocks.push({ kind: 'space', h: 6 });
    }
  }
  const body = (e.body || '').trim();
  if (body && !(photos && e.photos?.length && (PL.hasInline(e) || PL.hasSizes(e) || PL.hasCollages(e)))) {
    ctx.font = F(31, 400);
    for (const ln of wrap(ctx, body, inner)) blocks.push({ kind: 'line', h: ln ? 54 : 28, text: ln });
  }
  /* 오늘의 노래 (1.7.9): 한 줄로 */
  if (e.song && (e.song.t || e.song.a)) {
    blocks.push({ kind: 'space', h: 10 });
    ctx.font = F(31, 400);
    for (const ln of wrap(ctx, '♪ ' + [e.song.t, e.song.a].filter(Boolean).join(' · '), inner)) blocks.push({ kind: 'line', h: 54, text: ln });
  }
  if (e.tags?.length) {
    blocks.push({ kind: 'space', h: 14 });
    ctx.font = F(24, 650);
    const text = e.tags.map((x) => '#' + x).join('   ');
    for (const ln of wrap(ctx, text, inner)) blocks.push({ kind: 'tags', h: 40, text: ln });
  }
  return blocks;
}

/** 글 사이 사진·크기를 정한 사진 (1.7.5): 맨 위 묶음 → 글 → 사진 → 글 … 앱에서 보이는 순서대로.
    사진은 한 줄에 한 장, 자르지 않고 크기(작게 42% · 중간 66% · 크게 100%)대로 가운데에 */
async function inlineBlocks(ctx, e, inner, blocks) {
  const { top, flow } = PL.split(e);
  const addPhoto = async (pid) => {
    const im = await loadImg(await store.getPhoto(pid));
    if (!im) return;
    const scale = PL.widthOf(e, pid);                       // 자유 크기 (1.7.9)
    const h = Math.min(PHOTO_MAX_ONE, Math.round(inner * scale * im.height / im.width));
    /* 회전 (1.7.9): 돌린 모양이 자기 칸 너비에 들어오게 줄이고, 높이는 돌린 모양만큼 */
    const rot = PL.rotOf(e, pid);
    const w1 = Math.round(inner * scale);
    const rb = rot ? PL.rotBox(h / Math.max(1, w1), rot) : null;
    const bh = rb ? Math.round(rb.bh * w1) : h;
    blocks.push({ kind: 'photos', h: bh + 22, imgs: [im], layout: 'one', ph: h, bh, scale, align: PL.alignOf(e, pid), rot, sc: rb?.sc || 1 });
  };
  const addText = (text) => {
    const tx = (text || '').replace(/^\n+|\n+$/g, '');
    if (!tx.trim()) return;
    ctx.font = F(31, 400);
    for (const ln of wrap(ctx, tx, inner)) blocks.push({ kind: 'line', h: ln ? 54 : 28, text: ln });
  };
  /* 사진 묶음(콜라주): 틀 비율 그대로 한 덩어리로, 칸마다 보이는 부분(fx·fy)에 맞춰 잘라 채운다 */
  const addCollage = async (ch) => {
    const T = PL.TEMPLATES[ch.t];
    const cells = [];
    for (let i = 0; i < T.cells.length; i++) {
      const pid = ch.pids[i];
      const im = pid ? await loadImg(await store.getPhoto(pid)) : null;
      cells.push({ im, rect: T.cells[i], focus: pid ? PL.focusOf(e, pid) : null });
    }
    const h = Math.min(PHOTO_MAX_ONE, Math.round(inner * T.ratio));
    blocks.push({ kind: 'collage', h: h + 22, ph: h, T, cells });
  };
  const addPhotos = async (pids) => {
    for (const ch of PL.chunks(e, pids)) {
      if (ch.cid) await addCollage(ch); else await addPhoto(ch.pid);
    }
  };
  await addPhotos(top);
  if (top.length) blocks.push({ kind: 'space', h: 6 });
  for (const seg of flow) {
    if (seg.photos) await addPhotos(seg.photos);
    else addText(seg.text);
  }
}

/** 칸을 꽉 채우게(잘라서) 그린다. 보이는 부분 fx·fy(0~1) 를 기준으로 자른다 (사진 묶음, 1.7.5) */
function coverImage(c, im, x, y, w, h, r, fx = 0.5, fy = 0.5) {
  const s = Math.max(w / im.width, h / im.height);
  const sw = w / s, sh = h / s;
  const sx = (im.width - sw) * fx, sy = (im.height - sh) * fy;
  c.save();
  roundRect(c, x, y, w, h, r);
  c.clip();
  c.drawImage(im, sx, sy, sw, sh, x, y, w, h);
  c.restore();
}

/* ── 그리기 ───────────────────────────────────── */

function roundRect(ctx, x, y, w, h, r) {
  if (!r) { ctx.beginPath(); ctx.rect(x, y, w, h); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawCover(ctx, { title, sub, list }) {
  TH.page(ctx, PAGE_W, PAGE_H, G, 'cover');
  // 하루칸 모자이크 — 그 기간의 글마다 기분 색 한 칸
  const cols = 14, cell = 52, gap = 10;
  const shown = list.slice(0, cols * 8);
  const used = Math.max(1, Math.min(cols, shown.length));     // 글이 적으면 그 폭만큼 가운데로
  const gw = used * cell + (used - 1) * gap;
  const x0 = (PAGE_W - gw) / 2;
  const rows = Math.max(1, Math.ceil(shown.length / cols));
  const y0 = 760 - rows * (cell + gap);
  shown.forEach((e, i) => {
    const x = x0 + (i % cols) * (cell + gap);
    const y = y0 + Math.floor(i / cols) * (cell + gap);
    ctx.fillStyle = e.mood ? moodColor(e.mood, { light: 66 }) : C.accentBg;
    roundRect(ctx, x, y, cell, cell, TH.coverR ?? 12); ctx.fill();
  });
  /* 모눈·스크랩북은 제목 위에 테이프 한 줄 */
  if (TH.mat) tape(ctx, PAGE_W / 2, 868, 300, 64, -0.03, TH === theme('scrap') ? '#e9b9a3' : '#f1d98a', 0.7);
  ctx.textAlign = 'center';
  ctx.fillStyle = C.accent;
  ctx.font = F(34, 800);
  ctx.fillText(t('하루칸'), PAGE_W / 2, 880);
  ctx.fillStyle = C.ink;
  ctx.font = FH(86, TH.dayWeight || 800);
  ctx.fillText(title, PAGE_W / 2, 1000);
  ctx.fillStyle = C.muted;
  ctx.font = F(34, 500);
  ctx.fillText(sub, PAGE_W / 2, 1070);
  ctx.fillStyle = C.faint;
  ctx.font = F(26, 500);
  ctx.fillText(t('하루 한 칸. 쌓인 칸이 나에 대해 말해주는 일기장.'), PAGE_W / 2, PAGE_H - 150);
  ctx.textAlign = 'left';
}

function drawPageBase(ctx, pageNo, footLabel) {
  TH.page(ctx, PAGE_W, PAGE_H, G, pageNo);
  ctx.fillStyle = C.faint;
  ctx.font = F(22, 600);
  ctx.textAlign = 'left';
  ctx.fillText(t('하루칸') + ' · ' + footLabel, M, PAGE_H - 42);
  ctx.textAlign = 'right';
  ctx.fillText(String(pageNo), PAGE_W - M, PAGE_H - 42);
  ctx.textAlign = 'left';
}

async function drawSegment(ctx, seg, x, y, w, stickerCache) {
  const { e, blocks, cont } = seg;
  const h = seg.h;
  // 카드 틀 (기분 표시 포함) — 디자인마다 다르다
  TH.card(ctx, x, y, w, h, e, G);
  let pk = 0;                     // 이 카드에서 몇 번째 사진인지 (스크랩북 사진 기울기)

  const ix = x + PAD + 6, iw = w - PAD * 2 - 6;
  let cy = y + PAD - 6;
  for (const b of blocks) {
    if (b.kind === 'head') {
      const d = parseKey(e.date);
      ctx.font = FH(76, TH.dayWeight || 800);
      const dn = String(d.getDate());
      const dw = ctx.measureText(dn).width + 26;
      TH.headDeco?.(ctx, ix, cy, dw, e);
      ctx.fillStyle = TH.dayColor?.(e) || C.accent;
      ctx.fillText(dn, ix, cy + 76);
      ctx.fillStyle = C.ink;
      ctx.font = FH(30, 700);
      ctx.fillText(fmtDate(e.date, { year: true }) + (cont ? ' · ' + t('이어서') : ''), ix + dw, cy + 40);
      ctx.font = F(25, 600);
      ctx.fillStyle = C.muted;
      let mx = ix + dw;
      if (e.mood) {
        ctx.fillStyle = moodColor(e.mood, { light: 58 });
        ctx.beginPath(); ctx.arc(mx + 10, cy + 70, 10, 0, Math.PI * 2); ctx.fill();
        mx += 30;
        ctx.fillStyle = C.muted;
        ctx.fillText(t('{기분} 하루', { 기분: moodWord(e.mood) }), mx, cy + 79);
      }
      // 첫 스티커 하나를 모서리에 (홈 카드와 같은 장식)
      const s0 = !cont && e.stickers?.[0]?.s;
      if (s0) {
        let im = stickerCache.get(s0);
        if (im === undefined) { im = await loadImg(stickerSrc(s0)); stickerCache.set(s0, im); }
        if (im) {
          ctx.save();
          ctx.translate(x + w - 92, y + 64);
          ctx.rotate(-0.12);
          const sw = 118, sh = sw * im.height / im.width;
          ctx.drawImage(im, -sw / 2, -sh / 2, sw, sh);
          ctx.restore();
        }
      }
    } else if (b.kind === 'title') {
      ctx.fillStyle = C.ink; ctx.font = FH(42, 800);
      ctx.fillText(b.text, ix, cy + 44);
    } else if (b.kind === 'chips') {
      ctx.font = F(24, 700);
      let cx = ix;
      for (const c of b.row) {
        ctx.fillStyle = C.chip;
        roundRect(ctx, cx, cy + 6, c.w, 42, 21); ctx.fill();
        ctx.fillStyle = C.muted;
        ctx.fillText(c.text, cx + 18, cy + 36);
        cx += c.w + 10;
      }
    } else if (b.kind === 'photos') {
      if (b.layout === 'one') {
        /* 크기를 줄인 사진(1.7.5)은 가운데 좁은 칸에 */
        const w1 = Math.round(iw * (b.scale || 1));
        const x1 = b.align === 'l' ? ix : b.align === 'r' ? ix + iw - w1 : ix + Math.round((iw - w1) / 2);   // 좌우 자리 (1.7.9)
        if (b.rot) {
          ctx.save();
          ctx.translate(x1 + w1 / 2, cy + 6 + (b.bh || b.ph) / 2);
          ctx.rotate((b.rot * Math.PI) / 180);
          ctx.scale(b.sc || 1, b.sc || 1);
          TH.photo(ctx, b.imgs[0], -w1 / 2, -b.ph / 2, w1, b.ph, pk++, G);
          ctx.restore();
        } else TH.photo(ctx, b.imgs[0], x1, cy + 6, w1, b.ph, pk++, G);
      } else {
        const cell = (iw - 16) / 2;
        b.imgs.forEach((im, i) => TH.photo(ctx, im, ix + i * (cell + 16), cy + 6, cell, b.ph, pk++, G));
      }
    } else if (b.kind === 'collage') {
      /* 사진 묶음: 칸 사이 8px. 빈 칸은 연한 바탕 */
      /* 디자인에 따라 묶음 전체를 흰 틀(mat) 안에 넣는다 */
      const m = TH.mat || 0;
      if (m) {
        ctx.save();
        ctx.shadowColor = 'rgba(50,40,30,.18)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
        ctx.fillStyle = '#fffefb'; ctx.fillRect(ix, cy + 6, iw, b.ph);
        ctx.restore();
      }
      const gx = ix + m, gy = cy + 6 + m, gw = iw - m * 2, gh = b.ph - m * 2;
      const GP = TH.gap ?? 8, T = b.T, cw = (gw - GP * (T.cols - 1)) / T.cols, chh = (gh - GP * (T.rows - 1)) / T.rows;
      const R = TH.cellR ?? 14;
      for (const cell of b.cells) {
        const [cc, rr, cs, rs] = cell.rect;
        const x = gx + cc * (cw + GP), y = gy + rr * (chh + GP), w = cw * cs + GP * (cs - 1), h = chh * rs + GP * (rs - 1);
        if (cell.im) coverImage(ctx, cell.im, x, y, w, h, R, cell.focus.x, cell.focus.y);
        else { ctx.fillStyle = C.accentBg; roundRect(ctx, x, y, w, h, R); ctx.fill(); }
      }
    } else if (b.kind === 'line') {
      ctx.fillStyle = C.ink; ctx.font = F(31, 400);
      if (b.text) ctx.fillText(b.text, ix, cy + 38);
    } else if (b.kind === 'tags') {
      ctx.fillStyle = C.tag || C.accent; ctx.font = F(24, 650);
      ctx.fillText(b.text, ix, cy + 28);
    }
    cy += b.h;
  }

}

const G = { roundRect: (...a) => roundRect(...a), containImage: (...a) => containImage(...a), coverImage: (...a) => coverImage(...a) };

/** 사진 전체가 보이게(자르지 않고) 칸 가운데에 그린다. 모서리는 사진 자체에 둥글게 (1.7.3) */
function containImage(c, im, x, y, w, h, r) {
  const s = Math.min(w / im.width, h / im.height);
  const dw = Math.round(im.width * s), dh = Math.round(im.height * s);
  const dx = Math.round(x + (w - dw) / 2), dy = Math.round(y + (h - dh) / 2);
  c.save(); roundRect(c, dx, dy, dw, dh, Math.min(r, dw / 4, dh / 4)); c.clip();
  c.drawImage(im, dx, dy, dw, dh);
  c.restore();
}

/** 칸을 꽉 채우게(넘치는 쪽은 잘라서) 그린다 */
function fitImage(c, im, dx, dy, dw, dh) {
  const s = Math.max(dw / im.width, dh / im.height);
  const sw = dw / s, sh = dh / s;
  c.drawImage(im, (im.width - sw) / 2, (im.height - sh) / 2, sw, sh, dx, dy, dw, dh);
}

/* ── 쪽 나누기 ──────────────────────────────────────
   카드들을 쪽에 차례로 얹는다. 카드가 남은 자리에 안 들어가면
   (1) 카드 전체가 한 쪽에 들어가는 크기면 다음 쪽으로 넘기고
   (2) 한 쪽보다 길면 들어가는 데까지 그리고 나머지는 다음 쪽에서 '이어서' 그린다. */
async function layout(ctx, entries, opts) {
  const w = PAGE_W - M * 2;
  const inner = w - PAD * 2 - 6;
  const top = M, bottom = PAGE_H - M - FOOT + 30;
  const pages = [];
  let cur = []; let y = top;
  const newPage = () => { if (cur.length) pages.push(cur); cur = []; y = top; };
  for (const e of entries) {
    let blocks = await cardBlocks(ctx, e, inner, opts);
    let cont = false;
    while (blocks.length) {
      const need = blocks.reduce((s, b) => s + b.h, 0) + PAD * 2 - 12;
      const room = bottom - y;
      const full = bottom - top;
      if (need <= room) {
        cur.push({ e, blocks, cont, y, h: need });
        y += need + GAP;
        blocks = [];
      } else if (need <= full && cur.length) {
        newPage();                        // 통째로 다음 쪽으로
      } else {
        // 들어가는 데까지 자른다 (최소 머리+몇 줄은 들어갈 자리가 있어야)
        if (room < 300 && cur.length) { newPage(); continue; }
        let h = PAD * 2 - 12, n = 0;
        const avail = bottom - y;
        while (n < blocks.length && h + blocks[n].h <= avail) { h += blocks[n].h; n++; }
        if (n === 0) {
          // 블록 하나(큰 사진)가 쪽보다 크다 — 줄여서라도 넣는다
          const b = blocks[0];
          const scale = (avail - (PAD * 2 - 12) - 20) / b.h;
          b.ph = Math.max(200, Math.floor(b.ph * scale)); b.h = b.ph + 22;
          continue;
        }
        /* 머리(날짜·제목·칩)만 들어가고 내용이 다음 쪽으로 넘어가면 빈 카드가 남는다 (1.7.5 발견).
           카드를 통째로 다음 쪽에서 시작한다. 쪽 맨 위인데도 그렇다면 다음 블록(큰 사진)을 줄여 넣는다 */
        const HEADISH = ['head', 'title', 'chips', 'space'];
        if (n < blocks.length && blocks.slice(0, n).every((b) => HEADISH.includes(b.kind))) {
          if (cur.length) { newPage(); continue; }
          const b = blocks[n];
          if ((b.kind === 'photos' || b.kind === 'collage') && b.ph) {
            const scale = (avail - h - 20) / b.h;
            const nph = Math.max(200, Math.floor(b.ph * scale));
            if (scale > 0 && scale < 1 && nph < b.ph) { b.ph = nph; b.h = b.ph + 22; continue; }   // 줄어들 때만 (무한 반복 방지)
          }
        }
        cur.push({ e, blocks: blocks.slice(0, n), cont, y, h });
        blocks = [{ kind: 'head', h: 112, e }, ...blocks.slice(n)];
        cont = true;
        newPage();
      }
    }
  }
  newPage();
  return pages;
}

/* ── PDF 쓰기 ──────────────────────────────────────
   쪽마다 JPEG 한 장(DCTDecode)을 A4 에 꽉 차게 놓는 가장 단순한 PDF 1.4 */
function pdfFromJpegs(jpegs) {
  const enc = new TextEncoder();
  const parts = [];
  let offset = 0;
  const offsets = [];
  const push = (x) => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); offset += b.length; };
  const obj = (n, body) => { offsets[n] = offset; push(`${n} 0 obj\n`); for (const b of body) push(b); push('\nendobj\n'); };

  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  const n = jpegs.length;
  // 1: catalog, 2: pages, 그 다음 쪽마다 (page, content, image) 3개
  const kids = [];
  for (let i = 0; i < n; i++) kids.push(`${3 + i * 3} 0 R`);
  obj(1, ['<< /Type /Catalog /Pages 2 0 R >>']);
  obj(2, [`<< /Type /Pages /Count ${n} /Kids [${kids.join(' ')}] >>`]);
  const pw = 595.28, ph = 841.89;
  jpegs.forEach((j, i) => {
    const p = 3 + i * 3;
    const content = `q ${pw} 0 0 ${ph} 0 0 cm /Im0 Do Q`;
    obj(p, [`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pw} ${ph}] /Resources << /XObject << /Im0 ${p + 2} 0 R >> >> /Contents ${p + 1} 0 R >>`]);
    obj(p + 1, [`<< /Length ${content.length} >>\nstream\n${content}\nendstream`]);
    obj(p + 2, [`<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.bytes.length} >>\nstream\n`, j.bytes, '\nendstream']);
  });
  const xref = offset;
  const total = 3 + n * 3;
  let x = `xref\n0 ${total}\n0000000000 65535 f \n`;
  for (let i = 1; i < total; i++) x += String(offsets[i]).padStart(10, '0') + ' 00000 n \n';
  push(x);
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}

/* 한 쪽마다 화면에 차례를 넘긴다. setTimeout(0) 은 화면이 가려지면 1초씩 늦어져
   (폰을 잠깐 끄거나 다른 앱을 보면) 50쪽이면 분 단위로 느려진다. MessageChannel 은 그렇지 않다. */
function breathe() {
  return new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
}

/* toBlob 이 아니라 toDataURL 을 쓴다 (1.6.4). 안드로이드 웹뷰(갤럭시 S25)에서 toBlob 은 한 쪽에
   4초씩 걸렸고 toDataURL 은 0.08초였다 — 한 달짜리 5쪽이 25초, 한 해면 몇 분이었다. */
function canvasToJpeg(cv, q = 0.84) {
  const url = cv.toDataURL('image/jpeg', q);
  const b64 = url.slice(url.indexOf(',') + 1);
  if (!b64) throw new Error('그림을 만들지 못했어요');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/**
 * PDF 를 만든다.
 * @param {object[]} entries 오래된 순
 * @param {{title:string, sub:string, footLabel:string, cover?:boolean, photos?:boolean,
 *          onProgress?:(done:number,total:number)=>void, maxPages?:number}} opts
 * @returns {Promise<{blob: Blob, pages: number}>}
 */
export async function build(entries, opts) {
  TH = theme(opts.theme);
  C = TH.C;
  if (fontsMod.currentId()) await fontsMod.load(fontsMod.currentId());      // 캔버스는 받은 글꼴만 그린다
  try { const st = await import('./stickers.js'); await st.prepareCaptions(); } catch { /* 위로 스티커 문구 */ }
  if (document.fonts?.ready) { try { await document.fonts.ready; } catch { /* 그대로 */ } }
  const cv = document.createElement('canvas');
  cv.width = PAGE_W; cv.height = PAGE_H;
  const ctx = cv.getContext('2d');
  ctx.textBaseline = 'alphabetic';

  const pages = await layout(ctx, entries, { photos: opts.photos !== false });
  const total = pages.length + (opts.cover ? 1 : 0);
  const limit = opts.maxPages ?? Infinity;
  const jpegs = [];
  const stickerCache = new Map();
  let no = 0;
  if (opts.cover && jpegs.length < limit) {
    drawCover(ctx, { title: opts.title, sub: opts.sub, list: entries });
    jpegs.push({ w: PAGE_W, h: PAGE_H, bytes: await canvasToJpeg(cv) });
    opts.onProgress?.(++no, total);
  }
  for (const pg of pages) {
    if (jpegs.length >= limit) break;
    drawPageBase(ctx, jpegs.length + 1, opts.footLabel);
    for (const seg of pg) await drawSegment(ctx, seg, M, seg.y, PAGE_W - M * 2, stickerCache);
    jpegs.push({ w: PAGE_W, h: PAGE_H, bytes: await canvasToJpeg(cv) });
    opts.onProgress?.(++no, total);
    await breathe();     // 화면이 멈추지 않게 한 쪽마다 숨 돌린다
  }
  cv.width = cv.height = 0;
  return { blob: pdfFromJpegs(jpegs), pages: total, jpegs };
}

/** 디자인 고르기 칸의 작은 그림 (실제 그리기 코드로 그린다 — 고른 모양 그대로) */
const thumbCache = new Map();
export function themeThumb(id) {
  if (thumbCache.has(id)) return thumbCache.get(id);
  const th = theme(id);
  const S = 0.2;
  const cv = document.createElement('canvas');
  cv.width = Math.round(PAGE_W * S); cv.height = Math.round(PAGE_H * S);
  const ctx = cv.getContext('2d');
  ctx.scale(S, S);
  const keepTH = TH, keepC = C;
  TH = th; C = th.C;
  try {
    th.page(ctx, PAGE_W, PAGE_H, G, 'thumb');
    /* 가짜 사진: 하늘·바다 색 */
    const ph = document.createElement('canvas'); ph.width = 400; ph.height = 280;
    const pc = ph.getContext('2d');
    const g = pc.createLinearGradient(0, 0, 0, 280); g.addColorStop(0, '#9cc9e8'); g.addColorStop(0.62, '#e8f1f6'); g.addColorStop(0.63, '#4f90b5'); g.addColorStop(1, '#2f6f95');
    pc.fillStyle = g; pc.fillRect(0, 0, 400, 280);
    pc.fillStyle = '#f6d36b'; pc.beginPath(); pc.arc(300, 70, 34, 0, Math.PI * 2); pc.fill();
    const w = PAGE_W - M * 2;
    const cards = [
      { e: { id: 'a', date: '2026-10-24', mood: { v: 0.7, e: 0.3 } }, y: M, h: 900, photo: true },
      { e: { id: 'b', date: '2026-10-25', mood: { v: -0.3, e: -0.5 } }, y: M + 960, h: 560, photo: false },
    ];
    for (const c of cards) {
      th.card(ctx, M, c.y, w, c.h, c.e, G);
      const ix = M + PAD + 6, iw = w - PAD * 2 - 6;
      ctx.font = FH(96, th.dayWeight || 800);
      const dn = c.e.date.slice(8);
      const dw = ctx.measureText(dn).width + 26;
      th.headDeco?.(ctx, ix, c.y + 34, dw, c.e);
      ctx.fillStyle = th.dayColor?.(c.e) || th.C.accent;
      ctx.fillText(dn, ix, c.y + 130);
      ctx.fillStyle = th.C.ink; ctx.globalAlpha = 0.75;
      ctx.fillRect(ix + dw, c.y + 70, 380, 26);
      ctx.globalAlpha = 1;
      let yy = c.y + 190;
      if (c.photo) { th.photo(ctx, ph, ix, yy, iw, 470, 0, G); yy += 520; }
      ctx.fillStyle = th.C.muted; ctx.globalAlpha = 0.35;
      for (let i = 0; i < (c.photo ? 3 : 5); i++) { ctx.fillRect(ix, yy + i * 62, i === (c.photo ? 2 : 4) ? iw * 0.55 : iw, 22); }
      ctx.globalAlpha = 1;
    }
  } finally { TH = keepTH; C = keepC; }
  const url = cv.toDataURL('image/jpeg', 0.86);
  thumbCache.set(id, url);
  return url;
}

/** 미리보기 — 첫 두 쪽을 작은 그림으로 */
export async function preview(entries, opts) {
  const { jpegs } = await build(entries, { ...opts, maxPages: 2 });
  return jpegs.map((j) => URL.createObjectURL(new Blob([j.bytes], { type: 'image/jpeg' })));
}

/** 파일 이름: harukan-2026-10.pdf */
export function fileName(key) {
  return `harukan-${key}.pdf`;
}

