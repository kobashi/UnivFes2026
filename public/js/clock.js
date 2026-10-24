// サーバ時刻との同期（簡易NTP）。往復時間が最小のサンプルを採用する。

export class Clock {
  constructor() {
    this.offset = 0;
    this.rtt = null;
    this.synced = false;
  }

  now() {
    return Date.now() + this.offset;
  }

  async sync(samples = 6) {
    let best = null;
    for (let i = 0; i < samples; i++) {
      try {
        const t0 = performance.now();
        const r = await fetch('/api/time', { cache: 'no-store' });
        const j = await r.json();
        const rtt = performance.now() - t0;
        const off = j.t + rtt / 2 - Date.now();
        if (!best || rtt < best.rtt) best = { rtt, off };
      } catch {
        // 一時的なネットワーク断は無視して次のサンプルへ
      }
    }
    if (best) {
      this.offset = best.off;
      this.rtt = best.rtt;
      this.synced = true;
    }
    return best;
  }
}
