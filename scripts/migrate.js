// Applies db/postgres/migrations/*.sql in order, once each. Usage: npm run db:migrate
const fs = require('fs');
const path = require('path');
const env = require('../src/config/env');
const pg = require('../src/infra/postgres');

(async () => {
  if (!env.features.postgres) {
    console.log('DATABASE_URL is not set — nothing to migrate.');
    process.exit(0);
  }
  await pg.query(
    'CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())'
  );
  const dir = path.join(__dirname, '..', 'db', 'postgres', 'migrations');
  const done = new Set((await pg.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name));
  for (const file of fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort()) {
    if (done.has(file)) continue;
    await pg.tx(async (c) => {
      await c.query(fs.readFileSync(path.join(dir, file), 'utf8'));
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log(`applied ${file}`);
  }
  console.log('migrations up to date');
  await pg.close();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
