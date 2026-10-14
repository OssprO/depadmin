-- The log is still empty when this runs (nothing wrote to it before phase 4), so the new
-- columns can be NOT NULL without a default.

-- AlterTable
ALTER TABLE "audit_log" ADD COLUMN     "actor_role" "role" NOT NULL,
ADD COLUMN     "actor_unit" INTEGER,
ADD COLUMN     "entity_label" TEXT NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-written: rules Prisma cannot express.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "audit_log"
  -- An owner acts for exactly one depto; the superadmin for none.
  ADD CONSTRAINT "audit_log_actor_unit_iff_owner"
    CHECK (("actor_role" = 'OWNER') = ("actor_unit" IS NOT NULL)),
  ADD CONSTRAINT "audit_log_changes_is_array" CHECK (jsonb_typeof("changes") = 'array'),
  ADD CONSTRAINT "audit_log_action_valid" CHECK ("action" ~ '^[A-Z][A-Z0-9_]*$'),
  ADD CONSTRAINT "audit_log_entity_valid" CHECK ("entity" ~ '^[a-z][a-z0-9_]*$');
