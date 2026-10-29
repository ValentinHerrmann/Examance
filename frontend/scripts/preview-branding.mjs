// Post-build: preview builds get their own installed-app name ("Examance Preview") so the preview and production PWAs can sit side by side. Same preview rule as vite.config.ts; edits only build/, never static/.
import fs from 'node:fs';

const branch = process.env.CF_PAGES_BRANCH;
if (!branch || branch === 'release') process.exit(0);

const NAME = 'Examance Preview';
const manifestPath = 'build/manifest.json';
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
manifest.name = NAME;
manifest.short_name = NAME;
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');

for (const file of fs.readdirSync('build').filter((f) => f.endsWith('.html'))) {
  const path = `build/${file}`;
  const html = fs
    .readFileSync(path, 'utf8')
    .replace('<title>Examance', `<title>${NAME}`)
    .replace('name="apple-mobile-web-app-title" content="Examance"', `name="apple-mobile-web-app-title" content="${NAME}"`);
  fs.writeFileSync(path, html);
}
console.log(`✓ Preview branding applied (${NAME})`);
