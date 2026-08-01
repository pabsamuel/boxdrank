// app.js — UI mantığı ve olay bağlama
import { MATERIALS, estimate } from "./pricing.js";
import { parseFile } from "./parsers.js";

const $ = (id) => document.getElementById(id);
const fmt = (n) => "₺" + (Math.round(n * 100) / 100).toLocaleString("tr-TR");
const fmt2 = (n) => (Math.round(n * 100) / 100).toLocaleString("tr-TR");

// Malzeme seçimini doldur
const matSel = $("material");
for (const [key, m] of Object.entries(MATERIALS)) {
  const o = document.createElement("option");
  o.value = key; o.textContent = m.name; matSel.appendChild(o);
}

// ---- hesapla & ekrana bas ----
function recalc() {
  const material = matSel.value;
  const thickness = +$("thickness").value || 0;
  const cutLengthMm = +$("cutLength").value || 0;
  const pierces = +$("pierces").value || 0;
  const bboxAreaMm2 = (+$("w").value || 0) * (+$("h").value || 0);
  const quantity = +$("qty").value || 1;
  const machineRate = +$("machineRate").value || 0;
  const setupFee = +$("setupFee").value || 0;
  const marginPct = +$("margin").value || 0;
  const scrapPct = +$("scrap").value || 0;

  const r = estimate({
    material, thickness, cutLengthMm, bboxAreaMm2, pierces,
    quantity, machineRate, setupFee, marginPct, scrapPct,
  });

  $("total").textContent = fmt(r.subtotal);
  $("feed").textContent = Math.round(r.feed) + " mm/dk";
  $("time").textContent = r.totalMinutes < 1
    ? Math.round(r.totalMinutes * 60) + " sn"
    : fmt2(r.totalMinutes) + " dk";
  $("weight").textContent = fmt2(r.weightKg) + " kg";

  $("bMaterial").textContent = fmt(r.materialCost);
  $("bMachine").textContent = fmt(r.machineCost);
  $("bBase").textContent = fmt(r.unitBase);
  $("bUnit").textContent = fmt(r.unitPrice);
  $("bQty").textContent = quantity;
  $("bQtyTotal").textContent = fmt(r.unitPrice * quantity);
  $("bSetup").textContent = fmt(setupFee);
  $("bTotal").textContent = fmt(r.subtotal);

  lastQuote = { material: MATERIALS[material].name, thickness, quantity, ...r };
}
let lastQuote = null;

// tüm inputlar değişince yeniden hesapla
document.querySelectorAll("input, select").forEach((el) =>
  el.addEventListener("input", recalc));

// ---- dosya yükleme ----
const drop = $("drop");
const fileInput = $("file");
drop.addEventListener("click", () => fileInput.click());
["dragover", "dragenter"].forEach((e) =>
  drop.addEventListener(e, (ev) => { ev.preventDefault(); drop.classList.add("hot"); }));
["dragleave", "drop"].forEach((e) =>
  drop.addEventListener(e, () => drop.classList.remove("hot")));
drop.addEventListener("drop", (ev) => {
  ev.preventDefault();
  if (ev.dataTransfer.files[0]) handleFile(ev.dataTransfer.files[0]);
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) handleFile(fileInput.files[0]);
});

async function handleFile(file) {
  const text = await file.text();
  const scale = +$("unitScale").value || 1;
  $("warn").textContent = "";
  let res;
  try {
    res = parseFile(file.name, text, scale);
  } catch (err) {
    $("warn").textContent = "Dosya okunamadı: " + err.message;
    return;
  }

  $("cutLength").value = Math.round(res.cutLengthMm);
  $("pierces").value = res.pierces || 1;
  const bw = Math.max(0, res.bbox.maxX - res.bbox.minX);
  const bh = Math.max(0, res.bbox.maxY - res.bbox.minY);
  if (bw > 0) $("w").value = Math.round(bw);
  if (bh > 0) $("h").value = Math.round(bh);

  // önizleme
  const prev = $("preview");
  if (res.kind === "svg" && res.svg) {
    prev.innerHTML = res.svg;
  } else {
    prev.innerHTML = `<span class="empty">DXF önizlemesi yok · ${res.pierces} kontur, `
      + `${Math.round(res.cutLengthMm)} mm kesim</span>`;
  }

  $("warn").textContent = (res.warnings || []).join(" ");
  recalc();
}

// ---- teklifi kopyala ----
$("copy").addEventListener("click", async () => {
  if (!lastQuote) return;
  const q = lastQuote;
  const txt =
`LAZER KESİM TEKLİFİ
--------------------------------
Malzeme      : ${q.material} ${q.thickness} mm
Adet         : ${q.quantity}
Kesim/adet   : ${fmt2(q.totalMinutes)} dk
Ağırlık/adet : ${fmt2(q.weightKg)} kg
Birim fiyat  : ${fmt(q.unitPrice)}
TOPLAM       : ${fmt(q.subtotal)}
--------------------------------
LazerHesap ile hesaplandı`;
  try {
    await navigator.clipboard.writeText(txt);
    const b = $("copy"); const t = b.textContent;
    b.textContent = "Kopyalandı ✓"; setTimeout(() => (b.textContent = t), 1500);
  } catch (_) { alert(txt); }
});

$("print").addEventListener("click", () => window.print());

// ilk hesap
recalc();
