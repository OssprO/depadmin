-- Read-only users (phase 14, ADR-0025): a new role, any number of them per depto, and an
-- expiry date and a deactivation switch for anyone but the superadmin.

-- AlterEnum
ALTER TYPE "role" ADD VALUE 'READER';

-- AlterEnum
ALTER TYPE "audit_actor_role" ADD VALUE 'READER';

-- DropIndex
DROP INDEX "app_user_unit_number_key";

-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "disabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "expires_on" DATE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-written: rules Prisma cannot express (they repeat the invariants of User). A new
-- enum value cannot be used in the transaction that adds it, so they name the others.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "app_user"
  DROP CONSTRAINT "app_user_unit_iff_owner",
  -- An owner has its depto; a read-only user may have one or none.
  ADD CONSTRAINT "app_user_owner_has_unit" CHECK ("role" <> 'OWNER' OR "unit_number" IS NOT NULL),
  -- The superadmin has no depto, no expiry and is never deactivated.
  ADD CONSTRAINT "app_user_superadmin_access_fixed" CHECK (
    "role" <> 'SUPERADMIN' OR ("unit_number" IS NULL AND "expires_on" IS NULL AND NOT "disabled")
  ),
  -- One owner per depto. An exclusion constraint rather than a partial unique index,
  -- which Prisma's diff would try to drop.
  ADD CONSTRAINT "app_user_one_owner_per_unit"
    EXCLUDE USING btree ("unit_number" WITH =) WHERE ("role" = 'OWNER');

ALTER TABLE "audit_log"
  DROP CONSTRAINT "audit_log_actor_unit_iff_owner",
  -- An owner acts for its depto; the superadmin and the app for none; a read-only user
  -- (who only changes its own password) for its depto, if it has one.
  ADD CONSTRAINT "audit_log_owner_has_unit" CHECK ("actor_role" <> 'OWNER' OR "actor_unit" IS NOT NULL),
  ADD CONSTRAINT "audit_log_admin_and_app_have_no_unit"
    CHECK ("actor_role" NOT IN ('SUPERADMIN', 'SYSTEM') OR "actor_unit" IS NULL);
