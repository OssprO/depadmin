-- AlterTable
ALTER TABLE "cash_movement" ADD COLUMN     "covers_week" DATE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-written: rules Prisma cannot express.
-- ─────────────────────────────────────────────────────────────────────────────

-- Garbage rows recorded before this phase paid for the week of their date (weeks start on
-- Monday, as date_trunc('week') does).
UPDATE "cash_movement"
SET "covers_week" = date_trunc('week', "date")::date
WHERE "category" = 'GARBAGE';

ALTER TABLE "cash_movement"
  -- Garbage rows say which week they pay for, and no other row names a week.
  ADD CONSTRAINT "cash_movement_week_iff_garbage"
    CHECK (("category" = 'GARBAGE') = ("covers_week" IS NOT NULL)),
  -- A week is named by its Monday.
  ADD CONSTRAINT "cash_movement_week_is_monday"
    CHECK ("covers_week" IS NULL OR extract(isodow FROM "covers_week") = 1),
  -- Each week's garbage is paid once (removed rows free their week). An exclusion
  -- constraint rather than a partial unique index, which Prisma's diff would try to drop.
  ADD CONSTRAINT "cash_movement_one_garbage_per_week"
    EXCLUDE USING btree ("covers_week" WITH =) WHERE ("removed_at" IS NULL);
