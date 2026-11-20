## Agent messages (NEXUM)

Agents in this setup talk to each other in **NEXUM**, a compact agent language. The user never sees NEXUM unless they ask; talk to the user in plain prose.

- **Learn it:** read `.nexum/cards/core.md` and the card of every pack listed in `.nexum/nexum.lock.json` before sending or reading agent messages.
- **Every message** starts with `@nx<version> <packs> <from>><to> <type> #<id>`. Use the version from the lock file, only the packs the message actually uses, and agent codes from `.nexum/roster.yaml`.
- **Pass findings on verbatim**: copy records (and the `def` lines they use) instead of retelling them.
- **Text for humans** (designs, Jira drafts, customer or end-user texts, manuals, anything shown to the user) is never NEXUM. When a message must carry it, it goes after a `---` line, word for word.
- **Unknown version or pack:** run `node .nexum/nx.mjs sync --version <x.y> --packs <packs> --dir .nexum`. If that fails, use what you understand, ignore unknown records, and tell the user you did so.
- **No fitting record?** Use `txt` (max 25 words) and add an `ext` record proposing what was missing.
- **Log:** the orchestrator appends every NEXUM message it sends or receives to `.nexum/log/messages.nx`. A Stop hook sends `ext` and `txt` records from it to `NiHanDK/nexum-lang`.
- **Check:** `node .nexum/nx.mjs lint -` validates a message; `/nx` translates messages to English.
