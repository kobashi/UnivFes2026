// Webカメラを低解像度で読み、明るさマップと動き量を出す。
// 映像は左右反転して「鏡」として扱う。

export class Camera {
  constructor(w = 64, h = 48) {
    this.w = w;
    this.h = h;
    this.lum = new Float32Array(w * h);
    this.diff = new Float32Array(w * h);
    this.prev = new Float32Array(w * h);
    this.motion = 0;
    this.cx = 0.5;
    this.cy = 0.5;
    this.ok = false;
    this.real = true;
    this.error = null;
    this.lo = 0;
    this.hi = 1;
  }

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error = 'getUserMedia unavailable (secure origin required)';
      return false;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 320 }, height: { ideal: 240 }, facingMode: 'user' },
        audio: false,
      });
      const v = (this.video = document.createElement('video'));
      v.muted = true;
      v.playsInline = true;
      v.srcObject = stream;
      await v.play();
      this.canvas = document.createElement('canvas');
      this.canvas.width = this.w;
      this.canvas.height = this.h;
      this.cctx = this.canvas.getContext('2d', { willReadFrequently: true });
      this.ok = true;
    } catch (e) {
      this.error = e.name || String(e);
    }
    return this.ok;
  }

  get statusLabel() {
    return this.ok ? 'ok' : `none (${this.error})`;
  }

  update() {
    if (!this.ok || this.video.readyState < 2) return;
    const { w, h, cctx } = this;
    cctx.save();
    cctx.translate(w, 0);
    cctx.scale(-1, 1);
    cctx.drawImage(this.video, 0, 0, w, h);
    cctx.restore();
    const px = cctx.getImageData(0, 0, w, h).data;
    let cnt = 0;
    let sx = 0;
    let sy = 0;
    let mn = 1;
    let mx = 0;
    // 照明に左右されないよう、明るさを自動レベル補正する
    const range = Math.max(0.15, this.hi - this.lo);
    for (let i = 0, p = 0; i < w * h; i++, p += 4) {
      const raw = (0.299 * px[p] + 0.587 * px[p + 1] + 0.114 * px[p + 2]) / 255;
      if (raw < mn) mn = raw;
      if (raw > mx) mx = raw;
      const l = Math.min(1, Math.max(0, (raw - this.lo) / range));
      const d = Math.abs(raw - this.prev[i]);
      this.prev[i] = raw;
      this.lum[i] = l;
      this.diff[i] = this.diff[i] * 0.6 + d;
      if (d > 0.1) {
        cnt++;
        sx += i % w;
        sy += (i / w) | 0;
      }
    }
    this.lo += (mn - this.lo) * 0.05;
    this.hi += (mx - this.hi) * 0.05;
    this.motion = cnt / (w * h);
    if (cnt > 0) {
      this.cx = sx / cnt / w;
      this.cy = sy / cnt / h;
    }
  }
}

// カメラが無い/許可されない時や、シミュレータ用の疑似映像。
// ゆっくり動く光の塊を描くだけで、動き検出は発生させない。
export class SyntheticCamera {
  constructor(w = 64, h = 48, seed = 0) {
    this.w = w;
    this.h = h;
    this.lum = new Float32Array(w * h);
    this.diff = new Float32Array(w * h);
    this.motion = 0;
    this.cx = 0.5;
    this.cy = 0.5;
    this.ok = true;
    this.real = false;
    this.seed = seed;
    this.statusLabel = 'synthetic';
  }

  update(nowMs = Date.now()) {
    const t = nowMs / 1000 + this.seed * 1.7;
    const { w, h } = this;
    const blobs = [0, 1, 2].map((k) => ({
      x: 0.5 + 0.35 * Math.sin(t * (0.21 + k * 0.07) + k * 2),
      y: 0.5 + 0.3 * Math.cos(t * (0.17 + k * 0.05) + k),
      r: 0.18 + 0.06 * k,
    }));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        let l = 0.08;
        for (const b of blobs) {
          const d2 = ((u - b.x) ** 2 + (v - b.y) ** 2) / (b.r * b.r);
          l += Math.exp(-d2);
        }
        this.lum[y * w + x] = Math.min(1, l * 0.8);
      }
    }
  }
}
