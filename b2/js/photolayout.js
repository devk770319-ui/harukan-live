/* ===========================================================
   photolayout.js — 사진을 글 사이 원하는 자리에, 원하는 크기로 (1.7.5)
   사용자 의견(튀르키예, 2026-10-23): "사진을 원하는 위치에 놓고 크기를 조절하고 싶다"

   저장 모양
   · 본문(e.body)은 예전처럼 그냥 글이다. 사진 표시 글자를 섞지 않는다 →
     찾기·단어 분석·마크다운·옛 버전 앱이 그대로 동작한다.
   · e.photoLayout = { [사진 id]: { at?: 글자 위치, size?: 's'|'m'|'l' } }
       at   없으면 예전처럼 본문 위 사진 묶음(맨 위). 있으면 본문의 그 위치(줄바꿈 자리)에 들어간다.
       size 없으면 'l' (예전과 같은 꽉 찬 폭).
   · e.photos 순서 = 화면에 보이는 순서 (맨 위 묶음 → 본문 속 사진, 위에서 아래로).
     스티커가 사진에 붙을 때 몇 번째 사진인지(s.i)로 붙으므로 이 순서를 지켜야 한다 → normalize().
   · 글 사이 사진은 자유 모드에서만 쓴다. 한 줄·질문 모드에서는 at 을 무시하고 맨 위에 둔다.
   · 기본 기능(무료) — 2026-10-24 사용자 결정. 플러스로 막지 않는다.
   =========================================================== */

export const SIZES = ['s', 'm', 'l'];
export const SIZE_SCALE = { s: 0.42, m: 0.66, l: 1 };

/** 이 글이 글 사이 사진을 쓸 수 있는 모드인가 */
export function inlineOn(e) {
  return !e?.mode || e.mode === 'free';
}

export function sizeOf(e, pid) {
  const s = e?.photoLayout?.[pid]?.size;
  return SIZES.includes(s) ? s : 'l';
}

/** 글 사이 위치 (없으면 null = 맨 위) */
export function atOf(e, pid) {
  if (!inlineOn(e)) return null;
  const a = e?.photoLayout?.[pid]?.at;
  return Number.isFinite(a) && a >= 0 ? Math.min(a, (e.body || '').length) : null;
}

export function hasInline(e) {
  return (e?.photos || []).some((pid) => atOf(e, pid) !== null);
}

export function hasSizes(e) {
  return (e?.photos || []).some((pid) => sizeOf(e, pid) !== 'l');
}

/**
 * 화면에 놓을 순서대로 나눈다.
 * @returns {{ top: string[], flow: Array<{text:string}|{photos:string[], at:number}> }}
 *   flow 는 글 → 사진 묶음 → 글 → … 으로 번갈아 나오고, 처음과 끝은 언제나 글(빈 글일 수 있음)이다.
 */
export function split(e, extra = []) {
  const body = e?.body || '';
  const photos = e?.photos || [];
  const top = [];
  const inl = [];
  photos.forEach((pid, idx) => {
    const a = atOf(e, pid);
    if (a === null) top.push(pid); else inl.push({ pid, at: a, idx });
  });
  /* extra: [{pid, at}] — 쓰는 화면에서 아직 사진이 없는 빈 묶음 자리 (1.7.5). 저장되지 않는다 */
  extra.forEach((x, j) => {
    const a = inlineOn(e) && Number.isFinite(x.at) && x.at >= 0 ? Math.min(x.at, body.length) : null;
    if (a === null) top.push(x.pid); else inl.push({ pid: x.pid, at: a, idx: photos.length + j });
  });
  inl.sort((x, y) => x.at - y.at || x.idx - y.idx);
  const flow = [];
  let cur = 0;
  let i = 0;
  while (i < inl.length) {
    const p = Math.max(inl[i].at, cur);
    const group = [];
    while (i < inl.length && Math.max(inl[i].at, cur) === p) { group.push(inl[i].pid); i++; }
    flow.push({ text: body.slice(cur, p) });
    flow.push({ photos: group, at: p });
    cur = p + (body[p] === '\n' ? 1 : 0);
  }
  flow.push({ text: body.slice(cur) });
  return { top, flow };
}

/**
 * split 의 반대. 글 칸들과 그 사이 사진 묶음으로 본문과 위치를 다시 만든다.
 * texts.length === groups.length + 1. 글 칸 사이는 줄바꿈 하나로 잇고, 사진은 그 줄바꿈 자리에 놓인다.
 * @returns {{ body: string, at: Record<string, number> }}
 */
export function join(texts, groups) {
  let body = texts[0] || '';
  const at = {};
  for (let g = 0; g < groups.length; g++) {
    const p = body.length;
    for (const pid of groups[g]) at[pid] = p;
    body += '\n' + (texts[g + 1] || '');
  }
  return { body, at };
}

