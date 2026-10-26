-- PreFly schema (Neon Postgres). Safe to re-run.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS uploads (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  filename      text NOT NULL,
  booking_count integer NOT NULL DEFAULT 0,
  item_count    integer NOT NULL DEFAULT 0,
  rate_card_source text NOT NULL DEFAULT 'default',
  issues        jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookings (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_ref    text NOT NULL,
  source         text NOT NULL CHECK (source IN ('chat','excel','manual')),
  upload_id      uuid REFERENCES uploads(id) ON DELETE SET NULL,
  seller_name    text,
  origin         text,
  destination    text,
  data           jsonb NOT NULL,
  status         text NOT NULL CHECK (status IN ('blocked','review','warnings','ready')),
  red_count      integer NOT NULL DEFAULT 0,
  amber_count    integer NOT NULL DEFAULT 0,
  review_count   integer NOT NULL DEFAULT 0,
  dispatch_ready boolean NOT NULL DEFAULT false,
  recommended_carrier text,
  recommended_cost numeric(12,2),
  confirmed_at   timestamptz,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS bookings_created_idx ON bookings (created_at DESC);
CREATE INDEX IF NOT EXISTS bookings_upload_idx ON bookings (upload_id);

CREATE TABLE IF NOT EXISTS booking_items (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id        uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  line_no           integer NOT NULL,
  sku               text,
  description       text,
  hs_code           text,
  quantity          numeric,
  unit_price        numeric,
  units_per_carton  numeric,
  cartons           numeric,
  unit_weight_kg    numeric,
  country_of_origin text
);
CREATE INDEX IF NOT EXISTS booking_items_booking_idx ON booking_items (booking_id);

CREATE TABLE IF NOT EXISTS validation_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  run_id      uuid NOT NULL,
  rule_id     text NOT NULL,
  severity    text NOT NULL,
  status      text NOT NULL,
  line_no     integer,
  field       text,
  actual      text,
  expected    text,
  explanation text,
  fix         text,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS validation_results_booking_idx ON validation_results (booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS booking_events (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id uuid NOT NULL REFERENCES bookings(id) ON DELETE CASCADE,
  type       text NOT NULL,
  detail     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS booking_events_booking_idx ON booking_events (booking_id, created_at DESC);

CREATE TABLE IF NOT EXISTS carrier_options (
  id                       text PRIMARY KEY,
  carrier                  text NOT NULL,
  service                  text NOT NULL,
  origin_country           text NOT NULL,
  destination_country      text NOT NULL,
  price_per_pallet         numeric(10,2) NOT NULL,
  currency                 text NOT NULL,
  transit_days             integer NOT NULL,
  on_time_rate             numeric(5,2) NOT NULL,
  max_weight_per_pallet_kg numeric(10,2) NOT NULL
);
