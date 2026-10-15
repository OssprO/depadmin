-- CreateTable
CREATE TABLE "historical_books" (
    "id" SMALLINT NOT NULL DEFAULT 1,
    "first_month" DATE NOT NULL,
    "last_month" DATE NOT NULL,
    "opening_balance" INTEGER NOT NULL,
    "imported_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "verified_at" TIMESTAMPTZ,

    CONSTRAINT "historical_books_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_sheet" (
    "id" UUID NOT NULL,
    "month" DATE NOT NULL,
    "from_day" SMALLINT NOT NULL,
    "source" TEXT NOT NULL,
    "paper_opening" INTEGER,
    "paper_income" INTEGER,
    "paper_expense" INTEGER,
    "paper_closing" INTEGER,
    "alerts" TEXT[],
    "notes" JSONB NOT NULL,

    CONSTRAINT "historical_sheet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "historical_movement" (
    "id" UUID NOT NULL,
    "date" DATE NOT NULL,
    "category" "movement_category" NOT NULL,
    "amount" INTEGER NOT NULL,
    "description" TEXT,
    "unit_number" INTEGER,
    "covers_week" DATE,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "historical_movement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "historical_sheet_month_from_day_key" ON "historical_sheet"("month", "from_day");

-- CreateIndex
CREATE INDEX "historical_movement_date_idx" ON "historical_movement"("date");

-- AddForeignKey
ALTER TABLE "historical_movement" ADD CONSTRAINT "historical_movement_unit_number_fkey" FOREIGN KEY ("unit_number") REFERENCES "unit"("number") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ─────────────────────────────────────────────────────────────────────────────
-- Hand-written: rules Prisma cannot express.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE "historical_books"
  ADD CONSTRAINT "historical_books_singleton" CHECK ("id" = 1),
  ADD CONSTRAINT "historical_books_months_valid" CHECK (
    EXTRACT(DAY FROM "first_month") = 1
    AND EXTRACT(DAY FROM "last_month") = 1
    AND "first_month" <= "last_month"
  );

ALTER TABLE "historical_sheet"
  ADD CONSTRAINT "historical_sheet_month_valid" CHECK (EXTRACT(DAY FROM "month") = 1),
  ADD CONSTRAINT "historical_sheet_from_day_valid" CHECK ("from_day" BETWEEN 1 AND 31),
  ADD CONSTRAINT "historical_sheet_source_valid" CHECK (char_length(btrim("source")) > 0),
  ADD CONSTRAINT "historical_sheet_figures_valid" CHECK (
    ("paper_income" IS NULL OR "paper_income" >= 0)
    AND ("paper_expense" IS NULL OR "paper_expense" >= 0)
  );

-- The same row rules as "cash_movement" (see the init and garbage_week migrations).
ALTER TABLE "historical_movement"
  ADD CONSTRAINT "historical_movement_amount_positive" CHECK ("amount" > 0),
  ADD CONSTRAINT "historical_movement_unit_iff_payment"
    CHECK (("category" = 'UNIT_PAYMENT') = ("unit_number" IS NOT NULL)),
  ADD CONSTRAINT "historical_movement_description_required" CHECK (
    "category" NOT IN ('OTHER_INCOME', 'OTHER_EXPENSE')
    OR char_length(btrim(coalesce("description", ''))) > 0
  ),
  ADD CONSTRAINT "historical_movement_week_iff_garbage"
    CHECK (("category" = 'GARBAGE') = ("covers_week" IS NOT NULL)),
  ADD CONSTRAINT "historical_movement_week_is_monday"
    CHECK ("covers_week" IS NULL OR extract(isodow FROM "covers_week") = 1),
  -- Each week's garbage was paid once. An exclusion constraint rather than a partial
  -- unique index, which Prisma's diff would try to drop.
  ADD CONSTRAINT "historical_movement_one_garbage_per_week"
    EXCLUDE USING btree ("covers_week" WITH =) WHERE ("covers_week" IS NOT NULL);
