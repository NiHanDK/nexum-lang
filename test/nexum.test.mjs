import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { loadRegistry, validateRegistry } from '../src/registry.mjs';
import { tokenizeLine, lintMessage, translateMessage, translate, parseRoster, splitMessages, parseMessage } from '../src/nexum.mjs';
import { exampleMessage, cardText } from '../src/generate.mjs';
import { diffRegistries, versionFailures } from '../tools/check-compat.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const registry = loadRegistry(root);
const roster = parseRoster(readFileSync(join(root, 'examples/roster.yaml'), 'utf8'));
const errors = ps => ps.filter(p => p.level === 'error');
const warnings = ps => ps.filter(p => p.level === 'warning');
const clone = o => JSON.parse(JSON.stringify(o));

// ------------------------------------------------------------ registry

test('registry loads and is valid', () => {
  assert.equal(registry.name, 'NEXUM');
  assert.deepEqual(validateRegistry(registry), []);
  assert.ok(registry.packs.core && registry.packs.dev && registry.packs.bc && registry.packs.bcops);
});

test('schema validation catches mistakes', () => {
  const bad = clone(registry);
  bad.packs.dev.records.ac = clone(bad.packs.core.records.ac); // duplicate code
  bad.packs.core.records.v.args[0] = { name: 'status', set: 'nope' }; // unknown set
  bad.packs.core.records.f.en = 'Finding {missing}'; // unknown template arg
  const problems = validateRegistry(bad);
  assert.ok(problems.some(p => p.includes('already used by pack')));
  assert.ok(problems.some(p => p.includes('unknown set')));
  assert.ok(problems.some(p => p.includes('{missing}')));
});

// ------------------------------------------------------------ tokenizer

test('tokenizer: quotes, escapes and keys', () => {
  const { tokens, error } = tokenizeLine('f b "a b.al#12" "say \\"hi\\"" fix:"x: y" ac:4');
  assert.equal(error, null);
  assert.deepEqual(tokens.map(t => [t.key, t.value]), [[null, 'f'], [null, 'b'], [null, 'a b.al#12'], [null, 'say "hi"'], ['fix', 'x: y'], ['ac', '4']]);
});

test('tokenizer: errors', () => {
  assert.match(tokenizeLine('txt "open').error, /closing quote/);
  assert.match(tokenizeLine('txt ab"cd"').error, /quote/);
  assert.match(tokenizeLine('f b - "x" fix:').error, /no value/);
  assert.match(tokenizeLine('txt "a"b').error, /after a closing quote/);
});

test('roster parser', () => {
  assert.deepEqual(parseRoster('agents:\n  or: orchestrator  # main\n  cr: "code-reviewer"\n'), { or: 'orchestrator', cr: 'code-reviewer' });
});

// ------------------------------------------------------------ examples

const exampleFiles = readdirSync(join(root, 'examples')).filter(f => f.endsWith('.nx'));

for (const f of exampleFiles) {
  test(`example ${f} is valid and translates without losing values`, () => {
    const text = readFileSync(join(root, 'examples', f), 'utf8');
    const problems = lintMessage(registry, text, roster);
    assert.deepEqual(problems, [], JSON.stringify(problems));
    assertLossless(text);
  });
}

for (const [pname, pack] of Object.entries(registry.packs)) {
  for (const [code, rec] of Object.entries(pack.records)) {
    test(`registry example for ${pname}.${code} is valid and lossless`, () => {
      const msg = exampleMessage(registry, pname, rec.example);
      const problems = errors(lintMessage(registry, msg)).concat(warnings(lintMessage(registry, msg)).filter(p => !p.msg.includes('declared but not used')));
      assert.deepEqual(problems, [], `${rec.example}\n${JSON.stringify(problems)}`);
      assertLossless(msg);
    });
  }
}

/** Every value in the message (after $ref expansion) must appear in the English translation. */
function assertLossless(text) {
  const parsed = parseMessage(text);
  const defs = {};
  for (const r of parsed.records) if (r.code === 'def') defs[r.args[0].value] = r.args[1].value;
  const english = translateMessage(registry, text, roster).lines.join('\n');
  for (const r of parsed.records) {
    r.tokens.forEach((t, i) => {
      if (r.code === 'def' && i === 0) return;
      if (t.value === '-' && !t.quoted) return;
      const v = t.value.replace(/\$[a-z0-9]+/g, x => defs[x] ?? x);
      // enum codes are translated to labels; amounts to "6 hours": check the label instead
      const ok = english.includes(v) || english.includes(v.replace(/^(\d+)(h|d|sp)$/, (_, n, u) => `${n} ${{ h: 'hours', d: 'days', sp: 'story points' }[u]}`)) || isEnumCode(r.code, t, i);
      assert.ok(ok, `value "${v}" of "${r.raw}" missing from translation:\n${english}`);
    });
  }
  if (parsed.human !== null) assert.ok(english.includes(parsed.human), 'human text must be passed on verbatim');
}

