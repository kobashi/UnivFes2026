// 各iMacで全画面表示するクライアント本体

import { AudioEngine } from './audio.js';
import { Camera, SyntheticCamera } from './camera.js';
import { Clock } from './clock.js';
import { makeSeat } from './layout.js';
import { connectEvents, fetchHello, postJSON } from './net.js';
import { SeatRunner } from './runtime.js';

const params = new URLSearchParams(location.search);
const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: false });
const msg = document.getElementById('msg');

async function main() {
  msg.textContent = 'サーバに接続中…';
  const hello = await fetchHello(params.get('seat'));
  const { layout } = hello.config;
  const assigned = !!hello.seat;
  const seat = hello.seat ?? makeSeat(1, 1, layout);
  let state = hello.state;

  msg.textContent = '時刻を同期中…';
  const clock = new Clock();
  await clock.sync();
  setInterval(() => clock.sync(), 30_000);
  msg.remove();

  const forceMute = params.has('mute');
  const audio = new AudioEngine();
  audio.setVolume(state.volume);
  audio.setMuted(state.muted || forceMute);
  audio.resume(); // Chrome を --autoplay-policy=no-user-gesture-required で起動していればここで鳴る
  const unlock = () => audio.resume();
  addEventListener('pointerdown', unlock);
  addEventListener('keydown', unlock);

  const env = {
    seat,
    seats: hello.seats,
    layout,
    config: hello.config,
    audio,
    camera: new SyntheticCamera(64, 48, seat.index),
    emit: (type, data) => {
      if (assigned) postJSON('/api/event', { type, seat: seat.id, ...data }).catch(() => {});
    },
  };
  // カメラ許可を待つ間も疑似映像で動かしておき、取れたら差し替える
  let camStatus = params.has('nocam') ? 'disabled' : 'starting';
  if (!params.has('nocam')) {
    const cam = new Camera();
    cam.start().then((ok) => {
      if (ok) env.camera = cam;
      camStatus = cam.statusLabel;
    });
  }

  const runner = new SeatRunner(env);
  connectEvents((ev) => {
    if (ev.type === 'state') {
      state = ev.state;
      audio.setVolume(state.volume);
      audio.setMuted(state.muted || forceMute);
    } else if (ev.type === 'reload') {
      location.reload();
    } else {
      runner.onEvent(ev, clock.now());
    }
  });

  let fps = 0;
  setInterval(() => {
    postJSON('/api/status', {
      seat: assigned ? seat.id : null,
      fps: Math.round(fps),
      camera: camStatus,
      audio: audio.stateLabel,
      scene: runner.currentId,
      size: `${canvas.width}x${canvas.height}`,
      rtt: clock.rtt != null ? Math.round(clock.rtt) : null,
    }).catch(() => {});
  }, 5000);

  const scale = hello.config.renderScale ?? 1;
  let last = performance.now();
  let lastCam = 0;
  const loop = (ts) => {
    requestAnimationFrame(loop);
    const dt = Math.min(0.1, (ts - last) / 1000);
    last = ts;
    if (dt > 0) fps += (1 / dt - fps) * 0.05;

    const W = Math.round(innerWidth * scale);
    const H = Math.round(innerHeight * scale);
    if (canvas.width !== W || canvas.height !== H) {
      canvas.width = W;
      canvas.height = H;
    }
    const now = clock.now();
    if (ts - lastCam > 66) {
      env.camera.update(now);
      lastCam = ts;
    }
    runner.frame(ctx, W, H, now, dt, state, {
      identify: state.identify || !assigned,
      lines: assigned
        ? [`IP ${hello.ip}`, `camera: ${camStatus} / audio: ${audio.stateLabel} / ${Math.round(fps)}fps`]
        : [`このPC (${hello.ip}) は座席に割り当てられていません`, 'config.json の seatOverrides か URL の ?seat=列-番号 で指定してください'],
      hint: !audio.running && !audio.muted ? 'クリックで音声を有効化' : null,
    });
  };
  requestAnimationFrame(loop);
}

main().catch((e) => {
  console.error(e);
  msg.textContent = `起動エラー: ${e.message}`;
});
