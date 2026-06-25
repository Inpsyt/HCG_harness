# CI contract-drift gate (template)

> Wire deterministic contract↔code drift checks into CI so a drift **fails the
> build**, not just a manual qa pass. This is the machine-checkable layer the
> `contract-authoring` skill prescribes; the agentic `converge` workflow covers the
> *semantic* drift these deterministic checks can't see.
>
> Copy the relevant steps into your CI (GitHub Actions / GitLab CI / etc.) and
> adjust paths to your project. All checks are **deterministic** — no model calls.

## Why

`contracts/` is the authoritative SSOT, kept authoritative by the write-lock +
review gate. But "authoritative" ≠ "in sync with the code". Prose `db-schema.md`
↔ `prisma/schema.prisma` and `api-spec.md` ↔ route/Zod are two copies of one
truth; `tsc` only catches the typed one (`shared-types.ts`). These CI checks make
the rest machine-checkable.

## Deterministic checks (per contract)

| Contract | CI check | Fails when |
|---|---|---|
| `shared-types.ts` | `tsc --noEmit` | implementation diverges from the typed SSOT (or redefines instead of importing) |
| `db-schema.md` ↔ Prisma | `prisma validate` + `prisma migrate diff --exit-code` | schema invalid, or migrations don't match `schema.prisma` |
| `api-spec` ↔ routes | OpenAPI lint + contract tests (handlers validated against the OpenAPI/Zod) | a route's request/response shape diverges from the spec |
| `design-guide.md` | hardcoded-color lint (e.g. stylelint rule: only `var(--token)`) | a literal color value is used instead of a design-guide CSS variable |

## Example: GitHub Actions step

```yaml
# .github/workflows/contracts.yml  (CUSTOMIZE paths/commands to your project)
name: contract-drift
on: [pull_request]
jobs:
  contracts:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: corepack enable && pnpm install --frozen-lockfile

      # shared-types SSOT: implementation must compile against the typed contract
      - run: pnpm tsc --noEmit

      # db-schema ↔ Prisma: schema valid + migrations in sync (no drift)
      - run: pnpm prisma validate
      - run: pnpm prisma migrate diff \
          --from-migrations prisma/migrations \
          --to-schema-datamodel prisma/schema.prisma \
          --exit-code   # non-zero ⇒ schema and migrations drifted → fail the build

      # api-spec ↔ routes: lint the OpenAPI doc + run contract tests
      # - run: pnpm redocly lint contracts/openapi.yaml
      # - run: pnpm test:contract

      # design-guide: forbid hardcoded colors (stylelint custom rule)
      # - run: pnpm stylelint "apps/web/**/*.{css,tsx}"
```

> Lines are commented where the form is your choice (OpenAPI vs Zod-derived, your
> stylelint config). Enable the rows your project uses.

## Semantic drift (what deterministic checks miss)

`prisma migrate diff` proves the schema and migrations agree, but **not** that they
agree with the *intent* in `db-schema.md`; a contract requirement can be silently
unimplemented and still pass every deterministic check. For that **semantic** gap,
run the agentic gate on a schedule or before a milestone:

```
Workflow({ name: 'converge', args: '<optional area/scope>' })
```

`converge` classifies each contract requirement satisfied/partial/missing/
contradicts and proposes reconciliation tasks (read-only; fail-closed). Use the
deterministic CI gate for every PR (cheap, blocking) and `converge` periodically
for the semantic drift it can't catch.
