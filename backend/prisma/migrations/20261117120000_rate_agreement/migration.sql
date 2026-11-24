-- AlterTable: where each rate change was agreed (ADR-0031). Additive only (ADR-0029).
ALTER TABLE "rate_change" ADD COLUMN "agreed_on" DATE,
ADD COLUMN "agreement" TEXT;

-- Both or neither, and a summary of at most 300 characters (RATE_AGREEMENT_MAX_LENGTH).
ALTER TABLE "rate_change" ADD CONSTRAINT "rate_change_agreement_complete"
  CHECK (("agreed_on" IS NULL) = ("agreement" IS NULL));
ALTER TABLE "rate_change" ADD CONSTRAINT "rate_change_agreement_length"
  CHECK (char_length("agreement") BETWEEN 1 AND 300);
