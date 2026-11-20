// Generators: everything in dist/ is produced from the compiled registry by these functions.
import { signature, translateMessage } from './nexum.mjs';

const short = v => v.split('.').slice(0, 2).join('.');

function recordLine(registry, code, rec) {
  let line = `${signature(rec, code, registry.sets)} — ${rec.meaning}`;
  for (const rule of rec.required_when || []) {
    const [onArg, vals] = Object.entries(rule.when)[0];
    line += `; ${rule.arg} required if ${onArg} is ${vals.join('/')}`;
  }
  return line;
}

function setLine(name, values) {
  const vals = Object.entries(values).map(([k, label]) => (k === label ? k : `${k}(${label})`));
  return `${name}: ${vals.join('|')}`;
}

/** The compact agent card for one pack. This is what agents read; it counts against the budget. */
export function cardText(registry, packName) {
  const pack = registry.packs[packName];
  const v = short(registry.version);
  const out = [];
  if (packName === 'core') {
    out.push(`# NEXUM nx${v} · core card`);
    out.push(registry.card_intro.trim());
    out.push('Sets:');
    for (const s of ['result', 'verdict', 'progress', 'severity']) out.push(setLine(s, registry.sets[s]));
  } else {
    out.push(`# NEXUM nx${v} · pack ${packName}: ${pack.description}`);
    out.push(`Declare ${packName} in the first line to use these records.`);
    for (const s of pack.sets || []) {
      const keys = Object.keys(registry.sets[s]);
      out.push(`${s}: ${keys.join('|')}`);
    }
  }
  out.push('Records:');
  for (const [code, rec] of Object.entries(pack.records)) out.push(recordLine(registry, code, rec));
  const ext = Object.entries(pack.extends || {});
  if (ext.length) {
    out.push(`Adds keys: ${ext.map(([code, e]) => `${code} ${Object.keys(e.keys).map(k => `${k}:`).join(' ')}`).join(' · ')}`);
  }
  return out.join('\n') + '\n';
}

function exampleMessage(registry, packName, example) {
  const packs = packName === 'core' ? 'core' : `core,${packName}`;
  const defs = [];
  for (const ref of new Set(example.match(/\$[a-z0-9]+/g) || [])) {
    if (!example.startsWith(`def ${ref}`)) defs.push(`def ${ref} "${ref === '$base' ? 'https://api.example.com' : 'app/src'}"`);
  }
  return [`@nx${short(registry.version)} ${packs} a>b upd #1`, ...defs, example].join('\n');
}

/** Translation of a record's example, used in SPEC.md and tests. */
export function exampleTranslation(registry, packName, example) {
  const { lines } = translateMessage(registry, exampleMessage(registry, packName, example), { a: 'agent A', b: 'agent B' });
  return lines[lines.length - 1];
}

export { exampleMessage };

function mdEscape(s) {
  return String(s).replace(/\|/g, '\\|');
}

function specOf(registry, spec) {
  if (spec.set) return `one of \`${Object.keys(registry.sets[spec.set]).join('|')}\``;
  if (spec.values) return Object.entries(spec.values).map(([k, l]) => `\`${k}\` ${l}`).join(', ');
  if (spec.type === 'amount') return `number + unit: ${Object.entries(spec.units).map(([k, l]) => `\`${k}\` ${l}`).join(', ')}`;
  return registry.types[spec.type].en + (spec.pattern ? ` (format \`${spec.pattern}\`)` : '');
}

