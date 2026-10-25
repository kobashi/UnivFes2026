// 演目6「星降る夜」
// 4列を東西南北の夜空に見立て、列ごとに違う空を描く（10月の宵の空がモチーフ）。
//   列1 東の空 : 海から月がのぼり、すばるが輝く
//   列2 北の空 : 北極星を中心に星空がゆっくり回る。北斗七星・カシオペヤ座・オーロラ
//   列3 南の空 : 天の川とペガススの大四辺形、低い空にフォーマルハウト
//   列4 西の空 : 夕焼けの名残が消えていき、街の灯りの上に夏の大三角
// 北と南が向かい合う中央通路では、流れ星が列2から頭上を越えて列3へ（または逆へ）渡る。
// 星や稜線は部屋の座標に固定してあり、端末の間隔が広くても窓越しのように続いて見える。
// 星座の形と配置は「その列を見る人から見た左右」で決めている（部屋の座標のままだと、
// 見る向きが逆の列で星座が鏡写しになるため）。
// カメラの前で動くと、その画面から流れ星が飛び立つ。

import { maxGap, rowExtent, screenToWorldX, worldToScreenU } from '../layout.js';
import { clamp, hsl, mod, pentaFreq } from '../util.js';
import { edgeHint, hash01 } from './common.js';

const ASPECT = 9 / 16; // 画面の高さ（ユニット）
const STAR_CELL = 0.25;
const METEOR_EVERY = 3.2;
const METEOR_SPEED = 5;
const METEOR_LIFE = 1.8;
const SHOWER_EVERY = 30;
const SHOWER_LEN = 6;
const SHOWER_GAP = 0.4;
const OVERHEAD_EVERY = 6;
const ROTATE = (2 * Math.PI) / 1800; // 北の空の回転（rad/秒）

const SKIES = {
  1: { name: '東の空', pad: 130.8 },
  2: { name: '北の空', pad: 164.8 },
  3: { name: '南の空', pad: 196 },
  4: { name: '西の空', pad: 246.9 },
};

// 星座：{ name, pts: [[x, y, 明るさ], ...], lines: [[i, j], ...] }
// x, y はユニットで、見る人から見て x は右向き、y は下向き
const DIPPER = {
  name: '北斗七星',
  // ドゥーベ・メラク（指極星）を北極星側に向け、柄は左下へ伸びる
  pts: [[0, 0, 1], [0, 0.9, 1], [-1.1, 1.1, 0.8], [-1.0, 0.25, 0.6], [-1.9, 0.0, 0.9], [-2.6, 0.15, 0.9], [-3.3, 0.6, 0.9]].map(([x, y, m]) => [x * 0.22, y * 0.22, m]),
  lines: [[0, 1], [1, 2], [2, 3], [3, 0], [3, 4], [4, 5], [5, 6]],
};
const CASSIOPEIA = {
  name: 'カシオペヤ座',
  pts: [[0, 0, 0.9], [0.5, 0.6, 0.9], [1, 0.15, 1], [1.5, 0.7, 0.8], [2, 0.1, 0.8]].map(([x, y, m]) => [x * 0.22, y * 0.22, m]),
  lines: [[0, 1], [1, 2], [2, 3], [3, 4]],
};
const PEGASUS = {
  name: 'ペガススの大四辺形',
  pts: [[0, 0, 0.9], [1, 0.05, 0.9], [0.95, 0.9, 0.8], [-0.05, 0.85, 0.8], [-0.6, 0.15, 0.8], [-1.15, 0.35, 0.9]].map(([x, y, m]) => [x * 0.35, y * 0.35, m]),
  lines: [[0, 1], [1, 2], [2, 3], [3, 0], [0, 4], [4, 5]],
};
const PLEIADES = {
  name: 'すばる',
  pts: [[0, 0, 0.8], [0.25, 0.12, 0.7], [0.45, -0.05, 0.7], [0.38, 0.3, 0.6], [0.15, 0.35, 0.6], [0.6, 0.22, 0.6], [0.3, -0.18, 0.6]].map(([x, y, m]) => [x * 0.3, y * 0.3, m]),
  lines: [],
};

