/* ===========================================================
   views/insights.js — 발견
   숫자를 던져놓지 않고 문장으로 말해준다.
   단, 표본 수를 반드시 같이 보여주고 인과로 포장하지 않는다.
   =========================================================== */

import * as store from '../store.js';
import { t } from '../i18n.js';
import { go } from '../app.js';
import { el, esc, icon, moodColor, fmtDate, WD, openSheet, infoButton } from '../ui.js';
import * as I from '../insights.js';
import * as NB from '../newbadge.js';


/* 내가 일기 쓴 곳 (1.7.8) — 지도 화면으로 */
function mapCard() {
  const all = store.live().filter((x) => !x.demo);
  const n = all.filter((x) => x.place?.lat != null).length;
  const names = all.some((x) => x.place?.lat == null && x.weather?.place);
  const b = el('button', { class: 'ins-map span-all', type: 'button' });
  const sub = n ? t('지도에 일기 {n}편이 모여 있어요', { n })
    : (names ? t('동네 이름으로 지난 일기를 지도에 모아 볼 수 있어요') : t('장소 기록을 켜면 일기 쓴 곳이 지도에 모여요'));
  b.innerHTML = `<span class="ic">${icon('map')}</span><span class="tx"><b>${esc(t('내가 일기 쓴 곳'))}${NB.pill('map')}</b><span>${esc(sub)}</span></span><span aria-hidden="true">›</span>`;
  b.addEventListener('click', () => go('/map'));
  return b;
}

