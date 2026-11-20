---
description: Translate NEXUM agent messages to English
argument-hint: "[messages, or empty for this session's latest agent reports]"
---

Translate NEXUM messages to English with the deterministic translator. Do not translate them yourself.

1. Take the messages from `$ARGUMENTS`. If it is empty, use the NEXUM messages (lines from `@nx...` up to the next message) that agents sent in this session, newest last.
2. Run `node .nexum/nx.mjs translate - --roster .nexum/roster.yaml` with the messages on standard input.
3. Show the output to the user as it is. If the tool reports problems (errors or warnings), list them below the translation.