export default class NightSky {
  static id = 'nightsky';
  static title = '星降る夜';
  static subtitle = 'STARRY NIGHT — 動くと流れ星が飛ぶ';

  constructor(env) {
    const { seat, seats } = env;
    this.env = env;
    this.seat = seat;
    this.row = seat.row;
    this.sky = SKIES[seat.row] ?? SKIES[2];
    this.ext = rowExtent(seats, seat.row);
    this.ext2 = rowExtent(seats, 2);
    this.ext3 = rowExtent(seats, 3);
    this.trail = Math.max(1.6, maxGap(seats, seat.aisle) + 1.2);
    this.seatMap = new Map(seats.map((s) => [s.id, s]));
    // 列の真ん中に近い画面に方角を表示する
    const mid = (this.ext.min + this.ext.max) / 2;
    const rowSeats = seats.filter((s) => s.row === seat.row);
    this.showLabel = rowSeats.reduce((a, b) => (Math.abs(b.x - mid) < Math.abs(a.x - mid) ? b : a)).id === seat.id;
    this.extra = [];
    this.played = new Set();
    this.lastMotion = -99;
    this.lastPing = -99;
    this.sparkle = 0;
    this.pad = null;
    this.layout();
  }

  // 列ごとの星座の位置（ワールド座標）
  layout() {
    const { min, max, span } = this.ext;
    // 見る人から見て左端 = 0、右端 = 1 の位置をワールド座標に変換する
    this.vs = this.seat.screenSign;
    const at = (f) => (this.vs > 0 ? min + f * span : max - f * span);
    this.at = at;
    this.cons = [];
    // 東の空：すばるが昇ってくる
    if (this.row === 1) this.cons.push({ c: PLEIADES, X: at(0.68), Y: 0.3 });
    if (this.row === 2) {
      // 北の空：北極星の左下（北西）に北斗七星、右上（北東）にカシオペヤ座
      this.pole = { X: at(0.5), Y: 0.3 };
      this.cons.push({ c: DIPPER, X: this.vx(this.pole.X, -1.1), Y: 0.32, rotate: true });
      this.cons.push({ c: CASSIOPEIA, X: this.vx(this.pole.X, 0.8), Y: 0.02, rotate: true });
      // 回る星（北極星のまわりの円盤に散らす）
      const R = span / 2 + 1;
      const n = Math.min(4000, Math.round(R * R * 30));
      this.disk = Array.from({ length: n }, (_, i) => {
        const r = Math.sqrt(hash01(i * 3 + 11)) * R;
        return { r, a: hash01(i * 3 + 12) * Math.PI * 2, m: hash01(i * 3 + 13) };
      });
    }
    if (this.row === 3) {
      // 南の空：左上（南東の高い空）にペガススの大四辺形、真南の低い空にフォーマルハウト
      this.cons.push({ c: PEGASUS, X: at(0.22), Y: 0.08 });
      this.fomalhaut = { X: at(0.5), Y: 0.66 };
    }
    if (this.row === 4) {
      // 西の空：高い空にデネブ、左下（南西）にアルタイル、右（北西）にベガ。
      // 縦横の比率を実際の空に近づけるため、横幅も画面の高さ程度に収める
      const d = at(0.55);
      this.triangle = { deneb: { X: d, Y: 0.08 }, altair: { X: this.vx(d, -0.45), Y: 0.62 }, vega: { X: this.vx(d, 0.32), Y: 0.46 } };
    }
  }

  // 見る人から見て右へ dxView ユニット動かした位置
  vx(X, dxView) {
    return X + this.vs * dxView;
  }

  // 見る人から見た左右の位置（0..1）
  viewF(X) {
    const f = (X - this.ext.min) / this.ext.span;
    return this.vs > 0 ? f : 1 - f;
  }

  // 天の川の帯の中心（y、画面高さ比）。帯のない列・範囲外は null
  milkyY(X) {
    const f = this.viewF(X);
    let y = null;
    if (this.row === 3) y = (f - 0.45) / 0.4; // 右下（南西の地平線）から天頂へ
    // デネブを通り、アルタイルとベガの間を抜けて地平線へ
    if (this.row === 4) y = (-this.vs * (X - this.triangle.deneb.X) + 0.02) / 0.2;
    return y !== null && y > -0.2 && y < 1.1 ? y : null;
  }

