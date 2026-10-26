-- GeoEmissions database. Run once in Supabase → SQL Editor.
-- Only the server (service_role key) reads and writes: RLS is on with no policies, so the anon key sees nothing.

-- ─── Team ────────────────────────────────────────────────────────────────────
-- Roles: which email categories each role gets and what it may do; edited in Administration → Users & roles.
create table roles (
  id           text primary key,
  label        text not null,
  categories   jsonb not null default '[]',  -- email categories shared with the role
  capabilities jsonb not null default '[]'   -- 'admin' | 'mail.all' | 'thread.assign' | 'commercial.confirm'
);
insert into roles (id, label, categories, capabilities) values
  ('analyst', 'Emissions Analyst', '["vessel_report","bdn","customer_query","eu_mrv","fueleu"]', '["mail.all","thread.assign"]'),
  ('commercial', 'Commercial', '["allocation","allocation_confirmation","carbon_trading","invoice","customer_query"]', '["mail.all","thread.assign","commercial.confirm"]'),
  ('regulatory', 'Regulatory', '["imo_dcs","eu_mrv","fueleu","seemp","eu_ets","uk_ets"]', '["mail.all","thread.assign"]'),
  ('admin', 'Admin', '[]', '["admin","mail.all","thread.assign","commercial.confirm"]');

create table users (
  id           text primary key default gen_random_uuid()::text,
  name         text not null,
  email        text not null unique,
  role         text not null references roles (id),
  initials     text not null,
  lead         boolean not null default false,
  active       boolean not null default true,  -- false = removed; history keeps the name
  backup_id    text references users (id),     -- covers their mail while they are away
  availability text not null default 'available' check (availability in ('available', 'on_leave', 'unavailable')),
  away_from    date,                           -- IST, inclusive; empty = from now
  away_until   date,                           -- IST, inclusive; empty = until switched back
  signature    text,
  prefs        jsonb,
  views        jsonb                           -- saved inbox searches: [{name, query}]
);

-- ─── Master data ─────────────────────────────────────────────────────────────
create table orgs (
  id       text primary key default gen_random_uuid()::text,
  name     text not null,
  short    text not null,
  domain   text not null,                -- sender domain, used to link emails to the org
  country  text not null,
  kind     text not null check (kind in ('customer', 'verifier', 'broker', 'supplier', 'internal', 'publisher')),
  owner_id text references users (id)
);

create table vessels (
  imo            text primary key check (imo ~ '^\d{7}$'),
  name           text not null,          -- e.g. "MV Aegean Star"
  code           text,                   -- vessel code from report forms, e.g. NAMO
  principal      text,
  -- Master data a vessel report does not carry: empty until someone fills it in.
  type           text check (type in ('Bulk carrier', 'Oil tanker', 'Container ship', 'Reefer', 'Chemical tanker')),
  flag           text,
  dwt            integer,
  built          integer,
  customer_id    text references orgs (id),
  cii2025        text check (cii2025 in ('A', 'B', 'C', 'D', 'E')),
  uk_ets         boolean not null default false,
  -- Latest state from vessel reports (outlook-pipeline.py); never overwritten with blanks or older reports.
  voyage_no      text,
  voyage_from    text,
  voyage_to      text,
  voyage_eta     date,
  location       text,
  condition      text,
  last_report_at timestamptz,
  last_report_id text
);
create index vessels_code on vessels (upper(code));

create table reports (
  id         text primary key default gen_random_uuid()::text,
  imo        text not null references vessels (imo),
  type       text not null check (type in ('Noon report', 'Voyage report', 'Arrival report', 'Departure report', 'Bunker report', 'Monthly fuel report', 'BDN')),
  label      text not null,
  at         timestamptz not null,
  status     text not null check (status in ('received', 'missing', 'duplicate', 'revised')),
  thread_id  text,                        -- Outlook conversationId
  message_id text,                        -- Graph id of the email the report came from
  source     text,                        -- 'body' or the attachment file name
  voyage_no  text,
  data       jsonb                        -- every extracted reading: original text, number, unit
);
create index reports_imo_at on reports (imo, at desc);

