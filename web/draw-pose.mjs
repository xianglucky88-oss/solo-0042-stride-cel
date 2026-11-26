// Canvas proof drawing. The character, its action boxes and the root trail all
// go through one camera transform, so they can never drift apart. The camera
// may follow the character between laps, but grid lines, ruler ticks and the
// ground line keep describing original world coordinates.

import { lapExtents } from './playback.mjs';

function niceStep(minimum) {
  const power = 10 ** Math.floor(Math.log10(minimum));
  for (const factor of [1, 2, 5, 10]) if (power * factor >= minimum) return power * factor;
  return power * 10;
}

export function draw(canvas, sheet, view) {
  const ctx = canvas.getContext('2d'), { width: w, height: h } = canvas;
  const { pose, boxes, cameraX, trail = [], continuous } = view;
  const { left: extentLeft, right: extentRight, top, bottom } = lapExtents(sheet);
  // Scale comes from the authored lap, so it does not breathe as travel
  // accumulates over many laps.
  const scale = Math.min(2.2, (w - 86) / Math.max(1, extentRight - extentLeft),
    (h - 75) / Math.max(1, bottom - top));
  const xx = n => w / 2 + (n - cameraX) * scale;
  const yy = n => h / 2 + (n - (top + bottom) / 2) * scale;
  const step = niceStep(40 / scale);
  const left = cameraX - w / 2 / scale, right = cameraX + w / 2 / scale;
  const upper = (top + bottom) / 2 - h / 2 / scale, lower = (top + bottom) / 2 + h / 2 / scale;

  ctx.fillStyle = '#161b1e'; ctx.fillRect(0, 0, w, h);

  // World-space grid: each line sits at its true world coordinate, even while
  // the camera follows the character.
  ctx.lineWidth = 1;
  for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
    const screen = xx(x);
    ctx.strokeStyle = Math.abs(x) < 1e-9 ? '#46595d' : '#242e31';
    ctx.beginPath(); ctx.moveTo(screen, 0); ctx.lineTo(screen, h); ctx.stroke();
  }
  for (let y = Math.ceil(upper / step) * step; y <= lower; y += step) {
    const screen = yy(y);
    ctx.strokeStyle = Math.abs(y) < 1e-9 ? '#748489' : '#222c2f';
    ctx.beginPath(); ctx.moveTo(0, screen); ctx.lineTo(w, screen); ctx.stroke();
  }

  // Ground ruler: origin stays at world 0 and labels are world X values.
  const ground = yy(0);
  ctx.strokeStyle = '#748489'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(0, ground); ctx.lineTo(w, ground); ctx.stroke();
  ctx.font = '11px ui-monospace,monospace'; ctx.textAlign = 'center';
  for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
    const screen = xx(x);
    const origin = Math.abs(x) < 1e-9;
    ctx.strokeStyle = origin ? '#e0b76a' : '#556468';
    ctx.beginPath(); ctx.moveTo(screen, ground); ctx.lineTo(screen, ground + (origin ? 9 : 5)); ctx.stroke();
    ctx.fillStyle = origin ? '#e0b76a' : '#8e9ba0';
    if (screen > 18 && screen < w - 18) ctx.fillText(`${x}`, screen, ground + 22);
  }
  if (left <= 0 && 0 <= right) {
    ctx.fillStyle = '#e0b76a';
    ctx.beginPath(); ctx.arc(xx(0), ground, 3, 0, 2 * Math.PI); ctx.fill();
  }
  ctx.textAlign = 'left';

  // Root trail: the last lap of travel only, ending at the playhead.
  if (trail.length > 1) {
    ctx.strokeStyle = '#71b3b5'; ctx.lineWidth = 1.5; ctx.setLineDash([5, 6]);
    ctx.beginPath();
    trail.forEach((point, i) => ctx[i ? 'lineTo' : 'moveTo'](xx(point.x), yy(point.y)));
    ctx.stroke(); ctx.setLineDash([]);
  }

  for (const box of boxes) {
    ctx.fillStyle = '#f1a25440'; ctx.strokeStyle = '#ffb969'; ctx.lineWidth = 1;
    ctx.fillRect(xx(box.x), yy(box.y), box.w * scale, box.h * scale);
    ctx.strokeRect(xx(box.x), yy(box.y), box.w * scale, box.h * scale);
  }

  ctx.save();
  ctx.translate(xx(pose.x), yy(pose.y)); ctx.scale(scale, scale);
  const facing = sheet.facing === 'right' ? 1 : -1;
  function stroke(points, color, width) {
    ctx.beginPath(); points.forEach(([a, b], i) => ctx[i ? 'lineTo' : 'moveTo'](a, b));
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.lineCap = 'round'; ctx.stroke();
  }
  stroke([[-12, 0], [-8, -13], [0, -24], [13, -8], [21 * facing, 0]], '#7ba9aa', 6);
  stroke([[0, -25], [0, -48]], '#afd4ca', 12);
  ctx.fillStyle = '#e9f1df'; ctx.beginPath(); ctx.arc(4 * facing, -60, 10, 0, 2 * Math.PI); ctx.fill();
  ctx.fillStyle = '#182525'; ctx.fillRect(6 * facing - 1, -62, 4, 3);
  const angle = pose.arm * Math.PI / 180;
  stroke([[0, -46], [Math.sin(angle) * 32, -46 - Math.cos(angle) * 32]], '#f5c477', 7);
  ctx.restore();

  ctx.fillStyle = '#e1d7bc'; ctx.font = '15px monospace';
  ctx.fillText(`${sheet.facing.toUpperCase()} / ${sheet.fps} FPS`, 18, 27);
  ctx.fillStyle = '#8e9ba0'; ctx.font = '11px ui-monospace,monospace';
  ctx.fillText(continuous
    ? `连续行进 · 第 ${view.lap + 1} 圈 · 世界 X ${Math.round(pose.x)} · 刻度 ${step} px`
    : `单圈 · 世界 X ${Math.round(pose.x)} · 刻度 ${step} px`, 18, 45);
}
