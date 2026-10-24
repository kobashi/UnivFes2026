// 演目6「星降る夜」（統合の別バージョン）
// 通路に面した画面全体で1枚の夜空を描く。星・天の川・山の稜線は部屋の座標に
// 固定されているので、画面の間隔が広くても線や星の並びが窓越しのように続いて見える。
// 流れ星は画面から画面へ飛び、尾は最大の隙間より長くして途切れて見えないようにする。
// 流れ星が自分の前を通ると音が鳴り、音も部屋を駆け抜ける。
// カメラの前で動くと、その画面から流れ星が飛び立つ。

import { aisleExtent, maxGap, screenToWorldX, worldToScreenU } from '../layout.js';
import { clamp, hsl, mod, pentaFreq } from '../util.js';
import { edgeHint, hash01 } from './common.js';

const STAR_CELL = 0.25;
const METEOR_EVERY = 2.8;
const METEOR_SPEED = 5;
const METEOR_LIFE = 1.8;
const SHOWER_EVERY = 30; // 秒ごとに流星群
const SHOWER_LEN = 6;
const SHOWER_GAP = 0.35;

export default class NightSky {
  static id = 'nightsky';
  static title = '星降る夜';
  static subtitle = 'STARRY NIGHT — 動くと流れ星が飛ぶ';

  constructor(env) {
    this.env = env;
    this.seat = env.seat;
    this.ext = aisleExtent(env.seats, env.seat.aisle);
    this.trail = Math.max(1.6, maxGap(env.seats, env.seat.aisle) + 1.2);
    this.seatMap = new Map(env.seats.map((s) => [s.id, s]));
    this.extra = []; // カメラで呼ばれた流れ星
    this.lastMotion = -99;
    this.lastPing = -99;
    this.sparkle = 0;
    this.pad = null;
  }

  onEvent(ev) {
    if (ev.type !== 'meteor') return;
    const o = this.seatMap.get(ev.seat);
    if (!o || o.aisle !== this.seat.aisle) return;
    this.extra.push({ X0: o.x, y0: 0.15 + hash01(ev.t) * 0.2, dir: ev.dir ?? 1, t0ms: ev.t, big: true });
    if (this.extra.length > 20) this.extra.shift();
  }

  ridge(X) {
    const a = this.seat.aisle;
    return 0.8 + 0.05 * Math.sin(X * 1.1 + a) + 0.03 * Math.sin(X * 2.7 + a * 2) + 0.015 * Math.sin(X * 6.1);
  }

  milkyY(X) {
    return 0.08 + 0.5 * clamp((X - this.ext.min) / this.ext.span, 0, 1);
  }

  // 時刻 t に飛んでいる流れ星（全PCで同じ）
  meteors(t, now) {
    const out = [];
    const a = this.seat.aisle;
    const { min, span } = this.ext;
    const add = (seed, st, dirBias) => {
      const age = t - st;
      if (age < 0 || age > METEOR_LIFE) return;
      const dir = dirBias ?? (hash01(seed + 1) < 0.5 ? 1 : -1);
      out.push({ X0: min + hash01(seed + 2) * span, y0: 0.05 + hash01(seed + 3) * 0.3, dir, age, big: hash01(seed + 4) < 0.2 });
    };
    const n = Math.floor(t / METEOR_EVERY);
    for (let k = n - 1; k <= n; k++) add(k * 31 + a * 997, k * METEOR_EVERY + hash01(k * 31 + a * 997) * 1.5);
    // 流星群：同じ向きに次々と
    const sIdx = Math.floor(t / SHOWER_EVERY);
    const sStart = sIdx * SHOWER_EVERY + SHOWER_EVERY - SHOWER_LEN;
    if (sIdx >= 0 && t > sStart - 1 && t < sStart + SHOWER_LEN + METEOR_LIFE) {
      const dir = hash01(sIdx * 7 + a) < 0.5 ? 1 : -1;
      const m = Math.floor((t - sStart) / SHOWER_GAP);
      for (let k = m - 6; k <= m; k++) {
        const st = sStart + k * SHOWER_GAP;
        if (st < sStart || st > sStart + SHOWER_LEN) continue;
        add(sIdx * 1000 + k * 13 + a * 5, st, dir);
      }
    }
    for (const e of this.extra) out.push({ X0: e.X0, y0: e.y0, dir: e.dir, age: (now - e.t0ms) / 1000, big: true });
    return out.filter((m) => m.age >= 0 && m.age <= METEOR_LIFE);
  }

