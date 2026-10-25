-- LOCAL DEVELOPMENT ONLY. Do NOT run this on Supabase.
-- Supabase provides an auth.users table; a plain local Postgres does not.
-- This minimal stand-in lets db/schema.sql (profiles -> auth.users FK)
-- run on a laptop for testing.
CREATE SCHEMA IF NOT EXISTS auth;

CREATE TABLE IF NOT EXISTS auth.users (
    id     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email  TEXT UNIQUE
);
