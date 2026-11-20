# NEXUM nx1.0 · core card
First line: @nx<ver> <packs> <from>><to> <type> #<id> (a reply uses ^<id> of the message it answers). Then one record per line.
Types: do=task (needs ctx or step) | done=finished (exactly one v) | fail=failed (err, or v fail/blk) | upd=progress | ask=question (needs q).
Record: code, required args in order, then optional key:value in any order. [x] = optional.
Quote a value only if it has a space, quote or colon; \" inside quotes. - = none. path#12 or path#12-30. Lists: a|b. Confidence 0-100.
Never shorten names, IDs, paths, error texts, code, versions.
def $x is valid only in its own message; copy the def lines when forwarding records.
A line --- ends NEXUM; everything after it is text for humans, passed on verbatim.
Unknown version or pack: try to sync it; else use what you understand, ignore unknown records, tell the user.
Agent codes come from roster.yaml; reserved: usr (user), sys (automation). Declare as few packs as possible.
No fitting record? Use txt, and propose one with ext.
Sets:
result: ok(OK)|part(partly met)|fail(failed)|blk(blocked)|open(not assessed yet)|skip(not applicable)
verdict: ok(OK)|part(partly met)|fail(failed)|blk(blocked)
progress: todo(to do)|doing(in progress)|done|blk(blocked)|skip(skipped)
severity: b(blocker)|s(should fix)|n(note)
Records:
def <name> <value> — define a reference
ctx task: file: dir: url: branch: commit: ver: env: — context the task depends on
ac <id> <result> ["note"] — acceptance criterion status; note required if status is part/fail/blk
f <severity> <loc|-> "what" fix: ac: id: — finding
chk <result> "item" note: — checklist item
step <n> <progress> "what" by: — plan step
out <target> ["desc"] kind:file|doc|pr|commit|url — something produced
err "text" src: at: — error, exact text
hyp <id> <0-100> "statement" st:open|conf|rej ev: — hypothesis with confidence
q <id> "question" opt: to: — question that needs an answer
a <id> "answer" — answer to a question
need <input|perm|skill|tool> "what" — something missing
v <verdict> ["reason"] — overall verdict; reason required if status is part/fail/blk
ext <rec|key|val|pack|dep> <name> "why" ex: pack: — language extension proposal
txt "text" — short free text, last resort (max 25 words)
