// Post-build: `/.well-known/webauthn` lists the new address as a related origin of the old one (WebAuthn Related Origin Requests), so passkeys of the old domain sign in on the new one during the move (issue #198). Edits only build/, never static/.
import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from 'vite';
import { computeDomainMove } from './domain-move.mjs';

const env = { ...loadEnv('production', process.cwd(), 'PUBLIC_'), ...process.env };
const move = computeDomainMove(env, process.env.CF_PAGES_BRANCH);
const target = path.join('build', '.well-known', 'webauthn');

if (!move) {
  fs.rmSync(target, { force: true });
  process.exit(0);
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, JSON.stringify({ origins: [move.to] }, null, 2) + '\n');
console.log(`✓ Related origins for passkeys of ${move.from}: ${move.to}`);
