# GeoEmissions

Operations workspace on top of the `Geoemissions@geoserves.com` mailbox. Every screen reads live data: email from Outlook (synced by `../outlook-pipeline.py sync`, which the app runs every hour and on **Sync now**), everything else from Supabase. There is no sample data — an empty table shows an empty state.

## Setup

1. Create a Supabase project and run [`supabase/schema.sql`](supabase/schema.sql) in its SQL editor (creates the tables, turns on RLS, seeds the classification rules). A database created before 2026-10-15 also needs [`supabase/migrations/2026-10-15-vessel-reports.sql`](supabase/migrations/2026-10-15-vessel-reports.sql); one created before 2026-10-22 also needs [`supabase/migrations/2026-10-22-team-access.sql`](supabase/migrations/2026-10-22-team-access.sql) (roles, backups, templates, escalation).
2. Add to the shared `../.env` (also used by the pipeline):
   ```
   SUPABASE_URL=https://<project>.supabase.co
   SUPABASE_SERVICE_ROLE_KEY=<service_role key>
   ```
3. Add at least one admin row to `users` (name, email, role `admin`, initials); add the rest of the team in Administration → Users & roles. Add `orgs` (their email `domain` links mail to customers), `vessels`, and the commercial/compliance tables as data becomes available.
4. Run:
   ```bash
   python ../outlook-pipeline.py sync      # optional: fresher than the app's hourly sync (every 30 s); extracts vessel reports
   python ../outlook-pipeline.py reports   # once: extract reports from all stored mail (retries failures; --force redoes all)
   npm install
   npm run dev                             # http://localhost:3000
   node --test src/lib/*.test.ts
   python -m unittest test_vessel_reports test_pipeline  # from the folder above
   ```
   Optional: `pip install pypdf` lets the pipeline read vessel reports sent as PDF attachments. The app runs the pipeline with `python` from `PATH`; set `PYTHON` in `.env` for another interpreter.

The app re-reads the database every 30 s. After a page load it syncs the mailbox if the last sync is over an hour old, and moves unanswered mail to backups under the escalation policy. The header badge shows mail sync health (**Live mail**, **Mail sync stale** after 75 minutes, **Mailbox offline**); **Sync now** (↻) syncs at once, and a failing sync also raises an admin alert.

## Where each screen's data comes from

| Route | Source |
|---|---|
| `/inbox` | `messages` (Outlook) + `thread_state` (status, assignee, labels) + `notes`; linked to `orgs` by sender domain and to `vessels` by IMO / name; categories from `rules` |
| `/` | KPIs and charts computed from mail and the tables below; deadlines from `deadlines` |
| `/alerts` | Computed (SLA, overdue invoices, compliance actions, deadlines ≤14 days, stale allocations, missing/silent reports, proposed trades); snooze/resolve saved in `alert_state` |
| `/vessels` | `vessels` and `reports`, created and updated by the pipeline from vessel reports in the mailbox (Geoserve Forms noon / arrival / departure / bunker, in the body, a `.txt`/`.pdf` file or an attached email), matched by IMO (check digit) or vessel code; `mail_extractions` records what happened to each email; `compliance_items` |
| `/customers` | `orgs`, `vessels`, `compliance_items`, `company_obligations` |
| Email bodies, inline images, attachments | Microsoft Graph on demand (`/api/mail/...`), with the same app credentials as the pipeline; nothing is copied into Supabase |
| `/compliance` | `compliance_items`, `company_obligations`, `deadlines` |
| `/commercial` | `allocations`, `carbon_txns` (positions = confirmed + settled), `invoices` |
| `/admin` | `rules` (toggle saves), shared `templates`, `users` (add, edit, remove = deactivate), `roles` (categories and capabilities per role), `settings` (escalation policy), `activity` (audit log written by every action) |
| `/profile` | `users` availability, away dates, backup, `signature`, `prefs`, `views` (saved inbox views); personal `templates` |

## Code map

- `src/lib/workspace.ts` — loads every table in parallel on each request.
- `src/lib/db.ts` — Supabase REST access with the service-role key (server only).
- `src/app/actions.ts` — every write (triage, notes, alerts, confirmations, rules, profile, users, roles, templates, sync), each checked against the actor's role capabilities and logged to `activity`.
- `src/lib/team.ts` — who sees which mail (role categories, `mail.all`, assignee, backup), availability and backups, the escalation plan, validation of user/role edits. `src/lib/templates.ts` — template visibility, placeholders, validation.
- `src/lib/sync.ts`, `src/lib/automation.ts` — hourly / Sync now mail sync (runs the pipeline once) and backup reassignment, after page loads.
- `src/lib/mail.ts` — Outlook messages → threads (linking, rules, saved state, SLA).
- `src/lib/graph.ts`, `src/app/api/mail/` — Graph client (4 concurrent requests, retries on throttling); HTML body with `cid:` images resolved (`mail-html.ts`, shown in a sandboxed iframe), attachment download, attachment analysis.
- `src/lib/documents.ts`, `src/lib/document-analysis.ts` — Document Intelligence without AI: PDF text (pdf.js), OCR for scanned pages and images (Tesseract, English model bundled), then rule-based summary and data extraction. Add a file type in `EXTRACTORS`.
- `../vessel_reports.py` — vessel report parser (pure, tested in `../test_vessel_reports.py`); `../outlook-pipeline.py` matches and stores the results.
- `src/lib/alerts.ts`, `src/lib/metrics.ts` — alerts, charts and positions derived from records.
- `src/lib/data.ts` — configuration only: categories, regulations, capabilities, mailbox, SLA hours, sync interval. Roles live in the `roles` table.
- `src/lib/store.tsx` — client state over the workspace; optimistic updates, 30 s refresh.

## Not built yet

Microsoft (Entra ID) sign-in — "Signed in as" in the profile menu picks the team member until then, so role-based mail access is applied on the server but anyone can still pick any user; sending from the app; AI summaries (document summaries are extractive and rule-based); Teams/email notification delivery (backups and escalations are notified in-app, in Alerts); more than one mailbox; attachment storage (attachments stream from Graph); mail deletions in Outlook are not mirrored.
