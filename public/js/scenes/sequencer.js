// 演目4「光のシーケンサー」（回廊の別バージョン）
// 各列の10台をシーケンサーの10ステップに見立てる。再生位置が列に沿って進み、
// 「音符が置かれた」画面に来ると図形が弾けて音が鳴る。列ごとに楽器が違い
// （列1 ベース / 列2 和音 / 列3 メロディ / 列4 リズム）、40台で1つの曲になる。
// 中央通路では向かい合う列2・3が同じ再生位置で掛け合う。
// フレーズ（4周）ごとにパターンが変わる。

import { hsl, mod, mulberry32, pentaFreq } from '../util.js';

const BPM = 112;
const STEP = 60 / BPM / 2; // 8分音符
const STEPS = 10;
const LOOPS_PER_PHRASE = 4;
const LOOKAHEAD = 0.12; // 秒。少し先の音を予約して40台の発音を揃える

// 列ごとの楽器の色と形
const VOICES = {
  1: { name: 'bass', hue: 350, density: 0.45 },
  2: { name: 'chord', hue: 45, density: 0.35 },
  3: { name: 'lead', hue: 170, density: 0.5 },
  4: { name: 'drum', hue: 260, density: 0.7 },
};

export default class Sequencer {
  static id = 'sequencer';
  static title = '光のシーケンサー';
  static subtitle = 'LIGHT SEQUENCER';

  constructor(env) {
    this.env = env;
    this.seat = env.seat;
    this.voice = VOICES[env.seat.row] ?? VOICES[1];
    this.scheduled = -1;
    this.hitAt = -99;
    this.hitStrong = false;
  }

  // フレーズ番号から全PC共通のパターンを作る。{on, note, accent}
  cell(phrase, row, rank) {
    const r = mulberry32(phrase * 1009 + row * 31 + 7);
    const pat = [];
    const v = VOICES[row] ?? VOICES[1];
    for (let i = 0; i < STEPS; i++) {
      let on = r() < v.density;
      if (v.name === 'bass' && i % 5 === 0) on = true; // 拍の頭は必ず鳴らす
      if (v.name === 'drum' && i % 5 === 0) on = true;
      pat.push({ on, note: Math.floor(r() * 8), accent: r() < 0.3 || i === 0 });
    }
    return pat[rank % STEPS];
  }

  phraseAt(step) {
    return Math.floor(step / (STEPS * LOOPS_PER_PHRASE));
  }

  play(c, delay) {
    const a = this.env.audio;
    const g = c.accent ? 1 : 0.7;
    switch (this.voice.name) {
      case 'bass':
        a.tone({ freq: pentaFreq(55, c.note % 5), type: 'sawtooth', filter: 500, dur: 0.35, gain: 0.25 * g, delay });
        break;
      case 'chord':
        for (const k of [0, 2, 4]) a.tone({ freq: pentaFreq(220, c.note % 5 + k), type: 'triangle', dur: 0.6, gain: 0.07 * g, delay });
        break;
      case 'lead':
        a.tone({ freq: pentaFreq(440, c.note), type: 'square', filter: 2400, dur: 0.25, gain: 0.08 * g, delay });
        break;
      default:
        // 拍の頭はキック、それ以外はハイハット
        if (c.accent) a.tone({ freq: 150, slide: [[45, 0.15]], dur: 0.3, gain: 0.5, delay });
        else a.noise({ freq: 8000, q: 0.8, dur: 0.06, gain: 0.12, delay });
    }
  }

