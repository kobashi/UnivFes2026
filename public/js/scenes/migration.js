// 演目3「深海の大回遊」
// 4列それぞれが別の深さの海になり、違う生き物が泳ぐ。中央通路からは列2と列3、
// 壁側の通路からは列1と列3（または列2と列4）が同時に見えるので、どの組み合わせでも
// 同じ物が映らないようにしている。
//   列1 浅瀬   : クジラとウミガメが交互に横切り、熱帯魚の群れが泳ぐ
//   列2 中層   : イワシの群れが渦を巻きながら移動する
//   列3 中層   : マンボウがのんびり漂う
//   列4 深海   : チョウチンアンコウと発光クラゲ、光るプランクトン
//   列2⇔列3   : マンタの親子が中央通路を周回する。列2を泳ぎ切ると向かいの列3に現れて
//               戻ってくるので、中央通路の来場者の周りを回るように見える。
// 端末の間隔は実寸で扱う（隙間は「窓の外」）。大きな生き物は最大の隙間より大きくし、
// 隙間にいる間は隣の画面の縁が淡く光る。

import { maxGap, rowExtent, worldToScreenU } from '../layout.js';
import { clamp, mod, mulberry32, pentaFreq } from '../util.js';
import { edgeHint, hash01 } from './common.js';
import { drawAngler, drawFish, drawJelly, drawManta, drawSardine, drawSunfish, drawTurtle, drawWhale } from './sea-creatures.js';

const THEMES = {
  1: { bg: ['#1d78a3', '#0c4f78', '#062a45'], rays: 0.18, ocean: 600, bubbles: 14 },
  2: { bg: ['#0f5a85', '#073e63', '#031c33'], rays: 0.1, ocean: 450, bubbles: 10 },
  3: { bg: ['#0b4669', '#052b4d', '#021226'], rays: 0.07, ocean: 380, bubbles: 8 },
  4: { bg: ['#03192b', '#020c18', '#000307'], rays: 0, ocean: 220, bubbles: 3 },
};

const MANTA_SPEED = 0.75;
const MANTA_CROSS = 2.5; // 秒。通路の端で向かいの列へ渡る時間

// 列を横切る生き物の位置（全PCで同じ）。margin = 画面の外に出きるまでの余白
function pass(t, ext, { speed, margin, dir, offset = 0, rest = 0 }) {
  const dur = (ext.span + 2 * margin) / speed;
  const ct = mod(t - offset, dur + rest);
  if (ct > dur) return null;
  const d = ct * speed;
  return { X: dir > 0 ? ext.min - margin + d : ext.max + margin - d, dir, ct, dur };
}

export default class Migration {
  static id = 'migration';
  static title = '深海の大回遊';
  static subtitle = 'DEEP SEA MIGRATION';

