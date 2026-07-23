import { loadEnv } from '@global-emotes/config';
import { createDb } from './index';
import { seed } from './seed';

const env = loadEnv();
const { db, pool } = createDb({ connectionString: env.DATABASE_URL, max: 1 });

seed(db as never)
  .then((result) => {
    console.log('Seed complete. Demo data:');
    console.log(`  creator login:  creator@demo.local`);
    console.log(`  fan login:      fan@demo.local`);
    console.log(`  admin login:    admin@demo.local`);
    console.log(`  access code:    ${result.accessCode}`);
  })
  .catch((err) => {
    console.error('seed failed', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