/**
 * 저장 전에 모양을 맞춘다 (제자리에서 바꾼다).
 * · 없는 사진의 자리 정보를 지운다. 기본값(맨 위·큰 크기)만 남은 항목도 지운다.
 * · e.photos 를 화면 순서로 다시 줄 세우고, 사진에 붙은 스티커의 번호(s.i)를 따라 바꾼다.
 */
export function normalize(e) {
  if (!e) return e;
  fixCollages(e);
  const lay = e.photoLayout || {};
  const photos = e.photos || [];
  const clean = {};
  for (const pid of photos) {
    const v = lay[pid];
    if (!v) continue;
    const o = {};
    if (Number.isFinite(v.at) && v.at >= 0) o.at = Math.min(v.at, (e.body || '').length);
    if (SIZES.includes(v.size) && v.size !== 'l') o.size = v.size;
    if (typeof v.c === 'string' && v.c) {                                // 묶음 (1.7.5)
      o.c = v.c;
      if (Number.isInteger(v.k) && v.k >= 0) o.k = v.k;                  // 몇 번째 칸인지
    }
    if (Number.isFinite(v.fx) && v.fx !== 0.5) o.fx = Math.min(1, Math.max(0, v.fx));
    if (Number.isFinite(v.fy) && v.fy !== 0.5) o.fy = Math.min(1, Math.max(0, v.fy));
    if (Object.keys(o).length) clean[pid] = o;
  }
  if (Object.keys(clean).length) e.photoLayout = clean; else delete e.photoLayout;

  const { top, flow } = split(e);
  /* 묶음 사진은 붙여 둔다: 같은 자리 안에서 묶음의 첫 사진 자리에 나머지를 모은다 */
  const tight = (pids) => {
    const out = [], done = new Set();
    for (const p of pids) {
      if (done.has(p)) continue;
      const c = cidOf(e, p);
      if (c) {
        const mem = pids.filter((q) => cidOf(e, q) === c && !done.has(q));
        mem.sort((x, y) => slotOf(e, x) - slotOf(e, y));
        for (const q of mem) { out.push(q); done.add(q); }
      }
      else { out.push(p); done.add(p); }
    }
    return out;
  };
  const order = [...tight(top), ...flow.flatMap((s) => (s.photos ? tight(s.photos) : []))];
  const same = order.length === photos.length && order.every((p, k) => p === photos[k]);
  if (!same) {
    const newIdx = new Map(order.map((p, k) => [p, k]));
    e.stickers = (e.stickers || []).map((s) => {
      if (s.a !== 'photo') return s;
      const pid = photos[s.i | 0];
      return pid !== undefined && newIdx.has(pid) ? { ...s, i: newIdx.get(pid) } : s;
    });
    e.photos = order;
  }
  return e;
}

/** 백업 합치기에서 사진 id 가 바뀔 때 자리 정보도 새 id 로 */
export function remapIds(layout, idMap) {
  if (!layout) return undefined;
  const out = {};
  for (const [pid, v] of Object.entries(layout)) if (idMap[pid]) out[idMap[pid]] = { ...v };
  return Object.keys(out).length ? out : undefined;
}

/* ── 사진 묶음(콜라주) (1.7.5, 사용자 제안 2026-10-24) ─────────────────
   e.collages = { [묶음 id]: { t: 틀 이름 } },  e.photoLayout[사진].c = 묶음 id, .fx/.fy = 보이는 부분(0~1)
   · 묶음의 사진은 e.photos 에서 붙어 있고(화면 순서), 자리(at)는 첫 사진을 따른다 (normalize).
   · 칸: photoLayout[사진].k = 몇 번째 칸(0부터). 칸마다 '+' 로 한 장씩 넣고, 빠진 칸은 비어 있다.
     k 가 없거나 겹치면 빈 칸에 차례로 넣는다. 틀보다 사진이 많으면 넘친 사진은 묶음에서 빠져 낱장이 된다.
     e.photos 안에서는 칸 순서로 줄 선다 (normalize).
   · 옛 버전 앱은 collages 를 몰라 사진을 낱장으로 차례대로 보여준다 (일기·사진은 그대로).
   칸: [열, 행, 열 칸 수, 행 칸 수] — 화면(CSS grid)과 PDF 가 같은 표를 쓴다. ratio = 높이/폭 */
