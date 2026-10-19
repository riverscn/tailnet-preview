-- Runs as the PostgreSQL superuser before every deploy; must be idempotent (docs/design.md 5.3).
-- :'password' is TP_DB_PASSWORD, generated once per project on the host.
SELECT 'CREATE ROLE example LOGIN' WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'example') \gexec
ALTER ROLE example LOGIN NOSUPERUSER PASSWORD :'password';
