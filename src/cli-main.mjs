// NEXUM command-line tool. Bundled into dist/nx.mjs together with the registry, so setups need only Node (no npm install).
import { readFileSync, writeFileSync, mkdirSync, existsSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { translate, lint, parseRoster, splitMessages, parseMessage } from './nexum.mjs';

const HELP = `nx: NEXUM agent language tool

Usage:
  nx translate [file|-] [--roster roster.yaml]   Translate NEXUM messages to English
  nx lint [file|-] [--roster roster.yaml]        Check messages; exit code 1 on errors
                                                 (roster defaults to ./roster.yaml or .nexum/roster.yaml)
  nx card [pack ...]                             Print agent cards (default: core)
  nx version                                     Print the language version
  nx sync --version <x.y|latest> --packs core,dev,bc [--dir .nexum]
                                                 Download a released version from GitHub (needs gh)
  nx propose [file|-] [--setup name]             File ext proposals and txt usage as GitHub issues (needs gh)

Reading "-" or no file reads standard input.`;

function arg(argv, name, fallback = null) {
  const i = argv.indexOf(name);
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
}

function positional(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) { i++; continue; }
    out.push(argv[i]);
  }
  return out;
}

function readInput(file) {
  if (!file || file === '-') return readFileSync(0, 'utf8');
  return readFileSync(file, 'utf8');
}

function loadRoster(argv) {
  const path = arg(argv, '--roster') || ['roster.yaml', '.nexum/roster.yaml'].find(p => existsSync(p)) || null;
  return path ? parseRoster(readFileSync(path, 'utf8')) : null;
}

function gh(args, opts = {}) {
  return execFileSync('gh', args, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'inherit'], ...opts });
}

/** Run the CLI. `registry` is the compiled registry; `cards` maps pack name to card text. Returns an exit code. */
export function main(registry, cards, argv) {
  const [cmd, ...rest] = argv;
  if (!cmd || cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return 0;
  }
  if (cmd === 'version') {
    console.log(`${registry.name} ${registry.version}`);
    return 0;
  }
  if (cmd === 'translate') {
    const results = translate(registry, readInput(positional(rest)[0]), loadRoster(rest));
    results.forEach((r, i) => {
      if (i) console.log('');
      console.log(r.lines.join('\n'));
      for (const p of r.problems) console.log(`  ! ${p.level} (line ${p.line}): ${p.msg}`);
    });
    return 0;
  }
  if (cmd === 'lint') {
    const results = lint(registry, readInput(positional(rest)[0]), loadRoster(rest));
    let errors = 0;
    if (!results.length) {
      console.log('no NEXUM message found (a message starts with @nx)');
      return 1;
    }
    for (const r of results) {
      const errs = r.problems.filter(p => p.level === 'error').length;
      errors += errs;
      console.log(`${r.problems.length ? (errs ? 'FAIL' : 'WARN') : 'OK  '} ${r.message}`);
      for (const p of r.problems) console.log(`  ${p.level} (line ${p.line}): ${p.msg}`);
    }
    return errors ? 1 : 0;
  }
  if (cmd === 'card') {
    const packs = positional(rest);
    for (const p of packs.length ? packs : ['core']) {
      if (!cards[p]) {
        console.error(`unknown pack "${p}" (known: ${Object.keys(cards).join(', ')})`);
        return 1;
      }
      console.log(cards[p]);
    }
    return 0;
  }
  if (cmd === 'sync') return sync(registry, rest);
  if (cmd === 'propose') return propose(registry, rest);
  console.error(`unknown command "${cmd}"\n\n${HELP}`);
  return 1;
}

// ---------------------------------------------------------------- sync

