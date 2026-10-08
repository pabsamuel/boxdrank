import { PuppetSchema, type Puppet } from '@perde/shared';

/**
 * The family's own puppets live on the phone that drew them (localStorage),
 * and are sent to whichever TV the phone joins. Newest first, capped so a
 * dozen drawings never exceed the browser's quota.
 */

const KEY = 'perde.puppets.v1';
const MAX_BYTES = 4_000_000;

export function listPuppets(): Puppet[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as unknown[];
    return arr
      .map((p) => PuppetSchema.safeParse(p))
      .filter((r) => r.success)
      .map((r) => r.data);
  } catch {
    return [];
  }
}

export function savePuppet(puppet: Puppet): void {
  const rest = listPuppets().filter((p) => p.id !== puppet.id);
  let all = [puppet, ...rest];
  let json = JSON.stringify(all);
  while (json.length > MAX_BYTES && all.length > 1) {
    all = all.slice(0, -1);
    json = JSON.stringify(all);
  }
  try {
    localStorage.setItem(KEY, json);
  } catch {
    /* quota: keep going without persistence */
  }
}

export function deletePuppet(id: string): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(listPuppets().filter((p) => p.id !== id)));
  } catch {
    /* ignore */
  }
}

export function newPuppetId(): string {
  const rnd = Math.random().toString(36).slice(2, 8);
  return `custom:${Date.now().toString(36)}${rnd}`;
}
