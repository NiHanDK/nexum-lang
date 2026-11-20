# Changing NEXUM

## How the language grows

| Step | Where | Who |
|---|---|---|
| 1. An agent writes an `ext` record (what is missing, why, an example) | Agent setups | Any agent |
| 2. Proposals and `txt` usage are sent here as issues (`proposal`, `txt-log`) | Setup Stop hook → `nx propose` | Automatic |
| 3. Duplicates are grouped, evidence is collected, repeated `txt` lines become proposals | `Steward` workflow, weekly | Steward agent |
| 4. An idea seen in at least 3 separate tasks becomes a PR | `Steward` workflow | Steward agent |
| 5. Budget and compatibility checks | `CI` workflow | Automatic, no override |
| 6. Review with a recommendation | `Reviewer` workflow | Reviewer agent |
| 7. Approve and merge | GitHub | **Nicolai only** (CODEOWNERS + branch protection) |
| 8. Tag and release; setups pick it up with `nx sync` | `Release` workflow | Automatic |

Every proposal PR must include usage evidence (how often the pattern occurs, in which tasks) **and** an estimated token saving.

## What kind of change is allowed

| Change | Version | Who can approve |
|---|---|---|
| New record, key, value, unit, pack, message type | MINOR (1.0 → 1.1) | Nicolai, after the reviewer agent |
| Wording of `meaning`, `en` templates, labels | PATCH (1.0.0 → 1.0.1), flagged for review | Nicolai |
| Deprecation (marking something as not to be used any more) | MINOR, nothing is removed | Nicolai |
| Removing or renaming anything, changing a meaning, making something optional required, changing value order | MAJOR (1.x → 2.0) | **Nicolai only**, expected almost never |

`tools/check-compat.mjs` compares the registry with the last release and enforces these rules in CI.

Agents should mostly propose the **additions they need**. Many agents in many setups depend on what exists today.

## Where a change goes

- **`core`** only if two or more packs or setups need it (and it fits the 20-record budget).
- Otherwise the **narrowest pack** that fits. A pack nearing its budget is split into a narrower pack (as `bcops` was split from `bc`); the budget is not raised.
- **No synonyms**: never add a second word for something that already exists.
- Customer-specific packs (e.g. `ev`) are created only when the evidence shows a need.

## Budgets

`budgets.yaml` is locked. CI fails any change that exceeds it and refuses PRs that change both `budgets.yaml` and `registry/`. Raising a budget is a separate PR that only Nicolai can approve.

## Working locally

```sh
npm install
# edit registry/*.yaml, raise the version in registry/language.yaml and package.json
npm run build          # regenerates dist/ (commit it)
npm run check          # build, tests, budget check, compatibility check
```

Never edit `dist/` by hand.

## Major versions and support

Every released version stays available as a git tag and release, permanently. After a new major version ships, the previous major stays supported for 12 months, or until no setup declares it, whichever comes first.