create table compliance_items (
  imo        text not null references vessels (imo),
  regulation text not null check (regulation in ('imo_dcs', 'eu_mrv', 'fueleu', 'seemp1', 'seemp2', 'seemp3', 'uk_ets')),
  period     integer not null,
  status     text not null check (status in ('complete', 'submitted', 'in_progress', 'review', 'action_required', 'overdue', 'na')),
  due        date,
  note       text,
  thread_id  text,
  primary key (imo, regulation, period)
);

create table company_obligations (
  customer_id        text not null references orgs (id),
  period             integer not null,   -- emissions year, e.g. 2025
  eu_ets_verified_t  numeric not null,
  eu_ets_required    numeric not null,
  eu_ets_surrendered numeric not null default 0,
  eu_ets_status      text not null,
  fuel_eu_balance_t  numeric not null,
  fuel_eu_pool       text,
  fuel_eu_doc        text not null,
  uk_ets_status      text,               -- null = not in UK ETS scope
  uk_ets_note        text,
  primary key (customer_id, period)
);

create table deadlines (
  id       text primary key default gen_random_uuid()::text,
  date     date not null,
  title    text not null,
  scope    text not null,
  href     text not null default '/compliance',
  severity text not null check (severity in ('critical', 'high', 'medium', 'low'))
);

-- ─── Commercial ──────────────────────────────────────────────────────────────
create table carbon_txns (
  id           text primary key,
  date         date not null,
  type         text not null check (type in ('buy', 'sell', 'transfer_in', 'transfer_out', 'surrender')),
  instrument   text not null check (instrument in ('EUA', 'UKA')),
  qty          numeric not null,
  price        numeric,
  currency     text not null check (currency in ('EUR', 'GBP')),
  counterparty text not null,
  customer_id  text references orgs (id),
  imo          text references vessels (imo),
  status       text not null check (status in ('proposed', 'confirmed', 'settled')),
  source       text not null check (source in ('email', 'excel', 'platform')),
  thread_id    text
);

create table allocations (
  id           text primary key,
  customer_id  text not null references orgs (id),
  imo          text references vessels (imo),
  period       text not null,
  qty          numeric not null,
  instrument   text not null check (instrument in ('EUA', 'UKA')),
  requested_at timestamptz not null,
  confirmed_at timestamptz,
  status       text not null check (status in ('requested', 'pending_confirmation', 'confirmed')),
  thread_id    text
);

create table invoices (
  id          text primary key,
  kind        text not null check (kind in ('service', 'carbon_transfer')),
  customer_id text not null references orgs (id),
  imo         text references vessels (imo),
  description text not null,
  amount      numeric not null,
  currency    text not null check (currency in ('EUR', 'USD', 'GBP', 'INR')),
  issued      date not null,
  due         date not null,
  status      text not null check (status in ('draft', 'pending', 'sent', 'paid', 'overdue', 'disputed')),
  txn_id      text references carbon_txns (id),
  thread_id   text
);

-- ─── Mail (written by outlook-pipeline.py sync) ─────────────────────────────
create table messages (
  id              text primary key,      -- Graph message id
  conversation_id text not null,
  folder          text not null,         -- inbox | sentitems
  received_at     timestamptz not null,
  data            jsonb not null         -- the Graph message as returned
);
create index messages_received_at on messages (received_at desc);

-- One row per processed email (outlook-pipeline.py): idempotent report extraction, failures kept for troubleshooting.
create table mail_extractions (
  message_id   text primary key,
  status       text not null check (status in ('report', 'not_report', 'unmatched', 'failed')),
  report_id    text,
  detail       text,
  processed_at timestamptz not null default now()
);

