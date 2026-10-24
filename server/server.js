// PC実習室アトラクション 制御サーバ（依存パッケージなし）
//
//   node server/server.js            → http://<このPCのIP>:8080/
//
// 役割: 静的ファイル配信 / 時刻配信 / 演目スケジュール配信 / 波紋イベントの中継 /
//       各端末の状態集約（管理画面用）

import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEFAULT_LAYOUT, allSeats, makeSeat, parseSeatId, seatFromIp } from '../public/js/layout.js';
import { sceneAt, sceneOffset } from '../public/js/schedule.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC = path.join(ROOT, 'public');
const ONLINE_MS = 12_000;

const DEFAULTS = {
  port: 8080,
  layout: DEFAULT_LAYOUT,
  ipMapping: { octetStart: 1 },
  seatOverrides: {},
  scenes: [
    { id: 'corridor', duration: 120 },
    { id: 'mirror', duration: 120 },
    { id: 'migration', duration: 120 },
  ],
  transition: 3,
  volume: 0.7,
  renderScale: 1,
  motionThreshold: 0.05,
  idleRippleSec: 5,
  adminToken: '',
};

function loadConfig() {
  const file = process.env.UNIVFES_CONFIG || path.join(ROOT, 'config.json');
  let user = {};
  if (fs.existsSync(file)) user = JSON.parse(fs.readFileSync(file, 'utf8'));
  const cfg = { ...DEFAULTS, ...user, layout: { ...DEFAULTS.layout, ...user.layout } };
  if (process.env.PORT) cfg.port = +process.env.PORT;
  return cfg;
}

const config = loadConfig();
const SEATS = allSeats(config.layout);

const state = {
  epoch: Date.now(),
  hold: null,
  muted: false,
  identify: false,
  volume: config.volume,
};

const schedule = () => ({ epoch: state.epoch, hold: state.hold, scenes: config.scenes, transition: config.transition });
const publicState = () => ({ schedule: schedule(), muted: state.muted, identify: state.identify, volume: state.volume });

// ---------- 端末・SSE ----------

const streams = new Set();
const status = new Map(); // seatId or "?ip" → 最新の状態
const lastRippleBySeat = new Map();
let lastRipple = 0;

function broadcast(msg) {
  const line = `data: ${JSON.stringify(msg)}\n\n`;
  for (const res of streams) res.write(line);
}

const broadcastState = () => broadcast({ type: 'state', state: publicState() });

function clientIp(req) {
  return String(req.socket.remoteAddress ?? '').replace(/^::ffff:/, '');
}

function resolveSeat(ip, seatParam) {
  const p = parseSeatId(seatParam);
  if (p) return makeSeat(p.row, p.col, config.layout);
  const o = parseSeatId(config.seatOverrides[ip]);
  if (o) return makeSeat(o.row, o.col, config.layout);
  if (ip.startsWith('127.') || ip === '::1') return null; // サーバPC自身で開いた場合
  return seatFromIp(ip, config.layout, config.ipMapping);
}

function emitRipple(seatIdStr, intensity, auto = false) {
  const now = Date.now();
  lastRipple = now;
  lastRippleBySeat.set(seatIdStr, now);
  broadcast({ type: 'ripple', seat: seatIdStr, intensity, auto, t: now, hue: Math.floor(Math.random() * 360) });
}

// 「ミラー」上演中に誰も動かなければ、ランダムな席から波紋を出して場を保つ
setInterval(() => {
  const info = sceneAt(schedule(), Date.now());
  if (info.id !== 'mirror' || info.fade < 1) return;
  if (Date.now() - lastRipple < config.idleRippleSec * 1000) return;
  const s = SEATS[Math.floor(Math.random() * SEATS.length)];
  emitRipple(s.id, 0.6, true);
}, 1000);

setInterval(() => {
  for (const res of streams) res.write(': keepalive\n\n');
}, 15_000);

// ---------- HTTP ----------

function json(res, body, code = 200) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readBody(req, limit = 16 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > limit) {
        reject(new Error('body too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('invalid json'));
      }
    });
    req.on('error', reject);
  });
}

const str = (v, n = 80) => String(v ?? '').slice(0, n);
const num = (v) => (Number.isFinite(+v) ? +v : null);

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};
const PAGES = { '/': '/index.html', '/sim': '/sim.html', '/admin': '/admin.html' };

function serveStatic(res, pathname) {
  const rel = PAGES[pathname] ?? pathname;
  const file = path.join(PUBLIC, path.normalize(decodeURIComponent(rel)));
  if (!file.startsWith(PUBLIC + path.sep)) return json(res, { error: 'forbidden' }, 403);
  fs.readFile(file, (err, buf) => {
    if (err) return json(res, { error: 'not found' }, 404);
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(buf);
  });
}

