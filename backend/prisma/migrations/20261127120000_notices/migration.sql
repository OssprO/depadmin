-- Notices and the emails a user may turn off (phase 25, ADR-0034).

-- CreateEnum
CREATE TYPE "email_topic" AS ENUM ('NOTICES');

-- AlterTable
ALTER TABLE "app_user" ADD COLUMN     "email_opt_outs" "email_topic"[] DEFAULT ARRAY[]::"email_topic"[];

-- AlterTable
ALTER TABLE "email_outbox" ADD COLUMN     "unsubscribe_page" TEXT,
ADD COLUMN     "unsubscribe_post" TEXT;

-- CreateTable
CREATE TABLE "notice" (
    "id" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "expires_on" DATE,
    "author_id" UUID NOT NULL,
    "author_role" "role" NOT NULL,
    "author_unit" INTEGER,
    "published_at" TIMESTAMPTZ NOT NULL,
    "withdrawn_at" TIMESTAMPTZ,
    "withdrawn_by" UUID,

    CONSTRAINT "notice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notice_read" (
    "notice_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "read_at" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "notice_read_pkey" PRIMARY KEY ("notice_id","user_id")
);

-- CreateIndex
CREATE INDEX "notice_published_at_idx" ON "notice"("published_at");

-- CreateIndex
CREATE INDEX "notice_read_user_id_idx" ON "notice_read"("user_id");

-- AddForeignKey
ALTER TABLE "notice" ADD CONSTRAINT "notice_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "app_user"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_read" ADD CONSTRAINT "notice_read_notice_id_fkey" FOREIGN KEY ("notice_id") REFERENCES "notice"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notice_read" ADD CONSTRAINT "notice_read_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "app_user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Hand-written (Prisma's diff ignores CHECKs): the limits the domain enforces, a reader never
-- publishes, and a withdrawn notice says who withdrew it.
ALTER TABLE "notice" ADD CONSTRAINT "notice_title_length"
    CHECK (char_length("title") BETWEEN 1 AND 100 AND "title" = btrim("title"));
ALTER TABLE "notice" ADD CONSTRAINT "notice_body_length"
    CHECK (char_length("body") BETWEEN 1 AND 2000);
ALTER TABLE "notice" ADD CONSTRAINT "notice_author"
    CHECK ("author_role" <> 'READER' AND ("author_role" = 'OWNER') = ("author_unit" IS NOT NULL));
ALTER TABLE "notice" ADD CONSTRAINT "notice_withdrawn"
    CHECK (("withdrawn_at" IS NULL) = ("withdrawn_by" IS NULL));
