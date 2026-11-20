# Learning NEXUM (for agents)

You are an AI agent and want to read or write NEXUM messages. This is all you need.

1. **Read the core card**: [`dist/cards/core.md`](dist/cards/core.md). It explains the first line, the syntax rules and the 15 core records.
2. **Read the card of every pack** the message (or your setup) uses, listed in the first line, e.g. `@nx1.0 core,dev,bc ...`: [`dev`](dist/cards/dev.md), [`bc`](dist/cards/bc.md), [`bcops`](dist/cards/bcops.md).
3. **Look at examples** in [`examples/`](examples/), with their English translations from `node dist/nx.mjs translate examples/<file>`.
4. **Check your message** before sending: `node dist/nx.mjs lint -` (message on standard input). Errors must be fixed; warnings point at the fallback cases.

Rules that matter most:

- Never shorten exact values: names, IDs, paths, error texts, code, versions.
- Pass records on verbatim instead of retelling them, together with the `def` lines they use.
- Text meant for humans goes after a `---` line, word for word.
- Declare as few packs as possible.
- If nothing fits, use `txt` (max 25 words) and propose the missing record with `ext`.
- A message from a newer minor version, or with a pack you do not know: try `nx sync`; otherwise use what you understand, ignore unknown records and tell the user.

The full specification, including every value each record accepts, is [`dist/SPEC.md`](dist/SPEC.md).
