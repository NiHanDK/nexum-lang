# Adding NEXUM to an agent setup

Copy these files into the setup's repository, then fill in the roster.

| File | Purpose |
|---|---|
| `.nexum/roster.yaml` | Agent codes used in this setup (edit it) |
| `.nexum/nexum.lock.json` | Written by `nx sync`: pinned version and packs |
| `.nexum/cards/*.md` | Written by `nx sync`: the agent cards agents read |
| `.nexum/nx.mjs`, `.nexum/translator.html` | Written by `nx sync`: CLI and translator page |
| `.nexum/propose.sh` | Sends `ext` proposals and `txt` usage to `NiHanDK/nexum-lang` |
| `.claude/commands/nx.md` | `/nx` slash command that translates messages to English |
| `CLAUDE-section.md` | Paste into the setup's `CLAUDE.md` |
| `settings-hook.json` | Merge into `.claude/settings.json` to send proposals automatically |

## First install

You need Node 20+ and the GitHub CLI (`gh`) logged in with access to `NiHanDK/nexum-lang`.

```sh
# one-off bootstrap: download the CLI of the newest release
gh release download --repo NiHanDK/nexum-lang --pattern nx.mjs --dir .nexum
# pin version and packs, download cards and tools
node .nexum/nx.mjs sync --version 1.0 --packs core,dev,bc --dir .nexum
```

Choose only the packs the setup needs. A BC setup with a support agent adds `bcops`.

## Updating

`node .nexum/nx.mjs sync --version 1.0 --packs core,dev,bc --dir .nexum` pulls the newest release that can read 1.0 messages (same major, newest minor). Run it deliberately and commit the result.

## Checking messages

```sh
node .nexum/nx.mjs lint  messages.nx --roster .nexum/roster.yaml
node .nexum/nx.mjs translate messages.nx --roster .nexum/roster.yaml
```
