// 汎用ユーティリティ（ブラウザ / Node 共通）

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const mod = (a, n) => ((a % n) + n) % n;

// シード付き乱数。同じシードなら全PCで同じ並びになる。
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// メジャー・ペンタトニック。step を上げると音階を上る（5音で1オクターブ）。
const PENTA = [0, 2, 4, 7, 9];
export function pentaFreq(base, step) {
  const oct = Math.floor(step / 5);
  return base * 2 ** ((PENTA[mod(step, 5)] + 12 * oct) / 12);
}

export const hsl = (h, s, l, a = 1) => `hsla(${h.toFixed(1)},${s}%,${l.toFixed(1)}%,${a.toFixed(3)})`;