/** Enum codes are translated to their labels, so they need not appear literally. */
function isEnumCode(code, token, index) {
  const pack = Object.values(registry.packs).find(p => p.records[code]);
  if (!pack) return false;
  const rec = pack.records[code];
  // positional tokens always come before keys, so a positional token's index is its arg index
  const spec = token.key
    ? rec.keys?.[token.key] || Object.values(registry.packs).map(p => p.extends?.[code]?.keys?.[token.key]).find(Boolean)
    : rec.args[index];
  return !!(spec && (spec.values || spec.set));
}

// ------------------------------------------------------------ linter rules

const head = (packs = 'core', type = 'upd') => `@nx1.0 ${packs} or>cr ${type} #1`;

test('header must be valid', () => {
  assert.match(errors(lintMessage(registry, 'hello'))[0].msg, /first line/);
  assert.match(errors(lintMessage(registry, `@nx1.0 core or>cr shout #1\ntxt hi`))[0].msg, /unknown message type/);
});

test('message type requirements', () => {
  assert.ok(errors(lintMessage(registry, `${head('core', 'done')}\nac 1 ok`)).some(p => /exactly one v/.test(p.msg)));
  assert.ok(errors(lintMessage(registry, `${head('core', 'done')}\nv ok\nv ok`)).some(p => /found 2/.test(p.msg)));
  assert.ok(errors(lintMessage(registry, `${head('core', 'do')}\ntxt hi`)).some(p => /ctx or step/.test(p.msg)));
  assert.ok(errors(lintMessage(registry, `${head('core', 'ask')}\ntxt hi`)).some(p => /needs at least one q/.test(p.msg)));
  assert.ok(errors(lintMessage(registry, `${head('core', 'fail')}\nv ok`)).some(p => /err or v fail\/blk/.test(p.msg)));
  assert.deepEqual(errors(lintMessage(registry, `${head('core', 'fail')}\nv blk "waiting for access"`)), []);
});

test('values, keys and required notes', () => {
  const p = errors(lintMessage(registry, `${head()}\nac 4 part\nf x - "y"\nhyp h1 120 "z"\nstep 1 doing "a" foo:bar\nctx\nv fail`));
  const msgs = p.map(x => x.msg).join('\n');
  assert.match(msgs, /needs a note/);
  assert.match(msgs, /not one of b\|s\|n/);
  assert.match(msgs, /0-100/);
  assert.match(msgs, /no key "foo:"/);
  assert.match(msgs, /at least 1 key:value/);
  assert.match(msgs, /needs a reason/);
});

test('positional values must come before keys', () => {
  assert.ok(errors(lintMessage(registry, `${head('core,dev')}\nest 6h conf:60 "basis"`)).some(p => /after a key:value/.test(p.msg)));
});

test('txt is limited to 25 words', () => {
  const long = Array.from({ length: 26 }, (_, i) => `w${i}`).join(' ');
  assert.ok(errors(lintMessage(registry, `${head()}\ntxt "${long}"`)).some(p => /26 words/.test(p.msg)));
});

test('records from undeclared packs are errors; packs must be declared', () => {
  assert.ok(errors(lintMessage(registry, `${head()}\nbld ok`)).some(p => /in pack "dev"/.test(p.msg)));
  assert.ok(errors(lintMessage(registry, `${head('core,dev')}\nctx app:x`)).some(p => /no key "app:"/.test(p.msg)));
  assert.deepEqual(errors(lintMessage(registry, `${head('core,bc')}\nctx app:x`)), []);
});

test('unused declared packs give a warning', () => {
  assert.ok(warnings(lintMessage(registry, `${head('core,dev,bc')}\ntxt hi`)).some(p => /declared but not used/.test(p.msg)));
});

test('def is valid only inside its own message', () => {
  const text = `${head()}\ndef $a "x"\ntxt "$a and $b"`;
  const w = warnings(lintMessage(registry, text));
  assert.equal(w.length, 1);
  assert.match(w[0].msg, /\$b is not defined/);
  assert.ok(errors(lintMessage(registry, `${head()}\ndef $a x\ndef $a y\ntxt hi`)).some(p => /defined twice/.test(p.msg)));
});

test('roster: unknown agents are errors, reserved agents are fine', () => {
  assert.ok(errors(lintMessage(registry, `@nx1.0 core zz>or upd #1\ntxt hi`, roster)).some(p => /"zz" is not in roster/.test(p.msg)));
  assert.deepEqual(errors(lintMessage(registry, `@nx1.0 core sys>usr upd #1\ntxt hi`, roster)), []);
});

// ------------------------------------------------------------ fallback rule

