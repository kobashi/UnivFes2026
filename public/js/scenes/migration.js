// 演目3「深海の大回遊」
// 1列10台をつなげた横長の海を、画面より大きなクジラや魚の群れが泳いで渡る。
// クジラの声と低音はクジラが居る画面から鳴るので、音も一緒に移動する。
// カメラの前で動くと、その画面から泡が湧き上がる。

import { worldToScreenU } from '../layout.js';
import { clamp, hsl, mod, mulberry32, pentaFreq } from '../util.js';

const CYCLE = 40; // 秒。クジラ→魚群の1サイクル

export default class Migration {
  static id = 'migration';
  static title = '深海の大回遊';
  static subtitle = 'DEEP SEA MIGRATION';

  constructor(env) {
    this.env = env;
    this.seat = env.seat;
    this.L = env.layout.perRow;
    this.dir = env.seat.aisle === 1 ? -1 : 1;
    // 同じ通路の全PCが同じ魚を描けるよう、シードは通路ごとに共通
    const rnd = mulberry32(1234 + env.seat.aisle * 77);
    this.fish = Array.from({ length: 36 }, () => ({
      dx: (rnd() - 0.5) * 2.4,
      dy: (rnd() - 0.5) * 0.5,
      ph: rnd() * 6.28,
      sp: 0.8 + rnd() * 0.4,
      s: 0.035 + rnd() * 0.03,
      hue: rnd() < 0.5 ? 25 + rnd() * 25 : 175 + rnd() * 35,
    }));
    this.jelly = Array.from({ length: 4 }, (_, i) => ({
      X: 1.2 + i * 2.6 + rnd() * 0.8,
      ph: rnd() * 6.28,
      hue: 290 + rnd() * 50,
      s: 0.1 + rnd() * 0.05,
    }));
    const lr = mulberry32(999 + env.seat.index); // 泡は画面ごとにバラバラで良い
    this.bubbles = Array.from({ length: 14 }, () => ({ u: lr(), sp: 0.05 + lr() * 0.12, r: 0.004 + lr() * 0.01, ph: lr() }));
    this.burst = [];
    this.lastCall = null;
    this.lastMotion = -99;
    this.ocean = null;
    this.drone = null;
  }

  whale(t) {
    const ct = mod(t, CYCLE);
    const p = ct / 30;
    if (p > 1) return null;
    const span = this.L + 6;
    const X = this.dir > 0 ? -3 + p * span : this.L + 3 - p * span;
    return { X, Y: 0.5 + 0.1 * Math.sin(t * 0.4), len: 2.4, vx: this.dir, ct };
  }

  school(t) {
    const ct = mod(t - 16, CYCLE);
    const dur = 11;
    if (ct > dur) return null;
    const p = ct / dur;
    const span = this.L + 4;
    const X = this.dir > 0 ? this.L + 2 - p * span : -2 + p * span;
    return { X, Y: 0.35 + 0.15 * Math.sin(t * 0.7), vx: -this.dir };
  }

