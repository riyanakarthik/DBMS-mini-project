-- =====================================================================
-- Triggers. Run after db/views.sql:  psql "$DATABASE_URL" -f db/triggers.sql
-- =====================================================================

-- Trigger function: runs once for EVERY row inserted into prices.
-- NEW is the row that was just inserted.
CREATE OR REPLACE FUNCTION trg_prices_after_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    -- 1. Record that this company received fresh market data.
    UPDATE companies
       SET last_updated = now()
     WHERE cik = NEW.cik;

    -- 2. Write an audit row. user_id stays NULL: the insert came from the
    --    seed pipeline, not from a logged-in user.
    INSERT INTO activity_log (action, cik)
    VALUES ('PRICE_INSERT', NEW.cik);

    -- The return value of an AFTER trigger is ignored; NULL is conventional.
    RETURN NULL;
END;
$$;

-- AFTER INSERT: fires only once the price row has passed all CHECK/FK
-- constraints and been written. Because it runs inside the same
-- transaction as the INSERT, a failed batch rolls back the log rows and
-- last_updated changes too: they can never disagree with the prices table.
CREATE OR REPLACE TRIGGER prices_after_insert
AFTER INSERT ON prices
FOR EACH ROW
EXECUTE FUNCTION trg_prices_after_insert();
