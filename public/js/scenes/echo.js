// 演目5「エコー」（ミラーの別バージョン）
// 画面の前で動いた人の影（動きのシルエット）が、同じ通路の画面へ
// 距離に応じた遅れで次々と映し出され、こだまのように列を伝わっていく。
// 影は 32×18 の点の集まりとして送る（1回 約100バイト）。
// 誰も動かない時は、通路を歩く「幻の人影」が現れる。

import { aisleExtent, worldToScreenU } from '../layout.js';
import { clamp, hsl, mod, pentaFreq } from '../util.js';
import { edgeHint } from './common.js';

export const MASK_W = 32;
export const MASK_H = 18;
const MW = MASK_W;
const MH = MASK_H;
const SEND_EVERY = 0.25; // 秒
const DELAY_PER_UNIT = 0.45; // 1ユニット離れるごとの遅れ（秒）
const KEEP = 6000; // ms
const IDLE_AFTER = 6000; // ms 影が届かなければ幻の人影を出す

export default class Echo {
  static id = 'echo';
  static title = 'エコー';
  static subtitle = 'ECHO — 動くと影がこだまする';

  constructor(env) {
    this.env = env;
    this.seat = env.seat;
    this.seatMap = new Map(env.seats.map((s) => [s.id, s]));
    this.ext = aisleExtent(env.seats, env.seat.aisle);
    this.frames = new Map(); // seatId → [{t, bits, energy}]
    this.lastSend = -99;
    this.lastHeard = -1e15;
    this.lastSound = new Map();
    this.lastStep = null;
    this.myBits = new Uint8Array(MW * MH);
  }

  onEvent(ev) {
    if (ev.type !== 'echo' || ev.seat === this.seat.id) return;
    const o = this.seatMap.get(ev.seat);
    if (!o || o.aisle !== this.seat.aisle) return;
    let bits;
    try {
      bits = decode(ev.mask);
    } catch {
      return;
    }
    const list = this.frames.get(ev.seat) ?? [];
    list.push({ t: ev.t, bits, energy: ev.energy ?? 0 });
    while (list.length && ev.t - list[0].t > KEEP) list.shift();
    this.frames.set(ev.seat, list);
    this.lastHeard = ev.t;
  }

  frame(ctx, w, h, t, dt, g) {
    const seat = this.seat;
    const cam = this.env.camera;
    const now = g.now;
    ctx.fillStyle = '#04040a';
    ctx.fillRect(0, 0, w, h);
    const cell = w / MW;
    const ch = h / MH;

    // --- 自分の前の様子（薄い鏡像） ---
    const camRows = cam.h * Math.min(1, (cam.w / cam.h) / (16 / 9));
    const y0 = (cam.h - camRows) / 2;
    const dim = new Path2D();
    let moving = 0;
    for (let my = 0; my < MH; my++) {
      const sy = clamp(Math.floor(y0 + ((my + 0.5) * camRows) / MH), 0, cam.h - 1);
      for (let mx = 0; mx < MW; mx++) {
        const sx = clamp(Math.floor(((mx + 0.5) * cam.w) / MW), 0, cam.w - 1);
        const i = sy * cam.w + sx;
        const on = cam.real && cam.diff[i] > 0.12 ? 1 : 0;
        this.myBits[my * MW + mx] = on;
        moving += on;
        const r = cell * 0.4 * cam.lum[i] * 0.6;
        if (r > 0.5) {
          dim.moveTo((mx + 0.5) * cell + r, (my + 0.5) * ch);
          dim.arc((mx + 0.5) * cell, (my + 0.5) * ch, r, 0, Math.PI * 2);
        }
      }
    }
    ctx.fillStyle = 'rgba(120,140,200,0.25)';
    ctx.fill(dim);

    // 動いていたら影を送る
    if (moving >= 12 && t - this.lastSend > SEND_EVERY && g.info.fade > 0.5) {
      this.lastSend = t;
      this.env.emit('echo', { mask: encodeMask(this.myBits), energy: moving / (MW * MH) });
      this.env.audio.tone({ freq: pentaFreq(330, seat.rank), dur: 0.5, gain: 0.08 });
    }

    // --- 他の席から届いた影（遠いほど遅れて、淡く） ---
    ctx.globalCompositeOperation = 'lighter';
    for (const [id, list] of this.frames) {
      const o = this.seatMap.get(id);
      const dx = Math.abs(o.x - seat.x);
      const delay = (dx * DELAY_PER_UNIT + (o.row !== seat.row ? 0.3 : 0)) * 1000;
      const flip = o.screenSign !== seat.screenSign;
      const hue = mod(o.index * 37, 360);
      const fade = Math.exp(-dx / 5);
      // 少し古い影も重ねて残像にする
      for (const [lag, a] of [[0, 0.9], [150, 0.45], [300, 0.2]]) {
        const f = latestBefore(list, now - delay - lag);
        if (!f) continue;
        drawBits(ctx, f.bits, cell, ch, flip, hsl(hue, 90, 60, a * fade));
        if (lag === 0 && f.energy > 0.04 && now - (this.lastSound.get(id) ?? 0) > 600) {
          this.lastSound.set(id, now);
          this.env.audio.tone({ freq: pentaFreq(330, o.rank), dur: 0.8, gain: 0.12 * fade, attack: 0.02 });
        }
      }
    }
    for (const list of this.frames.values()) while (list.length && now - list[0].t > KEEP) list.shift();

    // 自分の影はくっきり白く
    drawBits(ctx, this.myBits, cell, ch, false, 'rgba(255,255,255,0.9)');

    // --- 誰も動かない時の幻の人影 ---
    if (now - this.lastHeard > IDLE_AFTER && moving < 12) this.phantom(ctx, w, h, t);
    ctx.globalCompositeOperation = 'source-over';
  }

