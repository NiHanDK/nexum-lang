# Changelog

## 1.0.0 (2026-11-20)

First version of NEXUM, successor to KORT-EV.

- **core**: 15 records (`def`, `ctx`, `ac`, `f`, `chk`, `step`, `out`, `err`, `hyp`, `q`, `a`, `need`, `v`, `ext`, `txt`), five message types (`do`, `done`, `fail`, `upd`, `ask`), shared status sets.
- **dev**: `bld`, `tst`, `tc`, `chg`, `est`, `dep`, `http`; `ctx` keys `repo`, `pr`, `run`.
- **bc**: `obj`, `fld`, `evt`, `perm`, `upg`, `lay`, `api`; `ctx` keys `app`, `co`, `tenant`; `rule:` on `f` and `err`.
- **bcops**: `tel`.
- Tooling: deterministic translator (web page and CLI), linter, agent cards, budget and compatibility checks, `nx sync`, `nx propose`.
- Governance: CODEOWNERS, CI, release, steward and reviewer workflows.