  frame(ctx, w, h, t, dt) {
    const seat = this.seat;
    const rank = seat.rank % STEPS;
    const step = Math.floor(t / STEP);
    const pos = mod(step, STEPS);
    const phrase = this.phraseAt(step);
    const c = this.cell(phrase, seat.row, rank);

    // 次に自分の番が来るステップを少し前に予約する
    const next = step + 1;
    if (next > this.scheduled && next * STEP - t < LOOKAHEAD && mod(next, STEPS) === rank) {
      this.scheduled = next;
      const nc = this.cell(this.phraseAt(next), seat.row, rank);
      if (nc.on) {
        this.play(nc, next * STEP - t);
        this.hitAt = next * STEP;
        this.hitStrong = nc.accent;
      }
    }

    // --- 背景：自分のステップ番号を示す格子 ---
    const hue = this.voice.hue;
    ctx.fillStyle = hsl(hue, 40, 5);
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = hsl(hue, 60, 18);
    ctx.lineWidth = Math.max(1, w * 0.002);
    for (let i = 1; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(0, (h * i) / 8);
      ctx.lineTo(w, (h * i) / 8);
      ctx.stroke();
    }

    // 再生位置の光：自分のステップの間、画面を進行方向に横切る
    const local = t / STEP - step; // 0..1
    if (pos === rank) {
      // 進行方向は物理 x の正方向 → 画面上では screenSign の向き
      const u = seat.screenSign > 0 ? local : 1 - local;
      const gx = u * w;
      const gr = ctx.createLinearGradient(gx - w * 0.3, 0, gx + w * 0.3, 0);
      gr.addColorStop(0, hsl(hue, 80, 50, 0));
      gr.addColorStop(0.5, hsl(hue, 80, 50, 0.35));
      gr.addColorStop(1, hsl(hue, 80, 50, 0));
      ctx.fillStyle = gr;
      ctx.fillRect(0, 0, w, h);
    }

    // 音符が置かれている画面は、次の出番を小さな図形で予告する
    if (c.on) {
      ctx.globalAlpha = 0.35;
      this.shape(ctx, w / 2, h / 2, h * 0.12, hue, 0);
      ctx.globalAlpha = 1;
    }

    // --- 発音した瞬間の図形 ---
    const age = t - this.hitAt;
    if (age >= 0 && age < 0.9) {
      const k = age / 0.9;
      const size = h * (0.15 + 0.45 * Math.sqrt(k)) * (this.hitStrong ? 1.2 : 1);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = (1 - k) ** 1.5;
      this.shape(ctx, w / 2, h / 2, size, hue, k);
      if (age < 0.08) {
        ctx.fillStyle = hsl(hue, 80, 70, 0.5);
        ctx.fillRect(0, 0, w, h);
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
    }

    // フレーズの変わり目は全台が一斉に光る
    const phraseStart = phrase * STEPS * LOOPS_PER_PHRASE * STEP;
    const pa = t - phraseStart;
    if (phrase > 0 && pa < 0.6) {
      ctx.fillStyle = `rgba(255,255,255,${0.5 * (1 - pa / 0.6)})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  // 楽器ごとの図形（k: 0..1 の展開度）
  shape(ctx, x, y, r, hue, k) {
    ctx.save();
    ctx.translate(x, y);
    ctx.lineWidth = Math.max(2, r * 0.12);
    ctx.strokeStyle = hsl(hue, 90, 65);
    ctx.fillStyle = hsl(hue, 90, 55, 0.6);
    ctx.beginPath();
    switch (this.voice.name) {
      case 'bass':
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fill();
        break;
      case 'chord':
        ctx.rotate(k * 0.8);
        for (let i = 0; i < 3; i++) ctx.rect(-r * (1 - i * 0.3), -r * (1 - i * 0.3), r * 2 * (1 - i * 0.3), r * 2 * (1 - i * 0.3));
        ctx.stroke();
        break;
      case 'lead':
        ctx.rotate(-k * 1.5);
        ctx.moveTo(0, -r);
        ctx.lineTo(r * 0.87, r * 0.5);
        ctx.lineTo(-r * 0.87, r * 0.5);
        ctx.closePath();
        ctx.stroke();
        break;
      default:
        for (let i = -3; i <= 3; i++) ctx.rect(-r * 1.6, i * r * 0.28 - r * 0.06, r * 3.2, r * 0.12);
        ctx.fill();
    }
    ctx.restore();
  }
}
