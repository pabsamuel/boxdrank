// All drawing lives here. Everything is drawn from primitives — no imported
// art, nothing traced from an existing game.

export const PLAYER_COLOURS = ['#35d0ff', '#ffd23d', '#a78bff', '#ff8ad4'];

export function fitCanvas(canvas) {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = Math.round(window.innerWidth * dpr);
  const h = Math.round(window.innerHeight * dpr);
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
  }
  return { w, h, dpr };
}

export function drawCrosshair(ctx, x, y, colour, { scale = 1, offscreen = false, label = '' } = {}) {
  const r = 26 * scale;
  ctx.save();
  ctx.globalAlpha = offscreen ? 0.3 : 1;
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3 * scale;
  ctx.shadowColor = colour;
  ctx.shadowBlur = 14 * scale;

  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    ctx.moveTo(x + dx * (r * 0.45), y + dy * (r * 0.45));
    ctx.lineTo(x + dx * (r * 1.5), y + dy * (r * 1.5));
  }
  ctx.stroke();

  ctx.fillStyle = colour;
  ctx.beginPath();
  ctx.arc(x, y, 2.6 * scale, 0, Math.PI * 2);
  ctx.fill();

  if (label) {
    ctx.shadowBlur = 0;
    ctx.font = `700 ${13 * scale}px ui-sans-serif, system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(label, x, y - r * 1.9);
  }
  ctx.restore();
}

/** Big, unambiguous aim-here target used during calibration. */
export function drawCalibTarget(ctx, x, y, t, scale = 1) {
  const pulse = 1 + 0.12 * Math.sin(t / 180);
  ctx.save();
  ctx.translate(x, y);
  for (let i = 3; i >= 1; i--) {
    ctx.beginPath();
    ctx.arc(0, 0, 22 * i * pulse * scale, 0, Math.PI * 2);
    ctx.strokeStyle = i === 1 ? '#ff4d3d' : `rgba(255,77,61,${0.22 * i})`;
    ctx.lineWidth = (i === 1 ? 6 : 3) * scale;
    ctx.stroke();
  }
  ctx.fillStyle = '#ff4d3d';
  ctx.beginPath();
  ctx.arc(0, 0, 7 * scale, 0, Math.PI * 2);
  ctx.fill();

  // Expanding halo makes the target findable from across the room.
  const halo = ((t / 12) % 90) * scale;
  ctx.beginPath();
  ctx.arc(0, 0, 30 * scale + halo, 0, Math.PI * 2);
  ctx.strokeStyle = `rgba(255,77,61,${Math.max(0, 0.5 - halo / (200 * scale))})`;
  ctx.lineWidth = 3 * scale;
  ctx.stroke();
  ctx.restore();
}

/**
 * Test-mode backdrop: a neutral field with a grid and numbered aim markers, so
 * accuracy can be judged by eye and measured by shooting the marker you name.
 */
export function drawTestField(ctx, w, h, markers, hitMap) {
  ctx.fillStyle = '#12161f';
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(255,255,255,0.055)';
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i++) {
    const x = (w * i) / 10;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke();
  }
  for (let i = 1; i < 6; i++) {
    const y = (h * i) / 6;
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
  }

  // Edge frame: shows immediately if the calibrated area is offset or rotated.
  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.lineWidth = 3;
  ctx.strokeRect(2, 2, w - 4, h - 4);

  for (const m of markers) {
    const x = m.x * w;
    const y = m.y * h;
    const hit = hitMap.get(m.id);
    ctx.beginPath();
    ctx.arc(x, y, 34, 0, Math.PI * 2);
    ctx.strokeStyle = hit ? 'rgba(53,208,127,0.9)' : 'rgba(255,255,255,0.4)';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = hit ? '#35d07f' : 'rgba(255,255,255,0.65)';
    ctx.fill();
    ctx.font = '700 15px ui-sans-serif, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText(m.id, x, y + 58);
    if (hit) {
      ctx.fillStyle = '#35d07f';
      ctx.fillText(`${(hit.errPct).toFixed(1)}%`, x, y - 46);
    }
  }
}

/** Shot marker: an expanding ring plus a persistent pin-prick. */
export function drawShot(ctx, shot, now) {
  const age = now - shot.t;
  const life = 700;
  if (age > life) return false;
  const k = age / life;
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.strokeStyle = shot.colour;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(shot.x, shot.y, 8 + k * 46, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = (1 - k) * 0.9;
  ctx.fillStyle = shot.colour;
  ctx.beginPath();
  ctx.arc(shot.x, shot.y, 3.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  return true;
}

export function drawFloatingText(ctx, item, now) {
  const age = now - item.t;
  const life = 900;
  if (age > life) return false;
  const k = age / life;
  ctx.save();
  ctx.globalAlpha = 1 - k;
  ctx.fillStyle = item.colour;
  ctx.font = `900 ${item.size || 30}px ui-sans-serif, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(item.text, item.x, item.y - k * 70);
  ctx.restore();
  return true;
}
