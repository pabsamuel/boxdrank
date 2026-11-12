/* HomeSizer calculator engines.
   One engine per calculator, keyed off data-engine on .calc-shell.
   Each returns { headline, unit, note, rows[], svg? } and the shared
   renderer paints it. Recomputes on every input change - no submit button,
   because a submit button is one more place to lose someone. */
(function () {
  "use strict";

  var shell = document.querySelector(".calc-shell");
  if (!shell) return;
  var form = document.getElementById("calc-form");
  var out = document.getElementById("calc-result");

  var num = function (id) {
    var el = document.getElementById("f-" + id);
    return el ? parseFloat(el.value) || 0 : 0;
  };
  var bool = function (id) {
    var el = document.getElementById("f-" + id);
    return el ? el.checked : false;
  };
  var sel = function (id) {
    return document.getElementById("f-" + id);
  };
  /* Pull a numeric hint off the selected <option> (data-factor, data-ach...). */
  var opt = function (id, attr, fallback) {
    var s = sel(id);
    if (!s) return fallback;
    var v = s.options[s.selectedIndex].getAttribute("data-" + attr);
    return v === null ? fallback : parseFloat(v);
  };
  var fmt = function (n, dp) {
    return n.toLocaleString("en-US", {
      minimumFractionDigits: dp || 0, maximumFractionDigits: dp || 0
    });
  };
  /* Nearest value in a list - deliberately nearest, not next-up, because
     several of these sizings are made worse by rounding up. */
  var nearest = function (v, list) {
    return list.reduce(function (a, b) {
      return Math.abs(b - v) < Math.abs(a - v) ? b : a;
    });
  };
  var atLeast = function (v, list) {
    for (var i = 0; i < list.length; i++) if (list[i] >= v) return list[i];
    return list[list.length - 1];
  };

  var engines = {

    generator: function () {
      var running = 0, maxDelta = 0, picked = 0;
      Array.prototype.forEach.call(document.querySelectorAll(".ap"), function (el) {
        if (!el.checked) return;
        picked++;
        var r = parseFloat(el.dataset.running), s = parseFloat(el.dataset.starting);
        running += r;
        maxDelta = Math.max(maxDelta, s - r);
      });
      if (!picked) {
        return { empty: "Tick the appliances you want to run at the same time." };
      }
      /* Worst realistic case: everything running, biggest single motor starting.
         Summing every surge together is what makes people buy double. */
      var surge = running + maxDelta;
      var withHeadroom = running * 1.2;
      var classes = [2000, 3000, 3500, 4500, 5500, 7000, 7500, 9000, 9500, 12000, 15000];
      var size = atLeast(withHeadroom, classes);

      return {
        headline: fmt(size) + " W",
        unit: "generator (running watts)",
        rows: [
          ["Running watts", fmt(running) + " W"],
          ["Starting surge needed", fmt(surge) + " W"],
          ["With 20% headroom", fmt(withHeadroom) + " W"],
          ["Appliances selected", picked]
        ],
        note: surge > size * 1.7
          ? "Your surge requirement is high relative to the running load — check that the generator you pick lists a peak rating of at least " + fmt(surge) + " W, not just the running watts."
          : "Look for a unit rated around " + fmt(size) + " W running and at least " + fmt(surge) + " W peak."
      };
    },

    minisplit: function () {
      var area = num("area"), ceiling = num("ceiling") || 8;
      if (!area) return { empty: "Enter the room's floor area." };
      var btu = area * 20;
      btu *= ceiling / 8;                       // load follows volume, not floor
      btu *= opt("zone", "factor", 1);
      btu *= opt("sun", "factor", 1);
      btu *= opt("insulation", "factor", 1);
      btu += Math.max(0, num("occupants") - 2) * 600;
      if (bool("kitchen")) btu += 4000;
      if (bool("attic")) btu *= 1.1;

      var sizes = [6000, 9000, 12000, 15000, 18000, 24000, 30000, 36000];
      var size = nearest(btu, sizes);

      return {
        headline: fmt(size) + " BTU",
        unit: "nominal capacity",
        rows: [
          ["Calculated load", fmt(Math.round(btu / 100) * 100) + " BTU/hr"],
          ["Nearest real size", fmt(size) + " BTU"],
          ["Room volume", fmt(area * ceiling) + " ft³"],
          ["BTU per sq ft", fmt(btu / area, 1)]
        ],
        note: size >= 30000
          ? "At this size you are past what a rule of thumb should decide. Get a Manual J load calculation before buying — and check whether this should be multiple heads rather than one."
          : "If your load landed between two sizes, take the smaller one. Oversizing causes short-cycling and a cold, clammy room."
      };
    },

    recessed: function () {
      var L = num("length"), W = num("width"), ceiling = num("ceiling") || 8;
      if (!L || !W) return { empty: "Enter the room's length and width." };

      var spacing = ceiling / 2;
      var nL = Math.max(1, Math.round(L / spacing));
      var nW = Math.max(1, Math.round(W / spacing));
      var sL = L / nL, sW = W / nW;             // re-centre so the grid comes out even
      var count = nL * nW;
      var fc = opt("roomtype", "fc", 15);
      var totalLumens = L * W * fc;
      var perFixture = totalLumens / count;

      var inches = function (ft) {
        var f = Math.floor(ft), i = Math.round((ft - f) * 12);
        if (i === 12) { f++; i = 0; }
        return f + "' " + i + '"';
      };

      /* Scale drawing of the layout, walls to scale, lights on the computed grid. */
      var pad = 22, scale = Math.min(520 / L, 320 / W);
      var w = L * scale, h = W * scale, dots = "";
      for (var i = 0; i < nL; i++) {
        for (var j = 0; j < nW; j++) {
          dots += '<circle cx="' + (pad + (sL / 2 + i * sL) * scale).toFixed(1) +
                  '" cy="' + (pad + (sW / 2 + j * sW) * scale).toFixed(1) +
                  '" r="6" class="lamp"/>';
        }
      }
      var svg = '<svg viewBox="0 0 ' + (w + pad * 2) + ' ' + (h + pad * 2) +
        '" class="layout" role="img" aria-label="Ceiling layout: ' + nL + ' by ' + nW +
        ' grid of ' + count + ' lights"><rect x="' + pad + '" y="' + pad + '" width="' +
        w.toFixed(1) + '" height="' + h.toFixed(1) + '" class="room"/>' + dots + '</svg>';

      return {
        headline: count + (count === 1 ? " light" : " lights"),
        unit: nL + " × " + nW + " grid",
        svg: svg,
        rows: [
          ["Spacing along length", inches(sL)],
          ["Spacing along width", inches(sW)],
          ["Offset from end walls", inches(sL / 2)],
          ["Offset from side walls", inches(sW / 2)],
          ["Lumens needed per fixture", fmt(perFixture) + " lm"],
          ["Total for the room", fmt(totalLumens) + " lm at " + fc + " fc"]
        ],
        note: perFixture > 1100
          ? "That is more output than a typical 6 in downlight delivers. Add a row, or supplement with task lighting rather than chasing it with brighter cans."
          : "Find your joists before committing to this grid — shift the whole layout if you must, rather than moving one light out of line."
      };
    },

    purifier: function () {
      var area = num("area"), ceiling = num("ceiling") || 8;
      if (!area) return { empty: "Enter the room's floor area." };
      var ach = opt("ach", "ach", 4);
      var volume = area * ceiling;
      var cadr = (volume * ach) / 60;
      if (bool("openplan")) cadr *= 1.4;
      /* Rated CADR is measured at max fan speed, which most people never use. */
      var practical = cadr / 0.6;

      return {
        headline: fmt(cadr) + " CFM",
        unit: "minimum smoke CADR",
        rows: [
          ["Room volume", fmt(volume) + " ft³"],
          ["Air changes per hour", ach + " ACH"],
          ["Minimum rated CADR", fmt(cadr) + " CFM"],
          ["Buy-one-size-up target", fmt(practical) + " CFM"],
          ["Equivalent AHAM room size", fmt(cadr * 1.55) + " sq ft"]
        ],
        note: "Size against the <strong>smoke</strong> CADR, which is always the lowest of the three ratings. Aiming at " +
          fmt(practical) + " CFM lets you run the unit on medium instead of maximum, which is the difference between using it and switching it off because it is loud."
      };
    },

    waterheater: function () {
      var fhr = 0, uses = 0;
      Array.prototype.forEach.call(document.querySelectorAll(".use"), function (el) {
        var n = parseFloat(el.value) || 0;
        if (n > 0) { uses += n; fhr += n * parseFloat(el.dataset.gallons); }
      });
      if (!uses) return { empty: "Enter what happens in your busiest hour." };

      var fuel = sel("fuel") ? sel("fuel").value : "gas";
      var ground = parseFloat(sel("groundtemp") ? sel("groundtemp").value : 50);
      var rise = 120 - ground;
      /* Recovery rates are quoted at a 90F rise; scale for real inlet temps. */
      var baseRecovery = { gas: 40, electric: 20, heatpump: 25 }[fuel];
      var recovery = baseRecovery * (90 / rise);
      /* FHR ~ 70% of stored volume (the usable draw) + one hour of recovery. */
      var tankNeeded = Math.max(20, (fhr - recovery) / 0.7);
      var tank = atLeast(tankNeeded, [30, 40, 50, 66, 75, 80]);
      /* Tankless is sized on simultaneous flow at your temperature rise. */
      var gpm = Math.max(2.0, Math.min(uses, 3) * 1.6);

      return {
        headline: fmt(fhr) + " gal",
        unit: "first hour rating needed",
        rows: [
          ["Peak hour demand", fmt(fhr) + " gallons"],
          ["Temperature rise", fmt(rise) + "°F"],
          ["Recovery at that rise", fmt(recovery) + " gal/hr"],
          ["Tank size to buy", tank + " gallon " + fuel.replace("heatpump", "heat pump")],
          ["Tankless equivalent", fmt(gpm, 1) + " GPM at " + fmt(rise) + "°F rise"]
        ],
        note: tank >= 75
          ? "You are at the top of the tank range. Compare against a tankless unit or two smaller tanks in series before buying — an 80 gallon electric is a large appliance with large standby losses."
          : "Shop by the <strong>first hour rating</strong> on the yellow EnergyGuide label, not by gallons. A " + tank + " gallon " + fuel.replace("heatpump", "heat pump") + " unit should list an FHR at or just above " + fmt(fhr) + " gal."
      };
    }
  };

  var engine = engines[shell.dataset.engine];
  if (!engine) return;

  function render() {
    var r = engine();
    if (r.empty) {
      out.innerHTML = '<p class="muted">' + r.empty + "</p>";
      return;
    }
    var rows = r.rows.map(function (kv) {
      return "<tr><th>" + kv[0] + "</th><td>" + kv[1] + "</td></tr>";
    }).join("");
    out.innerHTML =
      '<div class="answer"><span class="big">' + r.headline + "</span>" +
      '<span class="unit">' + r.unit + "</span></div>" +
      (r.svg || "") +
      '<table class="breakdown">' + rows + "</table>" +
      (r.note ? '<p class="note">' + r.note + "</p>" : "") +
      '<p class="muted small"><a href="#method">See how this is calculated</a></p>';
  }

  form.addEventListener("input", render);
  form.addEventListener("change", render);
  render();
})();