  constructor(env) {
    const { seat, seats } = env;
    this.env = env;
    this.seat = seat;
    this.row = seat.row;
    this.theme = THEMES[seat.row] ?? THEMES[2];
    this.ext = rowExtent(seats, seat.row);
    const gap = maxGap(seats, seat.aisle);
    // 隙間が広いほど大きくして、どこかの画面に必ず一部が見えるようにする
    const grow = (base, max) => clamp(Math.max(base, gap + base * 0.6), base, max);
    this.whaleLen = grow(2.4, 4.5);
    this.turtleLen = grow(0.6, 1.2);
    this.mantaW = grow(1.3, 2.6);
    this.sunH = grow(0.55, 1.2);
    this.anglerL = grow(0.5, 1.0);
    this.ballR = 0.5 + gap * 0.5;

    // 列1：クジラとウミガメを交互に
    this.whaleDur = (this.ext.span + 2 * this.whaleLen) / 0.53;
    this.turtleDur = (this.ext.span + 2 * (this.turtleLen + 0.5)) / 0.4;
    this.row1Cycle = this.whaleDur + this.turtleDur + 8;

    // マンタの周回（列2→端で渡る→列3→端で渡る）
    this.ext2 = rowExtent(seats, 2);
    this.ext3 = rowExtent(seats, 3);
    this.d2 = (this.ext2.span + 2 * this.mantaW) / MANTA_SPEED;
    this.d3 = (this.ext3.span + 2 * this.mantaW) / MANTA_SPEED;
    this.mantaCycle = this.d2 + this.d3 + 2 * MANTA_CROSS;

    // 列ごとにシードを変え、同じ物が並ばないようにする
    const rnd = mulberry32(1234 + seat.row * 77);
    this.reef = Array.from({ length: 30 }, () => ({
      dx: (rnd() - 0.5) * 2.4 * (1 + gap * 0.6),
      dy: (rnd() - 0.5) * 0.4,
      ph: rnd() * 6.28,
      sp: 0.8 + rnd() * 0.4,
      s: 0.035 + rnd() * 0.03,
      hue: rnd() < 0.5 ? 25 + rnd() * 25 : 175 + rnd() * 35,
    }));
    this.sardines = Array.from({ length: 80 }, () => ({ ph: rnd() * 6.28, rr: 0.25 + rnd() * 0.75, sp: 0.5 + rnd() * 0.5, s: 0.018 + rnd() * 0.01 }));
    const nj = Math.max(3, Math.round(this.ext.span / 3));
    this.jelly = Array.from({ length: nj }, (_, i) => ({
      X: this.ext.min + ((i + 0.3 + rnd() * 0.4) / nj) * this.ext.span,
      ph: rnd() * 6.28,
      hue: seat.row === 4 ? 170 + rnd() * 40 : 290 + rnd() * 50,
      s: 0.08 + rnd() * 0.05,
    }));
    const lr = mulberry32(999 + seat.index); // 泡は画面ごとにバラバラで良い
    this.bubbles = Array.from({ length: this.theme.bubbles }, () => ({ u: lr(), sp: 0.05 + lr() * 0.12, r: 0.004 + lr() * 0.01, ph: lr() }));
    this.burst = [];
    this.lastCall = null;
    this.lastBloop = null;
    this.lastMotion = -99;
    this.sounds = null;
  }

  // マンタの位置。row が null の間は通路の端で向かいの列へ渡っている
  manta(t) {
    const m = this.mantaW;
    const v = MANTA_SPEED;
    const tau = mod(t, this.mantaCycle);
    const { d2, d3 } = this;
    const Y = 0.45 + 0.12 * Math.sin(t * 0.3);
    if (tau < d2) return { row: 2, X: this.ext2.min - m + tau * v, dir: 1, Y };
    if (tau < d2 + MANTA_CROSS) return { row: null, X: this.ext2.max + m, dir: 1, Y };
    if (tau < d2 + MANTA_CROSS + d3) return { row: 3, X: this.ext3.max + m - (tau - d2 - MANTA_CROSS) * v, dir: -1, Y };
    return { row: null, X: this.ext3.min - m, dir: -1, Y };
  }

