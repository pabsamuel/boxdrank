// parsers.js — SVG ve DXF dosyalarından kesim geometrisi çıkarımı
// Dönen değer: { cutLengthMm, bbox:{minX,minY,maxX,maxY}, pierces, svg?:string, warnings:[] }

// ---- SVG ----
// Tarayıcının kendi SVG motorunu kullanır: getTotalLength() ile her
// geometri elemanının çevre uzunluğunu birebir doğru hesaplar.
export function parseSVG(text, unitScale = 1) {
  const warnings = [];
  const doc = new DOMParser().parseFromString(text, "image/svg+xml");
  const svg = doc.documentElement;
  if (svg.nodeName.toLowerCase() !== "svg") {
    throw new Error("Geçerli bir SVG dosyası değil.");
  }

  // Ölçüm için DOM'a geçici olarak ekle (getTotalLength/getBBox için gerekli)
  const holder = document.createElement("div");
  holder.style.cssText = "position:absolute;left:-99999px;top:0;width:0;height:0;overflow:hidden";
  holder.appendChild(svg);
  document.body.appendChild(holder);

  let cutLength = 0, pierces = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const geom = svg.querySelectorAll("path,line,polyline,polygon,circle,ellipse,rect");

  try {
    geom.forEach((el) => {
      if (typeof el.getTotalLength === "function") {
        const len = el.getTotalLength();
        if (len > 0) { cutLength += len; pierces += 1; }
      }
      if (typeof el.getBBox === "function") {
        try {
          const b = el.getBBox();
          minX = Math.min(minX, b.x); minY = Math.min(minY, b.y);
          maxX = Math.max(maxX, b.x + b.width); maxY = Math.max(maxY, b.y + b.height);
        } catch (_) {}
      }
    });
  } finally {
    document.body.removeChild(holder);
  }

  if (!isFinite(minX)) { minX = minY = maxX = maxY = 0; }
  if (geom.length === 0) warnings.push("SVG içinde çizim (path/line/…) bulunamadı.");

  const s = unitScale;
  return {
    cutLengthMm: cutLength * s,
    bbox: { minX: minX * s, minY: minY * s, maxX: maxX * s, maxY: maxY * s },
    pierces,
    svg: text,
    warnings,
  };
}

// ---- DXF ----
// Hafif bir DXF okuyucu: ENTITIES bölümündeki temel varlıkların uzunluğunu
// ve sınırlayıcı kutusunu hesaplar. (LINE, CIRCLE, ARC, LWPOLYLINE, POLYLINE)
export function parseDXF(text, unitScale = 1) {
  const warnings = [];
  const lines = text.split(/\r\n|\r|\n/);
  const pairs = [];
  for (let i = 0; i + 1 < lines.length; i += 2) {
    pairs.push([parseInt(lines[i].trim(), 10), lines[i + 1].trim()]);
  }

  let cutLength = 0, pierces = 0;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const seen = (x, y) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };

  let i = 0;
  // ENTITIES bölümüne atla
  while (i < pairs.length && !(pairs[i][0] === 2 && pairs[i][1] === "ENTITIES")) i++;
  i++;

  const readEntity = () => {
    const type = pairs[i][1]; i++;
    const g = {}; const poly = []; let vx = null, vy = null;
    while (i < pairs.length && pairs[i][0] !== 0) {
      const [code, val] = pairs[i];
      const num = parseFloat(val);
      if (code === 10) { if (vx !== null) poly.push([vx, vy]); vx = num; }
      else if (code === 20) { vy = num; }
      else g[code] = num;
      i++;
    }
    if (vx !== null) poly.push([vx, vy]);
    return { type, g, poly };
  };

  while (i < pairs.length && pairs[i][0] === 0 && pairs[i][1] !== "ENDSEC") {
    const { type, g, poly } = readEntity();
    switch (type) {
      case "LINE": {
        const [x1, y1, x2, y2] = [g[10], g[20], g[11], g[21]];
        if ([x1, y1, x2, y2].every(Number.isFinite)) {
          cutLength += Math.hypot(x2 - x1, y2 - y1); pierces++;
          seen(x1, y1); seen(x2, y2);
        }
        break;
      }
      case "CIRCLE": {
        const r = g[40];
        if (Number.isFinite(r)) {
          cutLength += 2 * Math.PI * r; pierces++;
          seen(g[10] - r, g[20] - r); seen(g[10] + r, g[20] + r);
        }
        break;
      }
      case "ARC": {
        const r = g[40];
        let a1 = (g[50] || 0) * Math.PI / 180, a2 = (g[51] || 0) * Math.PI / 180;
        let sweep = a2 - a1; if (sweep < 0) sweep += 2 * Math.PI;
        if (Number.isFinite(r)) {
          cutLength += r * sweep; pierces++;
          seen(g[10] - r, g[20] - r); seen(g[10] + r, g[20] + r);
        }
        break;
      }
      case "LWPOLYLINE":
      case "POLYLINE": {
        if (poly.length > 1) {
          pierces++;
          for (let k = 0; k < poly.length - 1; k++) {
            cutLength += Math.hypot(poly[k + 1][0] - poly[k][0], poly[k + 1][1] - poly[k][1]);
          }
          if (g[70] & 1) { // kapalı polyline
            const a = poly[0], b = poly[poly.length - 1];
            cutLength += Math.hypot(b[0] - a[0], b[1] - a[1]);
          }
          poly.forEach(([x, y]) => seen(x, y));
        }
        break;
      }
      default:
        break;
    }
    // POLYLINE alt varlıklarını (VERTEX/SEQEND) atla
    if (type === "POLYLINE") {
      while (i < pairs.length && pairs[i][0] === 0 && pairs[i][1] !== "ENDSEC" &&
             (pairs[i][1] === "VERTEX" || pairs[i][1] === "SEQEND")) {
        readEntity();
      }
    }
  }

  if (!isFinite(minX)) { minX = minY = maxX = maxY = 0; }
  if (cutLength === 0) warnings.push("DXF içinde desteklenen varlık bulunamadı (LINE/CIRCLE/ARC/POLYLINE).");

  const s = unitScale;
  return {
    cutLengthMm: cutLength * s,
    bbox: { minX: minX * s, minY: minY * s, maxX: maxX * s, maxY: maxY * s },
    pierces,
    warnings,
  };
}

export function parseFile(name, text, unitScale = 1) {
  if (/\.dxf$/i.test(name)) return { kind: "dxf", ...parseDXF(text, unitScale) };
  if (/\.svg$/i.test(name)) return { kind: "svg", ...parseSVG(text, unitScale) };
  // uzantı yoksa içeriğe bak
  if (/^\s*<\?xml|<svg/i.test(text)) return { kind: "svg", ...parseSVG(text, unitScale) };
  return { kind: "dxf", ...parseDXF(text, unitScale) };
}
