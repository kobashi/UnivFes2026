// 40台を1画面で再現するシミュレータ。実機が無くても演出の確認ができる。
// 各画面をクリックするとその席で「動き検出」が起きたことにして波紋を出す。

import { AudioEngine, NullAudio } from './audio.js';
import { SyntheticCamera } from './camera.js';
import { Clock } from './clock.js';
import { connectEvents, fetchHello, postJSON } from './net.js';
import { SeatRunner } from './runtime.js';
import { sceneAt } from './schedule.js';

const room = document.getElementById('room');
const listenSel = document.getElementById('listen');
const statusEl = document.getElementById('status');

const W = 192;
const H = 108;

async function main() {
  const hello = await fetchHello();
  const { layout } = hello.config;
  let state = hello.state;
  const clock = new Clock();
  await clock.sync();
  setInterval(() => clock.sync(), 30_000);

  const audio = new AudioEngine();
  const units = [];

  // 俯瞰図どおりに並べる（列1が上の壁側）
  const rowEls = {};
  const order = [['wall', '壁'], [1], ['aisle', '通路A'], [2], [3], ['aisle', '通路B'], [4], ['wall', '壁']];
  for (const [r, label] of order) {
    const el = document.createElement('div');
    if (typeof r === 'number') {
      el.className = 'row';
      el.dataset.label = `列${r} ${r % 2 ? '画面↓' : '画面↑'}`;
      rowEls[r] = el;
    } else {
      el.className = r;
      el.textContent = label;
    }
    room.append(el);
  }

  for (const seat of [...hello.seats].sort((a, b) => a.x - b.x)) {
    const wrap = document.createElement('div');
    wrap.className = 'unit';
    const cv = document.createElement('canvas');
    cv.width = W;
    cv.height = H;
    cv.title = `${seat.id} — クリックで波紋`;
    const label = document.createElement('span');
    label.textContent = seat.id;
    wrap.append(cv, label);
    rowEls[seat.row]?.append(wrap);
    cv.addEventListener('click', () => postJSON('/api/event', { type: 'ripple', seat: seat.id, intensity: 1 }));

    const env = {
      seat,
      seats: hello.seats,
      layout,
      config: hello.config,
      audio: NullAudio,
      camera: new SyntheticCamera(48, 36, seat.index),
      emit: () => {},
    };
    units.push({ seat, env, ctx: cv.getContext('2d'), runner: new SeatRunner(env) });

    const opt = document.createElement('option');
    opt.value = seat.id;
    opt.textContent = seat.id;
    listenSel.append(opt);
  }

  // 1席だけ選んで音を聴く
  listenSel.addEventListener('change', () => {
    audio.resume();
    for (const u of units) {
      const next = u.seat.id === listenSel.value ? audio : NullAudio;
      if (u.env.audio !== next) {
        u.env.audio = next;
        u.runner.reset();
      }
    }
  });

  connectEvents((ev) => {
    if (ev.type === 'state') {
      state = ev.state;
      audio.setVolume(state.volume);
      audio.setMuted(state.muted);
    } else if (ev.type !== 'reload') {
      for (const u of units) u.runner.onEvent(ev, clock.now());
    }
  });

  let last = performance.now();
  let lastCam = 0;
  const loop = (ts) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    const now = clock.now();
    const camTick = ts - lastCam > 100;
    if (camTick) lastCam = ts;
    for (const u of units) {
      if (camTick) u.env.camera.update(now);
      u.runner.frame(u.ctx, W, H, now, dt, state, { identify: state.identify });
    }
    const info = sceneAt(state.schedule, now);
    statusEl.textContent = `${info.index + 1}/${state.schedule.scenes.length} ${info.id}  残り ${Math.ceil(info.remaining)}秒${state.schedule.hold != null ? '（固定中）' : ''}`;
  };
  requestAnimationFrame(loop);
}

main().catch((e) => {
  console.error(e);
  statusEl.textContent = `エラー: ${e.message}`;
});
