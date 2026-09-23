/* Runs static/calc.js against a minimal fake DOM so the arithmetic in each
   engine is checked without a browser. Node only, no dependencies.
   Usage: node scripts/test_engines.js */
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = fs.readFileSync(path.join(__dirname, "..", "static", "calc.js"), "utf8");

function makeDom(engine, fields, collections) {
  const byId = {};
  for (const [id, spec] of Object.entries(fields)) {
    if (spec.type === "select") {
      byId["f-" + id] = {
        value: spec.value,
        selectedIndex: 0,
        // Real options expose "data-factor"; the spec declares { factor: ... }.
        options: [{
          getAttribute: (a) => {
            const k = a.replace(/^data-/, "");
            return spec.data && k in spec.data ? String(spec.data[k]) : null;
          },
        }],
      };
    } else if (spec.type === "check") {
      byId["f-" + id] = { checked: spec.value };
    } else {
      byId["f-" + id] = { value: String(spec.value) };
    }
  }
  const out = { innerHTML: "" };
  const form = { addEventListener() {} };
  const document = {
    querySelector: (s) => (s === ".calc-shell" ? { dataset: { engine } } : null),
    getElementById: (id) =>
      id === "calc-form" ? form : id === "calc-result" ? out : byId[id] || null,
    querySelectorAll: (s) => collections[s.replace(".", "")] || [],
  };
  return { document, out };
}

const results = [];
function check(name, condition, detail) {
  results.push({ name, ok: !!condition, detail });
}

function run(engine, fields, collections) {
  const { document, out } = makeDom(engine, fields, collections);
  vm.runInNewContext(SRC, { document, window: {} });
  return out.innerHTML;
}

function numbersIn(html) {
  return (html.match(/[\d,]+(\.\d+)?/g) || []).map((s) => parseFloat(s.replace(/,/g, "")));
}

/* --- generator: fridge(700/2200) + lights(100) + router(30) ------------- */
{
  const aps = [
    { checked: true, dataset: { running: "700", starting: "2200" } },
    { checked: true, dataset: { running: "100", starting: "100" } },
    { checked: true, dataset: { running: "30", starting: "30" } },
    { checked: false, dataset: { running: "5400", starting: "6800" } },
  ];
  const html = run("generator", {}, { ap: aps });
  // running 830, largest delta 1500 -> surge 2330, +20% = 996 -> 2000 W class
  check("generator running watts = 830", html.includes("830 W"), html);
  check("generator surge = 2,330", html.includes("2,330 W"), html);
  check("generator class = 2,000 W", html.includes(">2,000 W<"), html);
  check("generator counts 3 appliances", html.includes(">3<"), html);
}

/* --- generator: nothing ticked ----------------------------------------- */
{
  const html = run("generator", {}, { ap: [{ checked: false, dataset: { running: "1", starting: "1" } }] });
  check("generator empty state", html.includes("Tick the appliances"), html);
}

/* --- mini split: 400 sqft, 8ft, zone4, average, 2 people --------------- */
{
  const html = run("minisplit", {
    area: { value: 400 }, ceiling: { value: 8 }, occupants: { value: 2 },
    zone: { type: "select", value: "4", data: { factor: 1.0 } },
    sun: { type: "select", value: "normal", data: { factor: 1.0 } },
    insulation: { type: "select", value: "average", data: { factor: 1.0 } },
    kitchen: { type: "check", value: false }, attic: { type: "check", value: false },
  }, {});
  // 400 * 20 = 8000 -> nearest real size 9000
  check("minisplit 400sqft -> 9,000 BTU", html.includes("9,000 BTU"), html);
  check("minisplit shows 20 BTU/sqft", html.includes("20.0"), html);
}

/* --- mini split: sunny, poor insulation, kitchen, 10ft ceiling --------- */
{
  const html = run("minisplit", {
    area: { value: 400 }, ceiling: { value: 10 }, occupants: { value: 4 },
    zone: { type: "select", value: "1", data: { factor: 1.15 } },
    sun: { type: "select", value: "sunny", data: { factor: 1.1 } },
    insulation: { type: "select", value: "poor", data: { factor: 1.2 } },
    kitchen: { type: "check", value: true }, attic: { type: "check", value: true },
  }, {});
  // 400*20 *1.25(ceil) *1.15(zone) *1.1(sun) *1.2(insul) = 15,180
  // +1,200 (2 extra people) +4,000 (kitchen) = 20,380 ; *1.1 (attic) = 22,418
  check("minisplit worst case -> 24,000 BTU", html.includes("24,000 BTU"), html);
  check("minisplit worst case load shown", html.includes("22,400 BTU/hr"), html);
  check("minisplit large-size warning absent under 30k", !html.includes("Manual J load calculation before buying"), html);
}

