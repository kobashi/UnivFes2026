// 1台分の画面を動かす。演目の切替・フェード・タイトル・座席表示を担当。
// 実機（app.js）でもシミュレータ（sim.js）でも同じものを使う。

import { aisleExtent, screenToWorldX, worldToScreenU } from './layout.js';
import { edgeHint } from './scenes/common.js';
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
    this.env.audio.setFade(overlay.calibrate ? 0 : info.fade);
    ctx.save();
    if (overlay.calibrate) drawCalibration(ctx, w, h, this.env, now);
    else this.scene.frame(ctx, w, h, info.local, dt, { now, info });
    ctx.restore();
    if (overlay.calibrate) return info;

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

// 間隔調整用の画面。部屋の座標に固定した斜線と目盛り、一定速度で動く玉を描く。
// 位置の設定が正しければ、隣の画面との間で斜線がまっすぐ続き、玉の速さも揃って見える。
function drawCalibration(ctx, w, h, env, now) {
  const { seat, seats, layout } = env;
  const t = now / 1000;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, w, h);
  const X0 = screenToWorldX(seat, 0);
  const X1 = screenToWorldX(seat, 1);
  const lo = Math.min(X0, X1);
  const hi = Math.max(X0, X1);
  const sx = (X) => worldToScreenU(seat, X) * w;
  ctx.lineWidth = Math.max(2, h * 0.006);
  // 斜線（ワールド座標で 45° 相当。画面の高さ = 0.5625 ユニットとして描く）
  const H = h / w;
  ctx.strokeStyle = '#0cf';
  for (let n = Math.floor((lo - H) / 0.25) - 1; n <= Math.ceil(hi / 0.25) + 1; n++) {
    const Xa = n * 0.25;
    ctx.beginPath();
    ctx.moveTo(sx(Xa), 0);
    ctx.lineTo(sx(Xa + H), h);
    ctx.stroke();
  }
  // 目盛り（1ユニットごと = 画面1枚分）
  const cm = layout.geometry?.screenWidthCm ?? 0;
  ctx.fillStyle = '#ff0';
  ctx.font = `${Math.round(h * 0.04)}px "Helvetica Neue", sans-serif`;
  ctx.textAlign = 'center';
  for (let n = Math.floor(lo * 2); n <= Math.ceil(hi * 2); n++) {
    const X = n / 2;
    const x = sx(X);
    ctx.fillRect(x - 1, h * 0.46, 2, h * (n % 2 ? 0.04 : 0.08));
    if (n % 2 === 0 && cm) ctx.fillText(`${Math.round(X * cm)}cm`, x, h * 0.6);
  }
  ctx.fillRect(0, h / 2 - 1, w, 2);
  // 一定速度の玉（1ユニット/秒で通路を往復）
  const ext = aisleExtent(seats, seat.aisle);
  const p = (t % (ext.span * 2)) / ext.span;
  const bx = ext.min + (p < 1 ? p : 2 - p) * ext.span;
  ctx.fillStyle = '#f40';
  ctx.beginPath();
  ctx.arc(sx(bx), h * 0.3, h * 0.06, 0, Math.PI * 2);
  ctx.fill();
  edgeHint(ctx, w, h, seat, bx, 0.3, '255,80,0', { strength: 0.6 });
  // 番号の大きい隣の台がある側を矢印で示す（実物と逆なら col1Side を切り替える）
  const reverse = !!layout.rowReverse?.[seat.row - 1];
  const toHigher = (reverse ? -1 : 1) * seat.screenSign; // 画面上で +1 = 右
  ctx.fillStyle = '#0f8';
  ctx.font = `bold ${Math.round(h * 0.09)}px "Hiragino Sans", sans-serif`;
  ctx.fillText(toHigher > 0 ? `${layout.perRow}番側 →` : `← ${layout.perRow}番側`, w / 2, h * 0.16);
  ctx.fillStyle = '#fff';
  ctx.font = `bold ${Math.round(h * 0.08)}px "Helvetica Neue", sans-serif`;
  ctx.fillText(seat.id, w / 2, h * 0.85);
  ctx.font = `${Math.round(h * 0.04)}px "Helvetica Neue", sans-serif`;
  ctx.fillText(cm ? `中心 ${Math.round(seat.x * cm)}cm` : `x = ${seat.x.toFixed(2)}`, w / 2, h * 0.93);
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
