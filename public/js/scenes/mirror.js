// 演目2「ミラー・リップル」
// 各PCのWebカメラ映像をドット絵の鏡として映す。前で動くと、その席から
// 光の波紋が発生し、距離に応じた遅れで部屋中のPCへ広がっていく（音付き）。
// 誰も動かない時はサーバが時々ランダムな席から波紋を出す。

import { distance } from '../layout.js';
import { clamp, hsl, mod, pentaFreq } from '../util.js';

const WAVE_DELAY = 0.3; // 1ユニット（隣の席）進むのにかかる秒数
const LEVELS = 8;
const RIPPLE_LIFE = 1.8;
const SWEEP = 0.9; // 波面が1画面を横切る秒数

export default class Mirror {
  static id = 'mirror';
  static title = 'ミラー・リップル';
  static subtitle = 'MIRROR RIPPLE — 画面の前で動いてみよう';

  constructor(env) {
    this.env = env;
    this.seat = env.seat;
    this.seatMap = new Map(env.seats.map((s) => [s.id, s]));
    this.ripples = [];
    this.sparks = [];
    this.lastEmit = -99;
    this.lastEmitWall = -1e9;
    this.hueBase = env.seat.index * 9;
  }

  onEvent(ev) {
    if (ev.type !== 'ripple') return;
    const o = this.seatMap.get(ev.seat);
    if (!o) return;
    const d = distance(o, this.seat);
    this.ripples.push({
      o,
      d,
      self: o.id === this.seat.id,
      hue: ev.hue ?? 200,
      intensity: ev.intensity ?? 0.7,
      arrive: ev.t + d * WAVE_DELAY * 1000,
      played: false,
    });
    if (this.ripples.length > 40) this.ripples.shift();
  }

  frame(ctx, w, h, t, dt, g) {
    const cam = this.env.camera;
    const seat = this.seat;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, w, h);

    // --- カメラ映像をドット絵で描く（明るさで粒の大きさと色を変える） ---
    const cols = clamp(Math.round(w / 18), 16, 72);
    const cell = w / cols;
    const rows = Math.ceil(h / cell);
    const hue0 = mod(t * 6 + this.hueBase, 360);
    const paths = Array.from({ length: LEVELS }, () => new Path2D());
    const hot = new Path2D();
    const { w: cw, h: ch, lum, diff } = cam;
    // 4:3 のカメラ映像を画面いっぱいに（上下をトリミング）
    const crop = Math.min(1, cw / ch / (w / h));
    for (let r = 0; r < rows; r++) {
      const v = 0.5 + ((r + 0.5) / rows - 0.5) * crop;
      const sy = clamp(Math.floor(v * ch), 0, ch - 1);
      const y = (r + 0.5) * cell;
      for (let c = 0; c < cols; c++) {
        const sx = clamp(Math.floor(((c + 0.5) / cols) * cw), 0, cw - 1);
        const i = sy * cw + sx;
        const l = lum[i];
        const x = (c + 0.5) * cell;
        const rad = cell * 0.5 * (0.12 + 0.88 * l);
        const p = diff[i] > 0.15 ? hot : paths[Math.min(LEVELS - 1, Math.floor(l * LEVELS))];
        p.moveTo(x + rad, y);
        p.arc(x, y, rad, 0, Math.PI * 2);
      }
    }
    for (let k = 0; k < LEVELS; k++) {
      ctx.fillStyle = hsl(mod(hue0 + k * 12, 360), 80, 18 + k * 7);
      ctx.fill(paths[k]);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fill(hot);

    // --- 動きを検出したら波紋を発生させる ---
    if (cam.real && cam.motion > this.env.config.motionThreshold && t - this.lastEmit > 2.5 && g.info.fade > 0.8) {
      this.lastEmit = t;
      this.lastEmitWall = performance.now();
      const intensity = clamp(cam.motion * 6, 0.3, 1);
      this.env.emit('ripple', { intensity });
      this.burst(cam.cx * w, (0.5 + (cam.cy - 0.5) / crop) * h, hue0, w);
      this.env.audio.bell(pentaFreq(880, seat.rank), { gain: 0.2 });
    }

    // --- 届いた波紋を描く ---
    ctx.globalCompositeOperation = 'lighter';
    for (const rp of this.ripples) {
      const age = (g.now - rp.arrive) / 1000;
      if (age < -SWEEP / 2) continue;
      if (!rp.played && age >= 0) {
        rp.played = true;
        this.ping(rp);
      }
      if (age > RIPPLE_LIFE) {
        rp.dead = true;
        continue;
      }
      // 波源が画面のどちら側にあるか（物理座標→画面座標）
      const side = (rp.o.x - seat.x) * seat.screenSign;
      const strength = 0.4 + 0.6 * rp.intensity;
      if (rp.self || Math.abs(side) < 0.5) {
        // 自分 or 通路の向かい側 → 中心から輪が広がる
        if (age < 0) continue;
        const k = age / RIPPLE_LIFE;
        ctx.strokeStyle = hsl(rp.hue, 100, 60, (1 - k) * strength);
        ctx.lineWidth = cell * 1.5 * (1 - k) + 2;
        ctx.beginPath();
        ctx.arc(w / 2, h / 2, k * w * 0.9, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        // 横から波面が通り抜ける（中心通過 = 到着時刻）
        const k = (age + SWEEP / 2) / SWEEP;
        if (k > 1.3) continue;
        const pos = (side > 0 ? 1 - k : k) * w;
        const bw = w * 0.18;
        const gr = ctx.createLinearGradient(pos - bw, 0, pos + bw, 0);
        gr.addColorStop(0, hsl(rp.hue, 100, 60, 0));
        gr.addColorStop(0.5, hsl(rp.hue, 100, 60, 0.7 * strength * clamp(1.3 - k, 0, 1)));
        gr.addColorStop(1, hsl(rp.hue, 100, 60, 0));
        ctx.fillStyle = gr;
        ctx.fillRect(pos - bw, 0, bw * 2, h);
      }
    }
    this.ripples = this.ripples.filter((r) => !r.dead);

    for (const p of this.sparks) {
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      ctx.fillStyle = hsl(p.hue, 100, 70, Math.max(0, p.life));
      ctx.fillRect(p.x - p.s / 2, p.y - p.s / 2, p.s, p.s);
    }
    this.sparks = this.sparks.filter((p) => p.life > 0);
    ctx.globalCompositeOperation = 'source-over';
  }

  burst(x, y, hue, w) {
    for (let i = 0; i < 40; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = (0.1 + Math.random() * 0.4) * w;
      this.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 1, hue: mod(hue + Math.random() * 60, 360), s: w * 0.008 });
    }
  }

  ping(rp) {
    // 自分が出した波紋は発生時にもう鳴らしている
    if (rp.self && performance.now() - this.lastEmitWall < 2000) return;
    const f = pentaFreq(rp.o.row % 2 ? 440 : 330, rp.o.rank);
    this.env.audio.tone({ freq: f, dur: 1.2, gain: (0.2 * rp.intensity) / (1 + rp.d * 0.6), attack: 0.01 });
  }
}
