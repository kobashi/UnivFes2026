import assert from 'node:assert/strict';
import test from 'node:test';
import { aisleExtent, allSeats, makeSeat, maxGap, screenToWorldX, seatFromIp, worldToScreenU } from '../public/js/layout.js';

test('IP末尾 1〜10 が列1、11〜20 が列2 …', () => {
  assert.equal(seatFromIp('192.168.0.1').id, '1-1');
  assert.equal(seatFromIp('192.168.0.10').id, '1-10');
  assert.equal(seatFromIp('192.168.0.11').id, '2-1');
  assert.equal(seatFromIp('::ffff:10.0.0.40').id, '4-10');
  assert.equal(seatFromIp('192.168.0.41'), null);
  assert.equal(seatFromIp('192.168.0.0'), null);
  assert.equal(seatFromIp('localhost'), null);
});

test('octetStart で開始アドレスをずらせる', () => {
  assert.equal(seatFromIp('10.0.0.101', undefined, { octetStart: 101 }).id, '1-1');
  assert.equal(seatFromIp('10.0.0.140', undefined, { octetStart: 101 }).id, '4-10');
});

test('40席', () => assert.equal(allSeats().length, 40));

test('列2と列3は中央通路を挟んで向かい合い、画面の左右が物理的に逆', () => {
  const a = makeSeat(2, 5);
  const b = makeSeat(3, 5);
  assert.equal(a.x, b.x);
  assert.equal(a.facing, 1); // 列2 → 列3 側
  assert.equal(b.facing, -1); // 列3 → 列2 側
  assert.ok(a.y < b.y);
  // 両画面の右端は物理的に反対側
  assert.ok(screenToWorldX(a, 1) < a.x);
  assert.ok(screenToWorldX(b, 1) > b.x);
  assert.equal(a.aisle, 1);
  assert.equal(b.aisle, 1);
});

test('列1・列4は壁側を向き、それぞれ背中合わせの列と逆向き', () => {
  assert.equal(makeSeat(1, 1).facing, -1); // 壁(y=0)側
  assert.equal(makeSeat(4, 1).facing, 1);
  assert.equal(makeSeat(1, 1).facing, -makeSeat(2, 1).facing);
  assert.equal(makeSeat(3, 1).facing, -makeSeat(4, 1).facing);
  assert.deepEqual([1, 2, 3, 4].map((r) => makeSeat(r, 1).aisle), [0, 1, 1, 2]);
});

test('画面座標と物理座標の往復', () => {
  for (const s of allSeats()) {
    for (const u of [0, 0.3, 1]) assert.ok(Math.abs(worldToScreenU(s, screenToWorldX(s, u)) - u) < 1e-9);
  }
});

test('rowReverse で列内の番号の向きを反転できる', () => {
  const layout = { rows: 4, perRow: 10, rowReverse: [false, true, false, false] };
  assert.equal(makeSeat(2, 1, layout).x, makeSeat(1, 10, layout).x);
});

const withGeo = (geometry) => ({ rows: 4, perRow: 10, rowReverse: [false, false, false, false], geometry });

test('未測定なら隙間なしで並ぶ', () => {
  const seats = allSeats(withGeo({ screenWidthCm: 50, gapScale: 1, positionsCm: {} }));
  assert.equal(makeSeat(1, 3, withGeo({ screenWidthCm: 50, gapScale: 1, positionsCm: {} })).x, 2.5);
  assert.equal(maxGap(seats, 1), 0);
});

test('実測位置（cm）を画面幅単位に変換し、gapScale で隙間を縮められる', () => {
  // 1番の中心 25cm、以降 75cm 間隔、画面幅 50cm → 隙間 0.5 画面分
  const positionsCm = { 2: Array.from({ length: 10 }, (_, i) => 25 + 75 * i) };
  const full = withGeo({ screenWidthCm: 50, gapScale: 1, positionsCm });
  assert.equal(makeSeat(2, 1, full).x, 0.5);
  assert.equal(makeSeat(2, 3, full).x, 3.5);
  assert.ok(Math.abs(maxGap(allSeats(full), 1) - 0.5) < 1e-9);
  const half = withGeo({ screenWidthCm: 50, gapScale: 0.5, positionsCm });
  assert.equal(makeSeat(2, 3, half).x, 3); // 2.5（隙間なし）と 3.5（実寸）の中間
  const none = withGeo({ screenWidthCm: 50, gapScale: 0, positionsCm });
  assert.equal(makeSeat(2, 3, none).x, 2.5);
});

test('通路の範囲は面している列の画面全体', () => {
  const positionsCm = { 3: Array.from({ length: 10 }, (_, i) => 50 + 100 * i) };
  const ext = aisleExtent(allSeats(withGeo({ screenWidthCm: 50, gapScale: 1, positionsCm })), 1);
  assert.equal(ext.min, 0); // 列2（隙間なし）の左端
  assert.equal(ext.max, 19.5); // 列3 の10番 (950cm = 19) の右端
});
