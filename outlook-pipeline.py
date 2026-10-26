"""
E.M.O. (Emission Mail Operation) - read, write (draft) and send Outlook mail
through Microsoft Graph using APPLICATION permissions (client credentials).

No user sign-in, no device code, no offline_access.

Web app: `python outlook-pipeline.py sync` upserts the newest mail into the
Supabase `messages` table every 30 s; the geoemissions app reads it from there.
Each sync also extracts vessel reports from new mail into `vessels` / `reports`
(see vessel_reports.py); `python outlook-pipeline.py reports` backfills every
stored message and retries failed / unmatched ones.

.env file:
    TENANT_ID=...
    CLIENT_ID=...
    CLIENT_SECRET=...
    MAILBOX=alerts@yourcompany.com
    SUPABASE_URL=https://<project>.supabase.co        (sync only)
    SUPABASE_SERVICE_ROLE_KEY=...                      (sync only)

App registration (API permissions -> Microsoft Graph -> Application, admin consent):
    Mail.Read        read mail
    Mail.ReadWrite   drafts, mark as read (optional, includes read)
    Mail.Send        send mail

Ask the Exchange admin to restrict the app to the MAILBOX only
(application access policy / RBAC for Applications).
"""

import io
import os
import re
import sys
import time
import base64
import argparse
from datetime import datetime, timezone
from pathlib import Path

import msal
import requests
import truststore
from dotenv import load_dotenv

import vessel_reports

# Trust the OS certificate store: Microsoft's newer TLS G2 roots are missing from Python's certifi bundle.
truststore.inject_into_ssl()

load_dotenv()

TENANT_ID = os.getenv("TENANT_ID", "").strip()
CLIENT_ID = os.getenv("CLIENT_ID", "").strip()
CLIENT_SECRET = os.getenv("CLIENT_SECRET", "").strip()
MAILBOX = os.getenv("MAILBOX", "").strip()
SUPABASE_URL = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "").strip()

GRAPH = "https://graph.microsoft.com/v1.0"
SCOPES = ["https://graph.microsoft.com/.default"]

session = requests.Session()
_app = None


# --------------------------------------------------
# AUTH (client credentials)
# --------------------------------------------------

def authenticate():
    """Get an app-only token. MSAL caches it and renews it when expired."""
    global _app
    if not all([TENANT_ID, CLIENT_ID, CLIENT_SECRET, MAILBOX]):
        raise ValueError(
            "Set TENANT_ID, CLIENT_ID, CLIENT_SECRET and MAILBOX in .env"
        )
    if _app is None:
        _app = msal.ConfidentialClientApplication(
            CLIENT_ID,
            authority=f"https://login.microsoftonline.com/{TENANT_ID}",
            client_credential=CLIENT_SECRET,
        )
    result = _app.acquire_token_for_client(scopes=SCOPES)
    if "access_token" not in result:
        raise RuntimeError(result.get("error_description", result))
    session.headers["Authorization"] = f"Bearer {result['access_token']}"


def user_path(suffix=""):
    """Every app-only call must name the mailbox (there is no /me)."""
    return f"/users/{MAILBOX}{suffix}"


def request(method, path, **kwargs):
    """Call Graph, retrying throttled/transient errors and expired tokens."""
    url = path if path.startswith("https://") else GRAPH + path
    refreshed = False
    for attempt in range(6):
        r = session.request(method, url, timeout=60, **kwargs)
        if r.status_code == 401 and not refreshed:
            authenticate()
            refreshed = True
            continue
        if r.status_code in (429, 503, 504):
            try:
                delay = float(r.headers.get("Retry-After", 2 ** attempt))
            except ValueError:
                delay = 2 ** attempt
            time.sleep(min(delay, 120))
            continue
        if not r.ok:
            raise requests.HTTPError(
                f"HTTP {r.status_code}: {r.text[:1200]}", response=r
            )
        return r.json() if r.content else None
    raise RuntimeError(f"Retries exhausted: {url}")


# --------------------------------------------------
# READ  (Mail.Read)
# --------------------------------------------------

