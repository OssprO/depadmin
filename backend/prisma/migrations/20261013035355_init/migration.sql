-- CreateEnum
CREATE TYPE "movement_category" AS ENUM ('UNIT_PAYMENT', 'OTHER_INCOME', 'GARBAGE', 'CLEANING', 'OTHER_EXPENSE');

-- CreateEnum
CREATE TYPE "delegation_reason" AS ENUM ('SKIPPED_SHIFT', 'INACTIVE_UNIT', 'OTHER');

-- CreateEnum
CREATE TYPE "charge_type" AS ENUM ('MAINTENANCE_FEE', 'SHIFT_SKIP_PENALTY');

-- CreateEnum
CREATE TYPE "rate_name" AS ENUM ('MAINTENANCE_FEE', 'CLEANING_PER_VISIT', 'GARBAGE_WEEKLY', 'SHIFT_SKIP_PENALTY');

-- CreateTable
CREATE TABLE "unit" (
    "number" INTEGER NOT NULL,

    CONSTRAINT "unit_pkey" PRIMARY KEY ("number")
);

-- CreateTable
CREATE TABLE "unit_inactive_period" (
    "id" UUID NOT NULL,
    "unit_number" INTEGER NOT NULL,
    "from_month" DATE NOT NULL,
    "to_month" DATE,

    CONSTRAINT "unit_inactive_period_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shift_delegation" (
    "id" UUID NOT NULL,
    "from_month" DATE NOT NULL,
    "to_month" DATE NOT NULL,
    "original_unit" INTEGER NOT NULL,
    "delegate_unit" INTEGER NOT NULL,
    "reason" "delegation_reason" NOT NULL,
    "cancelled_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "shift_delegation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rate_change" (
    "rate" "rate_name" NOT NULL,
    "effective_from" DATE NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "rate_change_pkey" PRIMARY KEY ("rate","effective_from")
);

-- CreateTable
CREATE TABLE "reporting_start" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "month" DATE NOT NULL,
    "opening_balance" INTEGER NOT NULL,

    CONSTRAINT "reporting_start_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cash_movement" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "category" "movement_category" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "unit_number" INTEGER,
    "removed_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "cash_movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "charge" (
    "unit_number" INTEGER NOT NULL,
    "month" DATE NOT NULL,
    "type" "charge_type" NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "charge_pkey" PRIMARY KEY ("unit_number","month","type")
);

-- CreateTable
CREATE TABLE "monthly_report" (
    "month" DATE NOT NULL,
    "closed_at" TIMESTAMPTZ,
    "opening_balance" INTEGER,
    "income" INTEGER,
    "expense" INTEGER,
    "closing_balance" INTEGER,

    CONSTRAINT "monthly_report_pkey" PRIMARY KEY ("month")
);

-- CreateTable
CREATE TABLE "audit_log" (
    "id" BIGSERIAL NOT NULL,
    "occurred_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor_id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entity_id" TEXT NOT NULL,
    "changes" JSONB NOT NULL,

    CONSTRAINT "audit_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "unit_inactive_period_unit_number_idx" ON "unit_inactive_period"("unit_number");

-- CreateIndex
CREATE INDEX "shift_delegation_from_month_idx" ON "shift_delegation"("from_month");

-- CreateIndex
CREATE INDEX "cash_movement_date_idx" ON "cash_movement"("date");

-- CreateIndex
CREATE INDEX "cash_movement_unit_number_date_idx" ON "cash_movement"("unit_number", "date");

-- CreateIndex
CREATE INDEX "charge_month_idx" ON "charge"("month");

-- CreateIndex
CREATE INDEX "audit_log_entity_entity_id_idx" ON "audit_log"("entity", "entity_id");

-- CreateIndex
CREATE INDEX "audit_log_occurred_at_idx" ON "audit_log"("occurred_at");

-- AddForeignKey
ALTER TABLE "unit_inactive_period" ADD CONSTRAINT "unit_inactive_period_unit_number_fkey" FOREIGN KEY ("unit_number") REFERENCES "unit"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_delegation" ADD CONSTRAINT "shift_delegation_original_unit_fkey" FOREIGN KEY ("original_unit") REFERENCES "unit"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shift_delegation" ADD CONSTRAINT "shift_delegation_delegate_unit_fkey" FOREIGN KEY ("delegate_unit") REFERENCES "unit"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_movement" ADD CONSTRAINT "cash_movement_unit_number_fkey" FOREIGN KEY ("unit_number") REFERENCES "unit"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "charge" ADD CONSTRAINT "charge_unit_number_fkey" FOREIGN KEY ("unit_number") REFERENCES "unit"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rules Prisma cannot express. They repeat the domain invariants so that no
-- code path (a bug, a script, a manual query) can store an impossible state.
-- ─────────────────────────────────────────────────────────────────────────────

-- Needed to combine "=" on a unit with "&&" on a range in exclusion constraints.
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- Deptos: floors 1–5, doors 1–2.
ALTER TABLE "unit" ADD CONSTRAINT "unit_number_valid"
  CHECK ("number" / 100 BETWEEN 1 AND 5 AND "number" % 100 BETWEEN 1 AND 2);

-- Months are stored as the first day of the month.
ALTER TABLE "unit_inactive_period"
  ADD CONSTRAINT "unit_inactive_period_months_valid" CHECK (
    EXTRACT(DAY FROM "from_month") = 1
    AND ("to_month" IS NULL OR (EXTRACT(DAY FROM "to_month") = 1 AND "to_month" >= "from_month"))
  ),
  -- A depto cannot be inactive twice in the same month.
  ADD CONSTRAINT "unit_inactive_period_no_overlap" EXCLUDE USING gist (
    "unit_number" WITH =,
    daterange("from_month", "to_month", '[]') WITH &&
  );

ALTER TABLE "shift_delegation"
  ADD CONSTRAINT "shift_delegation_months_valid" CHECK (
    EXTRACT(DAY FROM "from_month") = 1
    AND EXTRACT(DAY FROM "to_month") = 1
    AND "to_month" >= "from_month"
  ),
  ADD CONSTRAINT "shift_delegation_not_self" CHECK ("original_unit" <> "delegate_unit"),
  -- At most one active delegation covers any month.
  ADD CONSTRAINT "shift_delegation_no_overlap" EXCLUDE USING gist (
    daterange("from_month", "to_month", '[]') WITH &&
  ) WHERE ("cancelled_at" IS NULL);

ALTER TABLE "rate_change" ADD CONSTRAINT "rate_change_amount_positive" CHECK ("amount" > 0);

ALTER TABLE "reporting_start"
  ADD CONSTRAINT "reporting_start_singleton" CHECK ("id" = 1),
  ADD CONSTRAINT "reporting_start_month_valid" CHECK (EXTRACT(DAY FROM "month") = 1);

ALTER TABLE "cash_movement"
  ADD CONSTRAINT "cash_movement_amount_positive" CHECK ("amount" > 0),
  -- Only unit payments name a depto, and they always do.
  ADD CONSTRAINT "cash_movement_unit_iff_payment"
    CHECK (("category" = 'UNIT_PAYMENT') = ("unit_number" IS NOT NULL)),
  -- Free-form rows need a description.
  ADD CONSTRAINT "cash_movement_description_required" CHECK (
    "category" NOT IN ('OTHER_INCOME', 'OTHER_EXPENSE')
    OR length(btrim(coalesce("description", ''))) > 0
  );

ALTER TABLE "charge"
  ADD CONSTRAINT "charge_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "charge_month_valid" CHECK (EXTRACT(DAY FROM "month") = 1);

ALTER TABLE "monthly_report"
  ADD CONSTRAINT "monthly_report_month_valid" CHECK (EXTRACT(DAY FROM "month") = 1),
  -- Open: no snapshot. Closed: a complete snapshot that adds up.
  ADD CONSTRAINT "monthly_report_snapshot_consistent" CHECK (
    (
      "closed_at" IS NULL AND "opening_balance" IS NULL AND "income" IS NULL
      AND "expense" IS NULL AND "closing_balance" IS NULL
    ) OR (
      "closed_at" IS NOT NULL AND "income" >= 0 AND "expense" >= 0
      AND "closing_balance" = "opening_balance" + "income" - "expense"
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- Append-only audit log. The triggers reject changes from any role, the table
-- owner included (only a superuser can disable triggers). Privileges are a
-- second layer: no one gets UPDATE, DELETE or TRUNCATE through PUBLIC, and the
-- runtime role created at deploy time (phase 5) only receives SELECT, INSERT.
-- ─────────────────────────────────────────────────────────────────────────────

CREATE FUNCTION "audit_log_reject_change"() RETURNS trigger
  LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only (% rejected)', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$;

CREATE TRIGGER "audit_log_no_update_delete"
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION "audit_log_reject_change"();

CREATE TRIGGER "audit_log_no_truncate"
  BEFORE TRUNCATE ON "audit_log"
  FOR EACH STATEMENT EXECUTE FUNCTION "audit_log_reject_change"();

REVOKE UPDATE, DELETE, TRUNCATE ON "audit_log" FROM PUBLIC;
