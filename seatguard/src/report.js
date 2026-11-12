/** Rendering. The audit produces data; this file is the only place that formats it. */

const money = (n) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

const BADGE = { high: '[HIGH]  ', medium: '[MEDIUM]', low: '[LOW]   ' };

export function renderConsole(report) {
  const out = [];
  const line = (s = '') => out.push(s);

  line();
  line(`SeatGuard audit — ${report.account.name}`);
  line('='.repeat(60));
  line(
    `${report.totals.billableSeats} billable seats · ` +
      `${report.totals.boards} boards · ` +
      `${report.totals.workspaces} workspaces · ` +
      `${report.totals.accessGrants} access grants`,
  );
  line(`Current seat spend: ${money(report.totals.monthlySeatCostUsd)}/month`);

  if (report.monthlySavingsUsd > 0) {
    line();
    line(
      `RECLAIMABLE: ${money(report.monthlySavingsUsd)}/month ` +
        `(${money(report.annualSavingsUsd)}/year)`,
    );
  }

  line();
  if (report.findings.length === 0) {
    line('No findings. This account is in good shape.');
    line();
    return out.join('\n');
  }

  line(`${report.findings.length} findings`);
  line('-'.repeat(60));

  for (const f of report.findings) {
    line();
    line(`${BADGE[f.severity]} ${f.title}`);
    line(`         ${f.detail}`);
    if (f.monthlySavingsUsd) {
      line(`         Worth ${money(f.monthlySavingsUsd)}/month.`);
    }
    for (const s of f.subjects.slice(0, 8)) {
      line(`           · ${s.name}${s.note ? ` — ${s.note}` : ''}`);
    }
    if (f.subjects.length > 8) {
      line(`           · …and ${f.subjects.length - 8} more`);
    }
  }
  line();
  return out.join('\n');
}

const esc = (s) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function renderHtml(report) {
  const findings = report.findings
    .map(
      (f) => `
    <section class="finding sev-${f.severity}">
      <header>
        <span class="badge">${f.severity}</span>
        <h3>${esc(f.title)}</h3>
        ${f.monthlySavingsUsd ? `<span class="saving">${money(f.monthlySavingsUsd)}/mo</span>` : ''}
      </header>
      <p>${esc(f.detail)}</p>
      <ul>
        ${f.subjects
          .map((s) => `<li><strong>${esc(s.name)}</strong>${s.note ? ` <span>${esc(s.note)}</span>` : ''}</li>`)
          .join('')}
      </ul>
    </section>`,
    )
    .join('');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>SeatGuard — ${esc(report.account.name)}</title>
<style>
  :root{--bg:#f4f5f7;--card:#fff;--ink:#121820;--ink2:#5a6673;--line:#e0e4e9;
        --high:#a3341c;--medium:#8a5c10;--low:#4b5a6b;--good:#14654a;}
  @media (prefers-color-scheme:dark){:root{--bg:#0f1319;--card:#171d25;--ink:#e9edf2;
    --ink2:#9aa5b1;--line:#28303a;--high:#e6907a;--medium:#e0b268;--low:#93a1b0;--good:#68c8a2;}}
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--ink);
       font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
  .wrap{max-width:52rem;margin:0 auto;padding:32px 16px 64px}
  h1{font-size:1.75rem;margin:0 0 4px;letter-spacing:-.02em}
  .meta{color:var(--ink2);font-size:.9rem;margin:0 0 24px}
  .headline{background:var(--card);border:1px solid var(--line);border-radius:10px;
            padding:20px;margin-bottom:24px}
  .big{font-size:2.2rem;font-weight:700;color:var(--good);letter-spacing:-.03em;
       font-variant-numeric:tabular-nums}
  .stats{display:flex;flex-wrap:wrap;gap:8px 24px;color:var(--ink2);font-size:.9rem;margin-top:12px}
  .finding{background:var(--card);border:1px solid var(--line);border-left:3px solid var(--low);
           border-radius:0 10px 10px 0;padding:16px 18px;margin-bottom:12px}
  .finding.sev-high{border-left-color:var(--high)}
  .finding.sev-medium{border-left-color:var(--medium)}
  .finding header{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
  .finding h3{font-size:1.05rem;margin:0;flex:1}
  .badge{font-size:.65rem;text-transform:uppercase;letter-spacing:.1em;font-weight:700}
  .sev-high .badge{color:var(--high)} .sev-medium .badge{color:var(--medium)}
  .sev-low .badge{color:var(--low)}
  .saving{color:var(--good);font-weight:700;font-variant-numeric:tabular-nums}
  .finding p{color:var(--ink2);font-size:.92rem;margin:.5em 0}
  .finding ul{margin:.5em 0 0;padding-left:18px;font-size:.9rem}
  .finding li span{color:var(--ink2)}
  footer{color:var(--ink2);font-size:.82rem;margin-top:32px;border-top:1px solid var(--line);
         padding-top:14px}
</style></head>
<body><div class="wrap">
  <h1>SeatGuard audit</h1>
  <p class="meta">${esc(report.account.name)} · generated ${esc(report.generatedAt.slice(0, 10))}</p>

  <div class="headline">
    ${
      report.monthlySavingsUsd > 0
        ? `<div class="big">${money(report.monthlySavingsUsd)}/month</div>
           <div style="color:var(--ink2)">reclaimable — ${money(report.annualSavingsUsd)} a year</div>`
        : `<div class="big">No reclaimable spend</div>`
    }
    <div class="stats">
      <span>${report.totals.billableSeats} billable seats</span>
      <span>${report.totals.boards} boards</span>
      <span>${report.totals.workspaces} workspaces</span>
      <span>${report.totals.accessGrants} access grants</span>
      <span>${money(report.totals.monthlySeatCostUsd)}/mo current spend</span>
    </div>
  </div>

  ${findings || '<p>No findings. This account is in good shape.</p>'}

  <footer>
    Permission modelling uses documented assumptions recorded in
    <code>src/permissions.js</code>. Verify them against your account before
    acting on access findings.
  </footer>
</div></body></html>`;
}
