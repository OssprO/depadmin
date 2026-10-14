-- The audit log can now record the app itself (role SYSTEM) as the author of a change, for
-- scheduled jobs such as opening the month when nobody did. It gets its own enum so that the
-- users' role can never be SYSTEM.
--
-- Hand-written: Prisma's diff would drop and recreate the column, losing the log. The type
-- is converted in place instead (a rewrite, which fires no row triggers), and the CHECK that
-- compares the role is dropped first and added again, because it is typed by the old enum.

-- CreateEnum
CREATE TYPE "audit_actor_role" AS ENUM ('SUPERADMIN', 'OWNER', 'SYSTEM');

ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_actor_unit_iff_owner";

-- AlterTable
ALTER TABLE "audit_log"
  ALTER COLUMN "actor_role" TYPE "audit_actor_role" USING "actor_role"::text::"audit_actor_role";

ALTER TABLE "audit_log"
  -- An owner acts for exactly one depto; the superadmin and the system for none.
  ADD CONSTRAINT "audit_log_actor_unit_iff_owner"
    CHECK (("actor_role" = 'OWNER') = ("actor_unit" IS NOT NULL)),
  -- The system has one fixed id, which no user (a UUID) can have.
  ADD CONSTRAINT "audit_log_system_actor_id"
    CHECK (("actor_role" = 'SYSTEM') = ("actor_id" = 'system'));
