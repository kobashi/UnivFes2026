import assert from 'node:assert/strict';
import test from 'node:test';
import { sceneAt } from '../public/js/schedule.js';

const scenes = [
  { id: 'a', duration: 10 },
  { id: 'b', duration: 20 },
  { id: 'c', duration: 30 },
];
const sch = { epoch: 0, scenes, transition: 2, hold: null };

test('時刻から演目と経過秒を求める', () => {
  assert.deepEqual([sceneAt(sch, 0).id, sceneAt(sch, 0).local], ['a', 0]);
  assert.equal(sceneAt(sch, 9_999).id, 'a');
  assert.equal(sceneAt(sch, 10_000).id, 'b');
  assert.equal(sceneAt(sch, 35_000).id, 'c');
  assert.equal(sceneAt(sch, 35_000).local, 5);
  assert.equal(sceneAt(sch, 60_000).id, 'a'); // ループ
  assert.equal(sceneAt(sch, -1_000).id, 'c'); // epoch 前でも破綻しない
});

test('切替前後はフェード', () => {
  assert.equal(sceneAt(sch, 0).fade, 0);
  assert.equal(sceneAt(sch, 1_000).fade, 0.5);
  assert.equal(sceneAt(sch, 5_000).fade, 1);
  assert.equal(sceneAt(sch, 9_000).fade, 0.5);
});

test('hold 中は同じ演目を繰り返す', () => {
  const h = { ...sch, epoch: -10_000, hold: 1 }; // 時刻0で b が開始
  assert.equal(sceneAt(h, 0).id, 'b');
  assert.equal(sceneAt(h, 25_000).id, 'b');
  assert.equal(sceneAt(h, 25_000).local, 5);
});
