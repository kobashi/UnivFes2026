// 40台を1画面で再現するシミュレータ。実機が無くても演出の確認ができる。
// 各画面をクリックするとその席で「動き検出」が起きたことにする（演目に応じて
// 波紋・影・流れ星が出る）。画面は端末の実際の間隔どおりに並べる。

import { AudioEngine, NullAudio } from './audio.js';
import { SyntheticCamera } from './camera.js';
import { Clock } from './clock.js';
import { allSeats, makeSeat } from './layout.js';
import { connectEvents, fetchHello, postJSON } from './net.js';
import { encodeMask, MASK_H, MASK_W } from './scenes/echo.js';
import { SeatRunner } from './runtime.js';
import { sceneAt } from './schedule.js';

const room = document.getElementById('room');
const listenSel = document.getElementById('listen');
const statusEl = document.getElementById('status');

const W = 192;
const H = 108;

async function main() {
  const hello = await fetchHello();
  let { layout } = hello.config;
  let state = hello.state;
  const clock = new Clock();
  await clock.sync();
  setInterval(() => clock.sync(), 30_000);

  const audio = new AudioEngine();
  const units = [];

  // 俯瞰図どおりに並べる（列1が上の壁側）
  const rowEls = {};
  const order = [['wall', '壁'], ['aisle', '通路A'], [1], [2], ['aisle', '中央通路'], [3], [4], ['aisle', '通路C'], ['wall', '壁']];
  for (const [r, label] of order) {
    const el = document.createElement('div');
    if (typeof r === 'number') {
      el.className = 'row';
      // 図は y が下向きに増えるので facing>0 なら画面は下向き
      const f = hello.seats.find((s) => s.row === r)?.facing;
      el.dataset.label = `列${r} ${f > 0 ? '画面↓' : '画面↑'}`;
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
    cv.addEventListener('click', () => postJSON('/api/event', clickEvent(seat.id, sceneAt(state.schedule, clock.now()).id)));

    const env = {
      seat,
      seats: hello.seats,
      layout,
      config: hello.config,
      audio: NullAudio,
      camera: new SyntheticCamera(48, 36, seat.index),
      emit: () => {},
    };
    units.push({ seat, env, wrap, ctx: cv.getContext('2d'), runner: new SeatRunner(env) });

    const opt = document.createElement('option');
    opt.value = seat.id;
    opt.textContent = seat.id;
    listenSel.append(opt);
  }

  // 実際の間隔どおりに配置する（1ユニット = 画面1枚 = W px）
  const place = () => {
    const minX = Math.min(...units.map((u) => u.env.seat.x)) - 0.5;
    const maxX = Math.max(...units.map((u) => u.env.seat.x)) + 0.5;
    for (const el of Object.values(rowEls)) el.style.width = `${(maxX - minX) * W}px`;
    for (const u of units) u.wrap.style.left = `${(u.env.seat.x - 0.5 - minX) * W}px`;
  };
  place();

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
    } else if (ev.type === 'layout') {
      layout = ev.layout;
      const seats = allSeats(layout);
      for (const u of units) {
        u.env.layout = layout;
        u.env.seats = seats;
        u.env.seat = makeSeat(u.seat.row, u.seat.col, layout);
        u.runner.reset();
      }
      place();
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
      u.runner.frame(u.ctx, W, H, now, dt, state, { identify: state.identify, calibrate: state.calibrate });
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

// クリックした席で起こす出来事（演目ごと）
function clickEvent(seat, sceneId) {
  if (sceneId === 'nightsky') return { type: 'meteor', seat };
  if (sceneId === 'echo') {
    // 人影の代わりに円い影を送る
    const bits = new Uint8Array(MASK_W * MASK_H);
    for (let y = 0; y < MASK_H; y++) {
      for (let x = 0; x < MASK_W; x++) bits[y * MASK_W + x] = (x - MASK_W / 2) ** 2 + ((y - MASK_H / 2) * 1.8) ** 2 < 60 ? 1 : 0;
    }
    return { type: 'echo', seat, mask: encodeMask(bits), energy: 0.2 };
  }
  return { type: 'ripple', seat, intensity: 1 };
}