  frame(ctx, w, h, t, dt) {
    const seat = this.seat;
    const audio = this.env.audio;
    const sx = (X) => worldToScreenU(seat, X) * w;

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, seat.aisle === 1 ? '#0a3a5c' : '#0b3550');
    bg.addColorStop(0.6, '#041a33');
    bg.addColorStop(1, '#010814');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // 水面から差し込む光（通路全体でつながった位置に描く）
    ctx.globalCompositeOperation = 'lighter';
    const ray = ctx.createLinearGradient(0, 0, 0, h);
    ray.addColorStop(0, 'rgba(150,220,255,0.14)');
    ray.addColorStop(1, 'rgba(150,220,255,0)');
    ctx.fillStyle = ray;
    for (let k = 0; k < this.L + 2; k++) {
      const X = k * 1.7 + Math.sin(t * 0.1 + k) * 0.4 - 0.5;
      if (Math.abs(X - seat.x) > 1.5) continue;
      ctx.beginPath();
      ctx.moveTo(sx(X - 0.12), 0);
      ctx.lineTo(sx(X + 0.12), 0);
      ctx.lineTo(sx(X + 0.75), h);
      ctx.lineTo(sx(X + 0.3), h);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';

    for (const j of this.jelly) {
      const X = j.X + 0.2 * Math.sin(t * 0.15 + j.ph);
      if (Math.abs(X - seat.x) > 0.8) continue;
      drawJelly(ctx, sx(X), (0.55 + 0.25 * Math.sin(t * 0.25 + j.ph)) * h, j.s * w, t + j.ph, j.hue);
    }

    const wh = this.whale(t);
    if (wh && Math.abs(wh.X - seat.x) < wh.len / 2 + 0.8) {
      drawWhale(ctx, sx(wh.X), wh.Y * h, wh.len * w, wh.vx * seat.screenSign, t);
    }

    const sc = this.school(t);
    if (sc) {
      const face = sc.vx * seat.screenSign;
      for (const f of this.fish) {
        const X = sc.X + f.dx + 0.05 * Math.sin(t * 2 + f.ph);
        if (Math.abs(X - seat.x) > 0.7) continue;
        const Y = sc.Y + f.dy + 0.03 * Math.sin(t * 3 * f.sp + f.ph);
        drawFish(ctx, sx(X), Y * h, f.s * w, face, t * 12 * f.sp + f.ph, f.hue);
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
      ctx.strokeStyle = `rgba(220,250,255,${clamp(b.life, 0, 1) * 0.8})`;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.stroke();
    }
    this.burst = this.burst.filter((b) => b.life > 0 && b.y > -b.r);

    // --- 音：クジラの位置に合わせて各PCの低音の大きさを変える ---
    if (!this.ocean) {
      this.ocean = audio.drone({ noise: true, filter: 450 });
      this.drone = audio.drone({ freq: seat.row % 2 ? 82.4 : 110, type: 'sawtooth', filter: 320 });
    }
    this.ocean.set(0.035);
    const near = wh ? Math.exp(-((wh.X - seat.x) ** 2) / (2 * 1.2 * 1.2)) : 0;
    this.drone.set(0.2 * near);
    if (wh) {
      const ci = Math.floor(wh.ct / 7);
      if (this.lastCall !== null && ci !== this.lastCall && near > 0.15) {
        audio.tone({ freq: 260, slide: [[420, 0.8], [220, 2.2]], dur: 2.6, gain: 0.22 * near, attack: 0.4 });
      }
      this.lastCall = ci;
    } else {
      this.lastCall = null;
    }
    if (sc && Math.abs(sc.X - seat.x) < 1.2 && Math.random() < dt * 3) {
      audio.tone({ freq: pentaFreq(880, Math.floor(Math.random() * 8)), dur: 0.25, gain: 0.06 });
    }
  }

  leave() {
    this.ocean?.stop();
    this.drone?.stop();
  }
}

// --- 描画ヘルパ（face=+1 で画面右向き） ---

function drawWhale(ctx, x, y, L, face, t) {
  const H = L * 0.17;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  const body = ctx.createLinearGradient(0, -H, 0, H);
  body.addColorStop(0, '#3d6e92');
  body.addColorStop(0.55, '#1b3b57');
  body.addColorStop(1, '#9cc3d6');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(L * 0.5, 0);
  ctx.bezierCurveTo(L * 0.48, -H, L * 0.1, -H * 1.15, -L * 0.2, -H * 0.7);
  ctx.bezierCurveTo(-L * 0.35, -H * 0.45, -L * 0.42, -H * 0.15, -L * 0.45, 0);
  ctx.bezierCurveTo(-L * 0.42, H * 0.2, -L * 0.3, H * 0.5, -L * 0.1, H * 0.75);
  ctx.bezierCurveTo(L * 0.15, H, L * 0.45, H * 0.7, L * 0.5, 0);
  ctx.fill();
  // 尾びれ
  ctx.save();
  ctx.translate(-L * 0.44, 0);
  ctx.rotate(Math.sin(t * 1.6) * 0.3);
  ctx.fillStyle = '#244a68';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-L * 0.05, -H * 0.2, -L * 0.13, -H * 0.85);
  ctx.quadraticCurveTo(-L * 0.08, -H * 0.1, -L * 0.1, 0);
  ctx.quadraticCurveTo(-L * 0.08, H * 0.1, -L * 0.13, H * 0.85);
  ctx.quadraticCurveTo(-L * 0.05, H * 0.2, 0, 0);
  ctx.fill();
  ctx.restore();
  // 胸びれ
  ctx.fillStyle = '#2a5576';
  ctx.beginPath();
  ctx.moveTo(L * 0.2, H * 0.55);
  ctx.quadraticCurveTo(L * 0.12, H * (1.3 + 0.15 * Math.sin(t * 1.2)), L * 0.02, H * 1.45);
  ctx.quadraticCurveTo(L * 0.1, H * 0.9, L * 0.1, H * 0.6);
  ctx.fill();
  // 腹のうね
  ctx.strokeStyle = 'rgba(220,240,250,0.35)';
  ctx.lineWidth = Math.max(1, L * 0.003);
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    ctx.moveTo(L * 0.46, H * (0.15 + k * 0.08));
    ctx.quadraticCurveTo(L * 0.25, H * (0.55 + k * 0.1), L * 0.0, H * (0.55 + k * 0.05));
    ctx.stroke();
  }
  ctx.fillStyle = '#e8f4fa';
  ctx.beginPath();
  ctx.arc(L * 0.36, -H * 0.02, H * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawFish(ctx, x, y, s, face, ph, hue) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  ctx.fillStyle = hsl(hue, 85, 60);
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  const wag = Math.sin(ph) * s * 0.25;
  ctx.beginPath();
  ctx.moveTo(-s * 0.85, 0);
  ctx.lineTo(-s * 1.5, -s * 0.45 + wag);
  ctx.lineTo(-s * 1.5, s * 0.45 + wag);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(s * 0.55, -s * 0.08, s * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawJelly(ctx, x, y, s, t, hue) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + 0.08 * Math.sin(t * 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * pulse);
  g.addColorStop(0, hsl(hue, 90, 75, 0.6));
  g.addColorStop(1, hsl(hue, 90, 50, 0.05));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * pulse, s * 0.7 / pulse, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = hsl(hue, 90, 75, 0.35);
  ctx.lineWidth = Math.max(1, s * 0.04);
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(k * s * 0.35, 0);
    for (let i = 1; i <= 8; i++) ctx.lineTo(k * s * 0.35 + Math.sin(t * 1.5 + i * 0.7 + k) * s * 0.12, i * s * 0.22);
    ctx.stroke();
  }
  ctx.restore();
}
