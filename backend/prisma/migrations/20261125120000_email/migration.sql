-- Email and password recovery (ADR-0033).

-- CreateEnum
CREATE TYPE "user_token_purpose" AS ENUM ('EMAIL_CONFIRMATION', 'PASSWORD_RECOVERY');

-- CreateEnum
CREATE TYPE "email_status" AS ENUM ('PENDING', 'SENT', 'FAILED', 'EXPIRED');

-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "email" TEXT,
ADD COLUMN     "pending_email" TEXT;

-- CreateTable
CREATE TABLE "user_token" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "purpose" "user_token_purpose" NOT NULL,
    "token_hash" TEXT NOT NULL,
    "email" TEXT,
    "expires_at" TIMESTAMPTZ NOT NULL,
    "used_at" TIMESTAMPTZ,
    "revoked_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "user_token_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "email_outbox" (
    "id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "paragraphs" JSONB NOT NULL,
    "action_label" TEXT,
    "action_path" TEXT,
    "urgent" BOOLEAN NOT NULL,
    "status" "email_status" NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "next_attempt_at" TIMESTAMPTZ NOT NULL,
    "send_by" TIMESTAMPTZ NOT NULL,
    "claimed_until" TIMESTAMPTZ,
    "last_error" TEXT,
    "created_at" TIMESTAMPTZ NOT NULL,
    "sent_at" TIMESTAMPTZ,
    "finished_at" TIMESTAMPTZ,

    CONSTRAINT "email_outbox_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "user_token_token_hash_key" ON "user_token"("token_hash");

-- CreateIndex
CREATE INDEX "user_token_user_id_purpose_created_at_idx" ON "user_token"("user_id", "purpose", "created_at");

-- CreateIndex
CREATE INDEX "email_outbox_status_urgent_next_attempt_at_idx" ON "email_outbox"("status", "urgent", "next_attempt_at");

-- CreateIndex
CREATE INDEX "email_outbox_sent_at_idx" ON "email_outbox"("sent_at");

-- AddForeignKey
ALTER TABLE "user_token" ADD CONSTRAINT "user_token_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written (Prisma's diff ignores CHECKs): addresses are stored as the domain normalizes
-- them, and a confirmation link always names the address it confirms.
ALTER TABLE "app_user" ADD CONSTRAINT "app_user_email_normalized"
    CHECK ("email" = lower(btrim("email")) AND "pending_email" = lower(btrim("pending_email")));
ALTER TABLE "user_token" ADD CONSTRAINT "user_token_confirmation_email"
    CHECK ("purpose" <> 'EMAIL_CONFIRMATION' OR "email" IS NOT NULL);