  ground(X) {
    const r = this.row;
    if (r === 1) return 0.76; // 海の水平線
    if (r === 2) return 0.78 + 0.06 * Math.sin(X * 1.1) + 0.03 * Math.sin(X * 2.7 + 1) + 0.015 * Math.sin(X * 6.1);
    if (r === 3) return 0.84 + 0.03 * Math.sin(X * 0.6 + 2) + 0.01 * Math.sin(X * 2.3);
    return 0.9;
  }

  onEvent(ev) {
    if (ev.type !== 'meteor') return;
    const o = this.seatMap.get(ev.seat);
    if (!o) return;
    const overhead = o.row === 2 || o.row === 3;
    if (overhead ? this.row !== 2 && this.row !== 3 : o.row !== this.row) return;
    this.extra.push({ overhead, from: o.row, X0: o.x, dir: ev.dir ?? 1, t0ms: ev.t, id: `e${ev.t}${ev.seat}` });
    if (this.extra.length > 20) this.extra.shift();
  }

  // 列に沿って流れる流れ星
  meteors(t, now) {
    const out = [];
    const r = this.row;
    const { min, span } = this.ext;
    const add = (seed, st, dir) => {
      const age = t - st;
      if (age < 0 || age > METEOR_LIFE) return;
      out.push({
        id: `m${seed}`,
        X0: min + hash01(seed + 2) * span,
        y0: 0.05 + hash01(seed + 3) * 0.3,
        dir: dir ?? (hash01(seed + 1) < 0.5 ? 1 : -1),
        age,
        big: hash01(seed + 4) < 0.2,
      });
    };
    const n = Math.floor(t / METEOR_EVERY);
    for (let k = n - 1; k <= n; k++) add(k * 31 + r * 997, k * METEOR_EVERY + hash01(k * 31 + r * 997) * 1.5);
    const si = Math.floor(t / SHOWER_EVERY);
    const ss = si * SHOWER_EVERY + SHOWER_EVERY - SHOWER_LEN;
    if (t > ss - 1 && t < ss + SHOWER_LEN + METEOR_LIFE) {
      const dir = hash01(si * 7 + r) < 0.5 ? 1 : -1;
      const m = Math.floor((t - ss) / SHOWER_GAP);
      for (let k = Math.max(0, m - 5); k <= m; k++) add(si * 1000 + k * 13 + r * 5, ss + k * SHOWER_GAP, dir);
    }
    for (const e of this.extra) {
      if (!e.overhead) out.push({ id: e.id, X0: e.X0, y0: 0.15, dir: e.dir, age: (now - e.t0ms) / 1000, big: true });
    }
    return out.filter((m) => m.age >= 0 && m.age <= METEOR_LIFE);
  }

  // 頭上を越える流れ星（列2⇔列3）。phase: 0 = 出発側の列を上へ、1 = 到着側の列を下へ
  overheads(t, now) {
    if (this.row !== 2 && this.row !== 3) return [];
    const out = [];
    const lo = Math.min(this.ext2.min, this.ext3.min);
    const hi = Math.max(this.ext2.max, this.ext3.max);
    const n = Math.floor(t / OVERHEAD_EVERY);
    for (let k = n - 1; k <= n; k++) {
      const seed = k * 53 + 7;
      out.push({ id: `o${k}`, from: k % 2 ? 3 : 2, X0: lo + 0.5 + hash01(seed) * (hi - lo - 1), dir: hash01(seed + 1) < 0.5 ? 1 : -1, age: t - (k * OVERHEAD_EVERY + hash01(seed + 2) * 2) });
    }
    for (const e of this.extra) if (e.overhead) out.push({ id: e.id, from: e.from, X0: e.X0, dir: e.dir, age: (now - e.t0ms) / 1000 });
    return out.filter((m) => m.age >= 0 && m.age < 2);
  }

