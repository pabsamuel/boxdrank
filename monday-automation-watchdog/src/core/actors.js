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
 *
 * There is also a much stronger signal, confirmed against a live account:
 * **monday's automations act under a negative `user_id`.** That needs no list of
 * people at all, so automations are recognised even when the users query is
 * unavailable — which is the path this module previously degraded into.
 */

/**
 * True for monday's internal, non-human actors.
 *
 * **Verified against a live account on 21 Sep 2026.** An automation firing on a
 * board writes its activity under `user_id: "-4"`. Real people have large
 * positive ids (`"117040353"` in that account), so the sign alone separates
 * them, and no person can ever collide with a negative id.
 *
 * Treats *any* negative id as internal rather than matching `-4` exactly: the
 * one value observed is certainly not the only one monday uses, and a new
 * system actor appearing should be watched, not ignored.
 */
export function isSystemActor(actor) {
  if (actor === null || actor === undefined) return false;
  const numeric = Number(String(actor).trim());
  return Number.isFinite(numeric) && numeric < 0;
}

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

  const systemActors = new Set([...seen].filter(isSystemActor));

  // Without a list of people there is nothing to subtract, and assuming every
  // actor is an automation would start watching people's manual edits and
  // alerting when someone goes on holiday.
  //
  // But a negative id is proof on its own. So when the human list is missing
  // and negative ids are present, those are still watched confidently — which
  // is precisely the product's job, since monday's own automations are exactly
  // what carries a negative id. Only when there is neither a human list nor a
  // system actor is there genuinely nothing to go on, and then everything stays
  // watched as before.
  if (humans.size === 0) {
    return {
      automationActors: systemActors,
      humanActors: new Set(),
      unknown: systemActors.size === 0,
    };
  }

  const automationActors = new Set(systemActors);
  const humanActors = new Set();
  for (const actor of seen) {
    if (systemActors.has(actor)) continue;
    if (humans.has(actor)) humanActors.add(actor);
    // Not a person and not negative: an installed app or integration. It can
    // stop working just as quietly as an automation, so it is watched too.
    else automationActors.add(actor);
  }

  return { automationActors, humanActors, unknown: false };
}