/** The full human-readable specification. */
export function specText(registry) {
  const v = registry.version;
  const out = [];
  out.push(`# NEXUM ${v} specification`);
  out.push('');
  out.push('> Generated from `registry/` by `npm run build`. Do not edit by hand.');
  out.push('');
  out.push('NEXUM (Latin-inspired: connection, bond) is a token-efficient language for messages between AI agents. Every message can be translated to English deterministically with `dist/translator.html` or `node dist/nx.mjs translate`.');
  out.push('');
  out.push('## Syntax');
  out.push('');
  for (const line of registry.card_intro.trim().split('\n')) out.push(`- ${line}`);
  out.push('');
  out.push('## Message types');
  out.push('');
  out.push('| Type | Meaning | Must contain |');
  out.push('|---|---|---|');
  for (const [t, mt] of Object.entries(registry.message_types)) {
    const req = (mt.requires || []).map(r => {
      const [kind, ms] = Object.entries(r)[0];
      const d = ms.map(m => (m.where ? `\`${m.record} ${Object.values(m.where)[0].join('/')}\`` : `\`${m.record}\``)).join(' or ');
      return `${kind === 'exactly_one_of' ? 'exactly one' : 'at least one'} ${d}`;
    }).join('; ') || '—';
    out.push(`| \`${t}\` | ${mt.en} | ${req} |`);
  }
  out.push('');
  out.push(`Reserved agent codes: ${Object.entries(registry.reserved_agents).map(([k, l]) => `\`${k}\` (${l})`).join(', ')}. All other codes come from the setup's \`roster.yaml\`.`);
  out.push('');
  out.push('## Value sets');
  out.push('');
  for (const [name, values] of Object.entries(registry.sets)) {
    out.push(`- **${name}**: ${Object.entries(values).map(([k, l]) => (k === l ? `\`${k}\`` : `\`${k}\` ${l}`)).join(', ')}`);
  }
  out.push('');
  for (const [pname, pack] of Object.entries(registry.packs)) {
    out.push(`## Pack \`${pname}\``);
    out.push('');
    out.push(pack.description);
    out.push('');
    for (const [code, rec] of Object.entries(pack.records)) {
      out.push(`### \`${code}\` — ${rec.meaning}`);
      out.push('');
      out.push('```');
      out.push(signature(rec, code, registry.sets));
      out.push('```');
      out.push('');
      if ((rec.args || []).length) {
        out.push('| Value | Accepts | |');
        out.push('|---|---|---|');
        for (const a of rec.args) out.push(`| ${a.name} | ${mdEscape(specOf(registry, a))} | ${a.optional ? 'optional' : 'required'}${a.none_ok ? ', `-` for none' : ''} |`);
        out.push('');
      }
      const keys = Object.entries(rec.keys || {});
      if (keys.length) {
        out.push('| Key | Meaning | Accepts |');
        out.push('|---|---|---|');
        for (const [k, s] of keys) out.push(`| \`${k}:\` | ${s.en} | ${mdEscape(specOf(registry, s))} |`);
        out.push('');
      }
      for (const rule of rec.required_when || []) {
        const [onArg, vals] = Object.entries(rule.when)[0];
        out.push(`- \`${rule.arg}\` is required when \`${onArg}\` is ${vals.map(x => `\`${x}\``).join(', ')}.`);
      }
      if (rec.repeat_keys) out.push('- Keys may repeat.');
      if (rec.min_keys) out.push(`- At least ${rec.min_keys} key:value pair(s).`);
      out.push('');
      out.push(`Example: \`${rec.example}\``);
      out.push('');
      out.push(`English: ${exampleTranslation(registry, pname, rec.example)}`);
      out.push('');
    }
    for (const [code, ext] of Object.entries(pack.extends || {})) {
      out.push(`Adds to \`${code}\`: ${Object.entries(ext.keys).map(([k, s]) => `\`${k}:\` (${s.en})`).join(', ')}.`);
      out.push('');
    }
  }
  return out.join('\n');
}

/** Strip ESM import/export syntax so modules can be inlined into one script. */
export function inlineModule(src, keepExports = false) {
  return src
    .split('\n')
    .filter(l => !/^import .* from '\.\/.*';$/.test(l))
    .map(l => (keepExports ? l : l.replace(/^export (function|const|class|async function) /, '$1 ').replace(/^export \{.*\};?$/, '')))
    .join('\n');
}

/** Single-file CLI: registry + runtime + CLI, no dependencies. */
export function bundleCli(registry, cards, runtimeSrc, cliSrc) {
  return [
    '#!/usr/bin/env node',
    `// NEXUM ${registry.version} command-line tool. Generated by npm run build; do not edit.`,
    `// Usage: node nx.mjs help`,
    inlineModule(cliSrc).replace(/^export function main/m, 'function main'),
    inlineModule(runtimeSrc),
    `const REGISTRY = ${JSON.stringify(registry)};`,
    `const CARDS = ${JSON.stringify(cards)};`,
    'process.exitCode = main(REGISTRY, CARDS, process.argv.slice(2));',
    '',
  ].join('\n');
}

