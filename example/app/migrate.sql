-- Forward-only, idempotent migrations of the example application.
CREATE TABLE IF NOT EXISTS notes (
  id serial PRIMARY KEY,
  env text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