  frame(ctx, w, h, t, dt, g) {
    const seat = this.seat;
    const audio = this.env.audio;
    const X0 = screenToWorldX(seat, 0);
    const X1 = screenToWorldX(seat, 1);
    const xa = Math.min(X0, X1);
    const xb = Math.max(X0, X1);
    const sx = (X) => worldToScreenU(seat, X) * w;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#02030c');
    bg.addColorStop(0.6, '#0a0c2a');
    bg.addColorStop(1, '#1d1238');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // 天の川（部屋全体を斜めに横切る帯）
    ctx.globalCompositeOperation = 'lighter';
    const SL = 12;
    for (let i = 0; i < SL; i++) {
      const X = X0 + ((i + 0.5) / SL) * (X1 - X0);
      const yc = this.milkyY(X) * h;
      const gr = ctx.createLinearGradient(0, yc - h * 0.18, 0, yc + h * 0.18);
      gr.addColorStop(0, 'rgba(140,150,255,0)');
      gr.addColorStop(0.5, 'rgba(170,170,255,0.12)');
      gr.addColorStop(1, 'rgba(140,150,255,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(Math.floor((i * w) / SL), yc - h * 0.18, Math.floor(((i + 1) * w) / SL) - Math.floor((i * w) / SL), h * 0.36);
    }

    // 星（ワールド座標のセルごとに決まった位置）
    this.sparkle = Math.max(0, this.sparkle - dt * 0.5);
    const a = seat.aisle;
    ctx.fillStyle = '#fff';
    for (let k = Math.floor(xa / STAR_CELL) - 1; k <= Math.ceil(xb / STAR_CELL); k++) {
      for (let j = 0; j < 12; j++) {
        const seed = k * 7919 + j * 104729 + a * 15485863;
        const X = (k + hash01(seed)) * STAR_CELL;
        let y = hash01(seed + 1) * 0.78;
        const nearBand = hash01(seed + 5) < 0.5; // 半分の星は天の川に集める
        if (nearBand) y = this.milkyY(X) + (hash01(seed + 6) - 0.5) * 0.18;
        if (y > this.ridge(X)) continue;
        const tw = 0.55 + 0.45 * Math.sin(t * (1 + hash01(seed + 2) * 3) + seed);
        const r = (1 + hash01(seed + 3) * 2) * (h / 600) * (1 + this.sparkle);
        ctx.globalAlpha = clamp(tw * (0.5 + this.sparkle), 0, 1);
        ctx.fillRect(sx(X) - r / 2, y * h - r / 2, r, r);
      }
    }
    ctx.globalAlpha = 1;

    // オーロラ（加算合成なので短冊どうしを重ねない）
    const AS = 24;
    for (let i = 0; i < AS; i++) {
      const X = X0 + ((i + 0.5) / AS) * (X1 - X0);
      for (let c = 0; c < 2; c++) {
        const inten = Math.max(0, Math.sin(X * 0.9 - t * 0.35 + c * 2.1) * 0.5 + Math.sin(X * 0.37 + t * 0.2 + c) * 0.5);
        if (inten < 0.05) continue;
        const top = (0.1 + 0.07 * Math.sin(X * 0.7 + t * 0.3 + c)) * h;
        const bottom = top + h * (0.25 + 0.1 * Math.sin(X * 1.7 + c));
        const hue = mod(130 + c * 150 + X * 4, 360);
        const gr = ctx.createLinearGradient(0, top, 0, bottom);
        gr.addColorStop(0, hsl(hue, 80, 55, 0));
        gr.addColorStop(0.75, hsl(hue, 80, 55, 0.38 * inten));
        gr.addColorStop(1, hsl(hue, 80, 60, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(Math.floor((i * w) / AS), top, Math.floor(((i + 1) * w) / AS) - Math.floor((i * w) / AS), bottom - top);
      }
    }

    // 月：上演時間をかけて通路の端から端へ渡る
    const mp = clamp(t / Math.max(1, g.info.duration), 0, 1);
    const mX = this.ext.min + 0.5 + mp * (this.ext.span - 1);
    const mY = 0.28 - 0.1 * Math.sin(mp * Math.PI);
    const mr = h * 0.09;
    if (Math.abs(mX - seat.x) < 1) {
      const mx = sx(mX);
      const glow = ctx.createRadialGradient(mx, mY * h, mr * 0.8, mx, mY * h, mr * 4);
      glow.addColorStop(0, 'rgba(255,245,210,0.25)');
      glow.addColorStop(1, 'rgba(255,245,210,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(mx - mr * 4, mY * h - mr * 4, mr * 8, mr * 8);
      ctx.fillStyle = '#fff6dc';
      ctx.beginPath();
      ctx.arc(mx, mY * h, mr, 0, Math.PI * 2);
      ctx.fill();
    }
    edgeHint(ctx, w, h, seat, mX, mY, '255,240,200', { strength: 0.3, range: 1.5 });

    // 流れ星
    for (const m of this.meteors(t, g.now)) {
      const head = m.X0 + m.dir * METEOR_SPEED * m.age;
      const len = Math.min(this.trail * (m.big ? 1.4 : 1), METEOR_SPEED * m.age);
      const tail = head - m.dir * len;
      const slope = 0.1;
      const hy = (m.y0 + slope * METEOR_SPEED * m.age) * h;
      const ty = (m.y0 + slope * (METEOR_SPEED * m.age - len)) * h;
      const life = 1 - m.age / METEOR_LIFE;
      // 自分の前を頭が通過したら音
      const prevHead = head - m.dir * METEOR_SPEED * dt;
      if ((prevHead - seat.x) * (head - seat.x) <= 0 && t - this.lastPing > 0.12) {
        this.lastPing = t;
        audio.bell(pentaFreq(m.big ? 660 : 1320, seat.rank), { gain: m.big ? 0.15 : 0.08, dur: 1.2 });
        audio.noise({ freq: 3500, q: 0.7, dur: 0.25, gain: 0.04 });
      }
      if (Math.max(head, tail) < xa - 0.1 || Math.min(head, tail) > xb + 0.1) continue;
      const hx = sx(head);
      const tx = sx(tail);
      const gr = ctx.createLinearGradient(hx, hy, tx, ty);
      gr.addColorStop(0, `rgba(255,255,255,${0.95 * life})`);
      gr.addColorStop(0.15, `rgba(180,220,255,${0.6 * life})`);
      gr.addColorStop(1, 'rgba(120,160,255,0)');
      ctx.strokeStyle = gr;
      ctx.lineWidth = (m.big ? 0.012 : 0.006) * h;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(hx, hy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }
    this.extra = this.extra.filter((e) => (g.now - e.t0ms) / 1000 < METEOR_LIFE);
    ctx.globalCompositeOperation = 'source-over';

    // 山の稜線（全画面で一続き）
    ctx.fillStyle = '#020208';
    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let i = 0; i <= 32; i++) {
      const u = i / 32;
      ctx.lineTo(u * w, this.ridge(screenToWorldX(seat, u)) * h);
    }
    ctx.lineTo(w, h);
    ctx.fill();

    // カメラ：動くと星がきらめき、流れ星が飛ぶ
    const cam = this.env.camera;
    if (cam.real && cam.motion > this.env.config.motionThreshold && t - this.lastMotion > 3 && g.info.fade > 0.8) {
      this.lastMotion = t;
      this.sparkle = 1;
      this.env.emit('meteor', {});
    }

    // オーロラの明るさに合わせた静かな持続音
    if (!this.pad) this.pad = audio.drone({ freq: pentaFreq(110, seat.rank % 5), type: 'sine' });
    const ai = Math.max(0, Math.sin(seat.x * 0.9 - t * 0.35) * 0.5 + Math.sin(seat.x * 0.37 + t * 0.2) * 0.5);
    this.pad.set(0.04 * ai);
  }

  leave() {
    this.pad?.stop();
  }
}