export async function render(root) {
  /* 예시(둘러보기) 데이터를 통계에 넣을지 (1.6.6)
     예전엔 직접 쓴 글이 한 편이라도 있으면 예시를 뺐다 → 글이 1~4편인 사람이 둘러보기를 눌러도
     '아직 볼 게 없어요'만 나왔다. 둘러보기는 미리보기용이니, 내 글이 5편이 안 되면 예시를 섞어
     보여주고 그 사실을 분명히 적는다. 5편부터는 내 글만으로 계산한다.
     홈의 주간 목표는 여전히 statsEntries()(예시 제외)를 쓴다 — 예시가 목표를 채워주면 안 된다. */
  const real = store.realLive();
  const demoN = store.live().length - real.length;
  const DEMO_MIX_BELOW = 5;
  const mixDemo = demoN > 0 && real.length < DEMO_MIX_BELOW;
  const entries = mixDemo || !real.length ? store.live() : real;
  const demoExcluded = mixDemo ? 0 : store.live().length - entries.length;
  const demoNote = () => (mixDemo && real.length
    ? el('div', { class: 'note span-all', style: 'margin:2px 4px 0' },
      t('지금은 예시 일기 {n}편을 섞어서 보여드려요. 내 일기가 5편 넘게 쌓이면 내 기록만으로 바뀌어요.', { n: demoN }))
    : null);

  if (entries.length < 2) {
    root.append(el('div', { class: 'empty', style: 'margin-top:40px' },
      `<span class="empty-emoji">📊</span>
       <div class="empty-title">${t('아직 볼 게 없어요')}</div>
       <div class="empty-sub">${t('글이 몇 편 쌓이면 여기에서')}<br>
       ${t('기분의 리듬, 요일의 패턴, 자주 쓰는 말을 찾아드릴게요.')}<br>
       ${t('보통 5편쯤부터 재미있어져요.')}</div>`));
    root.append(mapCard());
    if (demoExcluded > 0) {
      root.append(el('div', { class: 'note span-all', style: 'text-align:center;margin-top:14px' },
        t('예시 데이터 {n}편은 통계에서 뺐어요. 설정 → 둘러보기에서 지울 수 있어요.', { n: demoExcluded })));
    }
    return { title: t('발견') };
  }

  /* ── 한 줄 발견 ───────────────────────────── */
  const hero = el('div', { class: 'ins-hero' });
  hero.innerHTML =
    `<div class="ins-hero-kicker">${icon('spark')}<span>${t('오늘의 발견')}</span></div>
     <div class="ins-hero-body">${I.headline(entries).html}</div>`;
  hero.querySelector('.ins-hero-kicker').append(infoButton(t('오늘의 발견'),
    t('쌓인 글에서 눈에 띄는 것 하나를 골라 문장으로 보여줘요. 글이 늘어나면 내용도 바뀝니다. 평균의 차이일 뿐 원인이라는 뜻은 아니에요.')));
  root.append(hero);
  root.append(mapCard());

  // 예시 데이터가 섞여 있으면 그 사실을 분명히 알린다 — 통계가 왜곡됐다고 오해하지 않게
  const dn = demoNote();
  if (dn) root.append(dn);
  if (demoExcluded > 0) {
    root.append(el('div', { class: 'note span-all', style: 'margin:2px 4px 0' },
      t('예시 데이터 {n}편은 통계에서 뺐어요. 설정 → 둘러보기에서 지울 수 있어요.', { n: demoExcluded })));
  }

  /* ── 주간 리포트 ──────────────────────────── */
  const wr = I.weeklyReport(entries);
  if (wr) {
    const sec = section(t('이번 주 리포트'), `${Number(wr.from.slice(5, 7))}.${Number(wr.from.slice(8))} – ${Number(wr.to.slice(5, 7))}.${Number(wr.to.slice(8))}`, 'cal',
      t('이번 주(월요일~일요일)에 쓴 편수와 글자 수, 평균 기분을 지난주와 견줘 알려줘요. 주가 바뀌면 새로 계산됩니다.'));
    const c = el('div', { class: 'card' });
    c.innerHTML = wr.lines.map((l) => `<div style="margin:5px 0;line-height:1.75;word-break:keep-all">${esc(l)}</div>`).join('');
    sec.append(c);
    root.append(sec);
  }

  /* ── 기분 흐름 ────────────────────────────── */
  const series = I.smooth(I.recentSeries(entries, 60), 7);
  if (series.filter((p) => p.v != null).length >= 4) {
    const sec = section(t('기분의 흐름'), t('최근 60일 · 7일 평균'), 'chart');
    const c = el('div', { class: 'card' });
    c.append(sparkline(series));
    const dots = series.filter((p) => p.raw != null).length;
    c.append(el('div', { class: 'note', style: 'margin-top:4px' },
      t('점은 실제 기록({n}일), 선은 7일 이동평균이에요. 가운데 점선이 0점.', { n: dots })));
    sec.append(c);
    root.append(sec);
  }

  /* ── 체크 칩 효과 ─────────────────────────── */
  const eff = I.chipEffects(entries).slice(0, 6);
  if (eff.length) {
    const sec = section(t('이런 날의 기분'), t('표시한 날 vs 아닌 날'), 'mood');
    const c = el('div', { class: 'card' });
    for (const e of eff) {
      const row = el('div', { class: 'effect' });
      const pts = e.diff * 50;
      row.innerHTML =
        `<span class="effect-name">${esc(t(e.chip))}<span class="effect-n">n=${e.nYes}</span></span>
         <span class="effect-val ${pts >= 0 ? 'up' : 'down'}">${t('{n}점', { n: (pts >= 0 ? '+' : '') + pts.toFixed(0) })}</span>`;
      c.append(row);
    }
    c.append(el('div', { class: 'note' },
      t('평균 차이일 뿐, 원인이라는 뜻은 아니에요. 그래도 “나는 이런 날 어땠나”를 보는 출발점은 됩니다. (기분은 -50 ~ +50점 척도)')));
    sec.append(c);
    root.append(sec);
  }

  /* ── 요일별 ───────────────────────────────── */
  const wd = I.weekdayMood(entries);
  const wdc = I.weekdayCount(entries);
  if (wd.filter((d) => d.n >= 2).length >= 4) {
    const sec = section(t('요일의 리듬'), t('요일별 평균 기분'), 'clock');
    const c = el('div', { class: 'card' });
    const grid = el('div', { class: 'dow-grid' });
    for (let i = 0; i < 7; i++) {
      const d = wd[i];
      const col = el('div', { class: 'dow-col' });
      const bar = el('div', { class: 'dow-bar' });
      if (d.v != null) {
        const h = 12 + ((d.v + 1) / 2) * 88;                 // 12%~100%
        const fill = el('div', { class: 'dow-fill' });
        fill.style.height = h + '%';
        fill.style.background = moodColor({ v: d.v, e: 0 });
        bar.append(fill);
      }
      col.append(bar, el('div', { class: 'dow-lab' + (i === 0 ? '' : '') }, WD[i]));
      col.append(el('div', { class: 'dow-lab muted', style: 'font-size:.66rem;margin-top:-3px' },
        d.v == null ? '–' : `${d.v >= 0 ? '+' : ''}${(d.v * 50).toFixed(0)}`));
      grid.append(col);
    }
    c.append(grid);
    const most = wdc.reduce((a, b) => (b.n > a.n ? b : a));
    c.append(el('div', { class: 'note' }, t('가장 자주 쓰는 요일은 {wd}({n}편)이에요.', { wd: most.wd, n: most.n })));
    sec.append(c);
    root.append(sec);
  }

  /* ── 감정 분포 ────────────────────────────── */
  const mix = I.quadrantMix(entries);
  if (mix.length >= 2) {
    const sec = section(t('마음의 분포'), t('기분을 남긴 {n}편', { n: mix.reduce((s, m) => s + m.n, 0) }), 'heart',
      t('기분을 남긴 글을 네 갈래로 나눈 비율이에요. 유쾌한지 불쾌한지(가로)와 들떴는지 가라앉았는지(세로)를 함께 봐서 활기·평온·긴장·침체로 나눕니다. 한가운데면 보통이고요.'));
    const c = el('div', { class: 'card' });
    const colors = { 활기: { v: .6, e: .6 }, 평온: { v: .6, e: -.5 }, 긴장: { v: -.55, e: .6 }, 침체: { v: -.6, e: -.55 }, 보통: { v: 0, e: 0 } };
    const bars = el('div', { class: 'bars' });
    const max = Math.max(...mix.map((m) => m.pct));
    for (const m of mix) {
      const row = el('div', { class: 'bar-row' });
      row.innerHTML =
        `<span class="bar-name">${esc(t(m.name))}</span>
         <span class="bar-track"><span class="bar-fill" style="width:${(m.pct / max * 100).toFixed(1)}%;background:${moodColor(colors[m.name] || { v: 0, e: 0 })}"></span></span>
         <span class="bar-val">${m.pct}% · ${m.n}</span>`;
      bars.append(row);
    }
    c.append(bars);
    sec.append(c);
    root.append(sec);
  }

  /* ── 자주 쓴 단어 ─────────────────────────── */
  const words = I.words(entries, 26);
  if (words.length >= 5) {
    const sec = section(t('나의 단어'), t('자주 등장한 말'), 'quote',
      t('일기 본문에 자주 나온 낱말이에요. 크고 진할수록 많이 쓴 말입니다. 조사나 “그리고” 같은 흔한 말은 빼고 셉니다.'));
    const c = el('div', { class: 'card' });
    const cloud = el('div', { class: 'wordcloud' });
    const max = words[0].count, min = words[words.length - 1].count;
    for (const w of words) {
      const t = max === min ? 1 : (w.count - min) / (max - min);
      const b = el('button', {
        class: 'wc-word', type: 'button',
        style: `font-size:${(0.82 + t * 0.75).toFixed(2)}rem;color:${t > 0.55 ? 'var(--accent-2)' : 'var(--muted)'};opacity:${(0.6 + t * 0.4).toFixed(2)}`,
      }, esc(w.word));
      b.addEventListener('click', () => go(`/search?q=${encodeURIComponent(w.word)}`));
      cloud.append(b);
    }
    c.append(cloud);
    c.append(el('div', { class: 'note' }, t('눌러서 그 단어가 나온 글을 모아볼 수 있어요.')));
    sec.append(c);
    root.append(sec);
  }

  /* ── 태그 ─────────────────────────────────── */
  const tags = I.tagRanking(entries, 10);
  if (tags.length) {
    const sec = section(t('주제'), t('많이 붙인 태그'), 'tag',
      t('글에 붙인 태그를 많이 쓴 순서로 보여줘요. 태그는 쓰기 화면에서 직접 붙이거나, 설정에서 자동 추천을 켜두면 본문에서 뽑아 제안해 드려요. 줄을 누르면 그 태그가 붙은 글만 모아 볼 수 있어요.'));
    const c = el('div', { class: 'card' });
    const bars = el('div', { class: 'bars' });
    const max = tags[0].count;
    for (const tg of tags) {
      const row = el('div', { class: 'bar-row' });
      row.innerHTML =
        `<span class="bar-name">#${esc(tg.tag)}</span>
         <span class="bar-track"><span class="bar-fill" style="width:${(tg.count / max * 100).toFixed(1)}%;background:var(--area)"></span></span>
         <span class="bar-val">${t('{n}편', { n: tg.count })}</span>`;
      row.addEventListener('click', () => go(`/search?q=${encodeURIComponent('#' + tg.tag)}`));
      bars.append(row);
    }
    c.append(bars);
    sec.append(c);
    root.append(sec);
  }

  /* ── 쓰는 시간 ────────────────────────────── */
  const hh = I.hourHistogram(entries);
  if (entries.length >= 6) {
    const sec = section(t('쓰는 시간'), t('하루 중 언제 쓰나요'), 'clock');
    const c = el('div', { class: 'card' });
    const max = Math.max(...hh);
    const row = el('div', { style: 'display:flex;gap:2px;align-items:flex-end;height:70px' });
    hh.forEach((n, h) => {
      const b = el('div', {
        title: t('{h}시 · {n}편', { h, n }),
        style: `flex:1;border-radius:3px 3px 0 0;background:${n ? 'var(--area)' : 'var(--card-2)'};` +
               `height:${Math.max(4, (n / max) * 100)}%;opacity:${n ? 0.35 + (n / max) * 0.65 : 1}`,
      });
      row.append(b);
    });
    c.append(row);
    c.append(el('div', { style: 'display:flex;justify-content:space-between;margin-top:6px;font-size:.68rem;color:var(--muted-2);font-weight:600' },
      `<span>${t('0시')}</span><span>${t('6시')}</span><span>${t('12시')}</span><span>${t('18시')}</span><span>${t('23시')}</span>`));
    const peak = hh.indexOf(max);
    c.append(el('div', { class: 'note' }, t('주로 {h}시 무렵에 쓰시네요. 알림 시간을 그 즈음으로 맞추면 덜 놓쳐요.', { h: peak })));
    sec.append(c);
    root.append(sec);
  }

  /* ── 통계 ─────────────────────────────────── */
  const sum = I.summary(entries);
  const fr = I.fillRate(entries, 30);
  const streak = I.goalStreakWeeks(entries, store.getSettings().weeklyGoal);
  const sec = section(t('쌓인 것들'), '', 'book',
    t('지금까지 쌓인 기록을 한눈에 모은 숫자예요. 각 칸을 누르면 무엇을 어떻게 센 값인지 알려드려요.'));
  const c = el('div', { class: 'card' });
  const g = el('div', { class: 'cal-stats', style: 'margin-top:0' });
  // 숫자만 던지지 않는다 — 누르면 무엇을 어떻게 센 값인지 말해준다.
  // 물음표 표시가 없으면 눌러볼 생각을 못 하므로 칸마다 붙인다.
  const tile = (ico, tone, num, label, desc) => {
    const b = el('button', { class: 'stat', type: 'button' },
      `<span class="info-mark" aria-hidden="true">${icon('info')}</span>
       <div class="stat-top ico-${tone}">${icon(ico)}<span class="stat-num">${num}</span></div>
       <div class="stat-label">${esc(label)}</div>`);
    // 아래에 붙는 시트는 배너 광고에 가린다. 가운데 팝업이라 배너와 무관하게 항상 같은 자리다.
    b.addEventListener('click', () => openSheet({ title: label, text: desc, center: true }));
    return b;
  };
  g.append(
    tile('edit',  'orange', sum.count, t('글'),
      t('지금까지 쓴 일기 수예요. 휴지통에 있는 글은 세지 않아요.')),
    tile('cal',   'green',  sum.days, t('기록한 날'),
      t('한 편이라도 쓴 날의 수예요. 하루에 여러 편을 써도 하루로 세요.')),
    tile('type',  'amber',  (sum.chars / 1000).toFixed(1) + 'k', t('글자'),
      t('모든 글의 글자 수를 더한 값이에요. 공백은 빼고 세요.')),
    tile('users', 'plum',   sum.since, t('함께한 날'),
      t('첫 글을 쓴 날부터 오늘까지 흐른 날수예요. 하루칸과 함께한 시간이죠.')),
    tile('chart', 'green',  fr.pct + '%', t('최근 30일'),
      t('최근 30일 가운데 일기를 쓴 날의 비율이에요.')),
    tile('flame', 'red',    streak, t('목표 연속 주'),
      t('주간 목표(주 {n}회)를 연속으로 채운 주 수예요. 진행 중인 이번 주는 아직 들어가지 않아요.', { n: store.getSettings().weeklyGoal })),
  );
  c.append(g);
  if (sum.first) c.append(el('div', { class: 'note' }, t('첫 글은 {d}이었어요.', { d: fmtDate(sum.first, { year: true }) })));
  sec.append(c);
  root.append(sec);

  root.append(el('div', { class: 'note', style: 'text-align:center;margin-top:26px' },
    t('모든 계산은 이 기기 안에서만 이뤄집니다. 일기 내용은 밖으로 나가지 않아요.')));

  return { title: t('발견') };
}