create table sync_status (
  id        text primary key,            -- 'mail' | 'reports'
  synced_at timestamptz,
  error     text
);

-- ─── Workspace state (written by the app) ───────────────────────────────────
create table thread_state (
  id            text primary key,        -- Outlook conversationId
  status        text,
  priority      text,
  important     boolean,
  assignee_id   text references users (id),
  labels        jsonb,
  needs_review  boolean,
  snoozed_until timestamptz,
  read_at       timestamptz,
  original_assignee_id text references users (id),  -- first PIC, kept when moved to a backup
  escalated_at  timestamptz,                       -- set when automation reassigned it (once)
  updated_at    timestamptz not null default now()
);

create table notes (
  id        uuid primary key default gen_random_uuid(),
  thread_id text not null,
  author_id text not null references users (id),
  at        timestamptz not null default now(),
  body      text not null
);

create table alert_state (
  id            text primary key,        -- '<type>:<record id>', see src/lib/alerts.ts
  status        text not null check (status in ('open', 'snoozed', 'resolved')),
  snoozed_until timestamptz,
  updated_at    timestamptz not null default now()
);

create table activity (
  id       uuid primary key default gen_random_uuid(),
  at       timestamptz not null default now(),
  actor_id text not null,                -- users.id or 'system'
  action   text not null,
  target   text not null,
  href     text
);

create table templates (
  id       text primary key default gen_random_uuid()::text,
  name     text not null,
  category text not null,
  body     text not null,                -- {{placeholders}} are filled from the thread in the composer
  owner_id text references users (id),   -- set = personal template; empty = shared
  roles    jsonb                         -- shared only: roles that see it; empty = everyone
);

create table settings (
  id    text primary key,
  value jsonb not null
);
insert into settings (id, value) values ('escalation', '{"hours": 24, "reassign": false}');

-- ─── Classification rules (applied to subject + attachment names, first match wins) ─
create table rules (
  id         text primary key,
  name       text not null,
  pattern    text not null,              -- JavaScript regular expression, case-insensitive
  category   text not null,
  confidence numeric not null default 0.9,
  enabled    boolean not null default true,
  position   integer not null default 0  -- lower runs first
);

insert into rules (id, name, pattern, category, position) values
  ('R-01', 'BDN', '\bBDN\b|bunker delivery', 'bdn', 1),
  ('R-02', 'Noon / arrival / voyage reports', 'noon report|arrival report|departure report|voyage report', 'vessel_report', 2),
  ('R-03', 'Invoices', '\bINV-\d{4}-\d{4}\b|\binvoice\b', 'invoice', 3),
  ('R-04', 'Allocation confirmations', 'allocation.*confirm|confirm.*allocation', 'allocation_confirmation', 4),
  ('R-05', 'Allocations', '\ballocation\b', 'allocation', 5),
  ('R-06', 'Carbon trades', 'trade confirmation|carbon (credit|trad)', 'carbon_trading', 6),
  ('R-07', 'FuelEU', 'fuel ?eu', 'fueleu', 7),
  ('R-08', 'IMO DCS', '\bIMO DCS\b', 'imo_dcs', 8),
  ('R-09', 'EU MRV', '\bMRV\b', 'eu_mrv', 9),
  ('R-10', 'SEEMP / CII', '\bSEEMP\b|\bCII\b', 'seemp', 10),
  ('R-11', 'UK ETS', '\bUK ?ETS\b|\bUKAs?\b', 'uk_ets', 11),
  ('R-12', 'EU ETS', '\bEU ?ETS\b|\bEUAs?\b', 'eu_ets', 12);

do $$
declare t text;
begin
  foreach t in array array['roles','settings','users','orgs','vessels','reports','compliance_items','company_obligations','deadlines','carbon_txns',
    'allocations','invoices','messages','mail_extractions','sync_status','thread_state','notes','alert_state','activity','templates','rules'] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;
