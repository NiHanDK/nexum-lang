// Fails if a generated agent card exceeds its budget in budgets.yaml. There is no override flag.
// Usage: node tools/check-budget.mjs [--base <git ref>]
//   --base: also fail if budgets.yaml and the registry are changed in the same PR (budgets need their own PR).
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import YAML from 'yaml';
import { loadRegistry } from '../src/registry.mjs';
import { cardText } from '../src/generate.mjs';
import { countTokens } from './tokens.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

export async function checkBudget(registry, budgets) {
  const failures = [];
  const report = [];
  const tokens = {};
  let method = '';
  for (const p of Object.keys(registry.packs)) {
    const c = await countTokens(cardText(registry, p));
    tokens[p] = c.tokens;
    method = c.method;
    const max = p === 'core' ? budgets.core.max_tokens : budgets.pack.max_tokens;
    report.push(`${p.padEnd(8)} ${String(c.tokens).padStart(5)} / ${max} tokens`);
    if (c.tokens > max) failures.push(`card "${p}" is ${c.tokens} tokens, budget ${max}`);
  }
  const coreRecords = Object.keys(registry.packs.core.records).length;
  report.push(`core records ${coreRecords} / ${budgets.core.max_records}`);
  if (coreRecords > budgets.core.max_records) failures.push(`core has ${coreRecords} records, budget ${budgets.core.max_records}`);
  const typical = budgets.typical.packs.reduce((sum, p) => sum + (tokens[p] || 0), 0);
  report.push(`typical (${budgets.typical.packs.join('+')}) ${typical} / ${budgets.typical.max_tokens} tokens`);
  if (typical > budgets.typical.max_tokens) failures.push(`typical message load is ${typical} tokens, budget ${budgets.typical.max_tokens}`);
  return { failures, report, method };
}

function changedFiles(base) {
  return execFileSync('git', ['diff', '--name-only', `${base}...HEAD`], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const registry = loadRegistry(root);
  const budgets = YAML.parse(readFileSync(join(root, 'budgets.yaml'), 'utf8'));
  const { failures, report, method } = await checkBudget(registry, budgets);
  console.log(`Budget check (${method})`);
  for (const l of report) console.log(`  ${l}`);
  const baseIdx = process.argv.indexOf('--base');
  if (baseIdx > 0) {
    const files = changedFiles(process.argv[baseIdx + 1]);
    if (files.includes('budgets.yaml') && files.some(f => f.startsWith('registry/'))) {
      failures.push('budgets.yaml and registry/ changed in the same PR; change budgets in a separate PR');
    }
  }
  if (failures.length) {
    console.error(`\nBudget check FAILED:\n- ${failures.join('\n- ')}`);
    console.error('There is no override. Trim the cards, move records to a narrower pack, or raise the budget in a separate PR (Nicolai only).');
    process.exit(1);
  }
  console.log('Budget check passed.');
}