def list_messages(count=15, folder="inbox", unread_only=False):
    params = {
        "$top": count,
        "$select": "id,subject,from,receivedDateTime,isRead,hasAttachments",
        "$orderby": "receivedDateTime DESC",
    }
    if unread_only:
        # Graph requires $orderby properties to also appear in $filter,
        # so the receivedDateTime clause is deliberate.
        params["$filter"] = (
            "receivedDateTime ge 1900-01-01T00:00:00Z and isRead eq false"
        )
    data = request("GET", user_path(f"/mailFolders/{folder}/messages"),
                   params=params)
    return data["value"]


def get_message(message_id):
    return request(
        "GET",
        user_path(f"/messages/{message_id}"),
        params={
            "$select": "id,subject,from,toRecipients,ccRecipients,"
                       "receivedDateTime,body,hasAttachments,conversationId"
        },
    )


def search_messages(text, count=15):
    # $search can't be combined with $orderby on messages
    safe = text.replace('"', "")
    data = request(
        "GET",
        user_path("/messages"),
        params={
            "$search": f'"{safe}"',
            "$top": count,
            "$select": "id,subject,from,receivedDateTime,isRead",
        },
    )
    return data["value"]


def export_messages(count=50):
    """Newest inbox + sent mail with plain-text bodies, in the shape the web app reads."""
    out = []
    for folder in ("inbox", "sentitems"):
        data = request(
            "GET", user_path(f"/mailFolders/{folder}/messages"),
            params={
                "$top": count,
                "$select": "id,conversationId,subject,from,toRecipients,ccRecipients,"
                           "receivedDateTime,isRead,importance,flag,body,bodyPreview",
                "$orderby": "receivedDateTime DESC",
                # id + contentId let the app serve attachments and match inline images to their cid: references.
                "$expand": "attachments($select=id,name,size,isInline,contentType,"
                           "microsoft.graph.fileAttachment/contentId)",
            },
            headers={"Prefer": 'outlook.body-content-type="text"'},
        )
        out += [{**m, "folder": folder} for m in data["value"]]
    return out


def supabase_upsert(table, rows):
    """Insert or update rows through Supabase's REST API (service role, server-side only)."""
    r = requests.post(
        f"{SUPABASE_URL}/rest/v1/{table}", json=rows, timeout=60,
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}",
                 "Prefer": "resolution=merge-duplicates,return=minimal"},
    )
    if not r.ok:
        raise requests.HTTPError(f"Supabase {table}: HTTP {r.status_code}: {r.text[:500]}", response=r)


def supabase(method, table, params=None, json=None):
    """GET rows / PATCH rows matching PostgREST filters in params."""
    r = requests.request(
        method, f"{SUPABASE_URL}/rest/v1/{table}", params=params, json=json, timeout=60,
        headers={"apikey": SUPABASE_KEY, "Authorization": f"Bearer {SUPABASE_KEY}", "Prefer": "return=minimal"},
    )
    if not r.ok:
        raise requests.HTTPError(f"Supabase {table}: HTTP {r.status_code}: {r.text[:500]}", response=r)
    return r.json() if r.content else None


# --------------------------------------------------
# VESSEL REPORTS  (mail -> vessels / reports)
# --------------------------------------------------

REPORT_HINT = re.compile(r"noon|arrival|departure|bunker|position report|geoserve forms", re.I)


def pdf_text(data):
    try:
        from pypdf import PdfReader
    except ImportError:
        raise RuntimeError("PDF attachment not read: pip install pypdf")
    return "\n".join(page.extract_text() or "" for page in PdfReader(io.BytesIO(data)).pages)


def html_text(html):
    """Enough HTML -> text for report forms: block ends become line breaks, tags go, entities decode."""
    import html as htmllib
    text = re.sub(r"(?is)<(style|script|head)\b.*?</\1>", "", html)
    text = re.sub(r"(?i)<br\s*/?>|</(p|div|tr|li|h\d)>", "\n", text)
    return htmllib.unescape(re.sub(r"<[^>]+>", "", text))


