-- Configurable roles, user management, backups/availability, personal + shared templates, escalation policy, saved views.
-- For databases created before 2026-10-22; schema.sql already includes this. Safe to re-run.

-- Roles: which email categories each role gets, and what it may do. Seeded with the previous hardcoded roles;
-- every role keeps 'mail.all' so nobody loses access until an admin narrows it.
create table if not exists roles (
  id           text primary key,
  label        text not null,
  categories   jsonb not null default '[]',  -- email categories shared with the role
  capabilities jsonb not null default '[]'   -- 'admin' | 'mail.all' | 'thread.assign' | 'commercial.confirm'
);
insert into roles (id, label, categories, capabilities) values
  ('analyst', 'Emissions Analyst', '["vessel_report","bdn","customer_query","eu_mrv","fueleu"]', '["mail.all","thread.assign"]'),
  ('commercial', 'Commercial', '["allocation","allocation_confirmation","carbon_trading","invoice","customer_query"]', '["mail.all","thread.assign","commercial.confirm"]'),
  ('regulatory', 'Regulatory', '["imo_dcs","eu_mrv","fueleu","seemp","eu_ets","uk_ets"]', '["mail.all","thread.assign"]'),
  ('admin', 'Admin', '[]', '["admin","mail.all","thread.assign","commercial.confirm"]')
on conflict (id) do nothing;
alter table roles enable row level security;

alter table users drop constraint if exists users_role_check;
do $$ begin
  alter table users add constraint users_role_fkey foreign key (role) references roles (id);
exception when duplicate_object then null; end $$;
alter table users
  add column if not exists active       boolean not null default true,  -- false = removed; history keeps the name
  add column if not exists backup_id    text references users (id),     -- covers their mail while they are away
  add column if not exists availability text not null default 'available' check (availability in ('available', 'on_leave', 'unavailable')),
  add column if not exists away_from    date,                           -- IST, inclusive; empty = from now
  add column if not exists away_until   date,                           -- IST, inclusive; empty = until switched back
  add column if not exists views        jsonb;                          -- saved inbox searches: [{name, query}]

alter table templates
  add column if not exists owner_id text references users (id),  -- set = personal template; empty = shared
  add column if not exists roles    jsonb;                        -- shared only: roles that see it; empty = everyone

alter table thread_state
  add column if not exists original_assignee_id text references users (id),  -- first PIC, kept when moved to a backup
  add column if not exists escalated_at         timestamptz;                  -- set when automation reassigned it (once)

create table if not exists settings (
  id    text primary key,
  value jsonb not null
);
insert into settings (id, value) values ('escalation', '{"hours": 24, "reassign": false}') on conflict (id) do nothing;
alter table settings enable row level security;
