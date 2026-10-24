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

test('向かい合う列は画面の左右が物理的に逆', () => {
  const a = makeSeat(1, 5);
  const b = makeSeat(2, 5);
  assert.equal(a.x, b.x);
  // 両画面の右端は物理的に反対側
  assert.ok(screenToWorldX(a, 1) < a.x);
  assert.ok(screenToWorldX(b, 1) > b.x);
  // 列2と列3は背中合わせ＝画面は逆向き
  assert.equal(makeSeat(2, 1).facing, -makeSeat(3, 1).facing);
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