def report_sources(m):
    """(source, text) to look for a report in: the body first, then .txt/.pdf attachments of report-like mail.
    Attachments are downloaded only when the body has no report, so ordinary mail costs no Graph calls."""
    yield "body", (m.get("body") or {}).get("content") or ""
    if not m.get("hasAttachments", True) or not REPORT_HINT.search(m.get("subject") or ""):
        return
    for a in request("GET", user_path(f"/messages/{m['id']}/attachments"),
                     params={"$select": "id,name,isInline"})["value"]:
        name = a.get("name") or ""
        if a.get("@odata.type") == "#microsoft.graph.itemAttachment":  # a forwarded report attached as an email
            item = request("GET", user_path(f"/messages/{m['id']}/attachments/{a['id']}"),
                           params={"$expand": "microsoft.graph.itemAttachment/item"}).get("item") or {}
            body = item.get("body") or {}
            yield name, html_text(body.get("content") or "") if body.get("contentType") == "html" else body.get("content") or ""
            continue
        if a.get("isInline") or not name.lower().endswith((".txt", ".pdf")):
            continue
        att = request("GET", user_path(f"/messages/{m['id']}/attachments/{a['id']}"))
        raw = base64.b64decode(att.get("contentBytes") or "")
        yield name, pdf_text(raw) if name.lower().endswith(".pdf") else raw.decode("utf-8", "replace")


def vessel_imo(report):
    """IMO from the report when its check digit is valid, else the one vessel already stored with this code."""
    v = report["vessel"]
    if v["imo"]:
        return v["imo"]
    if v["code"]:
        rows = supabase("GET", "vessels", {"select": "imo", "code": f"ilike.{v['code']}"})
        if len(rows) == 1:
            return rows[0]["imo"]
    return None


def ingest_message(m):
    """Detect, parse, match and store every vessel report in one email. Returns its mail_extractions row."""
    found = []
    for source, text in report_sources(m):
        r = vessel_reports.parse_report(text, m.get("subject") or "", m.get("receivedDateTime"))
        if r:
            found.append((source, r))
            if source == "body":
                break  # a report in the body: no need to download attachments
    if not found:
        return {"status": "not_report"}
    rows = [store_report(m, source, r) for source, r in found]
    best = ([x for x in rows if x["status"] == "report"] or rows)[0]
    details = "; ".join(x["detail"] for x in rows if x.get("detail"))[:500]
    return {**best, "detail": details or None}


def store_report(m, source, r):
    """Match one parsed report to its vessel and upsert the vessel and report rows."""
    imo = vessel_imo(r)
    if not imo:
        v = r["vessel"]
        return {"status": "unmatched", "report_id": r["id"],
                "detail": f"{v['name']}: IMO '{v['imo_raw'] or ''}' invalid and code '{v['code'] or ''}' matches no single vessel"}

    # Vessel first (reports reference it). The time guard makes "only newer reports move the current state"
    # hold even when two syncs run at once.
    existing = supabase("GET", "vessels", {"select": "*", "imo": f"eq.{imo}"})
    patch = vessel_reports.vessel_patch(existing[0] if existing else None, r)
    if not existing:
        supabase_upsert("vessels", [{"imo": imo, "name": r["vessel"]["name"] or r["vessel"]["code"] or f"IMO {imo}", **patch}])
    elif patch:
        params = {"imo": f"eq.{imo}"}
        if "last_report_at" in patch:
            params["or"] = f"(last_report_at.is.null,last_report_at.lte.{r['at']})"
        supabase("PATCH", "vessels", params, patch)

    # The same report forwarded or quoted again has the same id: keep the first source, keep the fuller data.
    data = {k: r[k] for k in ("form", "at_source", "at_raw", "tz_assumed", "vessel", "voyage", "bunkers", "readings")}
    old = supabase("GET", "reports", {"select": "message_id,thread_id,source,data", "id": f"eq.{r['id']}"})
    old = old[0] if old else None
    if old and len((old["data"] or {}).get("readings", [])) >= len(r["readings"]):
        return {"status": "report", "report_id": r["id"],
                "detail": None if old["message_id"] == m["id"] else f"{r['id']} already stored from message {old['message_id']}"}
    supabase_upsert("reports", [{
        "id": r["id"], "imo": imo, "type": r["type"], "label": vessel_reports.label(r), "at": r["at"],
        "status": "received", "voyage_no": r["voyage"].get("number"), "data": data,
        "thread_id": (old or {}).get("thread_id") or m.get("conversationId"),
        "message_id": old["message_id"] if old else m["id"],
        "source": old["source"] if old else source,
    }])
    return {"status": "report", "report_id": r["id"], "detail": None if source == "body" else f"{r['id']} from attachment {source}"}