  phantom(ctx, w, h, t) {
    const seat = this.seat;
    const { min, span } = this.ext;
    const speed = 0.9;
    const dir = seat.aisle === 1 ? -1 : 1;
    const run = span + 3;
    const pos = (tt) => {
      const p = mod(tt * speed, run);
      return dir > 0 ? min - 1.5 + p : min + span + 1.5 - p;
    };
    const face = dir * seat.screenSign;
    for (const [lag, a] of [[0.6, 0.15], [0.3, 0.3], [0, 0.8]]) {
      const X = pos(t - lag);
      const u = worldToScreenU(seat, X);
      if (u < -0.3 || u > 1.3) continue;
      drawFigure(ctx, u * w, h * 0.55, h * 0.7, (t - lag) * speed * 6, face, `rgba(160,200,255,${a})`);
    }
    edgeHint(ctx, w, h, seat, pos(t), 0.55, '160,200,255', { strength: 0.3 });
    // 足音：自分の画面の上を歩いている時だけ
    const stepI = Math.floor(t * 2);
    const u = worldToScreenU(seat, pos(t));
    if (this.lastStep !== null && stepI !== this.lastStep && u > 0 && u < 1) {
      this.env.audio.noise({ freq: 300, q: 1.5, dur: 0.12, gain: 0.08 });
    }
    this.lastStep = stepI;
  }
}

function latestBefore(list, tMs) {
  for (let i = list.length - 1; i >= 0; i--) {
    if (list[i].t <= tMs) return tMs - list[i].t < 400 ? list[i] : null;
  }
  return null;
}

function drawBits(ctx, bits, cw, ch, flip, color) {
  const p = new Path2D();
  const r = Math.min(cw, ch) * 0.45;
  for (let y = 0; y < MH; y++) {
    for (let x = 0; x < MW; x++) {
      if (!bits[y * MW + x]) continue;
      const cx = ((flip ? MW - 1 - x : x) + 0.5) * cw;
      const cy = (y + 0.5) * ch;
      p.moveTo(cx + r, cy);
      p.arc(cx, cy, r, 0, Math.PI * 2);
    }
  }
  ctx.fillStyle = color;
  ctx.fill(p);
}

// 棒人間を点で描く（ph: 歩きの位相）
function drawFigure(ctx, x, y, H, ph, face, color) {
  const pts = [];
  const add = (px, py, n = 1) => {
    for (let i = 0; i < n; i++) pts.push([px, py]);
  };
  const seg = (ax, ay, bx, by, n) => {
    for (let i = 0; i <= n; i++) add(ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n);
  };
  const s = Math.sin(ph);
  add(0, -0.42);
  for (let a = 0; a < 6; a++) add(Math.cos(a) * 0.06, -0.42 + Math.sin(a) * 0.06);
  seg(0, -0.34, 0, 0.05, 6); // 胴
  seg(0, 0.05, 0.14 * s, 0.45, 6); // 脚
  seg(0, 0.05, -0.14 * s, 0.45, 6);
  seg(0, -0.28, -0.12 * s, 0.0, 4); // 腕
  seg(0, -0.28, 0.12 * s, 0.0, 4);
  ctx.fillStyle = color;
  ctx.beginPath();
  const r = H * 0.022;
  for (const [px, py] of pts) {
    const cx = x + px * H * face;
    const cy = y + py * H;
    ctx.moveTo(cx + r, cy);
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
  }
  ctx.fill();
}

export function encodeMask(bits) {
  const bytes = new Uint8Array(Math.ceil(bits.length / 8));
  for (let i = 0; i < bits.length; i++) if (bits[i]) bytes[i >> 3] |= 1 << (i & 7);
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function decode(b64) {
  const s = atob(b64);
  const bits = new Uint8Array(MW * MH);
  for (let i = 0; i < bits.length; i++) bits[i] = (s.charCodeAt(i >> 3) >> (i & 7)) & 1;
  return bits;
}
