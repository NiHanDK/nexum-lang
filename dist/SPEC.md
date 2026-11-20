# NEXUM 1.0.0 specification

> Generated from `registry/` by `npm run build`. Do not edit by hand.

NEXUM (Latin-inspired: connection, bond) is a token-efficient language for messages between AI agents. Every message can be translated to English deterministically with `dist/translator.html` or `node dist/nx.mjs translate`.

## Syntax

- First line: @nx<ver> <packs> <from>><to> <type> #<id> (a reply uses ^<id> of the message it answers). Then one record per line.
- Types: do=task (needs ctx or step) | done=finished (exactly one v) | fail=failed (err, or v fail/blk) | upd=progress | ask=question (needs q).
- Record: code, required args in order, then optional key:value in any order. [x] = optional.
- Quote a value only if it has a space, quote or colon; \" inside quotes. - = none. path#12 or path#12-30. Lists: a|b. Confidence 0-100.
- Never shorten names, IDs, paths, error texts, code, versions.
- def $x is valid only in its own message; copy the def lines when forwarding records.
- A line --- ends NEXUM; everything after it is text for humans, passed on verbatim.
- Unknown version or pack: try to sync it; else use what you understand, ignore unknown records, tell the user.
- Agent codes come from roster.yaml; reserved: usr (user), sys (automation). Declare as few packs as possible.
- No fitting record? Use txt, and propose one with ext.

## Message types

| Type | Meaning | Must contain |
|---|---|---|
| `do` | task assignment | at least one `ctx` or `step` |
| `done` | task finished | exactly one `v` |
| `fail` | task failed | at least one `err` or `v fail/blk` |
| `upd` | progress update | — |
| `ask` | question | at least one `q` |

Reserved agent codes: `usr` (user), `sys` (automated process). All other codes come from the setup's `roster.yaml`.

## Value sets

- **result**: `ok` OK, `part` partly met, `fail` failed, `blk` blocked, `open` not assessed yet, `skip` not applicable
- **verdict**: `ok` OK, `part` partly met, `fail` failed, `blk` blocked
- **progress**: `todo` to do, `doing` in progress, `done`, `blk` blocked, `skip` skipped
- **severity**: `b` blocker, `s` should fix, `n` note
- **change**: `new`, `mod` modified, `del` deleted
- **al_object**: `table`, `tableextension`, `page`, `pageextension`, `pagecustomization`, `codeunit`, `report`, `reportextension`, `query`, `xmlport`, `enum`, `enumextension`, `interface`, `permissionset`, `permissionsetextension`, `profile`, `controladdin`, `entitlement`
- **al_perm_object**: `tabledata`, `table`, `page`, `codeunit`, `report`, `query`, `xmlport`, `system`

## Pack `core`

Records almost any agent setup needs.

### `def` — define a reference

```
def <name> <value>
```

| Value | Accepts | |
|---|---|---|
| name | reference name | required |
| value | value | required |


Example: `def $src "app/Debt Collection"`

English: Define $src = app/Debt Collection

### `ctx` — context the task depends on

```
ctx task: file: dir: url: branch: commit: ver: env:
```

| Key | Meaning | Accepts |
|---|---|---|
| `task:` | task | value |
| `file:` | file | value |
| `dir:` | folder | value |
| `url:` | URL | value |
| `branch:` | branch | value |
| `commit:` | commit | value |
| `ver:` | version | value |
| `env:` | environment | value |

- Keys may repeat.
- At least 1 key:value pair(s).

Example: `ctx task:EVIT-1740 file:"$src/X.al" branch:fix-1`

English: Context: task: EVIT-1740; file: app/src/X.al; branch: fix-1

### `ac` — acceptance criterion status

```
ac <id> <result> ["note"]
```

| Value | Accepts | |
|---|---|---|
| id | short ID | required |
| status | one of `ok\|part\|fail\|blk\|open\|skip` | required |
| note | text | optional |

- `note` is required when `status` is `part`, `fail`, `blk`.

Example: `ac 4 part "missing Customer No. filter"`

English: Acceptance criterion 4: partly met — missing Customer No. filter

### `f` — finding

```
f <severity> <loc|-> "what" fix: ac: id:
```