def processed_ids(ids, retry=("failed",)):
    """Message ids already handled (statuses in retry are handled again)."""
    done = set()
    for i in range(0, len(ids), 20):  # keep the URL short
        quoted = ",".join('"' + x.replace('"', "") + '"' for x in ids[i:i + 20])
        rows = supabase("GET", "mail_extractions", {"select": "message_id,status", "message_id": f"in.({quoted})"})
        done |= {x["message_id"] for x in rows if x["status"] not in retry}
    return done


def ingest_reports(messages, retry=("failed",), force=False):
    """Process every message not yet handled; one bad message never stops the rest. Returns counts by status."""
    done = set() if force else processed_ids([m["id"] for m in messages], retry)
    counts = {}
    for m in messages:
        if m["id"] in done:
            continue
        try:
            row = ingest_message(m)
        except Exception as exc:
            row = {"status": "failed", "detail": str(exc)[:500]}
        supabase_upsert("mail_extractions", [{"message_id": m["id"], "report_id": None, "detail": None, **row,
                                              "processed_at": datetime.now(timezone.utc).isoformat()}])
        counts[row["status"]] = counts.get(row["status"], 0) + 1
    return counts


def backfill_reports(force=False):
    """Run extraction over every message stored in Supabase, oldest first; retries failed and unmatched ones."""
    offset, total = 0, {}
    while True:
        rows = supabase("GET", "messages", {"select": "data", "order": "received_at.asc", "limit": 25, "offset": offset})
        if not rows:
            break
        for k, v in ingest_reports([r["data"] for r in rows], retry=("failed", "unmatched"), force=force).items():
            total[k] = total.get(k, 0) + v
        offset += len(rows)
    supabase_upsert("sync_status", [{"id": "reports", "synced_at": datetime.now(timezone.utc).isoformat(), "error": None}])
    return total


def sync(count=50, every=30):
    """Upsert the newest mail into Supabase; loop forever when every > 0."""
    if not (SUPABASE_URL and SUPABASE_KEY):
        raise ValueError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
    while True:
        now = datetime.now(timezone.utc).isoformat()
        try:
            messages = export_messages(count)
            supabase_upsert("messages", [
                {"id": m["id"], "conversation_id": m["conversationId"], "folder": m["folder"],
                 "received_at": m["receivedDateTime"], "data": m}
                for m in messages
            ])
            supabase_upsert("sync_status", [{"id": "mail", "synced_at": now, "error": None}])
            print(f"{now[:19]}  synced {len(messages)} messages")
            try:  # report extraction must never hold up mail sync
                counts = ingest_reports(messages)
                supabase_upsert("sync_status", [{"id": "reports", "synced_at": now, "error": None}])
                if counts:
                    print(f"{now[:19]}  vessel reports: {counts}")
            except Exception as exc:
                print(f"[ERROR] reports: {exc}", file=sys.stderr)
                try:
                    supabase_upsert("sync_status", [{"id": "reports", "error": str(exc)[:500]}])
                except Exception:
                    pass
        except Exception as exc:
            try:  # tell the app; synced_at keeps the last good time
                supabase_upsert("sync_status", [{"id": "mail", "error": str(exc)[:500]}])
            except Exception:
                pass
            if every <= 0:  # one-off sync (the app's Sync now): fail loudly
                raise
            print(f"[ERROR] {exc}", file=sys.stderr)  # keep looping through outages
        if every <= 0:
            return
        time.sleep(every)


def list_attachments(message_id):
    data = request(
        "GET",
        user_path(f"/messages/{message_id}/attachments"),
        params={"$select": "id,name,size,contentType"},
    )
    return data["value"]


def download_attachment(message_id, attachment_id, out_dir="."):
    att = request(
        "GET", user_path(f"/messages/{message_id}/attachments/{attachment_id}")
    )
    if "contentBytes" not in att:
        raise ValueError("Not a file attachment")
    out = Path(out_dir) / att["name"]
    out.write_bytes(base64.b64decode(att["contentBytes"]))
    return out


# --------------------------------------------------
# WRITE / SEND  (Mail.ReadWrite for drafts, Mail.Send for sending)
# --------------------------------------------------

