CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE IF NOT EXISTS resources (
 id text PRIMARY KEY, name text NOT NULL, type text NOT NULL, building text NOT NULL,
 capacity integer NOT NULL, features text[] NOT NULL, accessible boolean NOT NULL,
 description text NOT NULL, requires_approval boolean NOT NULL
);
CREATE TABLE IF NOT EXISTS accounts (
 id text PRIMARY KEY, email text NOT NULL, normalized_email text NOT NULL,
 display_name text NOT NULL, password_hash text NOT NULL, role text NOT NULL, created_at timestamptz NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS accounts_normalized_email_unique ON accounts (normalized_email);
CREATE TABLE IF NOT EXISTS reservations (
 id text PRIMARY KEY, resource_id text NOT NULL, title text NOT NULL, organizer text NOT NULL,
 start_time timestamptz NOT NULL, end_time timestamptz NOT NULL, attendees integer NOT NULL,
 status text NOT NULL, series_id text, owner_id text
);
CREATE INDEX IF NOT EXISTS reservations_resource ON reservations (resource_id);
CREATE INDEX IF NOT EXISTS reservations_series ON reservations (series_id);
CREATE TABLE IF NOT EXISTS maintenance_windows (
 id text PRIMARY KEY, resource_id text NOT NULL, start_time timestamptz NOT NULL,
 end_time timestamptz NOT NULL, reason text NOT NULL
);
CREATE TABLE IF NOT EXISTS waitlist_entries (
 id text PRIMARY KEY, resource_id text NOT NULL, title text NOT NULL, organizer text NOT NULL,
 start_time timestamptz NOT NULL, end_time timestamptz NOT NULL, attendees integer NOT NULL,
 created_at timestamptz NOT NULL, status text NOT NULL, user_id text
);
CREATE TABLE IF NOT EXISTS notifications (
 id text PRIMARY KEY, type text NOT NULL, title text NOT NULL, message text NOT NULL,
 created_at timestamptz NOT NULL, is_read boolean NOT NULL, reservation_id text,
 series_id text, waitlist_id text, user_id text, audience_role text
);
CREATE TABLE IF NOT EXISTS sessions (id text PRIMARY KEY, account_id text NOT NULL, expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS spacesense_migrations (id text PRIMARY KEY);
DO $$ BEGIN
 IF NOT EXISTS (
  SELECT 1 FROM pg_constraint
  WHERE conname = 'reservations_active_resource_window_excl'
    AND conrelid = 'reservations'::regclass
 ) THEN
  ALTER TABLE reservations ADD CONSTRAINT reservations_active_resource_window_excl
  EXCLUDE USING gist (resource_id WITH =, tstzrange(start_time, end_time, '[)') WITH &&)
  WHERE (status IN ('confirmed', 'pending'));
 END IF;
END $$;
CREATE OR REPLACE FUNCTION prevent_reservation_during_maintenance() RETURNS trigger AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(90731);
 IF NEW.status IN ('confirmed','pending') AND EXISTS (
  SELECT 1 FROM maintenance_windows m WHERE m.resource_id = NEW.resource_id
  AND tstzrange(m.start_time,m.end_time,'[)') && tstzrange(NEW.start_time,NEW.end_time,'[)')
 ) THEN RAISE EXCEPTION 'reservation overlaps maintenance' USING ERRCODE = '23P01'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS reservations_respect_maintenance ON reservations;
CREATE TRIGGER reservations_respect_maintenance BEFORE INSERT OR UPDATE ON reservations
FOR EACH ROW EXECUTE FUNCTION prevent_reservation_during_maintenance();
CREATE OR REPLACE FUNCTION prevent_maintenance_over_reservation() RETURNS trigger AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(90731);
 IF EXISTS (
  SELECT 1 FROM reservations r WHERE r.resource_id = NEW.resource_id AND r.status IN ('confirmed','pending')
  AND tstzrange(r.start_time,r.end_time,'[)') && tstzrange(NEW.start_time,NEW.end_time,'[)')
 ) THEN RAISE EXCEPTION 'maintenance overlaps reservation' USING ERRCODE = '23P01'; END IF;
 RETURN NEW;
END; $$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS maintenance_respects_reservations ON maintenance_windows;
CREATE TRIGGER maintenance_respects_reservations BEFORE INSERT OR UPDATE ON maintenance_windows
FOR EACH ROW EXECUTE FUNCTION prevent_maintenance_over_reservation();
