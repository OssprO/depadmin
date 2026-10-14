-- AlterTable
ALTER TABLE "unit" ADD COLUMN     "owner_name" TEXT;

-- CreateTable
CREATE TABLE "opening_credit" (
    "unit_number" INTEGER NOT NULL,
    "month" DATE NOT NULL,
    "amount" INTEGER NOT NULL,

    CONSTRAINT "opening_credit_pkey" PRIMARY KEY ("unit_number")
);

-- AddForeignKey
ALTER TABLE "opening_credit" ADD CONSTRAINT "opening_credit_unit_number_fkey" FOREIGN KEY ("unit_number") REFERENCES "unit"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-written: rules Prisma cannot express.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "unit"
  ADD CONSTRAINT "unit_owner_name_valid"
    CHECK ("owner_name" IS NULL OR char_length(btrim("owner_name")) BETWEEN 1 AND 80);

ALTER TABLE "opening_credit"
  ADD CONSTRAINT "opening_credit_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "opening_credit_month_valid" CHECK (EXTRACT(DAY FROM "month") = 1);
