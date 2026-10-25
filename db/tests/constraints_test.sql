-- Constraint tests for db/schema.sql. Run on a THROWAWAY database after the schema:
--   psql -d <scratch_db> -f db/tests/constraints_test.sql
-- Each line marked with a reason other than 'ok' must fail with the named constraint.
\set ON_ERROR_STOP 0
INSERT INTO companies(cik,ticker,name) VALUES ('0000320193','AAPL','Apple Inc.');            -- ok
INSERT INTO companies(cik,ticker,name) VALUES ('320193','MSFT','x');                        -- bad cik
INSERT INTO companies(cik,ticker,name) VALUES ('0000000001','aapl','x');                    -- bad ticker
INSERT INTO companies(cik,ticker,name) VALUES ('0000000002','AAPL','x');                    -- dup ticker
INSERT INTO prices VALUES ('0000320193','2025-10-24',10,11,9,10.5,100);                     -- ok (Fri)
INSERT INTO prices VALUES ('0000320193','2025-10-25',10,11,9,10.5,100);                     -- Saturday
INSERT INTO prices VALUES ('0000320193','2025-10-23',10,9,9.5,10,100);                      -- high < open
INSERT INTO prices VALUES ('0000320193','2025-10-22',10,11,9,10,-1);                        -- neg volume
INSERT INTO prices VALUES ('0000999999','2025-10-22',10,11,9,10,1);                         -- FK
INSERT INTO auth.users(id) VALUES ('11111111-1111-1111-1111-111111111111');
INSERT INTO profiles(user_id,role) VALUES ('11111111-1111-1111-1111-111111111111','admin'); -- bad role
INSERT INTO profiles(user_id) VALUES ('11111111-1111-1111-1111-111111111111');              -- ok, default viewer
INSERT INTO watchlists(user_id,cik) VALUES ('11111111-1111-1111-1111-111111111111','0000320193'); -- ok
INSERT INTO watchlists(user_id,cik) VALUES ('11111111-1111-1111-1111-111111111111','0000320193'); -- dup
INSERT INTO activity_log(action) VALUES ('HACK');                                            -- bad action
DELETE FROM companies WHERE cik='0000320193';                                                -- cascades
SELECT (SELECT count(*) FROM prices) prices, (SELECT count(*) FROM watchlists) wl, (SELECT role FROM profiles) role;
