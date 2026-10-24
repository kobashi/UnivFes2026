// 複数画面にまたがる演目の共通部品

import { worldToScreenU } from '../layout.js';

// 画面と画面の隙間に隠れている物の気配を、近い側の画面の縁にぼんやり灯す。
// 隙間が広くても「向こうに続いている」感覚を保つための工夫。
//   X, Y : 物の位置（X はワールド座標、Y は画面高さに対する 0..1）
//   rgb  : 'r,g,b'
//   range: 縁から何ユニット離れるまで気配を出すか
export function edgeHint(ctx, w, h, seat, X, Y, rgb, { range = 1.2, strength = 0.6 } = {}) {
  const u = worldToScreenU(seat, X);
  if (u >= 0 && u <= 1) return;
  const dist = u < 0 ? -u : u - 1;
  if (dist > range) return;
  const a = strength * (1 - dist / range) ** 2;
  const x = u < 0 ? 0 : w;
  const y = Y * h;
  const r = h * 0.45;
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, `rgba(${rgb},${a.toFixed(3)})`);
  g.addColorStop(1, `rgba(${rgb},0)`);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);
  ctx.restore();
}

// 整数から 0..1 の決定的な値（全PCで同じ）
export function hash01(n) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
  x ^= x >>> 13;
  x = Math.imul(x, 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}