| Value | Accepts | |
|---|---|---|
| sev | one of `b\|s\|n` | required |
| loc | location (path | required, `-` for none |
| what | text | required |

| Key | Meaning | Accepts |
|---|---|---|
| `fix:` | suggested fix | text |
| `ac:` | acceptance criterion | short ID |
| `id:` | finding ID | short ID |


Example: `f b "$src/X.al#212" "applies by Document No. only" fix:"add SetRange" ac:4`

English: Finding (blocker) at app/src/X.al#212: applies by Document No. only (suggested fix: add SetRange; acceptance criterion: 4)

### `chk` — checklist item

```
chk <result> "item" note:
```

| Value | Accepts | |
|---|---|---|
| status | one of `ok\|part\|fail\|blk\|open\|skip` | required |
| item | text | required |

| Key | Meaning | Accepts |
|---|---|---|
| `note:` | note | text |


Example: `chk ok "migration script runs"`

English: Check OK: migration script runs

### `step` — plan step

```
step <n> <progress> "what" by:
```

| Value | Accepts | |
|---|---|---|
| n | whole number | required |
| status | one of `todo\|doing\|done\|blk\|skip` | required |
| what | text | required |

| Key | Meaning | Accepts |
|---|---|---|
| `by:` | done by | agent code |


Example: `step 2 doing "update codeunit" by:dev`

English: Step 2 (in progress): update codeunit (done by: dev)

### `out` — something produced

```
out <target> ["desc"] kind:file|doc|pr|commit|url
```

| Value | Accepts | |
|---|---|---|
| target | value | required |
| desc | text | optional |

| Key | Meaning | Accepts |
|---|---|---|
| `kind:` | kind | `file` file, `doc` document, `pr` pull request, `commit` commit, `url` link |


Example: `out "docs/EVIT-1740.md" "design" kind:doc`

English: Output docs/EVIT-1740.md — design (kind: document)

### `err` — error, exact text

```
err "text" src: at:
```

| Value | Accepts | |
|---|---|---|
| text | text | required |

| Key | Meaning | Accepts |
|---|---|---|
| `src:` | source | value |
| `at:` | location | location (path |


Example: `err "Field X does not exist" src:build`

English: Error: Field X does not exist (source: build)

### `hyp` — hypothesis with confidence

```
hyp <id> <0-100> "statement" st:open|conf|rej ev:
```

| Value | Accepts | |
|---|---|---|
| id | short ID | required |
| conf | whole number 0-100 | required |
| statement | text | required |

| Key | Meaning | Accepts |
|---|---|---|
| `st:` | status | `open` open, `conf` confirmed, `rej` rejected |
| `ev:` | evidence | text |


Example: `hyp h1 70 "duplicate posts come from job queue" st:open`

English: Hypothesis h1 (70% confidence): duplicate posts come from job queue (status: open)

### `q` — question that needs an answer

```
q <id> "question" opt: to:
```

| Value | Accepts | |
|---|---|---|
| id | short ID | required |
| question | text | required |

| Key | Meaning | Accepts |
|---|---|---|
| `opt:` | options | text |
| `to:` | asked to | agent code |


Example: `q q1 "which company to test in?" opt:"CRONUS|EV Test"`

English: Question q1: which company to test in? (options: CRONUS|EV Test)

### `a` — answer to a question

```
a <id> "answer"
```

| Value | Accepts | |
|---|---|---|
| id | short ID | required |
| answer | text | required |


Example: `a q1 CRONUS`

English: Answer to q1: CRONUS

### `need` — something missing

```
need <input|perm|skill|tool> "what"
```

| Value | Accepts | |
|---|---|---|
| kind | `input` input, `perm` permission, `skill` skill, `tool` tool | required |
| what | text | required |


Example: `need skill "AL report layouts"`

English: Needs skill: AL report layouts

### `v` — overall verdict

```
v <verdict> ["reason"]
```

| Value | Accepts | |
|---|---|---|
| status | one of `ok\|part\|fail\|blk` | required |
| reason | text | optional |

- `reason` is required when `status` is `part`, `fail`, `blk`.

Example: `v part "AC 4 not met"`

English: Verdict: partly met — AC 4 not met

### `ext` — language extension proposal

```
ext <rec|key|val|pack|dep> <name> "why" ex: pack:
```

| Value | Accepts | |
|---|---|---|
| kind | `rec` new record, `key` new key, `val` new value, `pack` new pack, `dep` deprecation | required |
| name | value | required |
| why | text | required |

| Key | Meaning | Accepts |
|---|---|---|
| `ex:` | example | text |
| `pack:` | target pack | value |


Example: `ext rec tst "need test counts" ex:"tst 41/42" pack:dev`

English: Language proposal (new record) tst: need test counts (example: tst 41/42; target pack: dev)

### `txt` — short free text, last resort (max 25 words)

```
txt "text"
```

| Value | Accepts | |
|---|---|---|
| text | text | required |


Example: `txt "customer prefers Friday deploy"`

English: Note: customer prefers Friday deploy

## Pack `bc`

Business Central and AL (objects, fields, events, permissions, upgrade code, report layouts, APIs).

### `obj` — AL object

```
obj <al_object> <id> <name> st:new|mod|del ext:
```

| Value | Accepts | |
|---|---|---|
| type | one of `table\|tableextension\|page\|pageextension\|pagecustomization\|codeunit\|report\|reportextension\|query\|xmlport\|enum\|enumextension\|interface\|permissionset\|permissionsetextension\|profile\|controladdin\|entitlement` | required |
| id | whole number | required |
| name | value | required |

| Key | Meaning | Accepts |
|---|---|---|
| `st:` | status | one of `new\|mod\|del` |
| `ext:` | extends | value |


Example: `obj codeunit 50120 "HortenAdvisMgt IFPS" st:mod`

English: AL codeunit 50120 HortenAdvisMgt IFPS (status: modified)

### `fld` — table field

```
fld <table> <no> <name> st:new|mod|del type:
```

| Value | Accepts | |
|---|---|---|
| table | value | required |
| no | whole number | required |
| name | value | required |

| Key | Meaning | Accepts |
|---|---|---|
| `st:` | status | one of `new\|mod\|del` |
| `type:` | AL type | value |


Example: `fld "Cust. Ledger Entry" 50100 "Rykker Status" st:new type:Enum`

English: Field 50100 Rykker Status on Cust. Ledger Entry (status: new; AL type: Enum)

### `evt` — event publisher or subscriber

```
evt <pub|sub> <object> <event> st:new|mod|del
```

| Value | Accepts | |
|---|---|---|
| role | `pub` publisher, `sub` subscriber | required |
| object | value | required |
| event | value | required |

| Key | Meaning | Accepts |
|---|---|---|
| `st:` | status | one of `new\|mod\|del` |


Example: `evt sub "Sales-Post" OnAfterPostSalesDoc st:new`

English: Event subscriber Sales-Post.OnAfterPostSalesDoc (status: new)

### `perm` — permission in a permission set

```
perm <set> <al_perm_object> <object> <RIMDX|->
```

| Value | Accepts | |
|---|---|---|
| set | value | required |
| type | one of `tabledata\|table\|page\|codeunit\|report\|query\|xmlport\|system` | required |
| object | value | required |
| rights | value (format `^(-\|[RIMDX]+)$`) | required |


Example: `perm "EV DEBT" tabledata "Rykker Log" RIMD`

English: Permission set EV DEBT: tabledata Rykker Log = RIMD

### `upg` — upgrade code with upgrade tag

```
upg <codeunit> <tag> ["what"]
```

| Value | Accepts | |
|---|---|---|
| codeunit | value | required |
| tag | value | required |
| what | text | optional |


Example: `upg "EV Upgrade" "EV-1740-RykkerStatus" "fill new status field"`

English: Upgrade in EV Upgrade, tag EV-1740-RykkerStatus — fill new status field

### `lay` — report layout

```
lay <report> <name> <rdlc|word|excel|custom> st:new|mod|del def:y|n
```

| Value | Accepts | |
|---|---|---|
| report | value | required |
| name | value | required |
| kind | `rdlc` RDLC, `word` Word, `excel` Excel, `custom` custom | required |

| Key | Meaning | Accepts |
|---|---|---|
| `st:` | status | one of `new\|mod\|del` |
| `def:` | default layout | `y` yes, `n` no |


Example: `lay "EV Rykker" "EV Rykker DK" word st:new def:y`

English: Layout EV Rykker DK (Word) for report EV Rykker (status: new; default layout: yes)

### `api` — API page or query

```
api <object> <publisher/group/version> <entity> st:new|mod|del ops:
```

| Value | Accepts | |
|---|---|---|
| object | value | required |
| route | value (format `^[^/\s]+/[^/\s]+/[^/\s]+$`) | required |
| entity | value | required |

| Key | Meaning | Accepts |
|---|---|---|
| `st:` | status | one of `new\|mod\|del` |
| `ops:` | operations | text |


Example: `api "EV Rykker API" ev/debt/v1.0 rykkers st:new ops:"GET|PATCH"`

English: API EV Rykker API at ev/debt/v1.0/rykkers (status: new; operations: GET|PATCH)

Adds to `ctx`: `app:` (extension), `co:` (company), `tenant:` (tenant).

Adds to `f`: `rule:` (rule).

Adds to `err`: `rule:` (rule).

## Pack `bcops`

Business Central operations (telemetry).

### `tel` — telemetry observation

```
tel <event> <count> ["observation"] per: obj:
```

| Value | Accepts | |
|---|---|---|
| event | short ID | required |
| count | whole number | required |
| observation | text | optional |

| Key | Meaning | Accepts |
|---|---|---|
| `per:` | period | value |
| `obj:` | object | value |


Example: `tel RT0005 37 "long SQL on rykker posting" per:7d obj:"HortenAdvisMgt IFPS"`

English: Telemetry RT0005: 37 times — long SQL on rykker posting (period: 7d; object: HortenAdvisMgt IFPS)

## Pack `dev`

General software development (builds, tests, changes, estimates, dependencies, HTTP calls).

### `bld` — build result

```
bld <ok|fail> warn: err: tool:
```

| Value | Accepts | |
|---|---|---|
| status | `ok` succeeded, `fail` failed | required |

| Key | Meaning | Accepts |
|---|---|---|
| `warn:` | warnings | whole number |
| `err:` | errors | whole number |
| `tool:` | tool | value |


Example: `bld fail err:2 warn:14 tool:alc`

English: Build failed (errors: 2; warnings: 14; tool: alc)

### `tst` — test run summary

```
tst <passed/total> fail: skip: suite:
```

| Value | Accepts | |
|---|---|---|
| result | passed/total | required |

| Key | Meaning | Accepts |
|---|---|---|
| `fail:` | failed | whole number |
| `skip:` | skipped | whole number |
| `suite:` | suite | value |


Example: `tst 41/42 fail:1 suite:DebtColl`

English: Tests: 41/42 passed (failed: 1; suite: DebtColl)

### `tc` — single test case

```
tc <name> <ok|fail|skip> ["note"]
```

| Value | Accepts | |
|---|---|---|
| name | value | required |
| status | `ok` passed, `fail` failed, `skip` skipped | required |
| note | text | optional |


Example: `tc TestHortenFallback fail "expected 1 entry, got 2"`

English: Test TestHortenFallback: failed — expected 1 entry, got 2

### `chg` — change to a file

```
chg <path> <add|mod|del|ren> ["what"]
```

| Value | Accepts | |
|---|---|---|
| path | value | required |
| kind | `add` added, `mod` modified, `del` deleted, `ren` renamed | required |
| what | text | optional |


Example: `chg "$src/X.al" mod "added Customer No. filter"`

English: Change modified app/src/X.al — added Customer No. filter

### `est` — estimate

```
est <number+h|d|sp> ["basis"] conf:0-100
```

| Value | Accepts | |
|---|---|---|
| amount | number + unit: `h` hours, `d` days, `sp` story points | required |
| basis | text | optional |

| Key | Meaning | Accepts |
|---|---|---|
| `conf:` | confidence (%) | whole number 0-100 |


Example: `est 6h "2 codeunits + tests" conf:60`

English: Estimate 6 hours — 2 codeunits + tests (confidence (%): 60)

### `dep` — dependency change

```
dep <name> <ver> <add|upd|rm>
```

| Value | Accepts | |
|---|---|---|
| name | value | required |
| ver | value | required |
| action | `add` added, `upd` updated, `rm` removed | required |


Example: `dep "Base Application" 25.0 upd`

English: Dependency Base Application 25.0: updated

### `http` — HTTP call made

```
http <GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS> <url> <status> ["note"] ms:
```

| Value | Accepts | |
|---|---|---|
| method | `GET` GET, `POST` POST, `PUT` PUT, `PATCH` PATCH, `DELETE` DELETE, `HEAD` HEAD, `OPTIONS` OPTIONS | required |
| url | value | required |
| status | whole number | required |
| note | text | optional |

| Key | Meaning | Accepts |
|---|---|---|
| `ms:` | duration ms | whole number |


Example: `http PATCH "$base/rykkers(123)" 400 "missing If-Match" ms:212`

English: HTTP PATCH https://api.example.com/rykkers(123) → 400 — missing If-Match (duration ms: 212)

Adds to `ctx`: `repo:` (repository), `pr:` (pull request), `run:` (build/pipeline run).
