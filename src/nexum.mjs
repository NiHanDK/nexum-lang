// NEXUM runtime: parser, linter and translator.
// Zero dependencies. Works in Node and in the browser (it is inlined into dist/translator.html and dist/nx.mjs).
// It operates on the compiled registry (dist/registry.json), never on the YAML directly.

const KEY_RE = /^([a-z][a-z0-9]*):(.*)$/s;
const HEADER_RE = /^@nx(\d+)\.(\d+)\s+(\S+)\s+([a-z][a-z0-9]*)>([a-z][a-z0-9]*)\s+([a-z]+)\s+([#^])(\S+)\s*$/;
const REF_RE = /\$[a-z0-9]+/g;

// ---------------------------------------------------------------- tokenizing

/** Split one record line into tokens. Returns {tokens, error}. */
export function tokenizeLine(line) {
  const tokens = [];
  let i = 0;
  const n = line.length;
  while (i < n) {
    while (i < n && line[i] === ' ') i++;
    if (i >= n) break;
    let bare = '';
    while (i < n && line[i] !== ' ' && line[i] !== '"') bare += line[i++];
    if (i < n && line[i] === '"') {
      const keyMatch = bare === '' ? null : KEY_RE.exec(bare);
      if (bare !== '' && !(keyMatch && keyMatch[2] === '')) {
        return { tokens, error: `unexpected quote after "${bare}" (quote the whole value)` };
      }
      i++; // opening quote
      let value = '';
      let closed = false;
      while (i < n) {
        const c = line[i];
        if (c === '\\' && i + 1 < n && (line[i + 1] === '"' || line[i + 1] === '\\')) {
          value += line[i + 1];
          i += 2;
          continue;
        }
        if (c === '"') { closed = true; i++; break; }
        value += c;
        i++;
      }
      if (!closed) return { tokens, error: 'missing closing quote' };
      if (i < n && line[i] !== ' ') return { tokens, error: 'text directly after a closing quote' };
      tokens.push({ key: keyMatch ? keyMatch[1] : null, value, quoted: true });
    } else {
      const m = tokens.length > 0 ? KEY_RE.exec(bare) : null;
      if (m) {
        if (m[2] === '') return { tokens, error: `key "${m[1]}:" has no value` };
        tokens.push({ key: m[1], value: m[2], quoted: false });
      } else {
        tokens.push({ key: null, value: bare, quoted: false });
      }
    }
  }
  return { tokens, error: null };
}

// ---------------------------------------------------------------- parsing

/** Split text that may contain several messages into message texts (each starts with @nx). */
export function splitMessages(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let cur = null;
  let inHuman = false;
  for (const line of lines) {
    if (line.startsWith('@nx') && !inHuman) {
      if (cur) out.push(cur.join('\n'));
      cur = [line];
      continue;
    }
    if (line.startsWith('@nx') && inHuman && HEADER_RE.test(line.trim())) {
      // a new header after human text starts a new message
      out.push(cur.join('\n'));
      cur = [line];
      inHuman = false;
      continue;
    }
    if (!cur) continue;
    if (line.trim() === '---') inHuman = true;
    cur.push(line);
  }
  if (cur) out.push(cur.join('\n'));
  return out;
}

/** Parse one message. Returns {header, records, human, problems}. Never throws. */
export function parseMessage(text) {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const problems = [];
  let idx = 0;
  while (idx < lines.length && lines[idx].trim() === '') idx++;
  const headerLine = (lines[idx] || '').trim();
  const hm = HEADER_RE.exec(headerLine);
  let header = null;
  if (!hm) {
    problems.push({ level: 'error', line: idx + 1, msg: 'first line must be: @nx<major>.<minor> <packs> <from>><to> <type> #<id> (or ^<id> for a reply)' });
  } else {
    header = {
      major: Number(hm[1]),
      minor: Number(hm[2]),
      packs: hm[3].split(',').filter(Boolean),
      from: hm[4],
      to: hm[5],
      type: hm[6],
      reply: hm[7] === '^',
      id: hm[8],
    };
  }
  const records = [];
  let human = null;
  for (let i = idx + 1; i < lines.length; i++) {
    const raw = lines[i];
    if (raw.trim() === '---') {
      human = lines.slice(i + 1).join('\n');
      break;
    }
    if (raw.trim() === '') continue;
    const { tokens, error } = tokenizeLine(raw.trim());
    if (error) {
      problems.push({ level: 'error', line: i + 1, msg: error });
      continue;
    }
    const [first, ...rest] = tokens;
    records.push({ line: i + 1, raw: raw.trim(), code: first.value, args: rest.filter(t => !t.key), keys: rest.filter(t => t.key), tokens: rest });
  }
  return { header, records, human, problems };
}

// ---------------------------------------------------------------- registry helpers

/** Records available for a message that declares `packs`. Core is always included. */
export function resolvePacks(registry, packs) {
  const declared = ['core', ...packs.filter(p => p !== 'core')];
  const unknownPacks = declared.filter(p => !registry.packs[p]);
  const known = declared.filter(p => registry.packs[p]);
  const records = {};
  for (const p of known) {
    for (const [code, rec] of Object.entries(registry.packs[p].records || {})) {
      records[code] = { ...rec, keys: { ...(rec.keys || {}) }, pack: p };
    }
  }
  for (const p of known) {
    for (const [code, ext] of Object.entries(registry.packs[p].extends || {})) {
      if (!records[code]) continue;
      for (const [k, def] of Object.entries(ext.keys || {})) records[code].keys[k] = { ...def, pack: p };
    }
  }
  return { records, known, unknownPacks };
}

/** Which pack defines record `code` (any pack in the registry), or null. */
export function packOfRecord(registry, code) {
  for (const [p, def] of Object.entries(registry.packs)) if (def.records && def.records[code]) return p;
  return null;
}

function enumValues(registry, spec) {
  if (spec.values) return spec.values;
  if (spec.set) return registry.sets[spec.set] || {};
  return null;
}

/** Check one value against an arg or key spec. Returns an error string or null. */
export function checkValue(registry, spec, value) {
  const values = enumValues(registry, spec);
  if (values) {
    if (!Object.prototype.hasOwnProperty.call(values, value)) return `"${value}" is not one of ${Object.keys(values).join('|')}`;
    return null;
  }
  if (spec.type === 'amount') {
    const units = Object.keys(spec.units || {});
    const m = /^([0-9]+(?:\.[0-9]+)?)([a-z]+)$/.exec(value);
    if (!m || !units.includes(m[2])) return `"${value}" must be a number followed by one of ${units.join('|')}`;
    return null;
  }
  const type = registry.types[spec.type];
  if (type && type.pattern && !new RegExp(type.pattern).test(value)) return `"${value}" is not a valid ${type.en}`;
  if (spec.pattern && !new RegExp(spec.pattern).test(value)) return `"${value}" does not match the expected format`;
  if (value === '') return 'empty value';
  return null;
}

// ---------------------------------------------------------------- roster

/** Parse a roster.yaml (agents: {code: name}). Tiny parser for a flat map; also accepts code: name at top level. */
export function parseRoster(text) {
  const agents = {};
  if (!text) return agents;
  for (const rawLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.replace(/\s+#.*$/, '');
    const m = /^\s*([a-z][a-z0-9]*)\s*:\s*(.+?)\s*$/.exec(line);
    if (!m || m[1] === 'agents') continue;
    agents[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return agents;
}

// ---------------------------------------------------------------- linting

/**
 * Lint one message. Returns a list of problems {level: 'error'|'warning', line, msg}.
 * Warnings are the fallback cases (unknown pack, newer minor version, unknown record): the message is still usable.
 */
export function lintMessage(registry, text, roster = null) {
  const parsed = parseMessage(text);
  const problems = [...parsed.problems];
  const { header } = parsed;
  if (!header) return problems;
  const [regMajor, regMinor] = registry.version.split('.').map(Number);
  const add = (level, line, msg) => problems.push({ level, line, msg });

  if (header.major !== regMajor) add('error', 1, `message is nx${header.major}.${header.minor} but this registry is ${registry.version}; sync that major version`);
  else if (header.minor > regMinor) add('warning', 1, `message is nx${header.major}.${header.minor}, newer than ${registry.version}; sync it, until then unknown records are ignored`);

  const { records: table, unknownPacks } = resolvePacks(registry, header.packs);
  for (const p of unknownPacks) add('warning', 1, `unknown pack "${p}"; sync it, until then its records are ignored`);

  const agents = { ...registry.reserved_agents, ...(roster || {}) };
  if (roster) {
    for (const who of [header.from, header.to]) if (!agents[who]) add('error', 1, `agent "${who}" is not in roster.yaml`);
  }
  if (!registry.message_types[header.type]) add('error', 1, `unknown message type "${header.type}" (${Object.keys(registry.message_types).join('|')})`);

  const defs = new Set();
  const seenIds = {};
  const usedPacks = new Set(['core']);
  const known = []; // records that passed lookup, with resolved arg values

  for (const r of parsed.records) {
    const rec = table[r.code];
    if (!rec) {
      const owner = packOfRecord(registry, r.code);
      if (owner && !unknownPacks.includes(owner)) add('error', r.line, `record "${r.code}" is in pack "${owner}"; declare it in the first line`);
      else add('warning', r.line, `unknown record "${r.code}"; ignored (sync the language if this is from a newer version)`);
      continue;
    }
    usedPacks.add(rec.pack);
    // positional/keys order
    let sawKey = false;
    for (const t of r.tokens) {
      if (t.key) sawKey = true;
      else if (sawKey) { add('error', r.line, `positional value "${t.value}" after a key:value; required values come first`); break; }
    }
    const specs = rec.args || [];
    const required = specs.filter(a => !a.optional).length;
    if (r.args.length < required) add('error', r.line, `"${r.code}" needs ${required} value(s): ${signature(rec, r.code, registry.sets)}`);
    if (r.args.length > specs.length) add('error', r.line, `"${r.code}" takes at most ${specs.length} value(s): ${signature(rec, r.code, registry.sets)}`);
    const vals = {};
    specs.forEach((spec, i) => {
      const tok = r.args[i];
      if (!tok) return;
      vals[spec.name] = tok.value;
      if (tok.value === '-' && !tok.quoted && (spec.none_ok || spec.optional)) return;
      const err = checkValue(registry, spec, tok.value);
      if (err) add('error', r.line, `${r.code} ${spec.name}: ${err}`);
    });
    // keys
    const seenKeys = new Set();
    for (const k of r.keys) {
      const spec = rec.keys[k.key];
      if (!spec) {
        add('error', r.line, `"${r.code}" has no key "${k.key}:" (known: ${Object.keys(rec.keys).join(', ') || 'none'}); quote values that contain ":"`);
        continue;
      }
      if (spec.pack) usedPacks.add(spec.pack);
      if (seenKeys.has(k.key) && !rec.repeat_keys) add('error', r.line, `key "${k.key}:" given twice`);
      seenKeys.add(k.key);
      const err = checkValue(registry, spec, k.value);
      if (err) add('error', r.line, `${r.code} ${k.key}: ${err}`);
    }
    if (rec.min_keys && r.keys.length < rec.min_keys) add('error', r.line, `"${r.code}" needs at least ${rec.min_keys} key:value pair(s)`);
    for (const rule of rec.required_when || []) {
      const [onArg, allowed] = Object.entries(rule.when)[0];
      if (allowed.includes(vals[onArg]) && (vals[rule.arg] === undefined || vals[rule.arg] === '-')) {
        add('error', r.line, `"${r.code}" with ${onArg} ${vals[onArg]} needs a ${rule.arg}`);
      }
    }
    // special rules
    if (r.code === 'def' && vals.name) {
      if (defs.has(vals.name)) add('error', r.line, `${vals.name} is defined twice`);
      defs.add(vals.name);
    }
    if (r.code === 'txt' && vals.text) {
      const words = vals.text.trim().split(/\s+/).length;
      const max = registry.limits.txt_max_words;
      if (words > max) add('error', r.line, `txt has ${words} words (max ${max}); put longer text after ---`);
    }
    if ((r.code === 'q' || r.code === 'hyp') && vals.id) {
      const k = `${r.code}:${vals.id}`;
      if (seenIds[k]) add('warning', r.line, `${r.code} id "${vals.id}" used twice`);
      seenIds[k] = true;
    }
    for (const k of r.keys) if ((k.key === 'by' || k.key === 'to') && roster && !agents[k.value]) add('error', r.line, `agent "${k.value}" is not in roster.yaml`);
    known.push({ r, rec, vals });
  }

  // references: defs are valid only inside their own message
  for (const { r } of known) {
    const values = r.tokens.map(t => t.value);
    for (const [i, v] of values.entries()) {
      if (r.code === 'def' && i === 0) continue;
      for (const ref of v.match(REF_RE) || []) {
        if (!defs.has(ref)) add('warning', r.line, `${ref} is not defined in this message (a def is valid only inside its own message)`);
      }
    }
  }

  // declared but unused packs (agents should declare as few as possible)
  for (const p of header.packs) {
    if (p !== 'core' && registry.packs[p] && !usedPacks.has(p)) add('warning', 1, `pack "${p}" is declared but not used; declare as few packs as possible`);
  }

  // message type requirements
  const mt = registry.message_types[header.type];
  if (mt) {
    for (const req of mt.requires || []) {
      const [kind, matchers] = Object.entries(req)[0];
      const count = known.filter(({ r, vals }) => matchers.some(m => m.record === r.code && Object.entries(m.where || {}).every(([a, vs]) => vs.includes(vals[a])))).length;
      const desc = matchers.map(m => m.where ? `${m.record} ${Object.values(m.where)[0].join('/')}` : m.record).join(' or ');
      if (kind === 'at_least_one_of' && count < 1) add('error', 1, `a "${header.type}" message needs at least one ${desc}`);
      if (kind === 'exactly_one_of' && count !== 1) add('error', 1, `a "${header.type}" message needs exactly one ${desc} (found ${count})`);
    }
  }
  return problems.sort((a, b) => a.line - b.line);
}

// ---------------------------------------------------------------- signatures (cards, spec, errors)

/** Human/agent-readable signature, e.g. `ac <id> <result> ["note"] [fix:] `. */
export function signature(rec, code, sets = null) {
  const parts = [code];
  for (const a of rec.args || []) {
    let s;
    if (a.hint) s = `<${a.hint}>`;
    else if (a.set) s = `<${a.set}>`;
    else if (a.values) s = `<${Object.keys(a.values).join('|')}>`;
    else if (a.type === 'text') s = `"${a.name}"`;
    else if (a.type === 'amount') s = `<number+${Object.keys(a.units).join('|')}>`;
    else if (a.type === 'pct') s = '<0-100>';
    else if (a.type === 'ratio') s = '<passed/total>';
    else s = `<${a.name}>`;
    if (a.none_ok) s = s.replace(/>$/, '|->');
    parts.push(a.optional ? `[${s}]` : s);
  }
  for (const [k, spec] of Object.entries(rec.keys || {})) {
    const vs = spec.values ? Object.keys(spec.values).join('|') : spec.set && sets && sets[spec.set] ? Object.keys(sets[spec.set]).join('|') : spec.type === 'pct' ? '0-100' : '';
    parts.push(vs ? `${k}:${vs}` : `${k}:`);
  }
  return parts.join(' ');
}

// ---------------------------------------------------------------- translating

function expandRefs(value, defs) {
  return value.replace(REF_RE, ref => (defs[ref] !== undefined ? defs[ref] : ref));
}

function label(registry, spec, value) {
  const values = enumValues(registry, spec);
  if (values && values[value] !== undefined) return values[value];
  if (spec.type === 'amount') {
    const m = /^([0-9.]+)([a-z]+)$/.exec(value);
    if (m && spec.units[m[2]]) return `${m[1]} ${spec.units[m[2]]}`;
  }
  return value;
}

function render(template, vals) {
  const filled = template.replace(/\[([^\[\]]*)\]/g, (_, inner) => {
    const names = [...inner.matchAll(/\{(\w+)\}/g)].map(m => m[1]);
    return names.every(nm => vals[nm] !== undefined) ? inner : '';
  });
  return filled.replace(/\{(\w+)\}/g, (_, nm) => (vals[nm] !== undefined ? vals[nm] : ''));
}

/**
 * Translate one message to English. Deterministic. Returns {lines, problems}.
 * Unknown records are shown raw and marked as unknown (fallback rule). Every value is kept.
 */
export function translateMessage(registry, text, roster = null) {
  const parsed = parseMessage(text);
  const problems = lintMessage(registry, text, roster);
  const lines = [];
  const h = parsed.header;
  if (!h) {
    lines.push('[not a NEXUM message]');
    return { lines, problems };
  }
  const agents = { ...registry.reserved_agents, ...(roster || {}) };
  const who = c => (agents[c] ? `${agents[c]} (${c})` : c);
  const mt = registry.message_types[h.type];
  const kind = mt ? mt.en : `unknown type "${h.type}"`;
  const ref = h.reply ? `Reply to #${h.id}` : `Message #${h.id}`;
  lines.push(`${ref} from ${who(h.from)} to ${who(h.to)}: ${kind}. [NEXUM ${h.major}.${h.minor}; packs: ${['core', ...h.packs.filter(p => p !== 'core')].join(', ')}]`);

  const { records: table } = resolvePacks(registry, h.packs);
  const defs = {};
  for (const r of parsed.records) if (r.code === 'def' && r.args.length >= 2) defs[r.args[0].value] = r.args[1].value;
  for (const r of parsed.records) {
    const rec = table[r.code];
    if (!rec) {
      lines.push(`[unknown record, not in nx${h.major}.${h.minor} ${h.packs.join(',')}] ${r.raw}`);
      continue;
    }
    const vals = {};
    (rec.args || []).forEach((spec, i) => {
      const tok = r.args[i];
      if (!tok) return;
      if (tok.value === '-' && !tok.quoted && (spec.none_ok || spec.optional)) return;
      vals[spec.name] = r.code === 'def' && i === 0 ? tok.value : label(registry, spec, expandRefs(tok.value, defs));
    });
    // extra positional values beyond the spec are kept, not dropped
    const extra = r.args.slice((rec.args || []).length).map(t => expandRefs(t.value, defs));
    let line = render(rec.en, vals);
    const keyParts = r.keys.map(k => {
      const spec = rec.keys[k.key];
      const v = expandRefs(k.value, defs);
      return spec ? `${spec.en}: ${label(registry, spec, v)}` : `${k.key}: ${v}`;
    });
    if (extra.length) keyParts.push(`extra values: ${extra.join(' ')}`);
    if (keyParts.length) line += (rec.args || []).length === 0 ? `: ${keyParts.join('; ')}` : ` (${keyParts.join('; ')})`;
    lines.push(line);
  }
  if (parsed.human !== null) {
    lines.push('Text for humans (verbatim):');
    lines.push(parsed.human);
  }
  return { lines, problems };
}

/** Translate text that may hold several messages. */
export function translate(registry, text, roster = null) {
  return splitMessages(text).map(m => translateMessage(registry, m, roster));
}

/** Lint text that may hold several messages. */
export function lint(registry, text, roster = null) {
  return splitMessages(text).map(m => ({ message: m.split('\n')[0], problems: lintMessage(registry, m, roster) }));
}
