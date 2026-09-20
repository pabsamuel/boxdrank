/**
 * Renders a notification plan as an email.
 *
 * Plain text is the primary format and the HTML is generated from the same
 * data, because the most likely reader is someone glancing at a phone preview.
 * The first line has to carry the whole message on its own.
 */

import { formatDuration } from './cadence.js';
import { singleLine } from './sanitize.js';
import { MAX_LISTED, subjectFor, selectForDisplay } from './alerts.js';

/** Escapes text for HTML. Board and automation names are user-controlled. */
function escapeHtml(text) {
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    // Single quotes too. No single-quoted attribute exists here today, but the
    // escaper should not be the reason a future one becomes a hole.
    .replace(/'/g, '&#39;');
}

/** Describes what was left out, naming boards rather than only counting. */
function overflowNote({ hiddenCount, hiddenBoards }) {
  if (hiddenCount === 0) return null;
  const named = hiddenBoards.slice(0, 5).join(', ');
  const extra = hiddenBoards.length - 5;
  const rest = extra > 0 ? ` and ${extra} other board${extra === 1 ? '' : 's'}` : '';
  return `  …and ${hiddenCount} more, on ${named}${rest}.`;
}

function section(title, items, describe) {
  if (items.length === 0) return [];
  const selection = selectForDisplay(items, MAX_LISTED);
  const lines = [title, ''];
  for (const item of selection.shown) {
    // singleLine again at the sink, not because labelFor missed it, but because
    // a second sink should not depend on a distant caller having sanitised.
    lines.push(`  • ${singleLine(item.label)}`);
    lines.push(`    ${singleLine(describe(item), 200)}`);
  }
  const note = overflowNote(selection);
  if (note) lines.push(note);
  lines.push('');
  return lines;
}

/**
 * @param {ReturnType<import('./alerts.js').planNotifications>} plan
 * @returns {{subject: string, text: string, html: string}}
 */
export function renderEmail(plan) {
  const subject = subjectFor(plan);

  const lines = [];
  lines.push(
    ...section('STOPPED', plan.newlySilent, (item) => item.reason),
    ...section('STILL STOPPED', plan.stillSilent, (item) => `Quiet for ${formatDuration(item.silentForMs)}. ${item.reason}`),
    ...section('RUNNING AGAIN', plan.recovered, (item) => `Was quiet for ${formatDuration(item.wasSilentForMs)}.`),
  );

  lines.push(
    'monday does not notify anyone when an automation is deactivated or starts',
    'failing. If one of these matters, check it in the board\'s Automations centre.',
  );

  const text = `${subject}\n\n${lines.join('\n')}`;

  const htmlSection = (title, items, describe, colour) => {
    if (items.length === 0) return '';
    const selection = selectForDisplay(items, MAX_LISTED);
    const rows = selection.shown
      .map(
        (item) =>
          `<li style="margin:0 0 10px"><strong>${escapeHtml(item.label)}</strong><br>` +
          `<span style="color:#676879">${escapeHtml(describe(item))}</span></li>`,
      )
      .join('');
    const note = overflowNote(selection);
    const more = note ? `<li style="color:#676879">${escapeHtml(note.trim())}</li>` : '';
    return (
      `<h2 style="font-size:14px;text-transform:uppercase;letter-spacing:.04em;color:${colour};margin:20px 0 8px">${escapeHtml(title)}</h2>` +
      `<ul style="padding-left:18px;margin:0">${rows}${more}</ul>`
    );
  };

  const html =
    `<div style="font:15px/1.5 -apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#1c1f3b;max-width:600px">` +
    `<h1 style="font-size:18px;margin:0 0 4px">${escapeHtml(subject)}</h1>` +
    htmlSection('Stopped', plan.newlySilent, (item) => item.reason, '#d83a52') +
    htmlSection('Still stopped', plan.stillSilent, (item) => `Quiet for ${formatDuration(item.silentForMs)}. ${item.reason}`, '#d83a52') +
    htmlSection('Running again', plan.recovered, (item) => `Was quiet for ${formatDuration(item.wasSilentForMs)}.`, '#16a34a') +
    `<p style="color:#676879;font-size:13px;margin-top:22px">monday does not notify anyone when an automation is deactivated or starts failing. ` +
    `If one of these matters, check it in the board's Automations centre.</p></div>`;

  return { subject, text, html };
}
