#!/bin/sh
set -eu

psql --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" --set ON_ERROR_STOP=1 <<'SQL'
\getenv app_password SPACESENSE_DB_PASSWORD
CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE ROLE spacesense_app WITH LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE;
GRANT CONNECT ON DATABASE spacesense TO spacesense_app;
GRANT USAGE, CREATE ON SCHEMA public TO spacesense_app;
SQL
