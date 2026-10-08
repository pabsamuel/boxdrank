import { lintContent } from './validate';
import { packs } from './index';

const issues = lintContent();
for (const i of issues) console.log(`${i.level.toUpperCase().padEnd(5)} ${i.where}: ${i.message}`);
const errors = issues.filter((i) => i.level === 'error').length;
const plays = packs.reduce((n, p) => n + p.plays.length, 0);
const puppets = packs.reduce((n, p) => n + p.puppets.length, 0);
console.log(
  `\n${packs.length} packs, ${plays} plays, ${puppets} puppets — ${errors} errors, ${issues.length - errors} warnings`,
);
process.exit(errors ? 1 : 0);
