// WebAudio のシンセ。音源ファイルは使わず全てその場で合成する。

class Drone {
  constructor(engine, opts) {
    this.e = engine;
    this.opts = opts;
    this.src = null;
    this.stopped = false;
  }

  // AudioContext が後から（クリック等で）有効になっても鳴らせるよう遅延生成する
  _ensure() {
    const e = this.e;
    if (this.src || this.stopped || !e.running) return;
    const c = e.ctx;
    const { freq = 110, type = 'sine', noise = false, filter = null } = this.opts;
    if (noise) {
      this.src = c.createBufferSource();
      this.src.buffer = e.noiseBuffer;
      this.src.loop = true;
    } else {
      this.src = c.createOscillator();
      this.src.type = type;
      this.src.frequency.value = freq;
    }
    this.gain = c.createGain();
    this.gain.gain.value = 0;
    let node = this.src;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      node.connect(f);
      node = f;
    }
    node.connect(this.gain);
    this.gain.connect(e.bus);
    this.src.start();
  }

  set(gain, freq) {
    this._ensure();
    if (!this.src) return;
    const t = this.e.ctx.currentTime;
    this.gain.gain.setTargetAtTime(gain, t, 0.15);
    if (freq && this.src.frequency) this.src.frequency.setTargetAtTime(freq, t, 0.2);
  }

  stop() {
    this.stopped = true;
    if (!this.src) return;
    const t = this.e.ctx.currentTime;
    this.gain.gain.setTargetAtTime(0, t, 0.2);
    this.src.stop(t + 1.2);
  }
}

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.volume = 0.7;
    this.muted = false;
    this.fade = 1;
  }

  _init() {
    if (this.ctx) return;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    const c = (this.ctx = new AC());
    this.bus = c.createGain(); // 演目の切替フェード用
    this.out = c.createGain(); // 音量・ミュート用
    const comp = c.createDynamicsCompressor();
    this.bus.connect(this.out);
    this.out.connect(comp);
    comp.connect(c.destination);
    this.out.gain.value = this.muted ? 0 : this.volume;
    const len = c.sampleRate * 2;
    this.noiseBuffer = c.createBuffer(1, len, c.sampleRate);
    const d = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  get stateLabel() {
    return this.ctx ? this.ctx.state : 'none';
  }

  resume() {
    this._init();
    return this.ctx?.resume().catch(() => {});
  }

  _applyGain() {
    if (this.ctx) this.out.gain.setTargetAtTime(this.muted ? 0 : this.volume, this.ctx.currentTime, 0.1);
  }

  setVolume(v) {
    this.volume = v;
    this._applyGain();
  }

  setMuted(m) {
    this.muted = m;
    this._applyGain();
  }

  setFade(f) {
    if (!this.ctx || Math.abs(f - this.fade) < 0.01) return;
    this.fade = f;
    this.bus.gain.setTargetAtTime(f, this.ctx.currentTime, 0.05);
  }

  // slide: [[周波数, 開始からの秒], ...] で音程を滑らせる
  tone({ freq = 440, delay = 0, dur = 0.4, type = 'sine', gain = 0.2, attack = 0.005, slide = null, filter = null } = {}) {
    if (!this.running) return;
    const c = this.ctx;
    const t0 = c.currentTime + Math.max(0, delay);
    const osc = c.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slide) for (const [f, at] of slide) osc.frequency.exponentialRampToValueAtTime(f, t0 + at);
    const g = c.createGain();
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    let node = osc;
    if (filter) {
      const f = c.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = filter;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.bus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  bell(freq, { gain = 0.2, delay = 0, dur = 1.6 } = {}) {
    this.tone({ freq, gain, delay, dur });
    this.tone({ freq: freq * 2.01, gain: gain * 0.3, delay, dur: dur * 0.5 });
    this.tone({ freq: freq * 3.0, gain: gain * 0.12, delay, dur: dur * 0.25 });
  }

  noise({ delay = 0, dur = 0.3, gain = 0.1, freq = 1200, q = 1 } = {}) {
    if (!this.running) return;
    const c = this.ctx;
    const t0 = c.currentTime + Math.max(0, delay);
    const src = c.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.bus);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  drone(opts = {}) {
    this._init();
    return new Drone(this, opts);
  }
}

// シミュレータ等、音を出さない席用
const NULL_DRONE = { set() {}, stop() {} };
export const NullAudio = {
  running: false,
  stateLabel: 'off',
  resume() {},
  setVolume() {},
  setMuted() {},
  setFade() {},
  tone() {},
  bell() {},
  noise() {},
  drone: () => NULL_DRONE,
};
