// Loads registry/*.yaml, validates the schema and compiles it into one JSON object (dist/registry.json).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import YAML from 'yaml';

const CODE_RE = /^[a-z]+$/;

/** Load and compile the registry in `dir` (the repo root). Throws with all schema problems listed. */
export function loadRegistry(dir) {
  const lang = YAML.parse(readFileSync(join(dir, 'registry/language.yaml'), 'utf8'));
  const packFiles = [join(dir, 'registry/core.yaml')];
  const packDir = join(dir, 'registry/packs');
  if (existsSync(packDir)) {
    for (const f of readdirSync(packDir).sort()) if (f.endsWith('.yaml')) packFiles.push(join(packDir, f));
  }
  const packs = {};
  const sets = { ...lang.sets };
  for (const file of packFiles) {
    const p = YAML.parse(readFileSync(file, 'utf8'));
    if (packs[p.pack]) throw new Error(`pack "${p.pack}" defined twice`);
    for (const [name, values] of Object.entries(p.sets || {})) {
      if (sets[name]) throw new Error(`set "${name}" in pack ${p.pack} already exists`);
      sets[name] = values;
    }
    packs[p.pack] = {
      description: p.description || '',
      records: p.records || {},
      extends: p.extends || {},
      sets: Object.keys(p.sets || {}),
    };
  }
  const registry = {
    name: lang.name,
    tag: lang.tag,
    version: lang.version,
    repository: lang.repository,
    reserved_agents: lang.reserved_agents,
    message_types: lang.message_types,
    sets,
    types: lang.types,
    limits: lang.limits,
    card_intro: lang.card_intro,
    packs,
  };
  const problems = validateRegistry(registry);
  if (problems.length) throw new Error(`registry is invalid:\n- ${problems.join('\n- ')}`);
  return registry;
}

function checkSpec(registry, where, spec, problems) {
  const kinds = ['type', 'set', 'values'].filter(k => spec[k] !== undefined);
  if (kinds.length !== 1) problems.push(`${where}: needs exactly one of type, set, values`);
  if (spec.type && spec.type !== 'amount' && !registry.types[spec.type]) problems.push(`${where}: unknown type "${spec.type}"`);
  if (spec.type === 'amount' && !spec.units) problems.push(`${where}: amount needs units`);
  if (spec.set && !registry.sets[spec.set]) problems.push(`${where}: unknown set "${spec.set}"`);
  if (spec.pattern) {
    try { new RegExp(spec.pattern); } catch { problems.push(`${where}: bad pattern`); }
  }
}

/** Schema checks. Returns a list of problem strings. */
export function validateRegistry(registry) {
  const problems = [];
  if (!/^\d+\.\d+\.\d+$/.test(registry.version)) problems.push('version must be MAJOR.MINOR.PATCH');
  if (!registry.packs.core) problems.push('core pack missing');
  const owner = {};
  for (const [pname, pack] of Object.entries(registry.packs)) {
    if (!CODE_RE.test(pname)) problems.push(`pack name "${pname}" must be lowercase letters`);
    for (const [code, rec] of Object.entries(pack.records)) {
      const w = `${pname}.${code}`;
      if (!CODE_RE.test(code)) problems.push(`${w}: record code must be lowercase letters`);
      if (owner[code]) problems.push(`${w}: record code already used by pack ${owner[code]}`);
      owner[code] = pname;
      if (!rec.meaning) problems.push(`${w}: missing meaning`);
      if (!rec.en) problems.push(`${w}: missing en template`);
      if (!rec.example) problems.push(`${w}: missing example`);
      let sawOptional = false;
      const names = new Set();
      for (const a of rec.args || []) {
        if (!a.name) problems.push(`${w}: arg without name`);
        names.add(a.name);
        if (a.optional) sawOptional = true;
        else if (sawOptional) problems.push(`${w}.${a.name}: required arg after an optional one`);
        checkSpec(registry, `${w}.${a.name}`, a, problems);
      }
      for (const [k, spec] of Object.entries(rec.keys || {})) {
        if (!CODE_RE.test(k)) problems.push(`${w} key ${k}: must be lowercase letters`);
        if (!spec.en) problems.push(`${w} key ${k}: missing en label`);
        checkSpec(registry, `${w} key ${k}`, spec, problems);
      }
      for (const rule of rec.required_when || []) {
        if (!names.has(rule.arg)) problems.push(`${w}: required_when names unknown arg ${rule.arg}`);
        for (const a of Object.keys(rule.when || {})) if (!names.has(a)) problems.push(`${w}: required_when uses unknown arg ${a}`);
      }
      for (const m of rec.en.matchAll(/\{(\w+)\}/g)) if (!names.has(m[1])) problems.push(`${w}: en template uses unknown arg {${m[1]}}`);
    }
  }
  for (const [pname, pack] of Object.entries(registry.packs)) {
    for (const [code, ext] of Object.entries(pack.extends)) {
      const target = owner[code];
      if (!target) problems.push(`${pname} extends unknown record ${code}`);
      else if (target === pname) problems.push(`${pname} extends its own record ${code}`);
      for (const [k, spec] of Object.entries(ext.keys || {})) {
        if (target && registry.packs[target].records[code].keys?.[k]) problems.push(`${pname} extends ${code} with key ${k} that already exists`);
        if (!spec.en) problems.push(`${pname} extends ${code} key ${k}: missing en label`);
        checkSpec(registry, `${pname} extends ${code} key ${k}`, spec, problems);
      }
      for (const other of Object.keys(ext)) if (other !== 'keys') problems.push(`${pname} extends ${code}: only "keys" can be extended in v1`);
    }
  }
  for (const [t, mt] of Object.entries(registry.message_types)) {
    if (!mt.en) problems.push(`message type ${t}: missing en`);
    for (const req of mt.requires || []) {
      const [kind, matchers] = Object.entries(req)[0];
      if (!['at_least_one_of', 'exactly_one_of'].includes(kind)) problems.push(`message type ${t}: unknown requirement ${kind}`);
      for (const m of matchers) if (owner[m.record] !== 'core') problems.push(`message type ${t}: requirement must use a core record, not ${m.record}`);
    }
  }
  return problems;
}