  frame(ctx, w, h, t, dt, g) {
    const seat = this.seat;
    const audio = this.env.audio;
    const X0 = screenToWorldX(seat, 0);
    const X1 = screenToWorldX(seat, 1);
    const xa = Math.min(X0, X1);
    const xb = Math.max(X0, X1);
    const sx = (X) => worldToScreenU(seat, X) * w;
    const dur = Math.max(1, g.info.duration);

    // 空の色（西は夕焼けの名残が上演中に消えていく）
    const dusk = this.row === 4 ? clamp(1 - t / (dur * 0.6), 0, 1) : 0;
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#02030c');
    bg.addColorStop(0.6, this.row === 2 ? '#06102a' : '#0a0c2a');
    bg.addColorStop(1, this.row === 1 ? '#151a3a' : '#1d1238');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    if (dusk > 0) {
      const gl = ctx.createLinearGradient(0, h * 0.35, 0, h);
      gl.addColorStop(0, 'rgba(255,120,60,0)');
      gl.addColorStop(0.7, `rgba(255,120,60,${0.55 * dusk})`);
      gl.addColorStop(1, `rgba(255,190,120,${0.7 * dusk})`);
      ctx.fillStyle = gl;
      ctx.fillRect(0, h * 0.35, w, h * 0.65);
    }
    const starA = 1 - 0.85 * dusk;

    ctx.globalCompositeOperation = 'lighter';
    // 天の川（列3・4）。加算合成なので短冊どうしを重ねない
    if (this.row === 3 || this.row === 4) {
      const SL = 12;
      for (let i = 0; i < SL; i++) {
        const X = X0 + ((i + 0.5) / SL) * (X1 - X0);
        const my = this.milkyY(X);
        if (my === null) continue;
        const yc = my * h;
        const gr = ctx.createLinearGradient(0, yc - h * 0.2, 0, yc + h * 0.2);
        gr.addColorStop(0, 'rgba(140,150,255,0)');
        gr.addColorStop(0.5, `rgba(170,170,255,${0.14 * starA})`);
        gr.addColorStop(1, 'rgba(140,150,255,0)');
        ctx.fillStyle = gr;
        const x0 = Math.floor((i * w) / SL);
        ctx.fillRect(x0, yc - h * 0.2, Math.floor(((i + 1) * w) / SL) - x0, h * 0.4);
      }
    }

    // 星
    this.sparkle = Math.max(0, this.sparkle - dt * 0.5);
    const starR = (m) => (1 + m * 2) * (h / 600) * (1 + this.sparkle);
    ctx.fillStyle = '#fff';
    if (this.row === 2) {
      // 北極星のまわりを回る星。短い光跡を付ける
      const ang = -t * ROTATE; // 北を向いて見ると反時計回り（y 下向きの座標では角度が減る向き）
      for (const s of this.disk) {
        const a = s.a + ang;
        const X = this.vx(this.pole.X, s.r * Math.cos(a));
        if (X < xa - 0.05 || X > xb + 0.05) continue;
        const y = (this.pole.Y * ASPECT + s.r * Math.sin(a)) / ASPECT;
        if (y < 0 || y > this.ground(X)) continue;
        const tw = 0.55 + 0.45 * Math.sin(t * (1 + s.m * 3) + s.a * 50);
        ctx.globalAlpha = clamp(tw * (0.5 + this.sparkle) * (0.4 + 0.6 * s.m), 0, 1);
        const r = starR(s.m * 0.8);
        ctx.fillRect(sx(X) - r / 2, y * h - r / 2, r, r);
      }
      ctx.globalAlpha = 1;
    } else {
      for (let k = Math.floor(xa / STAR_CELL) - 1; k <= Math.ceil(xb / STAR_CELL); k++) {
        for (let j = 0; j < 12; j++) {
          const seed = k * 7919 + j * 104729 + this.row * 15485863;
          const X = (k + hash01(seed)) * STAR_CELL;
          let y = hash01(seed + 1) * 0.78;
          const band = this.milkyY(X);
          if (band !== null && hash01(seed + 5) < 0.5) y = band + (hash01(seed + 6) - 0.5) * 0.2;
          if (y < 0 || y > this.ground(X)) continue;
          const tw = 0.55 + 0.45 * Math.sin(t * (1 + hash01(seed + 2) * 3) + seed);
          ctx.globalAlpha = clamp(tw * (0.5 + this.sparkle) * starA, 0, 1);
          const r = starR(hash01(seed + 3));
          ctx.fillRect(sx(X) - r / 2, y * h - r / 2, r, r);
        }
      }
      ctx.globalAlpha = 1;
    }

    // オーロラ（北の空）
    if (this.row === 2) this.aurora(ctx, w, h, t, X0, X1);

    // 星座。24秒ごとに星座線と名前が浮かび上がる
    const cp = mod(t, 24);
    const lineA = clamp(Math.min((cp - 4) / 1.5, (14 - cp) / 1.5), 0, 1);
    this.drawConstellations(ctx, w, h, t, sx, xa, xb, lineA, starA);

    // 月（東の空）：海からのぼる
    let moon = null;
    if (this.row === 1) {
      const p = clamp(t / dur, 0, 1);
      // 月は東の地平線から右上（南東）へ昇っていく
      moon = { X: this.at(0.28 + 0.12 * p), Y: 0.82 - 0.55 * Math.sqrt(p) };
      const mr = h * 0.09;
      if (Math.abs(moon.X - seat.x) < 1) {
        const mx = sx(moon.X);
        const warm = clamp((moon.Y - 0.4) / 0.4, 0, 1); // 低いほど赤い
        const glow = ctx.createRadialGradient(mx, moon.Y * h, mr * 0.8, mx, moon.Y * h, mr * 4);
        glow.addColorStop(0, `rgba(255,${230 - 60 * warm},${190 - 90 * warm},0.25)`);
        glow.addColorStop(1, 'rgba(255,230,190,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(mx - mr * 4, moon.Y * h - mr * 4, mr * 8, mr * 8);
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = `rgb(255,${246 - 70 * warm},${220 - 110 * warm})`;
        ctx.beginPath();
        ctx.arc(mx, moon.Y * h, mr, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalCompositeOperation = 'lighter';
      }
      edgeHint(ctx, w, h, seat, moon.X, moon.Y, '255,240,200', { strength: 0.3, range: 1.5 });
    }

    // 流れ星（列に沿って）
    for (const m of this.meteors(t, g.now)) {
      const head = m.X0 + m.dir * METEOR_SPEED * m.age;
      const len = Math.min(this.trail * (m.big ? 1.4 : 1), METEOR_SPEED * m.age);
      const hy = m.y0 + 0.1 * METEOR_SPEED * m.age;
      const ty = m.y0 + 0.1 * (METEOR_SPEED * m.age - len);
      const life = 1 - m.age / METEOR_LIFE;
      const prevHead = head - m.dir * METEOR_SPEED * dt;
      if ((prevHead - seat.x) * (head - seat.x) <= 0 && t - this.lastPing > 0.12) {
        this.lastPing = t;
        audio.bell(pentaFreq(m.big ? 660 : 1320, seat.rank), { gain: m.big ? 0.15 : 0.08, dur: 1.2 });
        audio.noise({ freq: 3500, q: 0.7, dur: 0.25, gain: 0.04 });
      }
      const tail = head - m.dir * len;
      if (Math.max(head, tail) < xa - 0.1 || Math.min(head, tail) > xb + 0.1) continue;
      streak(ctx, sx(head), hy * h, sx(tail), ty * h, life, (m.big ? 0.012 : 0.006) * h);
    }

    // 頭上を越える流れ星（中央通路）
    for (const m of this.overheads(t, g.now)) {
      const to = m.from === 2 ? 3 : 2;
      // 出発側：0〜0.7秒で画面の上へ抜ける / 到着側：1.0〜1.9秒で上から降りてくる
      let seg = null;
      if (this.row === m.from && m.age < 0.9) seg = { a: Math.max(0, m.age - 0.25), b: Math.min(m.age, 0.7), y: (k) => 0.55 - 0.7 * (k / 0.7), x: (k) => m.X0 + m.dir * 0.6 * (k / 0.7) };
      if (this.row === to && m.age >= 1.0) seg = { a: Math.max(1.0, m.age - 0.3), b: Math.min(m.age, 1.9), y: (k) => -0.1 + 0.7 * ((k - 1) / 0.9), x: (k) => m.X0 + m.dir * (0.85 + 0.75 * ((k - 1) / 0.9)) };
      if (!seg || seg.b <= seg.a) continue;
      const fade = this.row === to ? clamp((1.9 - m.age) / 0.5, 0, 1) : 1;
      streak(ctx, sx(seg.x(seg.b)), seg.y(seg.b) * h, sx(seg.x(seg.a)), seg.y(seg.a) * h, fade, 0.012 * h);
      const key = `${m.id}:${this.row}`;
      if (!this.played.has(key) && Math.abs(seg.x(seg.b) - seat.x) < 0.8) {
        this.played.add(key);
        if (this.row === m.from) audio.tone({ freq: 600, slide: [[1800, 0.6]], dur: 0.7, gain: 0.07 });
        else audio.bell(pentaFreq(880, seat.rank), { gain: 0.14, dur: 1.6 });
      }
    }
    if (this.played.size > 200) this.played.clear();
    this.extra = this.extra.filter((e) => (g.now - e.t0ms) / 1000 < 2.5);
    ctx.globalCompositeOperation = 'source-over';

    this.drawGround(ctx, w, h, t, sx, xa, xb, moon);

    if (this.showLabel) {
      ctx.fillStyle = `rgba(255,255,255,${0.25 + 0.5 * lineA})`;
      ctx.font = `${Math.round(h * 0.045)}px "Hiragino Sans", sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText(this.sky.name, w / 2, h * 0.97);
    }

    // カメラ：動くと星がきらめき、流れ星が飛ぶ
    const cam = this.env.camera;
    if (cam.real && cam.motion > this.env.config.motionThreshold && t - this.lastMotion > 3 && g.info.fade > 0.8) {
      this.lastMotion = t;
      this.sparkle = 1;
      this.env.emit('meteor', {});
    }

    // 列ごとに違う音の持続音（4列で和音になる）
    if (!this.pad) this.pad = audio.drone({ freq: this.sky.pad, type: 'sine' });
    this.pad.set(0.025 + (this.row === 2 ? 0.02 * Math.max(0, Math.sin(seat.x * 0.9 - t * 0.35)) : 0));
  }

  aurora(ctx, w, h, t, X0, X1) {
    const AS = 24;
    for (let i = 0; i < AS; i++) {
      const X = X0 + ((i + 0.5) / AS) * (X1 - X0);
      for (let c = 0; c < 2; c++) {
        const inten = Math.max(0, Math.sin(X * 0.9 - t * 0.35 + c * 2.1) * 0.5 + Math.sin(X * 0.37 + t * 0.2 + c) * 0.5);
        if (inten < 0.05) continue;
        const top = (0.15 + 0.07 * Math.sin(X * 0.7 + t * 0.3 + c)) * h;
        const bottom = top + h * (0.3 + 0.1 * Math.sin(X * 1.7 + c));
        const hue = mod(130 + c * 150 + X * 4, 360);
        const gr = ctx.createLinearGradient(0, top, 0, bottom);
        gr.addColorStop(0, hsl(hue, 80, 55, 0));
        gr.addColorStop(0.75, hsl(hue, 80, 55, 0.38 * inten));
        gr.addColorStop(1, hsl(hue, 80, 60, 0));
        ctx.fillStyle = gr;
        const x0 = Math.floor((i * w) / AS);
        ctx.fillRect(x0, top, Math.floor(((i + 1) * w) / AS) - x0, bottom - top);
      }
    }
  }

  drawConstellations(ctx, w, h, t, sx, xa, xb, lineA, starA) {
    const pts = []; // [X, y, 明るさ, ラベル]
    const segs = [];
    const ang = -t * ROTATE;
    for (const { c, X, Y, rotate } of this.cons) {
      const base = pts.length;
      for (const [dx, dy, m] of c.pts) {
        let px = this.vx(X, dx);
        let pyU = Y * ASPECT + dy;
        if (rotate) {
          // 北極星を中心に、見る人から見た座標で回す
          const rx = this.vs * (px - this.pole.X);
          const ry = pyU - this.pole.Y * ASPECT;
          px = this.vx(this.pole.X, rx * Math.cos(ang) - ry * Math.sin(ang));
          pyU = this.pole.Y * ASPECT + rx * Math.sin(ang) + ry * Math.cos(ang);
        }
        pts.push([px, pyU / ASPECT, m]);
      }
      for (const [i, j] of c.lines) segs.push([base + i, base + j]);
      const p0 = pts[base];
      if (lineA > 0) this.label(ctx, w, h, sx, xa, xb, p0[0], p0[1] - 0.08, c.name, lineA);
    }
    if (this.row === 2) {
      pts.push([this.pole.X, this.pole.Y, 1]);
      if (lineA > 0) this.label(ctx, w, h, sx, xa, xb, this.pole.X, this.pole.Y + 0.1, '北極星', lineA);
    }
    if (this.row === 3) {
      pts.push([this.fomalhaut.X, this.fomalhaut.Y, 1]);
      if (lineA > 0) this.label(ctx, w, h, sx, xa, xb, this.fomalhaut.X, this.fomalhaut.Y - 0.08, 'フォーマルハウト', lineA);
    }
    if (this.row === 4) {
      const { vega, deneb, altair } = this.triangle;
      const b = pts.length;
      pts.push([vega.X, vega.Y, 1], [deneb.X, deneb.Y, 0.9], [altair.X, altair.Y, 0.95]);
      segs.push([b, b + 1], [b + 1, b + 2], [b + 2, b]);
      if (lineA > 0) {
        this.label(ctx, w, h, sx, xa, xb, vega.X, vega.Y - 0.08, 'ベガ（夏の大三角）', lineA);
        this.label(ctx, w, h, sx, xa, xb, deneb.X, deneb.Y - 0.06, 'デネブ', lineA);
        this.label(ctx, w, h, sx, xa, xb, altair.X, altair.Y + 0.1, 'アルタイル', lineA);
      }
    }
    if (lineA > 0) {
      ctx.strokeStyle = `rgba(160,200,255,${0.4 * lineA})`;
      ctx.lineWidth = Math.max(1, h * 0.003);
      ctx.beginPath();
      for (const [i, j] of segs) {
        const [ax, ay] = pts[i];
        const [bx, by] = pts[j];
        if (Math.max(ax, bx) < xa - 0.5 || Math.min(ax, bx) > xb + 0.5) continue;
        ctx.moveTo(sx(ax), ay * h);
        ctx.lineTo(sx(bx), by * h);
      }
      ctx.stroke();
    }
    // 明るい星はにじんだ光で描く
    for (const [X, y, m] of pts) {
      if (X < xa - 0.1 || X > xb + 0.1 || y < 0 || y > this.ground(X)) continue;
      const r = h * (0.008 + 0.012 * m);
      const gr = ctx.createRadialGradient(sx(X), y * h, 0, sx(X), y * h, r * 3);
      gr.addColorStop(0, `rgba(255,255,255,${0.95 * Math.max(starA, 0.5)})`);
      gr.addColorStop(0.3, `rgba(200,220,255,${0.35 * Math.max(starA, 0.5)})`);
      gr.addColorStop(1, 'rgba(200,220,255,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(sx(X) - r * 3, y * h - r * 3, r * 6, r * 6);
    }
  }

  label(ctx, w, h, sx, xa, xb, X, y, text, a) {
    if (X < xa - 0.3 || X > xb + 0.3) return;
    ctx.fillStyle = `rgba(190,215,255,${0.75 * a})`;
    ctx.font = `${Math.round(h * 0.035)}px "Hiragino Sans", sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(text, sx(X), clamp(y, 0.05, 0.75) * h);
  }

  drawGround(ctx, w, h, t, sx, xa, xb, moon) {
    const seat = this.seat;
    const N = 32;
    const outline = () => {
      ctx.beginPath();
      ctx.moveTo(0, h);
      for (let i = 0; i <= N; i++) ctx.lineTo((i / N) * w, this.ground(screenToWorldX(seat, i / N)) * h);
      ctx.lineTo(w, h);
    };
    if (this.row === 1) {
      // 海と月の照り返し
      const hz = this.ground(0) * h;
      const sea = ctx.createLinearGradient(0, hz, 0, h);
      sea.addColorStop(0, '#0b1636');
      sea.addColorStop(1, '#02040c');
      ctx.fillStyle = sea;
      ctx.fillRect(0, hz, w, h - hz);
      if (moon && moon.Y < 0.76) {
        ctx.globalCompositeOperation = 'lighter';
        for (let k = 0; k < 40; k++) {
          const v = hash01(k * 17 + 3);
          const y = hz + v * (h - hz);
          const spread = 0.05 + 0.25 * v;
          const X = moon.X + (hash01(k * 17 + 4) - 0.5) * spread * 2;
          if (X < xa - 0.1 || X > xb + 0.1) continue;
          const a = Math.max(0, Math.sin(t * 3 + k * 1.7)) * 0.5 * (1 - v * 0.5);
          ctx.fillStyle = `rgba(255,235,190,${a.toFixed(3)})`;
          ctx.fillRect(sx(X) - w * 0.02, y, w * 0.04 * (1 - v * 0.5), Math.max(1, h * 0.004));
        }
        ctx.globalCompositeOperation = 'source-over';
      }
      return;
    }
    ctx.fillStyle = '#020208';
    outline();
    ctx.fill();
    if (this.row === 2) {
      // 稜線の木立
      for (let k = Math.floor(xa / 0.12) - 1; k <= Math.ceil(xb / 0.12); k++) {
        if (hash01(k * 29 + 5) > 0.45) continue;
        const X = (k + hash01(k * 29 + 6)) * 0.12;
        const y = this.ground(X) * h;
        const th = h * (0.04 + 0.04 * hash01(k * 29 + 7));
        ctx.beginPath();
        ctx.moveTo(sx(X), y - th);
        ctx.lineTo(sx(X) - th * 0.3, y + 2);
        ctx.lineTo(sx(X) + th * 0.3, y + 2);
        ctx.fill();
      }
    }
    if (this.row === 3) {
      // 天文台のドーム
      const dX = this.at(0.72);
      if (dX > xa - 0.3 && dX < xb + 0.3) {
        const y = this.ground(dX) * h;
        const r = h * 0.07;
        ctx.beginPath();
        ctx.arc(sx(dX), y - r * 0.6, r, Math.PI, 0);
        ctx.rect(sx(dX) - r, y - r * 0.6, r * 2, r * 0.6);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,220,150,0.5)';
        ctx.fillRect(sx(dX) - r * 0.08, y - r * 1.55, r * 0.16, r * 0.8);
      }
    }
    if (this.row === 4) {
      // 街並みと窓の灯り
      for (let k = Math.floor(xa / 0.09) - 1; k <= Math.ceil(xb / 0.09); k++) {
        const X = k * 0.09;
        const bh = (0.05 + 0.13 * hash01(k * 41 + 1)) * h;
        const bx = sx(X);
        const bw = Math.abs(sx(X + 0.085) - bx);
        const left = Math.min(bx, sx(X + 0.085));
        ctx.fillStyle = '#05040a';
        ctx.fillRect(left, h * 0.9 - bh, bw, bh);
        ctx.fillStyle = 'rgba(255,210,130,0.75)';
        for (let j = 0; j < 6; j++) {
          if (hash01(k * 41 + j * 7 + 2) > 0.35) continue;
          if (Math.sin(t * 0.2 + k + j) < -0.7) continue; // ときどき消える
          const wy = h * 0.9 - bh + (0.15 + 0.7 * hash01(k * 41 + j * 7 + 3)) * bh;
          ctx.fillRect(left + bw * (0.2 + 0.5 * hash01(k * 41 + j * 7 + 4)), wy, Math.max(1, bw * 0.15), Math.max(1, h * 0.008));
        }
      }
    }
  }

  leave() {
    this.pad?.stop();
  }
}

function streak(ctx, hx, hy, tx, ty, life, width) {
  const gr = ctx.createLinearGradient(hx, hy, tx, ty);
  gr.addColorStop(0, `rgba(255,255,255,${0.95 * life})`);
  gr.addColorStop(0.15, `rgba(180,220,255,${0.6 * life})`);
  gr.addColorStop(1, 'rgba(120,160,255,0)');
  ctx.strokeStyle = gr;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(hx, hy);
  ctx.lineTo(tx, ty);
  ctx.stroke();
}
