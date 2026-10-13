# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mobile-first web app to manage maintenance fees for a 10-unit building ("Edificio Correspondencia 63"). It replaces a monthly PDF report shared over WhatsApp.

- **`docs/SPEC.md`** is the source of truth for business rules and roles.
- **`docs/PLAN.md`** holds the agreed stack, the hexagonal architecture, the data-model changes to the spec, the phased plan and the open questions with their default answers. Read both before implementing domain logic. Decisions are recorded as ADRs in `docs/adr/`.

**Language:** code (identifiers, tables) is in English, and the UI is in Spanish. Map business terms through the glossary in PLAN.md section 3 (depto → `Unit`, turno → `Shift`, egreso → `Expense`, bitácora → `AuditLog`, and so on).

**Working mode:** one phase per PR. Explain the reasoning behind a design before implementing, include tests, and wait for the user's approval before starting the next phase.

**Current state:** phase 0 (foundations) is on branch `chore/fase-0-fundaciones`. Phase 1 (pure domain, no DB or HTTP) is on `feat/fase-1-dominio`: `shared-kernel` plus the `domain/` folders of `units`, `shifts`, `identity`, `settings`, `cashbook`, `billing` and `reports`. No application, infrastructure or http layers exist yet; persistence starts in phase 2.

## Layout & tooling

pnpm 11 workspace: `backend/` (`@depadmin/backend`, NestJS 12 in ESM), `frontend/` (`@depadmin/frontend`, React 19 + Vite 8 + Tailwind v4 + shadcn/ui) and `packages/shared/` (`@depadmin/shared`, Zod contracts). TypeScript 6.0 everywhere, with strict options in `tsconfig.base.json`. Don't add Nx or Turborepo.

```bash
pnpm install          # also builds @depadmin/shared (root postinstall)
pnpm db:up            # Postgres 18 on 127.0.0.1:5433 (not 5432: the host may run its own Postgres)
pnpm dev              # shared (tsc watch) + API :3000 + web :5173; Vite proxies /api to the API
pnpm lint             # ESLint for the whole repo, including the hexagonal boundary rule
pnpm format           # Prettier
pnpm typecheck
pnpm test             # Vitest unit tests in every package (*.spec.ts / *.spec.tsx next to code)
pnpm test:e2e         # backend/test/*.e2e-spec.ts (supertest)
pnpm --filter @depadmin/backend test:cov   # domain coverage; fails under 90% (CI runs it)
pnpm build

# single package / single test
pnpm --filter @depadmin/backend test -- src/platform/config/env.spec.ts
pnpm --filter @depadmin/frontend test -- -t "offers a retry"
```

CI (`.github/workflows/ci.yml`) runs format:check, lint, typecheck, test, domain coverage, test:e2e and build. Husky runs lint-staged on commit, and commitlint enforces Conventional Commits.

### Gotchas

- **Backend imports:** relative imports need a `.js` extension (ESM). Don't use `import type` for classes injected through constructors, because Nest DI relies on `emitDecoratorMetadata`. For the same reason the backend has no `verbatimModuleSyntax` or `consistent-type-imports`.
- **Changing `packages/shared`:** rebuild it (`pnpm --filter @depadmin/shared build`, or keep `pnpm dev` running). Consumers import its `dist/`.
- **Adding shadcn components:** run `pnpm exec shadcn add <component>` from `frontend/`. The `@/*` alias must stay in `frontend/tsconfig.json`; without it, shadcn writes to a literal `frontend/@/` folder with a broken `cn` import.
- **Dependencies with install scripts:** pnpm 11 fails the install until the package is listed under `allowBuilds` in `pnpm-workspace.yaml`.
- **Shared HTTP setup:** `configureApp()` in `backend/src/platform/http/` holds the global prefix and other HTTP setup, and e2e tests use it too. Put new global HTTP setup there, not in `main.ts`.
- **Domain tests:** assert errors by code with `toThrow(withCode('MONTH_CLOSED'))` from `backend/test/support/domain-error.ts`. Shared test builders for a module go in `domain/testing.ts`, which is excluded from the build and from coverage. `*.spec.ts` files are exempt from the boundary rule so they can import vitest.
- **Domain dates:** use `LocalDate` and `YearMonth` from the shared kernel, never `Date`. Calendar math in `shared-kernel/calendar.ts` doesn't depend on the host time zone, and "today" comes from the `Clock` port.
- **Env vars:** new environment variables must be added to the Zod schema in `backend/src/platform/config/env.ts` and to `backend/.env.example`.

## Architecture rules