def _recipients(addresses):
    return [{"emailAddress": {"address": a}} for a in addresses or []]


def _attachments(paths):
    out = []
    for p in paths or []:
        p = Path(p)
        if p.stat().st_size > 3 * 1024 * 1024:
            raise ValueError(
                f"{p.name} is over 3 MB; large files need an upload session"
            )
        out.append({
            "@odata.type": "#microsoft.graph.fileAttachment",
            "name": p.name,
            "contentBytes": base64.b64encode(p.read_bytes()).decode(),
        })
    return out


def _message(to, subject, body, cc=None, html=False, attachments=None):
    return {
        "subject": subject,
        "body": {
            "contentType": "HTML" if html else "Text",
            "content": body,
        },
        "toRecipients": _recipients(to),
        "ccRecipients": _recipients(cc),
        "attachments": _attachments(attachments),
    }


def create_draft(to, subject, body, cc=None, html=False, attachments=None):
    """WRITE: save a draft in the mailbox. Returns the draft (with its id)."""
    return request(
        "POST", user_path("/messages"),
        json=_message(to, subject, body, cc, html, attachments),
    )


def send_draft(message_id):
    """Send a draft created with create_draft()."""
    request("POST", user_path(f"/messages/{message_id}/send"))


def send_mail(to, subject, body, cc=None, html=False, attachments=None,
              save_to_sent=True):
    """SEND: send straight away, no draft step."""
    payload = {
        "message": _message(to, subject, body, cc, html, attachments),
        "saveToSentItems": save_to_sent,
    }
    request("POST", user_path("/sendMail"), json=payload)  # 202, empty body


def reply_to(message_id, comment, reply_all=False):
    action = "replyAll" if reply_all else "reply"
    request("POST", user_path(f"/messages/{message_id}/{action}"),
            json={"comment": comment})


def mark_read(message_id, is_read=True):
    """Needs Mail.ReadWrite."""
    request("PATCH", user_path(f"/messages/{message_id}"),
            json={"isRead": is_read})


# --------------------------------------------------
# CLI helpers
# --------------------------------------------------

def sender(m):
    addr = (m.get("from") or {}).get("emailAddress", {})
    return addr.get("name") or addr.get("address") or "?"


def print_list(messages):
    for i, m in enumerate(messages, 1):
        flag = " " if m.get("isRead") else "*"
        when = m["receivedDateTime"][:16].replace("T", " ")
        print(f"{i:>2}{flag} {when}  {sender(m)[:28]:<28}  "
              f"{m.get('subject') or '(no subject)'}")
    print("\n(* = unread)")


def pick_id(messages, ref):
    """Accept a list number or a full message id."""
    if ref.isdigit() and 1 <= int(ref) <= len(messages):
        return messages[int(ref) - 1]["id"]
    return ref


def show_message(m):
    to = ", ".join(r["emailAddress"]["address"] for r in m["toRecipients"])
    print(f"\nFrom:    {sender(m)}")
    print(f"To:      {to}")
    print(f"Date:    {m['receivedDateTime']}")
    print(f"Subject: {m['subject']}\n")
    print(m["body"]["content"])


def ask_body():
    print("Body (finish with an empty line):")
    lines = []
    while True:
        line = input()
        if not line:
            break
        lines.append(line)
    return "\n".join(lines)


