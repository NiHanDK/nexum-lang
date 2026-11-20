// Compares the registry with the last released version and enforces the versioning rules:
//   breaking change  -> MAJOR must go up (Nicolai only, via CODEOWNERS)
//   additive change  -> MINOR must go up
//   wording change   -> flagged for human review; PATCH (or more) must go up
// Usage: node tools/check-compat.mjs [--against <git ref>]   (default: newest v* tag)
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRegistry } from '../src/registry.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

function valuesOf(reg, spec) {
  if (spec.values) return spec.values;
  if (spec.set) return reg.sets[spec.set] || {};
  return null;
}

function compareSpec(oldR, newR, where, a, b, out) {
  const av = valuesOf(oldR, a);
  const bv = valuesOf(newR, b);
  if (!!av !== !!bv || (!av && a.type !== b.type)) {
    out.breaking.push(`${where}: kind of value changed`);
    return;
  }
  if (a.pattern !== b.pattern) out.breaking.push(`${where}: format changed`);
  if (a.type === 'amount') {
    for (const u of Object.keys(a.units)) if (!(b.units || {})[u]) out.breaking.push(`${where}: unit ${u} removed`);
    for (const u of Object.keys(b.units || {})) if (!a.units[u]) out.additive.push(`${where}: unit ${u} added`);
  }
  if (av) {
    for (const [k, label] of Object.entries(av)) {
      if (!(k in bv)) out.breaking.push(`${where}: value ${k} removed`);
      else if (bv[k] !== label) out.review.push(`${where}: label of ${k} changed ("${label}" -> "${bv[k]}")`);
    }
    for (const k of Object.keys(bv)) if (!(k in av)) out.additive.push(`${where}: value ${k} added`);
  }
  if (a.en !== undefined && a.en !== b.en) out.review.push(`${where}: label changed ("${a.en}" -> "${b.en}")`);
}

/** Classify every difference between two compiled registries. */
export function diffRegistries(oldR, newR) {
  const out = { breaking: [], additive: [], review: [] };
  for (const [t, mt] of Object.entries(oldR.message_types)) {
    if (!newR.message_types[t]) out.breaking.push(`message type ${t} removed`);
    else if (JSON.stringify(mt.requires) !== JSON.stringify(newR.message_types[t].requires)) out.breaking.push(`message type ${t}: requirements changed`);
    else if (mt.en !== newR.message_types[t].en) out.review.push(`message type ${t}: meaning text changed`);
  }
  for (const t of Object.keys(newR.message_types)) if (!oldR.message_types[t]) out.additive.push(`message type ${t} added`);
  for (const a of Object.keys(oldR.reserved_agents)) if (!newR.reserved_agents[a]) out.breaking.push(`reserved agent ${a} removed`);
  for (const a of Object.keys(newR.reserved_agents)) if (!oldR.reserved_agents[a]) out.breaking.push(`reserved agent ${a} added (may clash with existing rosters)`);
  if (oldR.limits.txt_max_words > newR.limits.txt_max_words) out.breaking.push('txt word limit lowered');
  if (oldR.card_intro !== newR.card_intro) out.review.push('card intro (syntax rules) text changed');

  for (const [p, pack] of Object.entries(oldR.packs)) {
    const np = newR.packs[p];
    if (!np) {
      out.breaking.push(`pack ${p} removed`);
      continue;
    }
    for (const [code, rec] of Object.entries(pack.records)) {
      const nr = np.records[code];
      const w = `${p}.${code}`;
      if (!nr) {
        out.breaking.push(`${w}: record removed`);
        continue;
      }
      const oa = rec.args || [];
      const na = nr.args || [];
      if (oa.length !== na.length) out.breaking.push(`${w}: number of values changed (${oa.length} -> ${na.length})`);
      oa.forEach((a, i) => {
        const b = na[i];
        if (!b) return;
        if (!!a.optional !== !!b.optional) out.breaking.push(`${w}.${a.name}: optional/required changed`);
        if (!!a.none_ok && !b.none_ok) out.breaking.push(`${w}.${a.name}: no longer accepts -`);
        if (!a.none_ok && b.none_ok) out.additive.push(`${w}.${a.name}: now accepts -`);
        compareSpec(oldR, newR, `${w}.${a.name}`, a, b, out);
      });
      for (const [k, spec] of Object.entries(rec.keys || {})) {
        if (!(nr.keys || {})[k]) out.breaking.push(`${w}: key ${k} removed`);
        else compareSpec(oldR, newR, `${w} key ${k}`, spec, nr.keys[k], out);
      }
      for (const k of Object.keys(nr.keys || {})) if (!(rec.keys || {})[k]) out.additive.push(`${w}: key ${k} added`);
      if (JSON.stringify(rec.required_when || []) !== JSON.stringify(nr.required_when || [])) out.breaking.push(`${w}: required_when changed`);
      if ((nr.min_keys || 0) > (rec.min_keys || 0)) out.breaking.push(`${w}: min_keys raised`);
      if (!!rec.repeat_keys && !nr.repeat_keys) out.breaking.push(`${w}: keys may no longer repeat`);
      if (rec.meaning !== nr.meaning) out.review.push(`${w}: meaning text changed ("${rec.meaning}" -> "${nr.meaning}")`);
      if (rec.en !== nr.en) out.review.push(`${w}: English template changed`);
    }
    for (const code of Object.keys(np.records)) if (!pack.records[code]) out.additive.push(`${p}.${code}: record added`);
    for (const [code, ext] of Object.entries(pack.extends || {})) {
      for (const k of Object.keys(ext.keys || {})) {
        if (!np.extends?.[code]?.keys?.[k]) out.breaking.push(`${p} extends ${code}: key ${k} removed`);
        else compareSpec(oldR, newR, `${p} extends ${code} key ${k}`, ext.keys[k], np.extends[code].keys[k], out);
      }
    }
    for (const [code, ext] of Object.entries(np.extends || {})) {
      for (const k of Object.keys(ext.keys || {})) if (!pack.extends?.[code]?.keys?.[k]) out.additive.push(`${p} extends ${code}: key ${k} added`);
    }
  }
  for (const p of Object.keys(newR.packs)) if (!oldR.packs[p]) out.additive.push(`pack ${p} added`);
  return out;
}

