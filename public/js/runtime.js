// 1台分の画面を動かす。演目の切替・フェード・タイトル・座席表示を担当。
// 実機（app.js）でもシミュレータ（sim.js）でも同じものを使う。

import { SCENES } from './scenes/index.js';
import { sceneAt } from './schedule.js';
import { clamp } from './util.js';

const TITLE_SEC = 6;

export class SeatRunner {
  // env = { seat, seats, layout, config, audio, camera, emit(type, data) }
  constructor(env) {
    this.env = env;
    this.scene = null;
    this.cur = null;
  }

  get currentId() {
    return this.scene?.constructor.id ?? null;
  }

  _ensure(info) {
    // 時刻同期で開始時刻が数十ms揺れても作り直さないよう余裕を持たせる
    if (this.cur && this.cur.index === info.index && Math.abs(this.cur.startMs - info.startMs) < 1500) return;
    this.scene?.leave?.();
    const Scene = SCENES[info.id] ?? Object.values(SCENES)[0];
    this.scene = new Scene(this.env);
    this.cur = { index: info.index, startMs: info.startMs };
  }

  // 新しい演目インスタンスを作り直させる（音声出力先の切替時など）
  reset() {
    this.scene?.leave?.();
    this.scene = null;
    this.cur = null;
  }

  onEvent(ev, now) {
    this.scene?.onEvent?.(ev, now);
  }

  frame(ctx, w, h, now, dt, state, overlay = {}) {
    const info = sceneAt(state.schedule, now);
    this._ensure(info);
    this.env.audio.setFade(info.fade);
    ctx.save();
    this.scene.frame(ctx, w, h, info.local, dt, { now, info });
    ctx.restore();

    if (info.fade < 1) {
      ctx.fillStyle = `rgba(0,0,0,${1 - info.fade})`;
      ctx.fillRect(0, 0, w, h);
    }
    if (info.local < TITLE_SEC) drawTitle(ctx, w, h, this.scene.constructor, info.local);
    if (overlay.identify) drawIdentify(ctx, w, h, this.env.seat, overlay.lines ?? []);
    if (overlay.hint) drawHint(ctx, w, h, overlay.hint);
    return info;
  }
}

function drawTitle(ctx, w, h, Scene, t) {
  const a = clamp(Math.min((t - 0.8) / 0.8, (TITLE_SEC - t) / 1.2), 0, 1);
  if (a <= 0) return;
  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.8)';
  ctx.shadowBlur = h * 0.03;
  ctx.fillStyle = `rgba(255,255,255,${a})`;
  ctx.font = `bold ${Math.round(h * 0.13)}px "Hiragino Sans", "Hiragino Kaku Gothic ProN", sans-serif`;
  ctx.fillText(Scene.title, w / 2, h * 0.45);
  ctx.font = `${Math.round(h * 0.04)}px "Helvetica Neue", "Hiragino Sans", sans-serif`;
  ctx.fillStyle = `rgba(255,255,255,${a * 0.8})`;
  ctx.fillText(Scene.subtitle, w / 2, h * 0.6);
  ctx.restore();
}

function drawIdentify(ctx, w, h, seat, lines) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(0, 0, w, h);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.round(h * 0.35)}px "Helvetica Neue", sans-serif`;
  ctx.fillText(seat.id, w / 2, h * 0.38);
  ctx.font = `${Math.round(h * 0.045)}px "Hiragino Sans", sans-serif`;
  lines.forEach((l, i) => ctx.fillText(l, w / 2, h * (0.68 + i * 0.07)));
  ctx.restore();
}

function drawHint(ctx, w, h, text) {
  ctx.save();
  ctx.font = `${Math.round(h * 0.03)}px "Hiragino Sans", sans-serif`;
  ctx.textAlign = 'right';
  ctx.textBaseline = 'bottom';
  ctx.fillStyle = 'rgba(255,255,255,0.6)';
  ctx.fillText(text, w - h * 0.03, h - h * 0.03);
  ctx.restore();
}
