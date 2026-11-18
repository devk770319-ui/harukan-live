/* ===========================================================
   pdfthemes.js — PDF 내보내기 디자인 (1.7.5, 사용자 요청 2026-10-24)
   "내보낸 PDF 에 디자인 요소가 너무 없다. 디자인을 골라서 내보내고 싶다."

   쪽 나누기(블록 높이)는 모든 디자인이 같다 — 디자인은 '그리는 방법'만 바꾼다.
   그래서 어떤 디자인을 골라도 쪽수와 내용이 같고, 쪽 나누기 버그가 디자인마다 따로 생기지 않는다.
   그림 파일을 새로 넣지 않고 캔버스로 직접 그린다 (모눈·종이 결·마스킹 테이프·폴라로이드 틀).

   디자인마다
   · C          색
   · serifHead  날짜·제목을 명조로
   · page()     쪽 바탕            · card()  카드 틀(기분 표시 포함)
   · headDeco() 날짜 뒤 장식       · photo() 사진 한 장 틀
   · mat        사진 묶음 바깥 틀  · cellR/gap 묶음 칸 모서리·간격
   =========================================================== */

import { moodColor } from './ui.js';

export const THEME_IDS = ['card', 'note', 'scrap', 'minimal', 'mood'];

/* 같은 글·같은 쪽이면 같은 무늬가 나오게 (미리보기와 실제 PDF 가 같아야 한다) */
export function rng(seed) {
  let h = 2166136261;
  for (const ch of String(seed)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
  return () => {
    h += 0x6D2B79F5;
    let x = h;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

const mc = (e, light, fb) => (e?.mood ? moodColor(e.mood, { light }) : fb);

/** 마스킹 테이프 한 조각 (가운데 cx,cy · 회전 rad) */
export function tape(ctx, cx, cy, w, h, rad, color, alpha = 0.72) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rad);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  // 양 끝을 톱니처럼 (손으로 찢은 느낌)
  const n = Math.max(3, Math.round(h / 9));
  ctx.beginPath();
  ctx.moveTo(-w / 2, -h / 2);
  ctx.lineTo(w / 2, -h / 2);
  for (let i = 1; i <= n; i++) ctx.lineTo(w / 2 + (i % 2 ? 5 : 0), -h / 2 + (h * i) / n);
  ctx.lineTo(-w / 2, h / 2);
  for (let i = n - 1; i >= 0; i--) ctx.lineTo(-w / 2 - (i % 2 ? 5 : 0), -h / 2 + (h * i) / n);
  ctx.closePath();
  ctx.fill();
  // 테이프 결 (가는 줄)
  ctx.globalAlpha = alpha * 0.25;
  ctx.fillStyle = '#ffffff';
  for (let yy = -h / 2 + 6; yy < h / 2; yy += 9) ctx.fillRect(-w / 2, yy, w, 2);
  ctx.restore();
}

/** 사진을 자르지 않고 넣을 크기 (틀 안 여백 px, 아래 여백 px) */
function fit(im, w, h, pad, padBottom = pad) {
  const s = Math.min((w - pad * 2) / im.width, (h - pad - padBottom) / im.height);
  const iw = Math.max(1, Math.round(im.width * s)), ih = Math.max(1, Math.round(im.height * s));
  return { iw, ih, fw: iw + pad * 2, fh: ih + pad + padBottom };
}

const shadow = (ctx, c, blur, dy) => { ctx.shadowColor = c; ctx.shadowBlur = blur; ctx.shadowOffsetY = dy; };

export const THEMES = {
  /* ── 기본 카드 (예전 그대로) ── */
  card: {
    C: { paper: '#f7f3ec', card: '#fffdf9', ink: '#221f1a', muted: '#6b6357', faint: '#9a9184',
      accent: '#ad6436', accentBg: '#f6e6da', line: '#e8e0d3', chip: '#f2ece2', tag: '#ad6436' },
    cellR: 14, gap: 8, coverR: 12,
    page(ctx, W, H) { ctx.fillStyle = this.C.paper; ctx.fillRect(0, 0, W, H); },
    card(ctx, x, y, w, h, e, G) {
      ctx.save(); shadow(ctx, 'rgba(60,40,20,.14)', 26, 8);
      ctx.fillStyle = this.C.card; G.roundRect(ctx, x, y, w, h, 30); ctx.fill(); ctx.restore();
      ctx.save(); G.roundRect(ctx, x, y, w, h, 30); ctx.clip();
      ctx.fillStyle = mc(e, 62, this.C.line); ctx.fillRect(x, y, 12, h); ctx.restore();
    },
    photo(ctx, im, x, y, w, h, k, G) { G.containImage(ctx, im, x, y, w, h, 20); },
  },

  /* ── 모눈 노트: 모눈종이 위에 붙인 카드, 날짜엔 마스킹 테이프 ── */
  note: {
    C: { paper: '#fbfbf8', card: 'rgba(255,255,255,0.93)', ink: '#1f2a33', muted: '#56687a', faint: '#8d9cab',
      accent: '#2f5d86', accentBg: '#e3ecf4', line: '#cdd8e2', chip: '#e8eff6', tag: '#2f5d86' },
    cellR: 3, gap: 8, mat: 12, coverR: 4,
    page(ctx, W, H) {
      ctx.fillStyle = this.C.paper; ctx.fillRect(0, 0, W, H);
      for (let i = 0; i <= W; i += 40) { ctx.fillStyle = i % 200 ? '#e7edf2' : '#d7e1ea'; ctx.fillRect(i, 0, i % 200 ? 1 : 2, H); }
      for (let j = 0; j <= H; j += 40) { ctx.fillStyle = j % 200 ? '#e7edf2' : '#d7e1ea'; ctx.fillRect(0, j, W, j % 200 ? 1 : 2); }
    },
    card(ctx, x, y, w, h, e, G) {
      ctx.save(); shadow(ctx, 'rgba(30,50,70,.08)', 10, 3);
      ctx.fillStyle = this.C.card; G.roundRect(ctx, x, y, w, h, 8); ctx.fill(); ctx.restore();
      ctx.strokeStyle = '#c3d0dc'; ctx.lineWidth = 2; G.roundRect(ctx, x + 1, y + 1, w - 2, h - 2, 8); ctx.stroke();
      ctx.save(); G.roundRect(ctx, x, y, w, h, 8); ctx.clip();
      ctx.fillStyle = mc(e, 66, this.C.line); ctx.fillRect(x, y, 10, h); ctx.restore();
    },
    headDeco(ctx, ix, cy, dw, e) {
      tape(ctx, ix + dw / 2 - 8, cy + 50, dw + 34, 62, -0.06, mc(e, 80, '#f1d98a'), 0.7);
    },
    photo(ctx, im, x, y, w, h, k, G) {
      const { iw, ih, fw, fh } = fit(im, w, h, 12);
      const fx = Math.round(x + (w - fw) / 2), fy = Math.round(y + (h - fh) / 2);
      ctx.save(); shadow(ctx, 'rgba(30,50,70,.16)', 12, 4); ctx.fillStyle = '#fff'; ctx.fillRect(fx, fy, fw, fh); ctx.restore();
      ctx.drawImage(im, fx + 12, fy + 12, iw, ih);
      tape(ctx, fx + 26, fy + 8, 90, 30, -0.7, '#f1d98a', 0.75);
      tape(ctx, fx + fw - 26, fy + 8, 90, 30, 0.7, '#f1d98a', 0.75);
    },
  },

  /* ── 스크랩북: 크라프트지 바탕, 손으로 찢은 종이 카드, 폴라로이드 사진 ── */
  scrap: {
    C: { paper: '#e6d8c0', card: '#fffaf0', ink: '#2b2118', muted: '#6e5d4b', faint: '#8f7b64',
      accent: '#b0503a', accentBg: '#f1dfca', line: '#e2d3bd', chip: '#f3e8d8', tag: '#8a5a2b' },
    cellR: 0, gap: 8, mat: 14, coverR: 0,
    page(ctx, W, H, G, seed) {
      ctx.fillStyle = this.C.paper; ctx.fillRect(0, 0, W, H);
      const r = rng('scrap' + seed);
      for (let i = 0; i < 2600; i++) {
        ctx.fillStyle = r() < 0.5 ? 'rgba(90,60,30,.07)' : 'rgba(255,255,255,.12)';
        const s = 1 + r() * 2.5;
        ctx.fillRect(r() * W, r() * H, s, s);
      }
      // 가장자리를 살짝 어둡게
      const g = ctx.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.75);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(80,50,20,.12)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    },
    card(ctx, x, y, w, h, e) {
      const r = rng('card' + (e?.id || '') + y);
      const j = () => (r() - 0.5) * 5;
      ctx.beginPath();
      ctx.moveTo(x + j(), y + j());
      for (let i = 24; i < w; i += 24) ctx.lineTo(x + i, y + j());
      ctx.lineTo(x + w + j(), y + j());
      for (let i = 24; i < h; i += 24) ctx.lineTo(x + w + j(), y + i);
      ctx.lineTo(x + w + j(), y + h + j());
      for (let i = w - 24; i > 0; i -= 24) ctx.lineTo(x + i, y + h + j());
      ctx.lineTo(x + j(), y + h + j());
      for (let i = h - 24; i > 0; i -= 24) ctx.lineTo(x + j(), y + i);
      ctx.closePath();
      ctx.save(); shadow(ctx, 'rgba(70,45,20,.22)', 16, 6); ctx.fillStyle = this.C.card; ctx.fill(); ctx.restore();
      // 위에 붙인 테이프 (기분 색)
      tape(ctx, x + w / 2, y + 4, 200, 44, (r() - 0.5) * 0.08, mc(e, 76, '#e9b9a3'), 0.68);
    },
    photo(ctx, im, x, y, w, h, k) {
      const { iw, ih, fw, fh } = fit(im, w - 16, h - 12, 16, 56);
      const rot = (k % 2 ? 1 : -1) * 0.022;
      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(rot);
      shadow(ctx, 'rgba(60,40,20,.28)', 14, 5);
      ctx.fillStyle = '#fffefb'; ctx.fillRect(-fw / 2, -fh / 2, fw, fh);
      ctx.shadowColor = 'transparent';
      ctx.drawImage(im, -fw / 2 + 16, -fh / 2 + 16, iw, ih);
      ctx.restore();
      tape(ctx, x + w / 2, y + (h - fh) / 2 + 2, 130, 36, rot * 3, '#d9c7a3', 0.8);
    },
  },

  /* ── 미니멀: 흰 종이, 가는 줄, 명조 날짜 — 장식 없이 글이 주인공 ── */
  minimal: {
    C: { paper: '#ffffff', card: '#ffffff', ink: '#141414', muted: '#5a5a5a', faint: '#9a9a9a',
      accent: '#141414', accentBg: '#f0f0f0', line: '#dcdcdc', chip: '#f2f2f2', tag: '#6a6a6a' },
    serifHead: true, dayWeight: 400, cellR: 0, gap: 6, coverR: 0,
    page(ctx, W, H) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, H); },
    card(ctx, x, y, w, h, e) {
      ctx.fillStyle = this.C.ink; ctx.fillRect(x, y, w, 3);
      ctx.fillStyle = '#e4e4e4'; ctx.fillRect(x, y + h - 1, w, 1);
      if (e?.mood) { ctx.fillStyle = moodColor(e.mood, { light: 58 }); ctx.fillRect(x + w - 26, y + 18, 26, 26); }
    },
    photo(ctx, im, x, y, w, h, k, G) { G.containImage(ctx, im, x, y, w, h, 0); },
  },

  /* ── 기분 색: 그날 기분 색으로 물든 카드 ── */
  mood: {
    C: { paper: '#fbf7f2', card: '#ffffff', ink: '#2a2420', muted: '#6d625a', faint: '#a0948a',
      accent: '#9a5a3a', accentBg: '#f3ebe3', line: '#eadfd4', chip: 'rgba(255,255,255,.75)', tag: '#7a6a5c' },
    cellR: 18, gap: 10, coverR: 26,
    dayColor: (e) => mc(e, 38, '#9a5a3a'),
    page(ctx, W, H) {
      const g = ctx.createLinearGradient(0, 0, W, H);
      g.addColorStop(0, '#fdfaf6'); g.addColorStop(1, '#f3ece4');
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    },
    card(ctx, x, y, w, h, e, G) {
      ctx.save(); shadow(ctx, 'rgba(60,40,20,.10)', 30, 10);
      ctx.fillStyle = mc(e, 95, '#ffffff'); G.roundRect(ctx, x, y, w, h, 40); ctx.fill(); ctx.restore();
      ctx.save(); G.roundRect(ctx, x, y, w, h, 40); ctx.clip();
      ctx.globalAlpha = 0.55; ctx.fillStyle = mc(e, 86, '#f1e6db');
      ctx.beginPath(); ctx.arc(x + w - 40, y + 30, 170, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 0.35;
      ctx.beginPath(); ctx.arc(x + w - 190, y - 30, 90, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    },
    photo(ctx, im, x, y, w, h, k, G) {
      const { iw, ih, fw, fh } = fit(im, w, h, 9);
      const fx = Math.round(x + (w - fw) / 2), fy = Math.round(y + (h - fh) / 2);
      ctx.save(); shadow(ctx, 'rgba(60,40,20,.12)', 14, 4);
      ctx.fillStyle = '#fff'; G.roundRect(ctx, fx, fy, fw, fh, 26); ctx.fill(); ctx.restore();
      G.containImage(ctx, im, fx + 9, fy + 9, iw, ih, 20);
    },
  },
};

export function theme(id) { return THEMES[id] || THEMES.card; }
