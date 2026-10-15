-- The building's history moves into the books (ADR-0023, replacing ADR-0022): its rows
-- become ordinary cash movements, so its own tables go. They held a transcription still
-- under review, which is imported again from the file.
DROP TABLE "historical_movement";
DROP TABLE "historical_books";
DROP TABLE "historical_sheet";

-- The cut-over: the first month kept live. Books started so far have no history, so it is
-- their first month.
ALTER TABLE "reporting_start" ADD COLUMN "cutover" DATE;
UPDATE "reporting_start" SET "cutover" = "month";
ALTER TABLE "reporting_start" ALTER COLUMN "cutover" SET NOT NULL;

-- CreateTable
CREATE TABLE "paper_sheet" (
    "id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "from_day" SMALLINT NOT NULL,
    "source" TEXT NOT NULL,
    "paper_opening" INTEGER,
    "paper_income" INTEGER,
    "paper_expense" INTEGER,
    "paper_closing" INTEGER,
    "alerts" TEXT[],
    "lines" JSONB NOT NULL,

    CONSTRAINT "paper_sheet_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "paper_sheet_month_from_day_key" ON "paper_sheet"("month", "from_day");

-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-written: rules Prisma cannot express.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "reporting_start"
  ADD CONSTRAINT "reporting_start_cutover_valid"
    CHECK (EXTRACT(DAY FROM "cutover") = 1 AND "cutover" >= "month");

ALTER TABLE "paper_sheet"
  ADD CONSTRAINT "paper_sheet_month_valid" CHECK (EXTRACT(DAY FROM "month") = 1),
  ADD CONSTRAINT "paper_sheet_from_day_valid" CHECK ("from_day" BETWEEN 1 AND 31),
  ADD CONSTRAINT "paper_sheet_source_valid" CHECK (char_length(btrim("source")) > 0),
  ADD CONSTRAINT "paper_sheet_figures_valid" CHECK (
    ("paper_income" IS NULL OR "paper_income" >= 0)
    AND ("paper_expense" IS NULL OR "paper_expense" >= 0)
  ),
  ADD CONSTRAINT "paper_sheet_lines_array" CHECK (jsonb_typeof("lines") = 'array');
