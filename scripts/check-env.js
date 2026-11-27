// Prints which HLD connections are configured. Usage: npm run check:env
const env = require('../src/config/env');

const rows = Object.entries(env.features).map(([name, on]) => `  ${on ? '✅' : '⬜'} ${name}`);
console.log(`NODE_ENV=${env.NODE_ENV}\nConnections:\n${rows.join('\n')}`);
console.log('\n⬜ = not configured; the app uses its dev fallback. Fill server/.env to enable.');