/** info 를 주면 제목 옆에 물음표가 붙고, 누르면 그 구역이 무엇인지 설명한다. */
function section(title, more = '', ico = '', info = '') {
  const s = el('div', { class: 'section' });
  const head = el('div', { class: 'section-head' },
    `<div class="section-title">${ico ? icon(ico) : ''}<span>${esc(title)}</span></div>`
    + (more ? `<div class="section-more" style="color:var(--muted-2);font-weight:600">${esc(more)}</div>` : ''));
  if (info) head.querySelector('.section-title').append(infoButton(title, info));
  s.append(head);
  return s;
}

/* ── 스파크라인 ─────────────────────────────────── */
function sparkline(series) {
  const W = 320, H = 96, pad = 6;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('class', 'spark');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');

  const x = (i) => pad + (i / Math.max(1, series.length - 1)) * (W - pad * 2);
  const y = (v) => pad + (1 - (v + 1) / 2) * (H - pad * 2);

  const zero = document.createElementNS(svg.namespaceURI, 'line');
  zero.setAttribute('class', 'zero');
  zero.setAttribute('x1', 0); zero.setAttribute('x2', W);
  zero.setAttribute('y1', y(0)); zero.setAttribute('y2', y(0));
  svg.append(zero);

  // 이어진 구간별로 선을 그린다 (결측은 끊는다)
  let seg = [];
  const flush = () => {
    if (seg.length >= 2) {
      const d = seg.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ');
      const area = document.createElementNS(svg.namespaceURI, 'path');
      area.setAttribute('class', 'area');
      area.setAttribute('d', `${d} L${seg[seg.length - 1][0].toFixed(1)},${y(0)} L${seg[0][0].toFixed(1)},${y(0)} Z`);
      svg.append(area);
      const line = document.createElementNS(svg.namespaceURI, 'path');
      line.setAttribute('class', 'line');
      line.setAttribute('d', d);
      svg.append(line);
    }
    seg = [];
  };
  series.forEach((p, i) => { if (p.v == null) flush(); else seg.push([x(i), y(p.v)]); });
  flush();

  series.forEach((p, i) => {
    if (p.raw == null) return;
    const c = document.createElementNS(svg.namespaceURI, 'circle');
    c.setAttribute('class', 'pt');
    c.setAttribute('cx', x(i).toFixed(1)); c.setAttribute('cy', y(p.raw).toFixed(1));
    c.setAttribute('r', 2.2);
    c.setAttribute('opacity', .55);
    svg.append(c);
  });
  return svg;
}
