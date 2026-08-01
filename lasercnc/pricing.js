// pricing.js — Malzeme tablosu ve maliyet modeli
// Feed rate'ler tipik CO2/fiber lazer değerleridir; atölyene göre ayarla.

export const MATERIALS = {
  mild_steel: {
    name: "Yumuşak Çelik (S235)",
    density: 7850,        // kg/m³
    pricePerKg: 42,       // ₺/kg (hammadde)
    pierceTime: 0.6,      // saniye / delme
    // kesim hızı (mm/dk) — kalınlık(mm) -> hız
    feeds: { 1: 6000, 2: 4200, 3: 3000, 4: 2200, 5: 1800, 6: 1500, 8: 1100, 10: 850, 12: 620, 15: 450, 20: 280 },
  },
  stainless: {
    name: "Paslanmaz Çelik (304)",
    density: 8000,
    pricePerKg: 155,
    pierceTime: 0.8,
    feeds: { 1: 5000, 2: 3200, 3: 2000, 4: 1400, 5: 1000, 6: 800, 8: 520, 10: 360, 12: 250 },
  },
  aluminum: {
    name: "Alüminyum (5052)",
    density: 2700,
    pricePerKg: 120,
    pierceTime: 0.7,
    feeds: { 1: 5500, 2: 3800, 3: 2600, 4: 1900, 5: 1400, 6: 1100, 8: 700, 10: 480 },
  },
  acrylic: {
    name: "Pleksi / Akrilik",
    density: 1180,
    pricePerKg: 90,
    pierceTime: 0.2,
    feeds: { 2: 2400, 3: 1800, 4: 1400, 5: 1100, 6: 900, 8: 650, 10: 450 },
  },
  mdf: {
    name: "MDF / Ahşap",
    density: 750,
    pricePerKg: 25,
    pierceTime: 0.2,
    feeds: { 2: 3000, 3: 2200, 4: 1700, 5: 1300, 6: 1000, 8: 700, 10: 500, 12: 380 },
  },
};

// En yakın iki kalınlık arasında lineer interpolasyon ile kesim hızı (mm/dk)
export function feedFor(material, thickness) {
  const table = MATERIALS[material].feeds;
  const ts = Object.keys(table).map(Number).sort((a, b) => a - b);
  if (thickness <= ts[0]) return table[ts[0]];
  if (thickness >= ts[ts.length - 1]) return table[ts[ts.length - 1]];
  for (let i = 0; i < ts.length - 1; i++) {
    const lo = ts[i], hi = ts[i + 1];
    if (thickness >= lo && thickness <= hi) {
      const r = (thickness - lo) / (hi - lo);
      return table[lo] + r * (table[hi] - table[lo]);
    }
  }
  return table[ts[ts.length - 1]];
}

// Ana maliyet hesabı. Tüm uzunluklar mm, alan mm² cinsinden gelir.
export function estimate({
  material, thickness, cutLengthMm, bboxAreaMm2, pierces,
  quantity, machineRate, setupFee, marginPct, scrapPct,
}) {
  const m = MATERIALS[material];
  const feed = feedFor(material, thickness);                 // mm/dk

  const cutMinutes = cutLengthMm / feed;                      // kesim süresi
  const pierceMinutes = (pierces * m.pierceTime) / 60;        // delme süresi
  const totalMinutes = cutMinutes + pierceMinutes;            // adet başına

  // Malzeme ağırlığı: bounding-box alanı * kalınlık * yoğunluk (+ fire)
  const areaM2 = bboxAreaMm2 / 1e6;
  const volM3 = areaM2 * (thickness / 1000);
  const weightKg = volM3 * m.density * (1 + scrapPct / 100);
  const materialCost = weightKg * m.pricePerKg;

  const machineCost = (totalMinutes / 60) * machineRate;      // adet başına makine

  const unitBase = materialCost + machineCost;                // adet ham maliyet
  const unitPrice = unitBase * (1 + marginPct / 100);         // kâr eklenmiş
  const subtotal = unitPrice * quantity + setupFee;           // toplam

  return {
    feed, cutMinutes, pierceMinutes, totalMinutes,
    weightKg, materialCost, machineCost,
    unitBase, unitPrice, subtotal,
  };
}
