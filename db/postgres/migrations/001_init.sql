CREATE EXTENSION IF NOT EXISTS pgcrypto; -- gen_random_uuid() on PG < 13

-- HLD Postgres schema, first slice: bookings + payments move here first
-- (row locks, constraints and a ledger fit money better than Mongo).
-- Ids of users/trips/agencies are still Mongo ObjectIds (text) until those
-- entities migrate in later stages.

CREATE TABLE IF NOT EXISTS trip_slots (
  id            BIGSERIAL PRIMARY KEY,
  trip_id       TEXT        NOT NULL,           -- Mongo Trip _id
  departs_on    DATE        NOT NULL,
  seats_total   INT         NOT NULL CHECK (seats_total >= 0),
  seats_left    INT         NOT NULL CHECK (seats_left >= 0),
  price_paise   BIGINT      NOT NULL CHECK (price_paise >= 0),
  UNIQUE (trip_id, departs_on)
);

CREATE TABLE IF NOT EXISTS bookings (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          TEXT        NOT NULL,
  slot_id          BIGINT      NOT NULL REFERENCES trip_slots(id),
  seats            INT         NOT NULL CHECK (seats > 0),
  amount_paise     BIGINT      NOT NULL CHECK (amount_paise >= 0),
  status           TEXT        NOT NULL CHECK (status IN ('pending','confirmed','cancelled','completed')),
  idempotency_key  TEXT,
  hold_expires_at  TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, idempotency_key)
);
CREATE INDEX IF NOT EXISTS bookings_user_idx ON bookings (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_pending_idx ON bookings (hold_expires_at) WHERE status = 'pending';

CREATE TABLE IF NOT EXISTS payments (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id         UUID        NOT NULL REFERENCES bookings(id),
  provider           TEXT        NOT NULL DEFAULT 'razorpay',
  provider_order_id  TEXT        NOT NULL UNIQUE,
  provider_payment_id TEXT       UNIQUE,          -- dedupes repeated webhooks
  amount_paise       BIGINT      NOT NULL,
  status             TEXT        NOT NULL CHECK (status IN ('created','paid','failed','refunded')),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Double-entry style ledger: every money movement is an append-only row.
CREATE TABLE IF NOT EXISTS ledger_entries (
  id            BIGSERIAL PRIMARY KEY,
  booking_id    UUID        REFERENCES bookings(id),
  payment_id    UUID        REFERENCES payments(id),
  account       TEXT        NOT NULL,   -- e.g. 'customer', 'platform_fee', 'agency_payable'
  amount_paise  BIGINT      NOT NULL,   -- +credit / -debit
  memo          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Transactional outbox: written in the same transaction as the change,
-- relayed to the queue by a worker (at-least-once).
CREATE TABLE IF NOT EXISTS outbox (
  id            BIGSERIAL PRIMARY KEY,
  topic         TEXT        NOT NULL,   -- e.g. 'BookingConfirmed'
  payload       JSONB       NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  published_at  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS outbox_unpublished_idx ON outbox (id) WHERE published_at IS NULL;
