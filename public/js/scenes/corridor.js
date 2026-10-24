// 演目1「光の回廊」
// 光のパルスが通路に沿って画面から画面へ走る。向かい合う2列が同時に光るので
// 通路そのものが光のトンネルになる。光が自分の画面を通過した瞬間に音が鳴るため、
// 音も部屋の中を走っていく。20秒ごとに全台が同時にフラッシュし和音を鳴らす。

import { screenToWorldX } from '../layout.js';
import { mod, pentaFreq, hsl } from '../util.js';

const SECTION = 30; // 秒ごとに光の動き方を切り替える
const FLASH_EVERY = 20;

export default class Corridor {
  static id = 'corridor';
  static title = '光の回廊';
  static subtitle = 'LIGHT CORRIDOR';

  constructor(env) {
    this.env = env;
    this.seat = env.seat;
    this.L = env.layout.perRow;
    this.armed = false; // 途中参加した直後に鳴らないよう、一度暗くなってから有効化
    this.lastFlash = null;
    this.flashAt = -99;
    this.sparks = [];
  }

  // 物理位置 X・時刻 t における光の強さ 0..1（全PCで同じ関数を評価する）
  intensity(X, t) {
    const L = this.L;
    const c = this.seat.corridor;
    const g = (d, w) => Math.exp(-(d * d) / (2 * w * w));
    const tri = (p) => 1 - Math.abs(mod(p, 2) - 1);
    const span = (p) => -0.8 + tri(p) * (L + 1.6);
    switch (Math.floor(t / SECTION) % 4) {
      case 0: // 1つのパルスが往復
        return g(X - span(t / 4.5 + c * 0.5), 0.6);
      case 1: {
        // 両端から来て中央ですれ違う
        const p = span(t / 4 + c * 0.5);
        return Math.max(g(X - p, 0.5), g(X - (L - p), 0.5));
      }
      case 2: {
        // 虹の帯がゆっくり流れる（通路Aと通路Bで逆向き）
        const dir = c ? -1 : 1;
        return (0.5 + 0.5 * Math.cos(2 * Math.PI * (X / 3.3 - dir * t * 0.4))) ** 4;
      }
      default: // 速いチェイス
        return g(X - span(t / 2 + c * 0.5), 0.4);
    }
  }

  frame(ctx, w, h, t, dt) {
    const seat = this.seat;
    const audio = this.env.audio;
    const baseHue = t * 8 + seat.corridor * 150;

    // 画面を横にサンプリングしてグラデーション1枚で描く（軽い）
    const N = 12;
    const grad = ctx.createLinearGradient(0, 0, w, 0);
    for (let i = 0; i <= N; i++) {
      const u = i / N;
      const X = screenToWorldX(seat, u);
      grad.addColorStop(u, hsl(mod(baseHue + X * 7, 360), 90, 3 + this.intensity(X, t) * 55));
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const bc = this.intensity(seat.x, t);
    const hue = mod(baseHue + seat.x * 7, 360);

    ctx.globalCompositeOperation = 'lighter';
    // 上下に流れる走査線
    const lh = Math.max(1, h * 0.006);
    ctx.fillStyle = hsl(mod(hue + 40, 360), 100, 70, 0.05 + 0.3 * bc);
    for (let k = 0; k < 14; k++) {
      const y = mod(k / 14 + t * 0.04 * (k % 2 ? 1 : -1.3), 1) * h;
      ctx.fillRect(0, y, w, lh);
    }

    // 光が来ている間は火の粉が舞い上がる
    if (bc > 0.5 && this.sparks.length < 80) {
      for (let i = 0; i < Math.ceil(bc * 3); i++) {
        this.sparks.push({ x: Math.random(), y: 1.02, vy: 0.2 + Math.random() * 0.5, life: 1, s: 0.5 + Math.random() });
      }
    }
    const ss = Math.max(2, w * 0.004);
    for (const p of this.sparks) {
      p.y -= p.vy * dt;
      p.life -= dt * 0.6;
      ctx.fillStyle = hsl(hue, 100, 80, Math.max(0, p.life));
      ctx.fillRect(p.x * w, p.y * h, ss * p.s, ss * p.s * 3);
    }
    this.sparks = this.sparks.filter((p) => p.life > 0 && p.y > -0.05);

    // 全台同時フラッシュ
    const fi = Math.floor(t / FLASH_EVERY);
    if (this.lastFlash !== null && fi !== this.lastFlash) {
      this.flashAt = t;
      this.chord();
    }
    this.lastFlash = fi;
    const fa = t - this.flashAt;
    if (fa >= 0 && fa < 1.6) {
      ctx.fillStyle = hsl(hue, 70, 85, 0.85 * (1 - fa / 1.6) ** 2);
      ctx.fillRect(0, 0, w, h);
    }
    ctx.globalCompositeOperation = 'source-over';

    // 光が自分の前を通過したら音を鳴らす（ヒステリシス付き）
    if (this.armed && bc > 0.75) {
      this.armed = false;
      const f = pentaFreq(seat.row % 2 ? 220 : 440, Math.floor(seat.x));
      if (Math.floor(t / SECTION) % 4 === 2) audio.tone({ freq: f, dur: 1.8, gain: 0.12, attack: 0.3 });
      else audio.bell(f, { gain: 0.18 });
    } else if (!this.armed && bc < 0.35) {
      this.armed = true;
    }
  }

  // 列ごとに和音の構成音を分担する（40台で1つの和音）
  chord() {
    const s = this.seat;
    const semis = [0, 4, 7, 12][(s.row - 1) % 4] + (s.col % 2 ? 0 : 12);
    this.env.audio.tone({ freq: 261.63 * 2 ** (semis / 12), type: 'triangle', dur: 2.5, gain: 0.1, attack: 0.02 });
  }
}
