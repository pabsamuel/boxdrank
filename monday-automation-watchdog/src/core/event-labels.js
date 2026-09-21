/**
 * Turns monday's raw activity-log event names into something an admin reading an
 * alert at 8am can parse without looking anything up.
 *
 * The mapped names are the ones seen referenced in monday's documentation and
 * community posts. They are **not** an exhaustive or verified list — the full
 * event vocabulary was not reachable while this was written. Anything unmapped
 * falls back to a tidied version of the raw name, so an unknown event reads as
 * "some new event" rather than breaking or being hidden.
 */

import { singleLine } from './sanitize.js';

const KNOWN = {
  create_pulse: 'creates an item',
  delete_pulse: 'deletes an item',
  archive_pulse: 'archives an item',
  move_pulse_into_group: 'moves an item between groups',
  move_pulse_into_board: 'moves an item between boards',
  change_column_value: 'changes a column',
  update_column_value: 'changes a column',
  create_update: 'posts an update',
  delete_update: 'deletes an update',
  create_column: 'adds a column',
  delete_column: 'removes a column',
  create_group: 'adds a group',
  delete_group: 'removes a group',
  create_subitem: 'creates a subitem',
  change_name: 'renames an item',
  // Seen in a live account on 21 Sep 2026.
  update_column_value: 'changes a column',
  update_board_name: 'renames the board',
  board_workspace_id_changed: 'moves the board to another workspace',
  create_board: 'creates a board',
  archive_board: 'archives the board',
  delete_board: 'deletes the board',
};

/**
 * @param {string|null|undefined} event Raw event name.
 * @returns {string} A verb phrase. Never empty.
 */
export function describeEvent(event) {
  if (!event) return 'does something';
  // hasOwn, not a bare lookup: an event named "constructor" would otherwise
  // return Object itself and render as "function Object() { [native code] }".
  if (Object.hasOwn(KNOWN, event)) return KNOWN[event];

  // snake_case or camelCase into plain words, so an unmapped event still reads.
  // Flattened too — event names come from the API and are a second injection
  // point into the same email body as board names.
  return singleLine(
    String(event)
      .replace(/[_-]+/g, ' ')
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .toLowerCase(),
    60,
  );
}
