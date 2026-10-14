-- CreateEnum
CREATE TYPE "role" AS ENUM ('SUPERADMIN', 'OWNER');

-- CreateTable
CREATE TABLE "app_user" (
    "id" UUID NOT NULL,
    "username" TEXT NOT NULL,
    "role" "role" NOT NULL,
    "unit_number" INTEGER,
    "password_hash" TEXT,
    "must_change_password" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "app_user_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_token" (
    "id" UUID NOT NULL,
    "session_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "rotated_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_token_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "app_user_username_key" ON "app_user"("username");

-- CreateIndex
CREATE UNIQUE INDEX "app_user_unit_number_key" ON "app_user"("unit_number");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_token_token_hash_key" ON "refresh_token"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_token_session_id_idx" ON "refresh_token"("session_id");

-- CreateIndex
CREATE INDEX "refresh_token_user_id_idx" ON "refresh_token"("user_id");

-- AddForeignKey
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_unit_number_fkey" FOREIGN KEY ("unit_number") REFERENCES "unit"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_token" ADD CONSTRAINT "refresh_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Rules Prisma cannot express (they repeat the invariants of the User entity).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "app_user"
  -- Stored normalized (lowercase), so the unique index is case-insensitive.
  ADD CONSTRAINT "app_user_username_valid" CHECK ("username" ~ '^[a-z0-9._-]{3,32}$'),
  -- An owner has exactly one depto; the superadmin has none.
  ADD CONSTRAINT "app_user_unit_iff_owner" CHECK (("role" = 'OWNER') = ("unit_number" IS NOT NULL)),
  -- A password change can only be pending if there is a (temporary) password.
  ADD CONSTRAINT "app_user_password_change_needs_password"
    CHECK (NOT "must_change_password" OR "password_hash" IS NOT NULL);

ALTER TABLE "refresh_token"
  ADD CONSTRAINT "refresh_token_hash_is_sha256" CHECK ("token_hash" ~ '^[0-9a-f]{64}$');
