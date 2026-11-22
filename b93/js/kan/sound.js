/* 칸이 소리 (2026-11-13 사용자: '캐릭터를 누르면 이쁜 소리를 내면 좋겠다')
   소리 파일 없이 Web Audio 로 만든다 — 말랑한 '뽁' + 실로폰 같은 맑은 음.
   기분마다 다른 소리, 연달아 누르면 5음 음계로 한 칸씩 올라간다(장난감처럼).
   폰이 무음·진동이면 소리 대신 진동만 (HabitAlarm.info 의 ringerMode). */

const PENTA = [0, 2, 4, 7, 9];                       // 도 레 미 솔 라
const note = (base, i) => base * Math.pow(2, (PENTA[((i % 5) + 5) % 5] + 12 * Math.floor(i / 5)) / 12);

/** 맑은 종소리 한 음 (사인 + 배음, 빨리 사라짐) */
function bell(ctx, out, f, t, { vol = 0.22, len = 0.9 } = {}) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  g.connect(out);
  for (const [mul, a, type] of [[1, 1, 'sine'], [2, 0.32, 'sine'], [3.01, 0.12, 'triangle'], [4.2, 0.05, 'sine']]) {
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f * mul, t);
    og.gain.value = a; o.connect(og); og.connect(g);
    o.start(t); o.stop(t + len + 0.05);
  }
}
/** 말랑한 '뽁' (위로 미끄러지는 짧은 음) */
function pop(ctx, out, t, { from = 380, to = 900, vol = 0.2, len = 0.12 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(from, t);
  o.frequency.exponentialRampToValueAtTime(to, t + len * 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  o.connect(g); g.connect(out);
  o.start(t); o.stop(t + len + 0.02);
}
/** 살짝 울림 (짧은 메아리) */
function space(ctx, dest) {
  const inp = ctx.createGain(), d = ctx.createDelay(1), fb = ctx.createGain(), wet = ctx.createGain(), lp = ctx.createBiquadFilter();
  d.delayTime.value = 0.13; fb.gain.value = 0.28; wet.gain.value = 0.32; lp.type = 'lowpass'; lp.frequency.value = 3200;
  inp.connect(dest); inp.connect(d); d.connect(lp); lp.connect(fb); fb.connect(d); lp.connect(wet); wet.connect(dest);
  return inp;
}

/** 소리 순서표 — ctx 시각 t 부터. step = 연달아 누른 횟수 */
export function schedule(ctx, dest, mood, t, step = 0) {
  const out = space(ctx, dest);
  const C6 = 1046.5, G5 = 784, E5 = 659.3, A4 = 440;
  if (mood === 'great') {                                       // 반짝 올라가는 세 음
    pop(ctx, out, t, { from: 420, to: 1100 });
    [0, 1, 2].forEach((k) => bell(ctx, out, note(C6, step + k * 2), t + 0.05 + k * 0.075, { vol: 0.17, len: 0.7 }));
  } else if (mood === 'good') {                                 // 짹짹 두 음
    pop(ctx, out, t, { from: 400, to: 950 });
    bell(ctx, out, note(G5, step), t + 0.04, { vol: 0.19, len: 0.6 });
    bell(ctx, out, note(G5, step + 2), t + 0.13, { vol: 0.17, len: 0.8 });
  } else if (mood === 'sad') {                                  // 토닥, 낮고 따뜻한 두 음
    pop(ctx, out, t, { from: 260, to: 420, vol: 0.16, len: 0.14 });
    bell(ctx, out, note(A4, step + 2), t + 0.06, { vol: 0.15, len: 1.0 });
    bell(ctx, out, note(A4, step), t + 0.26, { vol: 0.13, len: 1.2 });
  } else {                                                      // 보통: 맑은 한 음
    pop(ctx, out, t, { from: 360, to: 820, vol: 0.18 });
    bell(ctx, out, note(E5, step), t + 0.04, { vol: 0.2, len: 0.9 });
  }
}

let ctx = null, lastAt = 0, step = 0, ringer = { at: 0, ok: true };
async function soundAllowed() {
  if (Date.now() - ringer.at < 10000) return ringer.ok;
  let ok = true;
  try { const r = await window.Capacitor?.Plugins?.HabitAlarm?.info?.(); if (r?.ringerMode && r.ringerMode !== 'normal') ok = false; } catch { /* 모르면 소리 */ }
  ringer = { at: Date.now(), ok };
  return ok;
}
export async function play(mood) {
  try { navigator.vibrate?.(8); } catch { /* */ }
  if (!(await soundAllowed())) return;
  try {
    ctx = ctx || new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') await ctx.resume();
    const now = performance.now();
    step = now - lastAt < 900 ? step + 1 : 0;                  // 연달아 누르면 한 칸씩 위로 (8칸 뒤 처음으로)
    if (step > 7) step = 0;
    lastAt = now;
    /* 사용자 2026-11-13 '4번 소리가 좋다' — 기분과 상관없이 토닥이는 낮고 따뜻한 2음(원래 '안 좋음' 소리)을 기본으로 */
    schedule(ctx, ctx.destination, 'sad', ctx.currentTime + 0.01, step);
  } catch (e) { console.warn('[kan] sound', e); }
}