- **Backend:** hexagonal modules under `backend/src/modules/<module>/{domain,application,infrastructure,http}`, plus `<module>.module.ts`, `shared-kernel/` and `platform/`. `eslint.config.js` (`hexagonalPolicies`) enforces this layout. `domain/` and `shared-kernel/` cannot import any package or Node API.
  - `domain/` is plain TypeScript. It never imports Nest, Prisma or another module.
  - Modules talk to each other only through use cases or queries, never through each other's repositories.
- Each use case is one class. A write use case runs inside a `UnitOfWork` transaction that also writes its `AuditLog` entries.
- Domain errors are mapped to RFC 9457 Problem Details by a global filter.
- **Money** is integer centavos wrapped in a `Money` value object. Never use floats.
- The **backend is the authority** for money and shift calculations. The frontend only displays results and validates forms with the shared Zod schemas.

## Domain rules that drive architecture

- **Write permission depends on time.** Superadmin can always write. A dueño can write a month only if their depto is responsible for it (it holds the turno or receives a delegation of it). The window runs from day 1 of the month until `WRITE_GRACE_DAYS` (5) days after their unbroken responsibility ends: 501 can fix August during September, and both months until 5 October. Those days are the handover. In them, the outgoing owner closes their own months (`assertCanClose`) and records the next shift's handover (`assertCanHandOver` plus `ShiftScheduler.assertIsHandover`): the next depto takes it, or skips it and the outgoing depto or someone it picks covers. Only the superadmin reopens months. The next holder has no access to earlier months. Responsibility reaches the policy through the `ShiftResponsibility` port. This check is the domain `WriteAccessPolicy`, called from use cases, not only an HTTP guard. Whether the month is open is a separate check that `MonthlyCashbook` enforces.
- **The shift is computed, not stored per month.** The anchor is 2026-08 → depto 501, with fixed rotation 501→502→401→402→301→302→201→202→101→102 and 2 months per shift. The calendar never shifts for inactive deptos: an inactive depto's period has no responsible units until the superadmin assigns a cover with a `ShiftDelegation` (reason `INACTIVE_UNIT`, no penalty). A delegation stays within one scheduled period and overrides the months it covers. During it, both the original and the delegated depto can write while they are active. `ShiftScheduler` gets unit status through the `UnitAvailability` port, because domains never import other modules.
- **One monthly cashbook (`CashMovement`) holds every income and expense row:** `UNIT_PAYMENT`, `OTHER_INCOME`, `GARBAGE`, `CLEANING` and `OTHER_EXPENSE`. Its list view is the turn admin's main screen, and the monthly report is the opening balance plus that month's rows. Add, edit and remove go through one set of use cases, with a validation strategy per category.
- **Rows are cash-basis:** the row's date sets its month. Garbage is one $150 row per week, suggested as pending until it is confirmed. Cleaning is one row per visit. Weekly grouping is only a payout summary.
- **Billing:** monthly `Charge`s (fee, plus a $500 skip penalty per skipped month, from `shiftSkipPenalties`; with the regular fee that makes the spec's $1,200 per month) are keyed by depto, month and type. `UNIT_PAYMENT` rows cover them oldest-first through `allocatePayments`, a pure function recomputed from scratch after any edit. Adeudo, adelanto and partial payments are derived in `AccountStatement` and never stored.
- **Editing:** rows can be edited or soft-deleted while the month is open, with audit, and allocations are recomputed. A closed month is frozen.
- **The monthly report** is opened, then closed (which stores a snapshot) by the outgoing owner within their window or by the superadmin, and reopened only by the superadmin. `ReportLedger` opens and closes months in order. An open month's balances are live, from the previous month's closing balance; a closed month answers with its snapshot. Re-closing a reopened month restates the later closed months, stopping at the first open one.
- **The audit log is append-only and enforced in the database** by a trigger plus revoked UPDATE/DELETE grants.
- **The rate settings** (`RateSettings` in the `settings` module: fee, cleaning rate, garbage amount, penalty) have effective dates. Changes are only appended after the latest one, so they never rewrite past months.

## Frontend conventions

- `@/*` resolves to `frontend/src/*`. Code is organized by feature under `src/features/<feature>/` (`api.ts` for Query hooks, `components/`, `routes/`).
- Routing and data use TanStack Router and TanStack Query. Forms use react-hook-form with the Zod schemas from `packages/shared`.
- shadcn style `base-lyra` is built on **Base UI (`@base-ui/react`), not Radix**, and uses **Phosphor icons**. Add components with `pnpm dlx shadcn add <component>` from `frontend/`. Tailwind v4 is configured through `@tailwindcss/vite`, with theme tokens in `src/index.css` and no `tailwind.config`.
