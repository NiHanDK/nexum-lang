// Builds dist/ from registry/. Run: npm run build
// dist/ is committed so setups and the release workflow can use it directly; CI fails if it is out of date.
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../src/registry.mjs';
import { cardText, specText, bundleCli, translatorHtml } from '../src/generate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

const registry = loadRegistry(root);
const runtimeSrc = readFileSync(join(root, 'src/nexum.mjs'), 'utf8');
const cliSrc = readFileSync(join(root, 'src/cli-main.mjs'), 'utf8');

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'cards'), { recursive: true });

const cards = {};
for (const p of Object.keys(registry.packs)) {
  cards[p] = cardText(registry, p);
  writeFileSync(join(dist, 'cards', `${p}.md`), cards[p]);
}
writeFileSync(join(dist, 'registry.json'), JSON.stringify(registry, null, 2) + '\n');
writeFileSync(join(dist, 'SPEC.md'), specText(registry));
writeFileSync(join(dist, 'nx.mjs'), bundleCli(registry, cards, runtimeSrc, cliSrc), { mode: 0o755 });
writeFileSync(join(dist, 'translator.html'), translatorHtml(registry, runtimeSrc));

console.log(`built NEXUM ${registry.version}: ${Object.keys(registry.packs).join(', ')}`);
