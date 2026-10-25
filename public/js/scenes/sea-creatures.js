// 深海の大回遊で使う生き物の絵（face=+1 で画面右向き。大きさの基準は px）

import { hsl } from '../util.js';

export function drawWhale(ctx, x, y, L, face, t) {
  const H = L * 0.17;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  const body = ctx.createLinearGradient(0, -H, 0, H);
  body.addColorStop(0, '#3d6e92');
  body.addColorStop(0.55, '#1b3b57');
  body.addColorStop(1, '#9cc3d6');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(L * 0.5, 0);
  ctx.bezierCurveTo(L * 0.48, -H, L * 0.1, -H * 1.15, -L * 0.2, -H * 0.7);
  ctx.bezierCurveTo(-L * 0.35, -H * 0.45, -L * 0.42, -H * 0.15, -L * 0.45, 0);
  ctx.bezierCurveTo(-L * 0.42, H * 0.2, -L * 0.3, H * 0.5, -L * 0.1, H * 0.75);
  ctx.bezierCurveTo(L * 0.15, H, L * 0.45, H * 0.7, L * 0.5, 0);
  ctx.fill();
  // 尾びれ
  ctx.save();
  ctx.translate(-L * 0.44, 0);
  ctx.rotate(Math.sin(t * 1.6) * 0.3);
  ctx.fillStyle = '#244a68';
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.quadraticCurveTo(-L * 0.05, -H * 0.2, -L * 0.13, -H * 0.85);
  ctx.quadraticCurveTo(-L * 0.08, -H * 0.1, -L * 0.1, 0);
  ctx.quadraticCurveTo(-L * 0.08, H * 0.1, -L * 0.13, H * 0.85);
  ctx.quadraticCurveTo(-L * 0.05, H * 0.2, 0, 0);
  ctx.fill();
  ctx.restore();
  // 胸びれ
  ctx.fillStyle = '#2a5576';
  ctx.beginPath();
  ctx.moveTo(L * 0.2, H * 0.55);
  ctx.quadraticCurveTo(L * 0.12, H * (1.3 + 0.15 * Math.sin(t * 1.2)), L * 0.02, H * 1.45);
  ctx.quadraticCurveTo(L * 0.1, H * 0.9, L * 0.1, H * 0.6);
  ctx.fill();
  // 腹のうね
  ctx.strokeStyle = 'rgba(220,240,250,0.35)';
  ctx.lineWidth = Math.max(1, L * 0.003);
  for (let k = 0; k < 5; k++) {
    ctx.beginPath();
    ctx.moveTo(L * 0.46, H * (0.15 + k * 0.08));
    ctx.quadraticCurveTo(L * 0.25, H * (0.55 + k * 0.1), L * 0.0, H * (0.55 + k * 0.05));
    ctx.stroke();
  }
  ctx.fillStyle = '#e8f4fa';
  ctx.beginPath();
  ctx.arc(L * 0.36, -H * 0.02, H * 0.06, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawFish(ctx, x, y, s, face, ph, hue) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  ctx.fillStyle = hsl(hue, 85, 60);
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
  const wag = Math.sin(ph) * s * 0.25;
  ctx.beginPath();
  ctx.moveTo(-s * 0.85, 0);
  ctx.lineTo(-s * 1.5, -s * 0.45 + wag);
  ctx.lineTo(-s * 1.5, s * 0.45 + wag);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(s * 0.55, -s * 0.08, s * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawJelly(ctx, x, y, s, t, hue) {
  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';
  const pulse = 1 + 0.08 * Math.sin(t * 2);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, s * pulse);
  g.addColorStop(0, hsl(hue, 90, 75, 0.6));
  g.addColorStop(1, hsl(hue, 90, 50, 0.05));
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, s * pulse, s * 0.7 / pulse, 0, Math.PI, 0);
  ctx.fill();
  ctx.strokeStyle = hsl(hue, 90, 75, 0.35);
  ctx.lineWidth = Math.max(1, s * 0.04);
  for (let k = -2; k <= 2; k++) {
    ctx.beginPath();
    ctx.moveTo(k * s * 0.35, 0);
    for (let i = 1; i <= 8; i++) ctx.lineTo(k * s * 0.35 + Math.sin(t * 1.5 + i * 0.7 + k) * s * 0.12, i * s * 0.22);
    ctx.stroke();
  }
  ctx.restore();
}

// マンタ（下から見上げた姿）。W = 翼の端から端まで
export function drawManta(ctx, x, y, W, face, t) {
  const flap = Math.sin(t * 1.8);
  const span = W / 2;
  const len = W * 0.45;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  // 長い尾
  ctx.strokeStyle = '#1a2a3a';
  ctx.lineWidth = Math.max(1, W * 0.008);
  ctx.beginPath();
  ctx.moveTo(-len * 0.45, 0);
  ctx.quadraticCurveTo(-len * 1.1, flap * W * 0.02, -len * 1.6, flap * W * 0.05);
  ctx.stroke();
  // 翼：はばたきで上下の広がりと翼端の位置が変わる
  const wy = span * (0.8 + 0.2 * flap);
  const tipX = -len * (0.1 + 0.08 * flap);
  const body = ctx.createLinearGradient(0, -wy, 0, wy);
  body.addColorStop(0, '#22384c');
  body.addColorStop(0.5, '#3b5a72');
  body.addColorStop(1, '#22384c');
  ctx.fillStyle = body;
  ctx.beginPath();
  ctx.moveTo(len * 0.5, 0);
  ctx.quadraticCurveTo(len * 0.35, -wy * 0.55, tipX, -wy);
  ctx.quadraticCurveTo(-len * 0.1, -wy * 0.35, -len * 0.45, 0);
  ctx.quadraticCurveTo(-len * 0.1, wy * 0.35, tipX, wy);
  ctx.quadraticCurveTo(len * 0.35, wy * 0.55, len * 0.5, 0);
  ctx.fill();
  // 白いお腹
  ctx.fillStyle = 'rgba(225,235,240,0.85)';
  ctx.beginPath();
  ctx.ellipse(len * 0.05, 0, len * 0.32, wy * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
  // えら
  ctx.strokeStyle = 'rgba(60,80,100,0.6)';
  ctx.lineWidth = Math.max(1, W * 0.004);
  for (let i = 0; i < 5; i++) {
    const gx = len * (0.18 - i * 0.06);
    ctx.beginPath();
    ctx.moveTo(gx, -wy * 0.12);
    ctx.lineTo(gx - len * 0.02, -wy * 0.03);
    ctx.moveTo(gx, wy * 0.12);
    ctx.lineTo(gx - len * 0.02, wy * 0.03);
    ctx.stroke();
  }
  // 頭びれ
  ctx.fillStyle = '#22384c';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.ellipse(len * 0.55, s * wy * 0.1, len * 0.1, wy * 0.035, s * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// マンボウ。H = 背びれ先から尻びれ先までの高さ
export function drawSunfish(ctx, x, y, H, face, t) {
  const L = H * 0.55;
  const fin = Math.sin(t * 1.2);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  // 背びれ・尻びれ（交互にゆっくり振る）
  ctx.fillStyle = '#7d8c98';
  for (const s of [-1, 1]) {
    ctx.save();
    ctx.rotate(s * fin * 0.25);
    ctx.beginPath();
    ctx.moveTo(-L * 0.25, s * H * 0.2);
    ctx.quadraticCurveTo(-L * 0.3, s * H * 0.5, -L * 0.42, s * H * 0.5);
    ctx.quadraticCurveTo(-L * 0.4, s * H * 0.3, -L * 0.42, s * H * 0.15);
    ctx.fill();
    ctx.restore();
  }
  // 胴体（ほぼ円）
  const g = ctx.createLinearGradient(0, -H * 0.3, 0, H * 0.3);
  g.addColorStop(0, '#93a3ad');
  g.addColorStop(0.6, '#b9c5cc');
  g.addColorStop(1, '#dfe6ea');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, L * 0.5, H * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  // 舵びれ（後ろの波打つふち）
  ctx.fillStyle = '#8e9da7';
  ctx.beginPath();
  ctx.moveTo(-L * 0.42, -H * 0.24);
  for (let i = 0; i <= 6; i++) {
    const yy = -H * 0.24 + (i * H * 0.48) / 6;
    ctx.lineTo(-L * (0.6 + (i % 2) * 0.06 + 0.02 * Math.sin(t * 2 + i)), yy);
  }
  ctx.lineTo(-L * 0.42, H * 0.24);
  ctx.fill();
  // 目・口・胸びれ
  ctx.fillStyle = '#20262b';
  ctx.beginPath();
  ctx.arc(L * 0.28, -H * 0.05, H * 0.025, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(L * 0.46, H * 0.02, H * 0.015, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(120,135,145,0.9)';
  ctx.beginPath();
  ctx.ellipse(L * 0.15, H * 0.02, L * 0.05, H * 0.05, fin * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ウミガメ。L = 甲羅の長さ
export function drawTurtle(ctx, x, y, L, face, t) {
  const f = Math.sin(t * 1.5);
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  ctx.fillStyle = '#5d7a4a';
  // ひれ（前は大きく羽ばたく）
  for (const [fx, fy, len, k] of [[L * 0.15, -L * 0.2, L * 0.55, 1], [L * 0.15, L * 0.2, L * 0.55, -1], [-L * 0.35, -L * 0.15, L * 0.22, 0.4], [-L * 0.35, L * 0.15, L * 0.22, -0.4]]) {
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(Math.sign(fy) * (0.9 + f * 0.5 * Math.abs(k)) + Math.PI);
    ctx.beginPath();
    ctx.ellipse(len / 2, 0, len / 2, len * 0.14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
  // 頭
  ctx.beginPath();
  ctx.ellipse(L * 0.58, 0, L * 0.15, L * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111';
  ctx.beginPath();
  ctx.arc(L * 0.64, -L * 0.04, L * 0.02, 0, Math.PI * 2);
  ctx.fill();
  // 甲羅
  const g = ctx.createRadialGradient(-L * 0.05, -L * 0.08, L * 0.05, 0, 0, L * 0.5);
  g.addColorStop(0, '#8a6b3a');
  g.addColorStop(1, '#4b3a1e');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, L * 0.5, L * 0.33, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30,20,10,0.5)';
  ctx.lineWidth = Math.max(1, L * 0.015);
  ctx.beginPath();
  ctx.moveTo(-L * 0.35, 0);
  ctx.lineTo(L * 0.35, 0);
  for (const xx of [-0.18, 0.05, 0.25]) {
    ctx.moveTo(L * xx, -L * 0.3);
    ctx.lineTo(L * xx, L * 0.3);
  }
  ctx.stroke();
  ctx.restore();
}

// チョウチンアンコウ（暗闇に溶け込み、ちょうちんだけが明るい）。L = 体長
export function drawAngler(ctx, x, y, L, face, t) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(face, 1);
  const g = ctx.createRadialGradient(L * 0.1, -L * 0.1, L * 0.05, 0, 0, L * 0.5);
  g.addColorStop(0, '#2c2a33');
  g.addColorStop(1, '#0b0a10');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.ellipse(0, 0, L * 0.45, L * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  // 尾
  ctx.beginPath();
  ctx.moveTo(-L * 0.4, 0);
  ctx.lineTo(-L * 0.7, -L * 0.18 + Math.sin(t * 3) * L * 0.04);
  ctx.lineTo(-L * 0.7, L * 0.18 + Math.sin(t * 3) * L * 0.04);
  ctx.fill();
  // 輪郭をわずかに光らせる
  ctx.strokeStyle = 'rgba(120,140,200,0.25)';
  ctx.lineWidth = Math.max(1, L * 0.01);
  ctx.beginPath();
  ctx.ellipse(0, 0, L * 0.45, L * 0.35, 0, -Math.PI * 0.8, Math.PI * 0.3);
  ctx.stroke();
  // 大きな口と歯
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.moveTo(L * 0.45, -L * 0.02);
  ctx.quadraticCurveTo(L * 0.2, L * 0.12, L * 0.42, L * 0.22);
  ctx.fill();
  ctx.fillStyle = '#ddd';
  for (let i = 0; i < 5; i++) {
    const tx = L * (0.43 - i * 0.04);
    ctx.beginPath();
    ctx.moveTo(tx, L * (0.02 + i * 0.025));
    ctx.lineTo(tx - L * 0.012, L * (0.06 + i * 0.025));
    ctx.lineTo(tx - L * 0.024, L * (0.02 + i * 0.025));
    ctx.fill();
  }
  ctx.fillStyle = '#9ab';
  ctx.beginPath();
  ctx.arc(L * 0.25, -L * 0.12, L * 0.03, 0, Math.PI * 2);
  ctx.fill();
  // ちょうちん
  const lx = L * 0.62;
  const ly = -L * 0.42 + Math.sin(t * 1.3) * L * 0.03;
  ctx.strokeStyle = '#2c2a33';
  ctx.lineWidth = Math.max(1, L * 0.015);
  ctx.beginPath();
  ctx.moveTo(L * 0.15, -L * 0.3);
  ctx.quadraticCurveTo(L * 0.4, -L * 0.65, lx, ly);
  ctx.stroke();
  const pulse = 0.75 + 0.25 * Math.sin(t * 2.2);
  ctx.globalCompositeOperation = 'lighter';
  const glow = ctx.createRadialGradient(lx, ly, 0, lx, ly, L * 0.6);
  glow.addColorStop(0, `rgba(200,255,230,${0.9 * pulse})`);
  glow.addColorStop(0.1, `rgba(120,255,200,${0.5 * pulse})`);
  glow.addColorStop(1, 'rgba(60,200,160,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(lx - L * 0.6, ly - L * 0.6, L * 1.2, L * 1.2);
  ctx.restore();
}

// イワシ1匹（向きによって銀色に光る）
export function drawSardine(ctx, x, y, s, angle, glint) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.fillStyle = hsl(205, 25, 55 + 35 * glint);
  ctx.beginPath();
  ctx.ellipse(0, 0, s, s * 0.25, 0, 0, Math.PI * 2);
  ctx.moveTo(-s * 0.8, 0);
  ctx.lineTo(-s * 1.3, -s * 0.3);
  ctx.lineTo(-s * 1.3, s * 0.3);
  ctx.fill();
  ctx.restore();
}