test('fallback: newer minor version and unknown records are warnings, not errors', () => {
  const text = `@nx1.3 core or>cr done #1\nzap 1 2\nv ok`;
  const p = lintMessage(registry, text);
  assert.deepEqual(errors(p), []);
  assert.ok(warnings(p).some(x => /newer than/.test(x.msg)));
  assert.ok(warnings(p).some(x => /unknown record "zap"/.test(x.msg)));
  const t = translateMessage(registry, text).lines.join('\n');
  assert.match(t, /\[unknown record, not in nx1\.3 core\] zap 1 2/);
  assert.match(t, /Verdict: OK/);
});

test('fallback: unknown pack is a warning', () => {
  const p = lintMessage(registry, `@nx1.0 core,crm or>cr upd #1\ndeal 5`);
  assert.deepEqual(errors(p), []);
  assert.ok(warnings(p).some(x => /unknown pack "crm"/.test(x.msg)));
});

test('another major version is an error', () => {
  assert.ok(errors(lintMessage(registry, `@nx2.0 core or>cr upd #1\ntxt hi`)).some(p => /major/.test(p.msg)));
});

// ------------------------------------------------------------ translation

test('translation of a full message', () => {
  const text = readFileSync(join(root, 'examples/02-code-review.nx'), 'utf8');
  const lines = translateMessage(registry, text, roster).lines;
  assert.equal(lines[0], 'Reply to #7 from code-reviewer (cr) to orchestrator (or): task finished. [NEXUM 1.0; packs: core]');
  assert.ok(lines.includes('Acceptance criterion 4: partly met — Horten fallback lacks Customer No. filter'));
  assert.ok(lines.includes('Finding (note): consider a test for two customers with the same Document No.'));
  assert.ok(lines.includes('Verdict: partly met — AC 4 not met'));
});

test('several messages in one text', () => {
  const text = readFileSync(join(root, 'examples/05-question.nx'), 'utf8') + '\n' + readFileSync(join(root, 'examples/06-answer-and-human-text.nx'), 'utf8');
  assert.equal(splitMessages(text).length, 2);
  assert.equal(translate(registry, text, roster).length, 2);
});

// ------------------------------------------------------------ compatibility rules

test('compat: removing a value is breaking, adding a record is additive, wording is review', () => {
  const next = clone(registry);
  delete next.sets.result.skip;
  next.packs.dev.records.cov = { meaning: 'coverage', en: 'Coverage {pct}', args: [{ name: 'pct', type: 'pct' }], example: 'cov 80' };
  next.packs.core.records.f.meaning = 'a finding';
  const d = diffRegistries(registry, next);
  assert.ok(d.breaking.some(x => x.includes('value skip removed')));
  assert.ok(d.additive.some(x => x.includes('dev.cov: record added')));
  assert.ok(d.review.some(x => x.includes('core.f: meaning text changed')));
});

test('compat: version rules', () => {
  const add = { breaking: [], additive: ['x'], review: [] };
  const brk = { breaking: ['x'], additive: [], review: [] };
  const rev = { breaking: [], additive: [], review: ['x'] };
  assert.deepEqual(versionFailures('1.0.0', '1.1.0', add), []);
  assert.ok(versionFailures('1.0.0', '1.0.1', add).length);
  assert.ok(versionFailures('1.0.0', '1.1.0', brk).length);
  assert.deepEqual(versionFailures('1.0.0', '2.0.0', brk), []);
  assert.ok(versionFailures('1.0.0', '2.0.0', add).length);
  assert.deepEqual(versionFailures('1.0.0', '1.0.1', rev), []);
  assert.ok(versionFailures('1.0.0', '1.0.0', rev).length);
  assert.deepEqual(diffRegistries(registry, clone(registry)), { breaking: [], additive: [], review: [] });
});

// ------------------------------------------------------------ generated files

test('cards contain every record of their pack', () => {
  for (const [p, pack] of Object.entries(registry.packs)) {
    const card = cardText(registry, p);
    for (const code of Object.keys(pack.records)) assert.ok(card.includes(`\n${code} `), `${code} missing from card ${p}`);
  }
});

test('dist/ is up to date with the registry', () => {
  const built = JSON.parse(readFileSync(join(root, 'dist/registry.json'), 'utf8'));
  assert.deepEqual(built, JSON.parse(JSON.stringify(registry)), 'run npm run build');
  for (const p of Object.keys(registry.packs)) assert.equal(readFileSync(join(root, `dist/cards/${p}.md`), 'utf8'), cardText(registry, p), `card ${p} is stale; run npm run build`);
});

test('bundled CLI works without dependencies', () => {
  const nx = join(root, 'dist/nx.mjs');
  const ok = spawnSync('node', [nx, 'lint', join(root, 'examples/03-developer-done.nx')], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  const bad = spawnSync('node', [nx, 'lint', '-'], { input: '@nx1.0 core a>b done #1\nac 1 part', encoding: 'utf8' });
  assert.equal(bad.status, 1);
  const tr = spawnSync('node', [nx, 'translate', '-'], { input: '@nx1.0 core a>b done #1\nv ok', encoding: 'utf8' });
  assert.match(tr.stdout, /Verdict: OK/);
});
