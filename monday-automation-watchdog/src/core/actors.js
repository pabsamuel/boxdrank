/**
 * Works out which actors in an activity log are not people.
 *
 * The alternative was a settings screen where someone ticks which actors are
 * automations. That is worse in every direction: it is work before the app does
 * anything useful, it goes stale the moment an automation is added, and getting
 * it wrong means silently not watching something.
 *
 * Inferring it is better because the question has a clean answer. An account
 * knows exactly who its human users are. Anything that appears in an activity log
 * and is not one of them acted without a person behind it — an automation, an
 * integration, or an installed app. All three are things that can quietly stop
 * working, and all three are worth watching, so the imprecise label "not a
 * human" happens to select exactly the right set.
 */

/**
 * Splits the actors seen in a log into people and everything else.
 *
 * @param {{actor?: string|null}[]} entries
 * @param {Iterable<string>} humanIds Ids of the account's real users.
 * @returns {{ automationActors: Set<string>, humanActors: Set<string>, unknown: boolean }}
 *          `unknown` is true when the human list could not be established, in
 *          which case no actor is classified and the caller should watch
 *          everything rather than guess.
 */
export function classifyActors(entries, humanIds) {
  const humans = new Set([...(humanIds ?? [])].map(String));
  const seen = new Set(
    (entries ?? [])
      .map((entry) => (entry?.actor === null || entry?.actor === undefined ? null : String(entry.actor)))
      .filter((actor) => actor !== null),
  );

  // With no human list there is nothing to subtract, and assuming every actor
  // is an automation would silently start watching people's manual edits and
  // alerting when someone goes on holiday. Watching everything is the honest
  // fallback, and it is what the app did before this existed.
  if (humans.size === 0) {
    return { automationActors: new Set(), humanActors: new Set(), unknown: true };
  }

  const automationActors = new Set();
  const humanActors = new Set();
  for (const actor of seen) {
    if (humans.has(actor)) humanActors.add(actor);
    else automationActors.add(actor);
  }

  return { automationActors, humanActors, unknown: false };
}
