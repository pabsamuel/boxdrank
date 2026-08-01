// test.mjs — pricing.js için basit doğrulama testleri.
// Tarayıcı/DOM gerektirmez, saf hesap mantığını kontrol eder.
// Çalıştır: node test.mjs   (veya: npm test)

import { estimate, feedFor, MATERIALS } from "./pricing.js";

let passed = 0, failed = 0;
function check(name, cond) {
  if (cond) { passed++; console.log("  ✓ " + name); }
  else { failed++; console.error("  ✗ " + name); }
}
function near(a, b, tol = 0.01) { return Math.abs(a - b) <= tol; }

console.log("pricing testleri:");

// 1) Tablodaki tam kalınlık aynen dönmeli
check("3mm çelik feed = 3000", feedFor("mild_steel", 3) === 3000);

// 2) İki değer arasında lineer interpolasyon
//    3mm=3000, 4mm=2200 → 3.5mm = 2600
check("3.5mm interpolasyon = 2600", near(feedFor("mild_steel", 3.5), 2600));

// 3) Tablo sınırları dışında kelepçelenmeli (clamp)
check("çok ince → ilk değere sabitlenir",
  feedFor("mild_steel", 0.1) === MATERIALS.mild_steel.feeds[1]);
check("çok kalın → son değere sabitlenir",
  feedFor("mild_steel", 999) === MATERIALS.mild_steel.feeds[20]);

// 4) Ağırlık: 100x100mm, 3mm çelik → 0.1*0.1*0.003*7850 = 0.2355 kg (fire hariç)
const r = estimate({
  material: "mild_steel", thickness: 3, cutLengthMm: 900, bboxAreaMm2: 10000,
  pierces: 5, quantity: 10, machineRate: 900, setupFee: 50, marginPct: 35, scrapPct: 0,
});
check("ağırlık hesabı (fire=0) ≈ 0.2355 kg", near(r.weightKg, 0.2355, 0.001));

// 5) Süre: 900mm / 3000mm-dk + 5*0.6sn = 0.3 + 0.05 = 0.35 dk
check("süre ≈ 0.35 dk", near(r.totalMinutes, 0.35, 0.001));

// 6) Marj mantığı: birim fiyat, ham maliyetten büyük olmalı
check("kâr marjı fiyatı artırır", r.unitPrice > r.unitBase);

// 7) Toplam = birim*adet + kurulum
check("toplam = birim*adet + kurulum",
  near(r.subtotal, r.unitPrice * 10 + 50, 0.01));

// 8) Adet artınca toplam artar
const r2 = estimate({ ...{
  material: "mild_steel", thickness: 3, cutLengthMm: 900, bboxAreaMm2: 10000,
  pierces: 5, quantity: 20, machineRate: 900, setupFee: 50, marginPct: 35, scrapPct: 0,
}});
check("daha çok adet → daha yüksek toplam", r2.subtotal > r.subtotal);

console.log(`\nSonuç: ${passed} geçti, ${failed} kaldı`);
process.exit(failed ? 1 : 0);