/** Self-contained translator web page. */
export function translatorHtml(registry, runtimeSrc) {
  const example = [
    `@nx${short(registry.version)} core,dev,bc cr>or done ^7`,
    'def $dc "ev-evita/app/Debt Collection"',
    'ctx task:EVIT-1740 app:"EV Debt Collection"',
    'ac 4 part "Horten fallback lacks Customer No. filter"',
    'f b "$dc/HortenAdvisMgt_IFPS.Codeunit.al#212" "applies by Document No. only" fix:"add SetRange(\\"Customer No.\\", ...)" ac:4',
    'tst 41/42 fail:1 suite:DebtColl',
    'v part "AC 4 not met"',
  ].join('\n');
  const roster = 'agents:\n  or: orchestrator\n  cr: code-reviewer\n  dev: developer';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>NEXUM ${registry.version} translator</title>
<style>
  :root { --bg:#f7f6f3; --panel:#fff; --ink:#1d1d1b; --muted:#6b6a66; --line:#e2e0da; --accent:#2f5d50; --warn:#9a6700; --err:#b42318; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme=light]) { --bg:#161615; --panel:#1f1f1d; --ink:#ecebe7; --muted:#a3a19b; --line:#34332f; --accent:#7fb8a6; --warn:#e3b341; --err:#f97066; } }
  :root[data-theme=dark] { --bg:#161615; --panel:#1f1f1d; --ink:#ecebe7; --muted:#a3a19b; --line:#34332f; --accent:#7fb8a6; --warn:#e3b341; --err:#f97066; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:15px/1.5 system-ui, -apple-system, "Segoe UI", sans-serif; }
  header { padding:20px 24px 8px; display:flex; align-items:baseline; gap:12px; flex-wrap:wrap; }
  h1 { font-size:20px; margin:0; letter-spacing:.04em; }
  header span { color:var(--muted); font-size:13px; }
  main { display:grid; grid-template-columns: 1fr 1fr; gap:16px; padding:8px 24px 24px; }
  @media (max-width: 860px) { main { grid-template-columns: 1fr; } }
  section { background:var(--panel); border:1px solid var(--line); border-radius:10px; padding:14px; display:flex; flex-direction:column; gap:8px; min-width:0; }
  label { font-size:12px; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); }
  textarea { width:100%; border:1px solid var(--line); border-radius:8px; background:transparent; color:var(--ink); padding:10px; font:13px/1.45 ui-monospace, "SF Mono", Menlo, Consolas, monospace; resize:vertical; }
  #msg { min-height:300px; } #roster { min-height:90px; }
  .msg { border-top:1px solid var(--line); padding:10px 0; } .msg:first-child { border-top:0; padding-top:0; }
  .head { font-weight:600; } ul { margin:6px 0 0; padding-left:18px; } li { margin:2px 0; overflow-wrap:anywhere; }
  .unknown { color:var(--muted); font-style:italic; }
  pre.human { white-space:pre-wrap; background:var(--bg); border-radius:6px; padding:8px; font-size:13px; margin:6px 0 0; }
  .p { font-size:13px; margin-top:6px; } .p.error { color:var(--err); } .p.warning { color:var(--warn); }
  .ok { color:var(--accent); font-size:13px; margin-top:6px; }
  .empty { color:var(--muted); }
  footer { padding:0 24px 24px; font-size:13px; color:var(--muted); } footer a { color:var(--accent); }
</style>
</head>
<body>
<header><h1>NEXUM</h1><span>translator · language ${registry.version} · packs: ${Object.keys(registry.packs).join(', ')} · runs in your browser, nothing is sent anywhere</span></header>
<main>
  <section>
    <label for="msg">NEXUM messages</label>
    <textarea id="msg" spellcheck="false">${example.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</textarea>
    <label for="roster">roster.yaml (optional, maps agent codes to names)</label>
    <textarea id="roster" spellcheck="false">${roster}</textarea>
  </section>
  <section>
    <label>English</label>
    <div id="out"></div>
  </section>
</main>
<footer><a href="https://github.com/${registry.repository}/blob/main/dist/SPEC.md">Specification</a> · <a href="https://github.com/${registry.repository}/tree/main/dist/cards">Agent cards</a> · <a href="https://github.com/${registry.repository}">${registry.repository}</a></footer>
<script>
${inlineModule(runtimeSrc)}
const REGISTRY = ${JSON.stringify(registry)};
const esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
function run() {
  const text = document.getElementById('msg').value;
  let roster = null;
  try { const r = parseRoster(document.getElementById('roster').value); roster = Object.keys(r).length ? r : null; } catch (e) { roster = null; }
  const results = translate(REGISTRY, text, roster);
  const out = document.getElementById('out');
  if (!results.length) { out.innerHTML = '<p class="empty">Paste one or more messages. Each starts with @nx.</p>'; return; }
  out.innerHTML = results.map(r => {
    const humanAt = r.lines.indexOf('Text for humans (verbatim):');
    const body = humanAt >= 0 ? r.lines.slice(1, humanAt) : r.lines.slice(1);
    const human = humanAt >= 0 ? r.lines.slice(humanAt + 1).join('\\n') : null;
    const items = body.map(l => '<li' + (l.startsWith('[unknown record') ? ' class="unknown"' : '') + '>' + esc(l) + '</li>').join('');
    const probs = r.problems.length
      ? r.problems.map(p => '<div class="p ' + p.level + '">' + p.level + ' (line ' + p.line + '): ' + esc(p.msg) + '</div>').join('')
      : '<div class="ok">Valid message.</div>';
    return '<div class="msg"><div class="head">' + esc(r.lines[0]) + '</div><ul>' + items + '</ul>'
      + (human !== null ? '<div><label>Text for humans</label><pre class="human">' + esc(human) + '</pre></div>' : '')
      + probs + '</div>';
  }).join('');
}
const rosterBox = document.getElementById('roster');
try { const saved = localStorage.getItem('nexum.roster'); if (saved) rosterBox.value = saved; } catch (e) {}
document.getElementById('msg').addEventListener('input', run);
rosterBox.addEventListener('input', () => { try { localStorage.setItem('nexum.roster', rosterBox.value); } catch (e) {} run(); });
run();
</script>
</body>
</html>
`;
}
