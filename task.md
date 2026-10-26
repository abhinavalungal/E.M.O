# E.M.O. — Document Intelligence, Email Rendering & Vessel Data Integration

I want to improve E.M.O.’s existing email and document-handling capabilities and integrate vessel reports from the mailbox into the Vessel module.

First, inspect the E.M.O. codebase, architecture, database, mailbox integration, and existing UI components. Understand how the project currently works before making changes. Reuse the existing infrastructure wherever possible.

## 1. Document Intelligence

When a user opens a PDF attachment, provide two options:

- **Summarize:** Generate a clear summary highlighting important points, dates, figures, and action items.
- **Extract Data:** Extract key information, tables, figures, identifiers, and other relevant data into a structured format that users can easily copy.

Allow users to copy individual values or all extracted data. Preserve labels, units, and context. Support scanned PDFs through OCR when necessary.

Build this as a reusable document-processing capability that can later support other file types.

## 2. Fix Email Image Rendering

Currently, some emails display placeholders such as:

`[cid:image005.png@01DD5C9D.C7BB88C0]`

Fix the underlying email rendering pipeline so embedded images display correctly.

- Resolve `cid:` references to their corresponding MIME attachments.
- Render images in their correct positions within the email body.
- Support common image formats.
- Handle missing or invalid references gracefully.
- Preserve the original email layout as closely as possible.

Apply the fix across E.M.O., not just to the example email.

## 3. Fix Email Signature Rendering

Email signatures should display correctly, including their text, logos, profile pictures, formatting, and embedded images.

Investigate MIME parsing, Content-ID resolution, HTML sanitization, and frontend rendering to identify the root cause. Avoid duplicate images and broken placeholders while preserving links and basic formatting.

## 4. Extract Vessel Reports from Emails

E.M.O.'s mailbox contains structured vessel reports with information such as:

**Vessel details**
- Vessel Name: Navi Moon
- IMO Number: 9385154
- Vessel Code: NAMO
- Principal ID: Geoserve

**Voyage details**
- Voyage Number: 052026
- Location: At Sea
- Report Date: 09-09-2026
- Vessel Condition: Laden
- Upcoming Port: SOREL
- ETA: 18-09-2026
- Distance to Go: 2598
- Projected Speed: 11.55 knots

**Operational data**
- Ordered Speed, observed distance, engine distance, and reported speed
- Main engine hours, KWhrs, and average RPM
- Forward, aft, and mean draft
- Technical parameters, temperatures, pressures, and engine readings
- Weather, wind, swell, and sea conditions
- Bunker ROB, fuel types, and available fuel quantities

The sample is illustrative. Actual reports may have different formats, report versions, and available fields.

Build a reusable parser that identifies vessel reports from email bodies and supported attachments, extracts available information, normalizes it, and preserves the original values and units.

Handle missing fields, date formats, time zones, and report variations safely. Match vessels using reliable identifiers, especially IMO number and vessel code. Retain source email and report references for traceability.

## 5. Populate the Vessel Module

Currently, the Vessel module displays **No vessels yet**.

Connect the existing mailbox integration, report extraction, database, and frontend so the module displays real vessel data.

Implement this workflow:

1. Retrieve relevant emails and attachments through E.M.O.'s existing mailbox integration.
2. Detect messages containing vessel reports.
3. Extract and normalize vessel, voyage, and operational information.
4. Match each report to the correct vessel.
5. Persist the data using the existing database architecture.
6. Display vessels and their available details in the Vessel module.
7. Allow users to open a vessel and inspect its voyage information and reports.
8. Show the latest report date and link back to the source email.
9. Update existing records when new reports arrive without creating duplicates.
10. Provide clear loading, empty, error, and success states.

The vessel list should display useful fields such as vessel name, IMO number, vessel code, latest report date, voyage number, location, and vessel condition whenever available.

Do not overwrite previously stored valid values with missing or invalid data from a newer report.

## 6. Database and Reliability

Inspect E.M.O.'s existing database schema before introducing new tables or relationships.

- Reuse existing vessel, voyage, report, and email records where appropriate.
- Separate vessel master data from individual reports and time-dependent readings.
- Make processing idempotent so retries do not create duplicate records.
- Preserve source references and relevant raw extracted data for troubleshooting.
- Ensure the frontend reads persisted data rather than mock data.
- Handle partial reports and extraction failures without losing valid information.

## 7. Testing and Acceptance Criteria

Verify the complete workflow:

- PDF summaries and structured extraction work, with copy actions.
- Embedded email images render correctly.
- Signatures and signature images display properly.
- Vessel reports are detected and parsed from actual mailbox messages.
- Extracted values are mapped to the correct vessel records.
- The Vessel module displays real, persisted data instead of incorrectly showing an empty state.
- Multiple reports update the correct vessel without creating duplicates.
- Missing fields, malformed reports, and attachment errors are handled gracefully.
- Existing E.M.O. functionality remains intact.

## Final Expectations

Do not just add UI elements or populate the Vessel module with sample data. Identify the root causes and implement a reliable, end-to-end solution within E.M.O.'s existing architecture.

If mailbox, database, or service access is unavailable, identify the exact dependency instead of pretending the integration is complete.

Before finishing, report what was implemented, which real data sources were verified, what tests passed, and what remains blocked.