export const TEMPLATES = {
  two:   { n: 2, cols: 2, rows: 1, ratio: 0.62, cells: [[0, 0, 1, 1], [1, 0, 1, 1]] },
  big2:  { n: 3, cols: 3, rows: 2, ratio: 0.7,  cells: [[0, 0, 2, 2], [2, 0, 1, 1], [2, 1, 1, 1]] },
  grid4: { n: 4, cols: 2, rows: 2, ratio: 0.75, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1]] },
  tri:   { n: 3, cols: 3, rows: 1, ratio: 0.62, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1]] },
  top3:  { n: 4, cols: 3, rows: 3, ratio: 0.8,  cells: [[0, 0, 3, 2], [0, 2, 1, 1], [1, 2, 1, 1], [2, 2, 1, 1]] },
  six:   { n: 6, cols: 3, rows: 2, ratio: 0.62, cells: [[0, 0, 1, 1], [1, 0, 1, 1], [2, 0, 1, 1], [0, 1, 1, 1], [1, 1, 1, 1], [2, 1, 1, 1]] },
};
export const TEMPLATE_IDS = Object.keys(TEMPLATES);

export function hasCollages(e) {
  return !!(e?.collages && (e.photos || []).some((p) => cidOf(e, p)));
}

/** 이 사진이 든 묶음 id (없으면 null) */
export function cidOf(e, pid) {
  const c = e?.photoLayout?.[pid]?.c;
  return c && e?.collages?.[c] && TEMPLATES[e.collages[c].t] ? c : null;
}

export function templateOf(e, cid) { return TEMPLATES[e?.collages?.[cid]?.t] || null; }
export function membersOf(e, cid) { return (e?.photos || []).filter((p) => cidOf(e, p) === cid); }

/** 보이는 부분 (0~1, 기본 가운데) */
export function focusOf(e, pid) {
  const L = e?.photoLayout?.[pid] || {};
  const f = (v) => (Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5);
  return { x: f(L.fx), y: f(L.fy) };
}

/** 칸 번호 (없으면 아주 큰 수 — 칸이 정해진 사진 뒤로) */
export function slotOf(e, pid) {
  const k = e?.photoLayout?.[pid]?.k;
  return Number.isInteger(k) && k >= 0 ? k : 1e6;
}

/** 사진 줄을 그릴 덩어리로: 낱장 { pid } 또는 묶음 { cid, t, pids } — pids[칸] = 사진 (빈 칸은 비어 있다) */
export function chunks(e, pids) {
  const out = [];
  const put = (ch, pid) => {
    const n = TEMPLATES[ch.t].n;
    const k = slotOf(e, pid);
    if (k < n && ch.pids[k] === undefined) { ch.pids[k] = pid; return; }
    let i = 0;
    while (ch.pids[i] !== undefined) i++;
    if (i < n) ch.pids[i] = pid;
  };
  for (const pid of pids) {
    const c = cidOf(e, pid);
    const last = out[out.length - 1];
    if (c && last && last.cid === c) put(last, pid);
    else if (c) { const ch = { cid: c, t: e.collages[c].t, pids: [] }; put(ch, pid); out.push(ch); }
    else out.push({ pid });
  }
  return out;
}

export function newCollageId() { return 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

/** normalize 앞에서: 묶음 규칙을 맞춘다 (자리 통일·넘친 사진 빼기·빈 묶음 지우기·크기 무시) */
export function fixCollages(e) {
  if (!e) return;
  const lay = e.photoLayout || {};
  const cols = e.collages || {};
  for (const [pid, v] of Object.entries(lay)) {
    if (v.c && !(cols[v.c] && TEMPLATES[cols[v.c].t] && (e.photos || []).includes(pid))) delete v.c;
    if (!v.c) delete v.k;
  }
  for (const cid of Object.keys(cols)) {
    const all = (e.photos || []).filter((p) => lay[p]?.c === cid);
    const T = TEMPLATES[cols[cid].t];
    if (!all.length || !T) { delete cols[cid]; continue; }
    /* 칸 정하기: 맞는 칸 번호는 그대로, 없거나 겹치거나 틀 밖이면 빈 칸에 차례로. 칸이 모자라면 낱장으로 */
    const used = new Set();
    const wait = [];
    for (const p of all) {
      const k = lay[p].k;
      if (Number.isInteger(k) && k >= 0 && k < T.n && !used.has(k)) used.add(k); else wait.push(p);
    }
    for (const p of wait) {
      let k = 0;
      while (used.has(k)) k++;
      if (k < T.n) { lay[p].k = k; used.add(k); } else { delete lay[p].c; delete lay[p].k; }
    }
    const mem = all.filter((p) => lay[p].c === cid);
    const first = lay[mem[0]];
    for (const p of mem) {
      const v = lay[p];
      if (Number.isFinite(first.at)) v.at = first.at; else delete v.at;
      delete v.size;
    }
  }
  if (Object.keys(cols).length) e.collages = cols; else delete e.collages;
}
