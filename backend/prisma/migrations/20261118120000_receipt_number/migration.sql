-- A folio for every live depto payment: consecutive for the building, never reused (a
-- removed payment keeps its folio, void). Additive only (ADR-0029).
ALTER TABLE "cash_movement" ADD COLUMN "receipt_number" INTEGER;
CREATE UNIQUE INDEX "cash_movement_receipt_number_key" ON "cash_movement"("receipt_number");

CREATE SEQUENCE "cash_movement_receipt_number_seq" AS INTEGER OWNED BY "cash_movement"."receipt_number";

-- The payments recorded so far from the cut-over, in the order they happened. The history's
-- payments (before the cut-over) have no receipt: their accounts live on paper (ADR-0023).
UPDATE "cash_movement" AS m
SET "receipt_number" = numbered.n
FROM (
  SELECT c."id", row_number() OVER (ORDER BY c."date", c."created_at", c."id") AS n
  FROM "cash_movement" c
  JOIN "reporting_start" s ON s."id" = 1
  WHERE c."category" = 'UNIT_PAYMENT' AND c."date" >= s."cutover"
) AS numbered
WHERE m."id" = numbered."id";

SELECT setval(
  '"cash_movement_receipt_number_seq"',
  COALESCE((SELECT max("receipt_number") FROM "cash_movement"), 0) + 1,
  false
);

-- New live payments get the next folio, and so does a row a correction turns into a
-- payment. The application never writes the column.
--
-- A new row is numbered AFTER INSERT, not BEFORE: the app saves with INSERT ... ON CONFLICT
-- DO UPDATE, whose BEFORE INSERT triggers fire even when the row exists and the update
-- wins, so numbering there would burn a folio on every correction. AFTER INSERT fires only
-- for rows actually inserted; a corrected row goes through BEFORE UPDATE.
CREATE FUNCTION "cash_movement_receipt_number"() RETURNS trigger AS $$
BEGIN
  IF NEW."category" = 'UNIT_PAYMENT'
     AND NEW."receipt_number" IS NULL
     AND NEW."date" >= (SELECT "cutover" FROM "reporting_start" WHERE "id" = 1) THEN
    IF TG_OP = 'INSERT' THEN
      UPDATE "cash_movement"
      SET "receipt_number" = nextval('"cash_movement_receipt_number_seq"')
      WHERE "id" = NEW."id";
    ELSE
      NEW."receipt_number" := nextval('"cash_movement_receipt_number_seq"');
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER "cash_movement_receipt_number_insert"
AFTER INSERT ON "cash_movement"
FOR EACH ROW EXECUTE FUNCTION "cash_movement_receipt_number"();

CREATE TRIGGER "cash_movement_receipt_number_update"
BEFORE UPDATE ON "cash_movement"
FOR EACH ROW EXECUTE FUNCTION "cash_movement_receipt_number"();
