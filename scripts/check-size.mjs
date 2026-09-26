// CI gate: total JS in dist/ must stay under ~600 KB gzipped.
import { readdirSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { join } from 'node:path';

const LIMIT = 600 * 1024;
const dir = 'dist/assets';
let total = 0;
for (const f of readdirSync(dir)) {
  if (!f.endsWith('.js')) continue;
  const gz = gzipSync(readFileSync(join(dir, f))).length;
  total += gz;
  console.log(`${f}: ${(gz / 1024).toFixed(1)} KB gzipped`);
}
console.log(`total JS: ${(total / 1024).toFixed(1)} KB gzipped (limit ${LIMIT / 1024} KB)`);
if (total > LIMIT) {
  console.error('JS bundle over budget');
  process.exit(1);
}
