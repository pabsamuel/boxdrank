/**
 * Automations "set up in an older way", as monday returns them in
 * `board_automations { legacy_automations }`. Pure functions, no API calls.
 *
 * FACT (Samet's API playground, API 2026-10, 28 Sep 2026, board 5104569213):
 * `legacy_automations` is an object, not a list:
 *
 *   { note, automations: [ { id, boardId, userId, recipeId, config, active,
 *     state, noticeMessage, description, createdAt, updatedAt, … } ],
 *   (userId is not kept: nothing here uses it.)
 *     recipes: { recipes: [], dynamicRecipes: [ { id, sentenceParts: [
 *     { nodeId, sentencePartial } ], parsedSentence, … } ] }, apps }
 *
 * The automations carry **no title**. monday's own Autopilot hub showed that
 * one as "When status changes to something move item to group" — the
 * recipe's generic `parsedSentence`, which cannot be searched for what it
 * actually does. The recipe's `sentenceParts` name the configured values
 * instead — "When {status,columnId} changes to {something,statusColumnValue}"
 * — and `config[nodeId]` holds them: a column id, a status label id, a group
 * id. With the board's column titles, status labels and group names, the
 * sentence becomes "When Status changes to Bitir move item to Group Title",
 * which is what an earlier answer for the same automation read.
 *
 * INFERENCE: this mapping is read from one real automation. Every term it
 * cannot resolve keeps monday's own generic word, so the worst case is the
 * sentence the Autopilot hub shows, never a wrong one.
 *
 * The `note` in the answer asks that these automations be presented "like
 * any other automation, without labels such as legacy or read-only". The list
 * does that; the `legacy` flag stays internal.
 */

const TERM = /\{\s*([^{},]+?)\s*,\s*([^{},]+?)\s*\}/g;

const asObject = (value) => {
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return value && typeof value === 'object' ? value : null;
};

/** The raw automation entries, whichever shape monday sent. */
export function legacyEntries(value) {
  const data = asObject(value);
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.automations)) return data.automations;
  if (Array.isArray(data?.items)) return data.items;
  return [];
}

/** Recipe id → its sentence parts and generic sentence. */
export function legacyRecipes(value) {
  const data = asObject(value);
  const recipes = new Map();
  const lists = [data?.recipes?.dynamicRecipes, data?.recipes?.recipes, data?.dynamicRecipes];
  for (const list of lists) {
    if (!Array.isArray(list)) continue;
    for (const recipe of list) {
      if (!recipe || typeof recipe !== 'object' || recipe.id === undefined || recipe.id === null) continue;
      const parts = Array.isArray(recipe.sentenceParts)
        ? recipe.sentenceParts
            .filter((part) => part && typeof part.sentencePartial === 'string')
            .map((part) => ({ nodeId: part.nodeId === undefined ? null : String(part.nodeId), text: part.sentencePartial }))
        : [];
      const generic = typeof recipe.parsedSentence === 'string'
        ? recipe.parsedSentence
        : typeof recipe.sentence === 'string'
          ? recipe.sentence.replace(TERM, (_, word) => word)
          : '';
      recipes.set(String(recipe.id), { parts, generic });
    }
  }
  return recipes;
}

/** Whether any older automation here would read better with the board's names. */
export function legacyNeedsBoardNames(value) {
  return legacyEntries(value).length > 0 && legacyRecipes(value).size > 0;
}

/**
 * The board's names for a sentence: column titles, status labels by label id,
 * group titles. Built from `boards { columns { id title } statusColumns:
 * columns(types: [status]) { id settings } groups { id title } }`; settings
 * inside `columns` are read too. FACT (`api-reference/reference/status`, read
 * 28 Sep 2026): a status column's `settings.labels` is a list of `{ id, label,
 * index, … }`, and a stored status value's "index" is the label's `id`.
 */
export function boardNames(board) {
  const columns = new Map();
  const entry = (id) => {
    if (!columns.has(id)) columns.set(id, { title: null, labels: new Map() });
    return columns.get(id);
  };
  const lists = [board?.columns, board?.statusColumns].filter(Array.isArray);
  for (const column of lists.flat()) {
    if (!column || column.id === undefined) continue;
    const target = entry(String(column.id));
    if (typeof column.title === 'string') target.title = column.title;
    const settings = asObject(column.settings);
    for (const label of Array.isArray(settings?.labels) ? settings.labels : []) {
      if (label && label.id !== undefined && typeof label.label === 'string') target.labels.set(String(label.id), label.label);
    }
  }
  const groups = new Map();
  for (const group of Array.isArray(board?.groups) ? board.groups : []) {
    if (group && group.id !== undefined && typeof group.title === 'string') groups.set(String(group.id), group.title);
  }
  return { columns, groups };
}

function columnIdOf(value) {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.columnId === 'string') return value.columnId;
  return null;
}

/** One `{word,fieldKey}` term, resolved from the node's config, or its word. */
function resolveTerm(word, fieldKey, nodeConfig, names) {
  if (!nodeConfig || !names) return word;
  const value = nodeConfig[fieldKey];
  if (fieldKey === 'columnId') {
    const column = names.columns.get(columnIdOf(value) ?? '');
    return column?.title ?? word;
  }
  if (fieldKey === 'statusColumnValue') {
    const column = names.columns.get(columnIdOf(nodeConfig.columnId) ?? '');
    const labelId = value && typeof value === 'object' ? value.index : undefined;
    const label = labelId === undefined || labelId === null ? undefined : column?.labels.get(String(labelId));
    return label ?? word;
  }
  if (fieldKey === 'groupId') {
    const groupId = typeof value === 'string' ? value : value && typeof value === 'object' ? value.groupId : null;
    return names.groups.get(String(groupId ?? '')) ?? word;
  }
  return word;
}

const tidy = (text) => text.replace(/\s+/g, ' ').trim();

/**
 * A readable name for one older automation.
 *
 * @param {object} entry   One entry of `automations`.
 * @param {Map} recipes    From `legacyRecipes`.
 * @param {{columns: Map, groups: Map}|null} names  From `boardNames`, or null.
 * @returns {string} Never empty.
 */
export function legacyTitle(entry, recipes, names) {
  for (const key of ['title', 'name']) {
    if (typeof entry?.[key] === 'string' && entry[key].trim() !== '') return tidy(entry[key]);
  }
  const recipe = recipes.get(String(entry?.recipeId ?? entry?.RecipeModelId ?? ''));
  const config = entry?.config && typeof entry.config === 'object' ? entry.config : {};
  if (recipe && recipe.parts.length > 0) {
    const sentence = recipe.parts
      .map((part) => part.text.replace(TERM, (_, word, fieldKey) => resolveTerm(word, fieldKey, config[part.nodeId], names)))
      .join(' ');
    if (tidy(sentence) !== '') return tidy(sentence);
  }
  if (recipe && recipe.generic.trim() !== '') return tidy(recipe.generic);
  if (typeof entry?.description === 'string' && entry.description.trim() !== '') return tidy(entry.description);
  return 'Untitled automation';
}