const routes = {
  'GET /api/time': (req, res) => json(res, { t: Date.now() }),

  // 各iMacで `curl -s http://<サーバ>:8080/kiosk.sh | bash` するだけで展示を開始できる
  'GET /kiosk.sh': (req, res) => {
    const host = String(req.headers.host ?? '');
    if (!/^[\w.:-]+$/.test(host)) return json(res, { error: 'bad host' }, 400);
    const script = fs.readFileSync(path.join(ROOT, 'scripts', 'kiosk-mac.sh'), 'utf8');
    res.writeHead(200, { 'Content-Type': 'text/x-shellscript; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(script.replace(/^#!.*\n/, (l) => `${l}export UNIVFES_SERVER="${host}"\n`));
  },

  'GET /api/hello': (req, res, url) => {
    const ip = clientIp(req);
    json(res, {
      ip,
      seat: resolveSeat(ip, url.searchParams.get('seat')),
      seats: SEATS,
      state: publicState(),
      config: { layout: config.layout, renderScale: config.renderScale, motionThreshold: config.motionThreshold },
    });
  },

  'GET /events': (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    res.write(`data: ${JSON.stringify({ type: 'state', state: publicState() })}\n\n`);
    streams.add(res);
    req.on('close', () => streams.delete(res));
  },

  'POST /api/event': async (req, res) => {
    const b = await readBody(req);
    if (b.type !== 'ripple') return json(res, { error: 'unknown type' }, 400);
    const p = parseSeatId(b.seat);
    const seat = p && makeSeat(p.row, p.col, config.layout);
    if (!seat) return json(res, { error: 'bad seat' }, 400);
    // 1台からの連打を抑える
    if (Date.now() - (lastRippleBySeat.get(seat.id) ?? 0) < 800) return json(res, { ok: false, throttled: true });
    emitRipple(seat.id, Math.min(1, Math.max(0, num(b.intensity) ?? 0.7)));
    json(res, { ok: true });
  },

  'POST /api/status': async (req, res) => {
    const b = await readBody(req);
    const ip = clientIp(req);
    const p = parseSeatId(b.seat);
    const seat = p && makeSeat(p.row, p.col, config.layout);
    status.set(seat ? seat.id : `?${ip}`, {
      ip,
      fps: num(b.fps),
      camera: str(b.camera),
      audio: str(b.audio, 20),
      scene: str(b.scene, 20),
      size: str(b.size, 20),
      rtt: num(b.rtt),
      lastSeen: Date.now(),
    });
    json(res, { ok: true });
  },

  'GET /api/clients': (req, res) => {
    const now = Date.now();
    const online = (st) => !!st && now - st.lastSeen < ONLINE_MS;
    json(res, {
      now,
      state: publicState(),
      seats: SEATS.map((s) => {
        const st = status.get(s.id) ?? null;
        return { ...s, status: st, online: online(st) };
      }),
      unassigned: [...status.entries()].filter(([k, st]) => k.startsWith('?') && online(st)).map(([, st]) => st),
    });
  },

  'POST /api/admin': async (req, res) => {
    const token = req.headers['x-admin-token'] ?? '';
    if (config.adminToken && token !== config.adminToken) return json(res, { error: 'unauthorized' }, 401);
    const b = await readBody(req);
    const now = Date.now();
    const n = config.scenes.length;
    const startScene = (i) => (state.epoch = now - sceneOffset(config.scenes, i) * 1000);
    const validIndex = (i) => Number.isInteger(i) && i >= 0 && i < n;
    switch (b.action) {
      case 'jump':
        if (!validIndex(b.index)) return json(res, { error: 'bad index' }, 400);
        startScene(b.index);
        if (state.hold != null) state.hold = b.index;
        break;
      case 'next': {
        const i = (sceneAt(schedule(), now).index + 1) % n;
        startScene(i);
        if (state.hold != null) state.hold = i;
        break;
      }
      case 'hold':
        if (!validIndex(b.index)) return json(res, { error: 'bad index' }, 400);
        startScene(b.index);
        state.hold = b.index;
        break;
      case 'release':
        if (state.hold != null) {
          // 固定中の演目の続きから通常ループに戻す
          const info = sceneAt(schedule(), now);
          state.epoch = now - (sceneOffset(config.scenes, info.index) + info.local) * 1000;
          state.hold = null;
        }
        break;
      case 'restart':
        state.epoch = now;
        state.hold = null;
        break;
      case 'mute':
        state.muted = !!b.on;
        break;
      case 'volume':
        state.volume = Math.min(1, Math.max(0, num(b.value) ?? state.volume));
        break;
      case 'identify':
        state.identify = !!b.on;
        break;
      case 'reload':
        broadcast({ type: 'reload' });
        return json(res, { ok: true });
      default:
        return json(res, { error: 'unknown action' }, 400);
    }
    broadcastState();
    console.log(`[admin] ${b.action} ${b.index ?? b.on ?? b.value ?? ''}`);
    json(res, { ok: true, state: publicState() });
  },
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const handler = routes[`${req.method} ${url.pathname}`];
  try {
    if (handler) await handler(req, res, url);
    else if (req.method === 'GET') serveStatic(res, url.pathname);
    else json(res, { error: 'not found' }, 404);
  } catch (e) {
    if (!res.headersSent) json(res, { error: e.message }, 400);
  }
});

server.listen(config.port, () => {
  const ips = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && i.family === 'IPv4' && !i.internal)
    .map((i) => i.address);
  console.log(`PC実習室アトラクション サーバ起動 (port ${config.port})`);
  for (const ip of ips.length ? ips : ['localhost']) {
    console.log(`  展示:     http://${ip}:${config.port}/`);
    console.log(`  管理画面: http://${ip}:${config.port}/admin`);
    console.log(`  シミュレータ: http://${ip}:${config.port}/sim`);
    console.log(`  各iMacで: curl -s http://${ip}:${config.port}/kiosk.sh | bash`);
  }
  console.log(`演目: ${config.scenes.map((s) => `${s.id}(${s.duration}s)`).join(' → ')} → ループ`);
});