  frame(ctx, w, h, t, dt) {
    const seat = this.seat;
    const sx = (X) => worldToScreenU(seat, X) * w;
    const near = (X, r) => Math.abs(X - seat.x) < r;
    const th = this.theme;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, th.bg[0]);
    bg.addColorStop(0.6, th.bg[1]);
    bg.addColorStop(1, th.bg[2]);
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // 水面から差し込む光（列全体でつながった位置に描く）
    if (th.rays > 0) {
      ctx.globalCompositeOperation = 'lighter';
      const ray = ctx.createLinearGradient(0, 0, 0, h);
      ray.addColorStop(0, `rgba(150,220,255,${th.rays})`);
      ray.addColorStop(1, 'rgba(150,220,255,0)');
      ctx.fillStyle = ray;
      const nRays = Math.ceil(this.ext.span / 1.7) + 2;
      for (let k = 0; k < nRays; k++) {
        const X = this.ext.min + k * 1.7 + Math.sin(t * 0.1 + k + this.row) * 0.4 - 0.5;
        if (!near(X, 1.5)) continue;
        ctx.beginPath();
        ctx.moveTo(sx(X - 0.12), 0);
        ctx.lineTo(sx(X + 0.12), 0);
        ctx.lineTo(sx(X + 0.75), h);
        ctx.lineTo(sx(X + 0.3), h);
        ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // 深海：光るプランクトン（部屋の座標に固定）
    if (this.row === 4) this.plankton(ctx, w, h, t, sx);

    if (this.row !== 2) {
      for (const j of this.jelly) {
        const X = j.X + 0.2 * Math.sin(t * 0.15 + j.ph);
        if (!near(X, 0.8)) continue;
        drawJelly(ctx, sx(X), (0.55 + 0.25 * Math.sin(t * 0.25 + j.ph)) * h, j.s * w, t + j.ph, j.hue);
      }
    }

    const focus = []; // 音の計算用 { X, kind }
    if (this.row === 1) this.drawRow1(ctx, w, h, t, sx, focus);
    if (this.row === 2) this.drawSardines(ctx, w, h, t, sx, focus);
    if (this.row === 3) this.drawSunfishRow(ctx, w, h, t, sx, focus);
    if (this.row === 4) this.drawAnglerRow(ctx, w, h, t, sx, focus);

    // マンタの親子（列2・3）
    if (this.row === 2 || this.row === 3) {
      for (const [lag, k] of [[0, 1], [3, 0.55]]) {
        const mt = this.manta(t - lag);
        const W = this.mantaW * k;
        // 翼は縦に広がるので、画面の高さに収まる大きさまでにする
        if (mt.row === this.row && near(mt.X, W / 2 + 0.8)) drawManta(ctx, sx(mt.X), (mt.Y + (k < 1 ? 0.12 : 0)) * h, Math.min(W * w, 0.85 * h * k), mt.dir * seat.screenSign, t - lag);
        // 隙間にいる時・向かいの列へ渡る直前直後も気配を残す
        if (mt.row === this.row || mt.row === null) edgeHint(ctx, w, h, seat, mt.X, mt.Y, '150,190,220', { strength: 0.3 * k });
        if (k === 1 && mt.row === this.row) focus.push({ X: mt.X, kind: 'manta' });
      }
    }

    // 泡
    ctx.strokeStyle = 'rgba(200,240,255,0.45)';
    ctx.lineWidth = Math.max(1, w * 0.0015);
    for (const b of this.bubbles) {
      const y = (1.05 - mod(t * b.sp + b.ph, 1.1)) * h;
      ctx.beginPath();
      ctx.arc((b.u + 0.02 * Math.sin(t * 2 + b.ph * 6)) * w, y, b.r * w, 0, Math.PI * 2);
      ctx.stroke();
    }

    // カメラの前で動くと泡が湧く
    const audio = this.env.audio;
    const cam = this.env.camera;
    if (cam.real && cam.motion > this.env.config.motionThreshold && t - this.lastMotion > 1) {
      this.lastMotion = t;
      for (let i = 0; i < 14; i++) {
        this.burst.push({ x: cam.cx * w + (Math.random() - 0.5) * w * 0.1, y: h * 1.02, vy: (0.25 + Math.random() * 0.35) * h, r: (0.006 + Math.random() * 0.018) * w, life: 1 });
      }
      for (let i = 0; i < 4; i++) audio.tone({ freq: 500 + Math.random() * 700, slide: [[1400, 0.12]], dur: 0.15, gain: 0.08, delay: i * 0.07 });
    }
    for (const b of this.burst) {
      b.y -= b.vy * dt;
      b.x += Math.sin(b.y * 0.05) * 0.5;
      b.life -= dt * 0.4;
      ctx.strokeStyle = this.row === 4 ? `rgba(140,255,220,${clamp(b.life, 0, 1) * 0.8})` : `rgba(220,250,255,${clamp(b.life, 0, 1) * 0.8})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.burst = this.burst.filter((b) => b.life > 0 && b.y > -b.r);

    this.sound(t, dt, focus);
  }

  drawRow1(ctx, w, h, t, sx, focus) {
    const seat = this.seat;
    const wh = pass(t, this.ext, { speed: 0.53, margin: this.whaleLen, dir: 1, rest: this.turtleDur + 8 });
    if (wh) {
      const Y = 0.5 + 0.1 * Math.sin(t * 0.4);
      if (Math.abs(wh.X - seat.x) < this.whaleLen / 2 + 0.8) drawWhale(ctx, sx(wh.X), Y * h, this.whaleLen * w, seat.screenSign, t);
      for (const e of [wh.X + this.whaleLen / 2, wh.X - this.whaleLen / 2]) edgeHint(ctx, w, h, seat, e, Y, '120,190,230', { strength: 0.35 });
      focus.push({ X: wh.X, kind: 'whale', ct: wh.ct });
    }
    const tu = pass(t, this.ext, { speed: 0.4, margin: this.turtleLen + 0.5, dir: -1, offset: this.whaleDur + 4, rest: this.whaleDur + 8 });
    if (tu) {
      const Y = 0.42 + 0.08 * Math.sin(t * 0.5);
      if (Math.abs(tu.X - seat.x) < this.turtleLen + 0.6) drawTurtle(ctx, sx(tu.X), Y * h, this.turtleLen * w, -seat.screenSign, t);
      edgeHint(ctx, w, h, seat, tu.X, Y, '170,200,120', { strength: 0.3 });
    }
    // 熱帯魚の群れ（常に回遊）
    const sc = pass(t, this.ext, { speed: 0.9, margin: 2.5, dir: -1, offset: 7, rest: 6 });
    if (sc) {
      const Y0 = 0.72 + 0.08 * Math.sin(t * 0.7);
      for (const f of this.reef) {
        const X = sc.X + f.dx + 0.05 * Math.sin(t * 2 + f.ph);
        if (Math.abs(X - seat.x) > 0.7) continue;
        drawFish(ctx, sx(X), (Y0 + f.dy * 0.5 + 0.02 * Math.sin(t * 3 * f.sp + f.ph)) * h, f.s * w, -seat.screenSign, t * 12 * f.sp + f.ph, f.hue);
      }
      edgeHint(ctx, w, h, seat, sc.X, Y0, '255,190,120', { strength: 0.2, range: 2 });
      focus.push({ X: sc.X, kind: 'fish' });
    }
  }

  // イワシの群れ：渦を巻きながら列を移動する
  drawSardines(ctx, w, h, t, sx, focus) {
    const seat = this.seat;
    const c = pass(t, this.ext, { speed: 0.35, margin: this.ballR + 0.6, dir: -1, offset: 5, rest: 4 });
    if (!c) return;
    const cy = 0.55 + 0.1 * Math.sin(t * 0.4);
    const R = this.ballR;
    for (const f of this.sardines) {
      const a = f.ph + t * f.sp * 1.4;
      const X = c.X + Math.cos(a) * R * f.rr;
      if (Math.abs(X - seat.x) > 0.6) continue;
      const Y = cy + Math.sin(a) * 0.22 * f.rr;
      // 実際の進行方向（渦の接線方向 + 群れ全体の移動）に向ける
      const w1 = f.sp * 1.4;
      const dxs = (-Math.sin(a) * R * f.rr * w1 + c.dir * 0.35) * seat.screenSign * w;
      const dys = Math.cos(a) * 0.22 * f.rr * w1 * h;
      drawSardine(ctx, sx(X), Y * h, f.s * w, Math.atan2(dys, dxs), 0.5 + 0.5 * Math.sin(a * 2 + t));
    }
    edgeHint(ctx, w, h, seat, c.X, cy, '190,210,230', { strength: 0.25, range: 1 + R });
    focus.push({ X: c.X, kind: 'sardine' });
  }

  drawSunfishRow(ctx, w, h, t, sx, focus) {
    const seat = this.seat;
    const s = pass(t, this.ext, { speed: 0.22, margin: this.sunH, dir: 1, offset: 10, rest: 10 });
    if (!s) return;
    const Y = 0.55 + 0.05 * Math.sin(t * 0.35);
    if (Math.abs(s.X - seat.x) < this.sunH + 0.6) drawSunfish(ctx, sx(s.X), Y * h, Math.min(this.sunH * w, 0.85 * h), seat.screenSign, t);
    edgeHint(ctx, w, h, seat, s.X, Y, '200,210,220', { strength: 0.3 });
    focus.push({ X: s.X, kind: 'sunfish' });
  }

  drawAnglerRow(ctx, w, h, t, sx, focus) {
    const seat = this.seat;
    const dur = (this.ext.span + 2 * (this.anglerL + 0.6)) / 0.25;
    const cycle = dur + 6;
    const dir = Math.floor(t / cycle) % 2 ? -1 : 1; // 行き来する
    const a = pass(t, this.ext, { speed: 0.25, margin: this.anglerL + 0.6, dir, rest: 6 });
    if (!a) return;
    const Y = 0.58 + 0.08 * Math.sin(t * 0.3);
    if (Math.abs(a.X - seat.x) < this.anglerL + 0.8) drawAngler(ctx, sx(a.X), Y * h, this.anglerL * w, dir * seat.screenSign, t);
    edgeHint(ctx, w, h, seat, a.X + dir * this.anglerL * 0.6, Y - 0.2, '120,255,200', { strength: 0.45 });
    focus.push({ X: a.X, kind: 'angler' });
  }

  plankton(ctx, w, h, t, sx) {
    const seat = this.seat;
    ctx.globalCompositeOperation = 'lighter';
    const cell = 0.1;
    for (let k = Math.floor((seat.x - 0.6) / cell); k <= Math.ceil((seat.x + 0.6) / cell); k++) {
      for (let j = 0; j < 3; j++) {
        const seed = k * 131 + j * 7919;
        const X = (k + hash01(seed)) * cell;
        const y = hash01(seed + 1) * h;
        const tw = Math.max(0, Math.sin(t * (0.5 + hash01(seed + 2) * 1.5) + seed));
        if (tw < 0.3) continue;
        const r = (1 + hash01(seed + 3) * 2) * (h / 700);
        ctx.fillStyle = `rgba(110,255,210,${(tw * 0.7).toFixed(3)})`;
        ctx.fillRect(sx(X) - r / 2, y - r / 2, r, r);
      }
    }
    ctx.globalCompositeOperation = 'source-over';
  }

  // 生き物の近くの画面ほど、その生き物の音が大きく鳴る
  sound(t, dt, focus) {
    const audio = this.env.audio;
    const seat = this.seat;
    if (!this.sounds) {
      this.sounds = {
        ocean: audio.drone({ noise: true, filter: this.theme.ocean }),
        body: audio.drone({
          freq: { 1: 82.4, 2: 98, 3: 73.4, 4: 55 }[this.row] ?? 82.4,
          type: this.row === 4 ? 'triangle' : 'sawtooth',
          filter: this.row === 4 ? 200 : 320,
        }),
      };
    }
    this.sounds.ocean.set(0.035);
    const prox = (X, r = 1.2) => Math.exp(-((X - seat.x) ** 2) / (2 * r * r));
    const main = focus.find((f) => f.kind !== 'fish' && f.kind !== 'sardine');
    this.sounds.body.set(main ? 0.18 * prox(main.X) : 0);

    const whale = focus.find((f) => f.kind === 'whale');
    if (whale) {
      const ci = Math.floor(whale.ct / 7);
      if (this.lastCall !== null && ci !== this.lastCall && prox(whale.X) > 0.15) {
        audio.tone({ freq: 260, slide: [[420, 0.8], [220, 2.2]], dur: 2.6, gain: 0.22 * prox(whale.X), attack: 0.4 });
      }
      this.lastCall = ci;
    } else {
      this.lastCall = null;
    }
    const sun = focus.find((f) => f.kind === 'sunfish');
    if (sun) {
      const bi = Math.floor(t / 4);
      if (this.lastBloop !== null && bi !== this.lastBloop && prox(sun.X) > 0.2) {
        audio.tone({ freq: 140, slide: [[90, 0.3]], dur: 0.4, gain: 0.15 * prox(sun.X) });
      }
      this.lastBloop = bi;
    }
    for (const f of focus) {
      if ((f.kind === 'fish' || f.kind === 'sardine') && Math.abs(f.X - seat.x) < 1.2 && Math.random() < dt * 3) {
        audio.tone({ freq: pentaFreq(f.kind === 'fish' ? 880 : 1175, Math.floor(Math.random() * 8)), dur: 0.25, gain: 0.05 });
      }
      if (f.kind === 'angler' && Math.abs(f.X - seat.x) < 1 && Math.random() < dt * 0.8) {
        audio.bell(pentaFreq(1320, Math.floor(Math.random() * 5)), { gain: 0.05, dur: 1.5 });
      }
    }
  }

  leave() {
    this.sounds?.ocean.stop();
    this.sounds?.body.stop();
  }
}