def interactive():
    """Menu mode, used when the script is run with no arguments."""
    msgs = []
    help_text = (
        f"\n  Mailbox: {MAILBOX}\n"
        "  l           list inbox\n"
        "  u           list unread\n"
        "  r N         read message N from the last list\n"
        "  re N        reply to message N\n"
        "  s TEXT      search mail\n"
        "  n           new mail (send now)\n"
        "  d           new draft (save only)\n"
        "  q           quit"
    )
    print(help_text)
    while True:
        try:
            raw = input("\n> ").strip()
        except (EOFError, KeyboardInterrupt):
            break
        if not raw:
            continue
        cmd, _, rest = raw.partition(" ")
        rest = rest.strip()
        try:
            if cmd == "q":
                break
            elif cmd == "l":
                msgs = list_messages(20)
                print_list(msgs)
            elif cmd == "u":
                msgs = list_messages(20, unread_only=True)
                print_list(msgs)
            elif cmd == "s" and rest:
                msgs = search_messages(rest)
                print_list(msgs)
            elif cmd in ("r", "re") and rest.isdigit():
                n = int(rest)
                if not 1 <= n <= len(msgs):
                    print("Run l, u or s first, then pick a number from that list.")
                    continue
                mid = msgs[n - 1]["id"]
                if cmd == "r":
                    show_message(get_message(mid))
                else:
                    body = ask_body()
                    if input("Send reply? [y/N] ").lower() == "y":
                        reply_to(mid, body)
                        print("Reply sent.")
            elif cmd in ("n", "d"):
                to = input("To (comma separated): ").split(",")
                to = [a.strip() for a in to if a.strip()]
                subject = input("Subject: ")
                body = ask_body()
                if cmd == "n":
                    if input(f"Send to {', '.join(to)}? [y/N] ").lower() == "y":
                        send_mail(to, subject, body)
                        print("Sent.")
                else:
                    d = create_draft(to, subject, body)
                    print(f"Draft saved (id: {d['id']})")
            else:
                print(help_text)
        except Exception as exc:
            print(f"[ERROR] {exc}")


def main():
    ap = argparse.ArgumentParser(description="E.M.O. - read and send Outlook mail (app-only)")
    sub = ap.add_subparsers(dest="cmd", required=False)

    p = sub.add_parser("list", help="list recent messages")
    p.add_argument("-n", type=int, default=15)
    p.add_argument("--unread", action="store_true")
    p.add_argument("--folder", default="inbox")

    p = sub.add_parser("sync", help="keep the Supabase messages table fresh for the web app")
    p.add_argument("-n", type=int, default=50, help="messages per folder")
    p.add_argument("--every", type=int, default=30, help="seconds between syncs, 0 = once")

    p = sub.add_parser("reports", help="extract vessel reports from every stored message (retries failures)")
    p.add_argument("--force", action="store_true", help="reprocess messages already handled")

    p = sub.add_parser("read", help="read a message by list number or id")
    p.add_argument("ref")

    p = sub.add_parser("search", help="search all mail")
    p.add_argument("text")

    p = sub.add_parser("send", help="send a new message")
    p.add_argument("--to", nargs="+", required=True)
    p.add_argument("--cc", nargs="*")
    p.add_argument("--subject", required=True)
    p.add_argument("--body", required=True)
    p.add_argument("--html", action="store_true")
    p.add_argument("--attach", nargs="*")

    p = sub.add_parser("draft", help="save a draft without sending")
    p.add_argument("--to", nargs="+", required=True)
    p.add_argument("--cc", nargs="*")
    p.add_argument("--subject", required=True)
    p.add_argument("--body", required=True)
    p.add_argument("--html", action="store_true")
    p.add_argument("--attach", nargs="*")

    p = sub.add_parser("reply", help="reply to a message by list number or id")
    p.add_argument("ref")
    p.add_argument("--body", required=True)
    p.add_argument("--all", action="store_true")

    args = ap.parse_args()
    authenticate()

    if args.cmd is None:
        interactive()
        return

    if args.cmd == "list":
        print_list(list_messages(args.n, args.folder, args.unread))

    elif args.cmd == "sync":
        sync(args.n, args.every)

    elif args.cmd == "reports":
        if not (SUPABASE_URL and SUPABASE_KEY):
            raise ValueError("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env")
        print(f"Vessel reports: {backfill_reports(args.force)}")

    elif args.cmd == "search":
        print_list(search_messages(args.text))

    elif args.cmd == "read":
        msgs = list_messages(50)
        show_message(get_message(pick_id(msgs, args.ref)))

    elif args.cmd == "send":
        send_mail(args.to, args.subject, args.body, cc=args.cc,
                  html=args.html, attachments=args.attach)
        print("Sent.")

    elif args.cmd == "draft":
        d = create_draft(args.to, args.subject, args.body, cc=args.cc,
                         html=args.html, attachments=args.attach)
        print(f"Draft saved (id: {d['id']})")

    elif args.cmd == "reply":
        msgs = list_messages(50)
        reply_to(pick_id(msgs, args.ref), args.body, reply_all=args.all)
        print("Reply sent.")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"[ERROR] {exc}", file=sys.stderr)
        sys.exit(1)