function sync(registry, argv) {
  const repo = arg(argv, '--repo', registry.repository);
  const want = arg(argv, '--version');
  const packs = (arg(argv, '--packs') || '').split(',').filter(Boolean);
  const dir = arg(argv, '--dir', '.nexum');
  if (!want || !packs.length) {
    console.error('sync needs --version <x.y|latest> and --packs core,...');
    return 1;
  }
  let tags;
  try {
    tags = JSON.parse(gh(['release', 'list', '-R', repo, '--json', 'tagName', '-L', '200'])).map(r => r.tagName);
  } catch {
    console.error(`could not list releases of ${repo}; is gh installed and logged in?`);
    return 2;
  }
  const parsed = tags.map(t => /^v(\d+)\.(\d+)\.(\d+)$/.exec(t)).filter(Boolean).map(m => ({ tag: m[0], v: [Number(m[1]), Number(m[2]), Number(m[3])] }));
  let candidates = parsed;
  if (want !== 'latest') {
    const [ma, mi] = want.split('.').map(Number);
    candidates = parsed.filter(p => p.v[0] === ma && (mi === undefined || Number.isNaN(mi) || p.v[1] >= mi));
    // "x.y" means the newest release that can read x.y messages: same major, minor >= y
  }
  candidates.sort((a, b) => b.v[0] - a.v[0] || b.v[1] - a.v[1] || b.v[2] - a.v[2]);
  const pick = candidates[0];
  if (!pick) {
    console.error(`no release of ${repo} matches ${want}`);
    return 2;
  }
  mkdirSync(join(dir, 'cards'), { recursive: true });
  const assets = ['nx.mjs', 'translator.html', 'registry.json', ...packs.map(p => `card-${p}.md`)];
  try {
    gh(['release', 'download', pick.tag, '-R', repo, '--clobber', '-D', dir, ...assets.flatMap(a => ['-p', a])]);
  } catch {
    console.error(`download of ${pick.tag} failed`);
    return 2;
  }
  for (const p of packs) {
    const from = join(dir, `card-${p}.md`);
    if (!existsSync(from)) {
      console.error(`release ${pick.tag} has no pack "${p}"`);
      return 2;
    }
    writeFileSync(join(dir, 'cards', `${p}.md`), readFileSync(from, 'utf8'));
    unlinkSync(from);
  }
  const lock = { language: 'NEXUM', repository: repo, version: pick.tag.slice(1), packs, synced: new Date().toISOString() };
  writeFileSync(join(dir, 'nexum.lock.json'), JSON.stringify(lock, null, 2) + '\n');
  console.log(`synced NEXUM ${lock.version} (${packs.join(', ')}) into ${dir}`);
  return 0;
}

// ---------------------------------------------------------------- propose

function propose(registry, argv) {
  const repo = arg(argv, '--repo', registry.repository);
  const setup = arg(argv, '--setup', 'unknown setup');
  const text = readInput(positional(argv)[0]);
  const exts = [];
  const txts = [];
  for (const m of splitMessages(text)) {
    const parsed = parseMessage(m);
    const head = m.split('\n')[0];
    for (const r of parsed.records) {
      if (r.code === 'ext') exts.push({ raw: r.raw, args: r.args.map(a => a.value), head });
      if (r.code === 'txt') txts.push({ raw: r.raw, head });
    }
  }
  if (!exts.length && !txts.length) {
    console.log('nothing to propose');
    return 0;
  }
  try {
    for (const [name, color, desc] of [['proposal', '0e8a16', 'Language extension proposed by an agent'], ['txt-log', 'c5def5', 'Log of txt records sent by agents']]) {
      try { gh(['label', 'create', name, '-R', repo, '--color', color, '--description', desc], { stdio: ['pipe', 'pipe', 'pipe'] }); } catch { /* label exists */ }
    }
    for (const e of exts) {
      const title = `ext ${e.args[0] || '?'} ${e.args[1] || '?'}`;
      const found = JSON.parse(gh(['issue', 'list', '-R', repo, '--state', 'open', '--label', 'proposal', '--search', `"${title}" in:title`, '--json', 'number,title']));
      const same = found.find(i => i.title === title);
      const body = `Setup: ${setup}\nMessage: \`${e.head}\`\n\n\`\`\`\n${e.raw}\n\`\`\``;
      if (same) {
        gh(['issue', 'comment', String(same.number), '-R', repo, '--body', `Seen again.\n\n${body}`]);
        console.log(`added evidence to #${same.number} ${title}`);
      } else {
        gh(['issue', 'create', '-R', repo, '--label', 'proposal', '--title', title, '--body', `Proposed by an agent via \`nx propose\`.\n\n${body}`]);
        console.log(`opened proposal: ${title}`);
      }
    }
    if (txts.length) {
      const logTitle = 'txt usage log';
      const found = JSON.parse(gh(['issue', 'list', '-R', repo, '--state', 'open', '--label', 'txt-log', '--json', 'number,title']));
      let num = found.find(i => i.title === logTitle)?.number;
      if (!num) {
        const url = gh(['issue', 'create', '-R', repo, '--label', 'txt-log', '--title', logTitle, '--body', 'Every txt record agents send is logged here. The steward reads it to find missing records.']).trim();
        num = Number(url.split('/').pop());
      }
      const body = `Setup: ${setup}\n\n\`\`\`\n${txts.map(t => `${t.head}\n${t.raw}`).join('\n\n')}\n\`\`\``;
      gh(['issue', 'comment', String(num), '-R', repo, '--body', body]);
      console.log(`logged ${txts.length} txt line(s) in #${num}`);
    }
  } catch (e) {
    console.error(`could not reach GitHub with gh: ${e.message}`);
    return 2;
  }
  return 0;
}

