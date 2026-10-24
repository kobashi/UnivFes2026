import assert from 'node:assert/strict';
import test from 'node:test';
import { allSeats, makeSeat, screenToWorldX, seatFromIp, worldToScreenU } from '../public/js/layout.js';

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
