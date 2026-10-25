// 部屋のPC配置（ブラウザ / Node 共通）
//
// 俯瞰図（y は部屋の奥行き方向、x は列に沿った方向）
//
//   ───────────── 壁 ─────────────
//   ········ 通路A ········          ← 壁を背に座る。列1の画面を見る
//   列1  [1][2]...[10]   画面 ↑ (壁側を向く)
//   列2  [1][2]...[10]   画面 ↓ (列1と背中合わせ、中央通路側を向く)
//   ········ 中央通路 ········       ← 列2と列3の画面に挟まれた「光の廊下」
//   列3  [1][2]...[10]   画面 ↑ (列2と向かい合う)
//   列4  [1][2]...[10]   画面 ↓ (列3と背中合わせ、壁側を向く)
//   ········ 通路C ········          ← 壁を背に座る。列4の画面を見る
//   ───────────── 壁 ─────────────
//
// 通路は3本。中央通路では来場者が左右から画面に挟まれる。

export const DEFAULT_LAYOUT = { rows: 4, perRow: 10, rowReverse: [false, false, false, false] };

// 端末の実際の間隔。
//   screenWidthCm : 画面（表示部分）の横幅。1ユニット = この幅
//   positionsCm   : { 列: [1番の中心, 2番の中心, ...] }。全列共通の基準端から測った画面中心の位置
//   gapScale      : 1 = 実寸どおり（隙間も再現）、0 = 隙間なしで並んでいるものとして扱う
//   col1Side      : 通路A（壁側）から列1を見たとき、1番が 'left'（左端）か 'right'（右端）か。
//                   全列とも1番は同じ側にあるので、これで全列の画面の左右が決まる
// 未測定の席は隙間なしで並んでいるものとして扱う。
export const DEFAULT_GEOMETRY = { screenWidthCm: 52, gapScale: 1, positionsCm: {}, col1Side: 'left' };

// facing: 画面が向いている y 方向（+1 = y が増える方向）。壁(y=0)から測る。
// aisle: その画面を見る来場者がいる通路（0=通路A, 1=中央通路, 2=通路C）
const ROW_GEOM = {
  1: { y: 1.0, facing: -1, aisle: 0 },
  2: { y: 1.6, facing: +1, aisle: 1 },
  3: { y: 3.6, facing: -1, aisle: 1 },
  4: { y: 4.2, facing: +1, aisle: 2 },
};

export const seatId = (row, col) => `${row}-${col}`;

export function parseSeatId(s) {
  const m = /^(\d+)-(\d+)$/.exec(String(s ?? '').trim());
  return m ? { row: +m[1], col: +m[2] } : null;
}

export function makeSeat(row, col, layout = DEFAULT_LAYOUT) {
  const { rows, perRow } = layout;
  if (!Number.isInteger(row) || !Number.isInteger(col)) return null;
  if (row < 1 || row > rows || col < 1 || col > perRow) return null;
  const g = ROW_GEOM[row] ?? { y: row * 1.5, facing: row % 2 ? -1 : 1, aisle: Math.min(row - 1, 2) };
  const reverse = !!layout.rowReverse?.[row - 1];
  const rank = reverse ? perRow - col : col - 1; // 列の中で基準端から何台目か
  const adjacent = rank + 0.5;
  const geo = layout.geometry;
  const pos = geo?.positionsCm?.[row]?.[col - 1];
  const physical = Number.isFinite(pos) && geo.screenWidthCm > 0 ? pos / geo.screenWidthCm : adjacent;
  return {
    id: seatId(row, col),
    row,
    col,
    index: (row - 1) * perRow + (col - 1),
    rank,
    // 画面中心の物理位置（画面幅 = 1ユニット）
    x: adjacent + (geo?.gapScale ?? 1) * (physical - adjacent),
    y: g.y,
    facing: g.facing,
    aisle: g.aisle,
    // 画面の「右」が物理 x の正負どちらを向くか。向かい合う列どうしは逆になる。
    // col1Side='left' では、列1（facing<0）を見る人の右手が x の正方向（10番側）。
    screenSign: (g.facing > 0 ? -1 : 1) * (geo?.col1Side === 'right' ? -1 : 1),
  };
}

export function allSeats(layout = DEFAULT_LAYOUT) {
  const out = [];
  for (let r = 1; r <= layout.rows; r++) for (let c = 1; c <= layout.perRow; c++) out.push(makeSeat(r, c, layout));
  return out;
}

// IPv4 末尾オクテットから座席を求める。
// octetStart=1 なら .1〜.10 が列1、.11〜.20 が列2 …
export function seatFromIp(ip, layout = DEFAULT_LAYOUT, mapping = { octetStart: 1 }) {
  const m = /(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(String(ip ?? ''));
  if (!m) return null;
  const idx = +m[4] - (mapping.octetStart ?? 1);
  if (idx < 0 || idx >= layout.rows * layout.perRow) return null;
  return makeSeat(Math.floor(idx / layout.perRow) + 1, (idx % layout.perRow) + 1, layout);
}

// 画面内の横位置 u (0=左端, 1=右端) ⇔ 物理 x
export const screenToWorldX = (seat, u) => seat.x + (u - 0.5) * seat.screenSign;
export const worldToScreenU = (seat, X) => (X - seat.x) * seat.screenSign + 0.5;

export const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// 画面の集まりが覆う x の範囲（ユニット）
function extentOf(xs) {
  if (!xs.length) return { min: 0, max: 1, span: 1 };
  const min = Math.min(...xs) - 0.5;
  const max = Math.max(...xs) + 0.5;
  return { min, max, span: max - min };
}

// 通路に面した画面全体の範囲
export const aisleExtent = (seats, aisle) => extentOf(seats.filter((s) => s.aisle === aisle).map((s) => s.x));

// 1つの列の画面全体の範囲
export const rowExtent = (seats, row) => extentOf(seats.filter((s) => s.row === row).map((s) => s.x));

// 画面どうしの最大の隙間（ユニット）
export function maxGap(seats, aisle) {
  let gap = 0;
  const byRow = new Map();
  for (const s of seats) if (s.aisle === aisle) byRow.set(s.row, [...(byRow.get(s.row) ?? []), s.x]);
  for (const xs of byRow.values()) {
    xs.sort((a, b) => a - b);
    for (let i = 1; i < xs.length; i++) gap = Math.max(gap, xs[i] - xs[i - 1] - 1);
  }
  return gap;
}
