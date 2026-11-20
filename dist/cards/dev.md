# NEXUM nx1.0 · pack dev: General software development (builds, tests, changes, estimates, dependencies, HTTP calls).
Declare dev in the first line to use these records.
Records:
bld <ok|fail> warn: err: tool: — build result
tst <passed/total> fail: skip: suite: — test run summary
tc <name> <ok|fail|skip> ["note"] — single test case
chg <path> <add|mod|del|ren> ["what"] — change to a file
est <number+h|d|sp> ["basis"] conf:0-100 — estimate
dep <name> <ver> <add|upd|rm> — dependency change
http <GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS> <url> <status> ["note"] ms: — HTTP call made
Adds keys: ctx repo: pr: run:
