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
  return {
    id: seatId(row, col),
    row,
    col,
    index: (row - 1) * perRow + (col - 1),
    // 画面中心の物理位置（1台 = 幅1ユニット）
    x: (reverse ? perRow - col : col - 1) + 0.5,
    y: g.y,
    facing: g.facing,
    aisle: g.aisle,
    // 画面の「右」が物理 x の正負どちらを向くか。
    // 画面の前に立つ人は -facing 方向を見るので、右手は facing>0 なら -x 側。
    screenSign: g.facing > 0 ? -1 : 1,
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
