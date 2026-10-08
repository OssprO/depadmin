# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Mobile-first web app to manage maintenance fees for a 10-unit building ("Edificio Correspondencia 63"). It replaces a monthly PDF report shared over WhatsApp.

- **`docs/SPEC.md`** is the source of truth for business rules and roles.
- **`docs/PLAN.md`** holds the agreed stack, the hexagonal architecture, the data-model changes to the spec, the phased plan and the open questions with their default answers. Read both before implementing domain logic. Decisions are recorded as ADRs in `docs/adr/`.

**Language:** code (identifiers, tables) is in English, and the UI is in Spanish. Map business terms through the glossary in PLAN.md section 3 (depto → `Unit`, turno → `Shift`, egreso → `Expense`, bitácora → `AuditLog`, and so on).

**Working mode:** one phase per PR. Explain the reasoning behind a design before implementing, include tests, and wait for the user's approval before starting the next phase.

**Current state:** phase 0 has not started. Both packages are still close to their scaffolds. Phase 0 will switch the backend from Jest to Vitest and add `packages/shared`, root scripts and Docker, so update the commands below when that lands.

## Layout & tooling

pnpm workspace monorepo with `backend/` (NestJS 11) and `frontend/` (React 19 + Vite + Tailwind v4 + shadcn/ui). `packages/shared` (Zod schemas shared by both sides) is planned. Don't add Nx or Turborepo. The root `package.json` has no scripts yet, so run commands with `pnpm --filter <pkg>`.

```bash
pnpm install                                   # from repo root

# backend (NestJS, listens on PORT or 3000)
pnpm --filter backend start:dev                # watch mode
pnpm --filter backend build
pnpm --filter backend lint                     # eslint --fix
pnpm --filter backend format                   # prettier
pnpm --filter backend test                     # unit tests: src/**/*.spec.ts (Jest for now)
pnpm --filter backend test -- src/app.controller.spec.ts   # single file
pnpm --filter backend test -- -t "test name"               # single test by name
pnpm --filter backend test:e2e                 # test/*.e2e-spec.ts (supertest)

# frontend (Vite)
pnpm --filter frontend dev
pnpm --filter frontend build                   # tsc -b && vite build
pnpm --filter frontend lint
```

## Architecture rules

- **Backend:** hexagonal modules under `backend/src/modules/<module>/{domain,application,infrastructure,http}`, plus `shared-kernel/` and `platform/`.
  - `domain/` is plain TypeScript. It never imports Nest, Prisma or another module.
  - Modules talk to each other only through use cases or queries, never through each other's repositories.
  - These boundaries are checked by `eslint-plugin-boundaries`.
- Each use case is one class. A write use case runs inside a `UnitOfWork` transaction that also writes its `AuditLog` entries.
- Domain errors are mapped to RFC 9457 Problem Details by a global filter.
- **Money** is integer centavos wrapped in a `Money` value object. Never use floats.
- The **backend is the authority** for money and shift calculations. The frontend only displays results and validates forms with the shared Zod schemas.

## Domain rules that drive architecture

- **Write permission depends on time.** Superadmin can always write. A dueño can write only while their depto holds the turno, or receives a delegation of it, for the report's month. This check is a domain `WriteAccessPolicy` called from use cases, not only an HTTP guard.
- **The shift is computed, not stored per month.** The anchor is 2026-08 → depto 501, with fixed rotation 501→502→401→402→301→302→201→202→101→102 and 2 months per shift. Inactive deptos are skipped based on their `UnitStatusPeriod` history. A `ShiftDelegation` overrides a period, and both the original and the delegated depto can write during it.
- **One monthly cashbook (`CashMovement`) holds every income and expense row:** `UNIT_PAYMENT`, `OTHER_INCOME`, `GARBAGE`, `CLEANING` and `OTHER_EXPENSE`. Its list view is the turn admin's main screen, and the monthly report is the opening balance plus that month's rows. Add, edit and remove go through one set of use cases, with a validation strategy per category.
- **Rows are cash-basis:** the row's date sets its month. Garbage is one $150 row per week, suggested as pending until it is confirmed. Cleaning is one row per visit. Weekly grouping is only a payout summary.
- **Billing:** monthly `Charge`s (fee, skip penalty) are covered oldest-first by `UNIT_PAYMENT` rows through `PaymentAllocation`. Adeudo, adelanto and partial payments are derived, never stored.
- **Editing:** rows can be edited or soft-deleted while the month is open, with audit, and allocations are recomputed. A closed month is frozen.
- **The monthly report** is opened, closed (which stores a snapshot) and reopened only by the superadmin, which recalculates later closed months in cascade. A month's closing balance becomes the next month's opening balance.
- **The audit log is append-only and enforced in the database** by a trigger plus revoked UPDATE/DELETE grants.
- **The rate settings** (fee, cleaning rate, garbage amount, penalty) have effective dates, so changing them never rewrites past months.

## Frontend conventions

- `@/*` resolves to `frontend/src/*`. Code is organized by feature under `src/features/<feature>/` (`api.ts` for Query hooks, `components/`, `routes/`).
- Routing and data use TanStack Router and TanStack Query. Forms use react-hook-form with the Zod schemas from `packages/shared`.
- shadcn style `base-lyra` is built on **Base UI (`@base-ui/react`), not Radix**, and uses **Phosphor icons**. Add components with `pnpm dlx shadcn add <component>` from `frontend/`. Tailwind v4 is configured through `@tailwindcss/vite`, with theme tokens in `src/index.css` and no `tailwind.config`.