/* --- recessed: 16x12 room, 8ft ceiling, living (15fc) ------------------ */
{
  const html = run("recessed", {
    length: { value: 16 }, width: { value: 12 }, ceiling: { value: 8 },
    roomtype: { type: "select", value: "living", data: { fc: 15 } },
  }, {});
  // spacing 4ft -> 4 x 3 = 12 lights; 192 sqft * 15fc = 2880 lm total; 240 each
  check("recessed 16x12 -> 12 lights", html.includes("12 lights"), html);
  check("recessed grid label 4 x 3", html.includes("4 × 3 grid"), html);
  check("recessed offset 2'", html.includes("2' 0\""), html);
  check("recessed per-fixture 240 lm", html.includes("240 lm"), html);
  check("recessed draws 12 circles", (html.match(/<circle/g) || []).length === 12, html);
}

/* --- recessed: tall ceiling changes the grid --------------------------- */
{
  const html = run("recessed", {
    length: { value: 16 }, width: { value: 12 }, ceiling: { value: 12 },
    roomtype: { type: "select", value: "kitchen", data: { fc: 40 } },
  }, {});
  // spacing 6ft -> round(16/6)=3, round(12/6)=2 -> 6 lights
  check("recessed 12ft ceiling -> 6 lights", html.includes("6 lights"), html);
  check("recessed high-output warning fires", html.includes("more output than a typical"), html);
}

/* --- purifier: 300 sqft, 8ft, 4 ACH ------------------------------------ */
{
  const html = run("purifier", {
    area: { value: 300 }, ceiling: { value: 8 },
    ach: { type: "select", value: "4", data: { ach: 4 } },
    openplan: { type: "check", value: false },
  }, {});
  // 2400 ft3 * 4 / 60 = 160 CFM
  check("purifier 300sqft/4ACH = 160 CFM", html.includes("160 CFM"), html);
  check("purifier buy-up target 267 CFM", html.includes("267 CFM"), html);
}

/* --- purifier: open plan adds 40% -------------------------------------- */
{
  const html = run("purifier", {
    area: { value: 300 }, ceiling: { value: 8 },
    ach: { type: "select", value: "4", data: { ach: 4 } },
    openplan: { type: "check", value: true },
  }, {});
  check("purifier open plan = 224 CFM", html.includes("224 CFM"), html);
}

/* --- water heater: 2 showers + 2 handwash + 1 prep, gas, 50F ---------- */
{
  const uses = [
    { value: "2", dataset: { gallons: "20" } },
    { value: "0", dataset: { gallons: "36" } },
    { value: "2", dataset: { gallons: "4" } },
    { value: "1", dataset: { gallons: "4" } },
  ];
  const html = run("waterheater", {
    fuel: { type: "select", value: "gas" },
    groundtemp: { type: "select", value: "50" },
  }, { use: uses });
  // FHR = 40 + 8 + 4 = 52 ; rise 70 ; recovery 40*90/70 = 51.4 ; tank (52-51.4)/.7 -> min 20 -> 30
  check("waterheater FHR = 52 gal", html.includes("52 gal"), html);
  check("waterheater rise = 70F", html.includes("70°F"), html);
  check("waterheater picks 30 gallon gas", html.includes("30 gallon gas"), html);
}

/* --- water heater: big household, electric, cold inlet ---------------- */
{
  const uses = [
    { value: "4", dataset: { gallons: "20" } },
    { value: "1", dataset: { gallons: "36" } },
    { value: "1", dataset: { gallons: "14" } },
    { value: "1", dataset: { gallons: "30" } },
  ];
  const html = run("waterheater", {
    fuel: { type: "select", value: "electric" },
    groundtemp: { type: "select", value: "42" },
  }, { use: uses });
  // FHR = 80+36+14+30 = 160 ; rise 78 ; recovery 20*90/78 = 23 ; (160-23)/.7 = 195 -> 80
  check("waterheater big house FHR = 160", html.includes("160 gal"), html);
  check("waterheater maxes at 80 gallon", html.includes("80 gallon electric"), html);
  check("waterheater top-of-range warning", html.includes("top of the tank range"), html);
}

/* --- water heater: empty ---------------------------------------------- */
{
  const html = run("waterheater", {
    fuel: { type: "select", value: "gas" }, groundtemp: { type: "select", value: "50" },
  }, { use: [{ value: "0", dataset: { gallons: "20" } }] });
  check("waterheater empty state", html.includes("busiest hour"), html);
}

const failed = results.filter((r) => !r.ok);
for (const r of results) console.log((r.ok ? "  PASS  " : "  FAIL  ") + r.name);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length) {
  console.log("\nFirst failure output:\n" + failed[0].detail);
  process.exit(1);
}
