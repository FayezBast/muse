CREATE TABLE IF NOT EXISTS bookings (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  cancelled_at TIMESTAMPTZ,
  user_id TEXT,
  session_id TEXT,
  idempotency_key TEXT,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  session TEXT NOT NULL,
  class_date DATE NOT NULL,
  class_time TEXT NOT NULL,
  request_type TEXT NOT NULL CHECK (request_type IN ('booking', 'waitlist')),
  status TEXT NOT NULL CHECK (status IN ('confirmed', 'waitlist', 'cancelled')),
  notes TEXT,
  price_cents INTEGER NOT NULL,
  capacity_snapshot INTEGER NOT NULL
);

ALTER TABLE bookings
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT;

CREATE TABLE IF NOT EXISTS studio_settings (
  key TEXT PRIMARY KEY,
  data JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS booking_email_jobs (
  id BIGSERIAL PRIMARY KEY,
  booking_id BIGINT NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  payload JSONB NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'sent', 'failed', 'skipped')),
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  UNIQUE (booking_id)
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_user_id_required'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_user_id_required
      CHECK (user_id IS NOT NULL AND btrim(user_id) <> '') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_session_id_required'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_session_id_required
      CHECK (session_id IS NOT NULL AND btrim(session_id) <> '') NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_email_len'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_email_len CHECK (char_length(email) BETWEEN 3 AND 220) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_name_len'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_name_len CHECK (char_length(name) BETWEEN 1 AND 160) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_notes_len'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_notes_len
      CHECK (notes IS NULL OR char_length(notes) <= 2000) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_price_nonnegative'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_price_nonnegative CHECK (price_cents >= 0) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'bookings_capacity_positive'
  ) THEN
    ALTER TABLE bookings
      ADD CONSTRAINT bookings_capacity_positive CHECK (capacity_snapshot > 0) NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS bookings_lookup_idx
  ON bookings (class_date, class_time, session, status);

CREATE INDEX IF NOT EXISTS bookings_user_idx
  ON bookings (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS bookings_active_date_idx
  ON bookings (class_date, status, created_at DESC)
  WHERE status IN ('confirmed', 'waitlist');

CREATE INDEX IF NOT EXISTS bookings_recent_active_idx
  ON bookings (created_at DESC)
  WHERE status IN ('confirmed', 'waitlist');

CREATE UNIQUE INDEX IF NOT EXISTS bookings_one_active_user_per_class_idx
  ON bookings (user_id, class_date, class_time, session)
  WHERE status IN ('confirmed', 'waitlist');

CREATE UNIQUE INDEX IF NOT EXISTS bookings_idempotency_idx
  ON bookings (user_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS booking_email_jobs_pending_idx
  ON booking_email_jobs (status, attempts, created_at)
  WHERE status IN ('pending', 'failed', 'processing');
