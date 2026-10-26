-- Vessels and reports extracted from mailbox vessel reports by `python outlook-pipeline.py sync|reports`.
-- For databases created before 2026-10-15; schema.sql already includes this. Safe to re-run.

-- A vessel first seen in a report has only what the report says: name, IMO, code, principal.
alter table vessels
  alter column type drop not null,
  alter column flag drop not null,
  alter column dwt drop not null,
  alter column built drop not null,
  alter column customer_id drop not null,
  alter column cii2025 drop not null;
alter table vessels
  add column if not exists code           text,   -- vessel code from the report form, e.g. NAMO
  add column if not exists principal      text,
  add column if not exists location       text,   -- latest reported location or port
  add column if not exists condition      text,   -- Laden / Ballast
  add column if not exists last_report_id text;
create index if not exists vessels_code on vessels (upper(code));

alter table reports drop constraint if exists reports_type_check;
alter table reports add constraint reports_type_check
  check (type in ('Noon report', 'Voyage report', 'Arrival report', 'Departure report', 'Bunker report', 'Monthly fuel report', 'BDN'));
alter table reports
  add column if not exists message_id text,         -- Graph id of the email the report came from
  add column if not exists source     text,         -- 'body' or the attachment file name
  add column if not exists voyage_no  text,
  add column if not exists data       jsonb;        -- every extracted reading: original text, number, unit
create index if not exists reports_imo_at on reports (imo, at desc);

-- One row per processed email: makes extraction idempotent and keeps failures visible for troubleshooting.
create table if not exists mail_extractions (
  message_id   text primary key,
  status       text not null check (status in ('report', 'not_report', 'unmatched', 'failed')),
  report_id    text,
  detail       text,
  processed_at timestamptz not null default now()
);
alter table mail_extractions enable row level security;