const parseV = v => v.split('.').map(Number);

/** Returns a list of version-rule failures. */
export function versionFailures(oldV, newV, diff) {
  const [oM, om, op] = parseV(oldV);
  const [nM, nm, np] = parseV(newV);
  const cmp = nM - oM || nm - om || np - op;
  const f = [];
  if (cmp < 0) f.push(`version went down (${oldV} -> ${newV})`);
  if (diff.breaking.length && nM <= oM) f.push(`breaking changes need a new MAJOR version (have ${newV}, last release ${oldV}); only Nicolai may approve this`);
  if (!diff.breaking.length && nM > oM) f.push('MAJOR version raised without a breaking change');
  if (diff.additive.length && !diff.breaking.length && !(nM === oM && nm > om)) f.push(`additive changes need a new MINOR version (have ${newV}, last release ${oldV})`);
  if (diff.review.length && !diff.additive.length && !diff.breaking.length && cmp <= 0) f.push(`wording changes need at least a new PATCH version (have ${newV})`);
  return f;
}

function lastTag() {
  try {
    const tags = execFileSync('git', ['tag', '--list', 'v*', '--sort=-v:refname'], { cwd: root, encoding: 'utf8' }).split('\n').filter(Boolean);
    return tags[0] || null;
  } catch {
    return null;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--against');
  const ref = i > 0 ? process.argv[i + 1] : lastTag();
  const current = loadRegistry(root);
  if (!ref) {
    console.log(`No earlier release found; ${current.version} is the first. Compatibility check skipped.`);
    process.exit(0);
  }
  let old;
  try {
    old = JSON.parse(execFileSync('git', ['show', `${ref}:dist/registry.json`], { cwd: root, encoding: 'utf8' }));
  } catch {
    console.error(`Could not read dist/registry.json at ${ref}.`);
    process.exit(1);
  }
  const diff = diffRegistries(old, current);
  console.log(`Compatibility check: ${old.version} (${ref}) -> ${current.version}`);
  for (const [kind, items] of Object.entries(diff)) {
    if (!items.length) continue;
    console.log(`\n${kind.toUpperCase()}:`);
    for (const it of items) console.log(`  - ${it}`);
  }
  if (diff.review.length) console.log('\nREVIEW items change meaning or wording. A human must confirm they do not change what existing messages mean.');
  const failures = versionFailures(old.version, current.version, diff);
  if (failures.length) {
    console.error(`\nCompatibility check FAILED:\n- ${failures.join('\n- ')}`);
    process.exit(1);
  }
  console.log('\nCompatibility check passed.');
}
