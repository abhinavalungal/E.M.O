"""
Vessel report extraction for E.M.O. (used by outlook-pipeline.py).

Reads the "Geoserve Forms" vessel reports (Noon / Arrival / Departure / Bunker, SCM variants, any version)
from an email body or a text attachment and returns one normalized dict. Every reading keeps the text as
written and its unit; numbers are added next to it, never instead of it. Pure functions only: no I/O.

    parse_report(text, subject="", received_at=None) -> dict | None
    vessel_patch(existing, report) -> dict          # what to write to the vessels row
"""

import hashlib
import re
from datetime import datetime, timedelta, timezone

# Labels that sometimes run together on one line when a report is quoted in a reply (HTML -> text).
_KNOWN = [
    "Vessel Name", "IMO Number", "Vessel Code", "Principal ID", "Report", "Voyage Number", "Location", "Date/Time",
    "Port ETD", "Port", "Vessel Condition", "Latitude", "Longitude", "Upcoming Port", "Via", "ETA", "Distance to Go",
    "Projected Speed", "Start of Sea Passage", "End of Sea Passage", "Supplier.", "Supplier", "Barge Name",
    "Barge Alongside", "Bunker Hose Connected", "Commenced Bunkering", "Bunkering Completed",
    "Bunker Hose disconnected", "Barge Cast Off", "Fuel Type", "ROB Start", "ROB End", "BDN Quantity", "BDN Number",
    "Start Date/Time", "End Date/Time", "Event Types", "Remarks",
]
# Scanned left to right, longest label first, so "Upcoming Port:" is one label, never "Upcoming" + "Port:".
_LABEL_AT = re.compile(r"(?<!\S)(?:(?:" + "|".join(re.escape(k) for k in sorted(_KNOWN, key=len, reverse=True))
                       + r")\s*:|(?:ETA|Start Date/Time|End Date/Time)\s+(?=\d))")
_HEADER = re.compile(r"^-{3,}\s*(.*?)\s*-{3,}$")
_PAIR = re.compile(r"^([A-Za-z0-9/#&'().,%<>=+ -]{1,80}?)\s*:\s*(.*)$")
_NOCOLON = re.compile(r"^(ETA|Start Date/Time|End Date/Time)\s+(\d.*)$")  # the form prints these without a colon
_NUM = re.compile(r"^[-+]?\d+(?:\.\d+)?$")
_UNIT = re.compile(r"^(.*?)\s*\(([^()]*)\)\s*$")
_DATE = re.compile(r"(\d{1,2})[-./](\d{1,2})[-./](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?\s*(Z|UTC|GMT|[+-]\d{2}:?\d{2})?", re.I)

# Units the form implies but does not print.
IMPLIED_UNITS = {
    "Reported Speed": "knots", "Projected Speed": "knots", "Distance to Go": "nm", "Mean Draft": "m",
    "Main Engine Hrs": "h", "Main Engine KWhrs": "kWh", "Average RPM": "rpm", "Average KW": "kW",
    "ROB Start": "MT", "ROB End": "MT", "BDN Quantity": "MT", "Total": "MT", "Main": "MT", "Aux": "MT",
}

TYPES = [  # (pattern on the form/subject name, reports.type)
    (r"noon", "Noon report"),
    (r"arrival", "Arrival report"),
    (r"departure", "Departure report"),
    (r"bunker", "Bunker report"),
]
TIME_FIELDS = {  # where each report type says when it happened, best first
    "Noon report": ["Date/Time"],
    "Arrival report": ["End of Sea Passage", "Date/Time"],
    "Departure report": ["Start of Sea Passage", "Date/Time"],
    "Bunker report": ["Commenced Bunkering", "Bunkering Completed", "Barge Alongside", "Date/Time"],
    "Voyage report": ["Date/Time", "Start of Sea Passage", "End of Sea Passage"],
}


def imo_ok(imo):
    """7 digits with a valid check digit (same rule as geoemissions/src/lib/imo.ts)."""
    return bool(re.fullmatch(r"\d{7}", imo or "")) and sum(int(d) * (7 - i) for i, d in enumerate(imo[:6])) % 10 == int(imo[6])


def parse_time(raw):
    """'09-09-2026 12:00:00 -05:00' -> ('2026-09-09T17:00:00+00:00', tz_assumed). Day-first, as the forms print."""
    m = _DATE.search(raw or "")
    if not m:
        return None, False
    d, mo, y, h, mi, s, tz = m.groups()
    try:
        offset = timedelta(0)
        if tz and tz.upper() not in ("Z", "UTC", "GMT"):
            sign = -1 if tz[0] == "-" else 1
            hh, mm = tz[1:].replace(":", "")[:2], tz[1:].replace(":", "")[2:]
            offset = sign * timedelta(hours=int(hh), minutes=int(mm))
        local = datetime(int(y), int(mo), int(d), int(h or 0), int(mi or 0), int(s or 0), tzinfo=timezone(offset))
    except ValueError:  # 31-02-2026, month 13, ...
        return None, False
    return local.astimezone(timezone.utc).isoformat(), tz is None


def _reading(label, raw, section, group=None):
    m = _UNIT.match(label)
    name, unit = (m.group(1), m.group(2)) if m else (label, None)
    if name.endswith(" %"):
        name, unit = name[:-2], "%"
    r = {"label": name.strip(), "raw": raw, "section": section}
    if unit or IMPLIED_UNITS.get(name.strip()):
        r["unit"] = unit or IMPLIED_UNITS[name.strip()]
    if _NUM.match(raw):
        r["value"] = float(raw)
    if group:
        r["group"] = group
    return r


def _form_text(text):
    start = text.find("BEGIN FORM DETAILS")
    if start >= 0:
        end = text.find("BEGIN GEOFORM FORM DATA", start)  # encrypted payload follows; nothing readable after it
        return text[start - 40 if start >= 40 else 0: end if end > 0 else None]
    return text


def parse_report(text, subject="", received_at=None):
    """A normalized vessel report, or None when the text holds no report with a vessel identifier."""
    text = (text or "").replace("\r", "")
    if not re.search(r"IMO Number\s*:|Vessel Code\s*:", text):
        return None
    lines = []
    for line in _form_text(text).split("\n"):
        line = line.strip().strip(" ")
        # A quoted report can carry a section header and several fields on one line.
        for part in re.split(r"(-{3,}[^-]+-{3,})", line):
            cuts = [m.start() for m in _LABEL_AT.finditer(part)] or [0]
            lines += [p.strip() for p in (part[a:b] for a, b in zip([0] + cuts, cuts + [len(part)])) if p.strip()]

    section, group, event, fields, readings = "Form", None, None, {}, []
    for line in lines:
        h = _HEADER.match(line)
        if h:
            section, group, event = (h.group(1).title() or section), None, None
            continue
        m = _NOCOLON.match(line) or _PAIR.match(line)  # "ETA 18-09-2026 22:00" has colons only in the time
        if not m:
            if readings and not line.startswith("-"):  # wrapped remark
                readings[-1]["raw"] += "\n" + line
            continue
        label, raw = m.group(1).strip().rstrip("."), m.group(2).strip()
        if label == "Fuel Type":
            group = raw
            continue
        if label == "Event Types":
            event, group = raw, None
            readings.append(_reading("Event", raw, section))
            continue
        if raw == "":
            continue  # headings such as "Upcoming Ports.:" or "At Sea Bunker ROB Details:"
        r = _reading(label, raw, section, group or event)
        readings.append(r)
        if not (group or event):
            fields.setdefault(r["label"], raw)  # first occurrence is the report's own value

    imo = re.sub(r"\D", "", fields.get("IMO Number", ""))
    code = re.sub(r"[^A-Za-z0-9]", "", fields.get("Vessel Code", "")).upper() or None
    if not imo_ok(imo) and not code:
        return None

    form = fields.get("Report") or ""
    kind = form or subject
    rtype = next((t for p, t in TYPES if re.search(p, kind, re.I)), "Voyage report")
    at, tz_assumed, at_source = None, False, None
    for f in TIME_FIELDS[rtype]:
        at, tz_assumed = parse_time(fields.get(f))
        if at:
            at_source = f
            break
    if not at:  # the subject's date ("... - 09.09.2026"), then the email's own time
        at, _ = parse_time(subject)
        at_source, tz_assumed = ("subject", True) if at else ("received", False)
        at = at or received_at
    if not at:
        return None
    eta, _ = parse_time(fields.get("ETA"))

    def num(label):
        v = fields.get(label, "").split(" ")[0]
        return float(v) if _NUM.match(v) else None

    bunkers = {}
    for r in readings:
        if r.get("group") and r["section"].startswith("Bunker") and r["label"] in ("ROB End", "BDN Quantity") and "value" in r:
            bunkers[r["group"]] = {"fuel": r["group"], r["label"]: r["value"], "unit": "MT"}

    voyage = {
        "number": fields.get("Voyage Number"),
        "location": fields.get("Location"),
        "port": fields.get("Port"),
        "condition": fields.get("Vessel Condition"),
        "latitude": fields.get("Latitude"),
        "longitude": fields.get("Longitude"),
        "next_port": fields.get("Upcoming Port"),
        "eta": eta,
        "eta_raw": fields.get("ETA"),
        "distance_to_go_nm": num("Distance to Go"),
        "projected_speed_kn": num("Projected Speed"),
    }
    vessel = {
        "name": fields.get("Vessel Name"),
        "imo": imo if imo_ok(imo) else None,
        "imo_raw": fields.get("IMO Number"),
        "code": code,
        "principal": fields.get("Principal ID"),
    }
    key = f"{vessel['imo'] or code}|{rtype}|{at}"
    return {
        "id": "VR-" + hashlib.sha1(key.encode()).hexdigest()[:16],
        "type": rtype,
        "form": form or None,
        "at": at,
        "at_source": at_source,
        "at_raw": fields.get(at_source) if at_source in fields else None,
        "tz_assumed": tz_assumed,
        "vessel": vessel,
        "voyage": {k: v for k, v in voyage.items() if v not in (None, "")},
        "bunkers": list(bunkers.values()),
        "readings": readings,
    }


def label(report):
    """Short line for the reports table, e.g. 'Voy 052026 · At Sea · → SOREL'."""
    v = report["voyage"]
    parts = [f"Voy {v['number']}" if v.get("number") else None, v.get("location") or v.get("port"),
             f"→ {v['next_port']}" if v.get("next_port") else None]
    return " · ".join(p for p in parts if p) or report.get("form") or report["type"]


def vessel_patch(existing, report):
    """Columns to write on the vessels row. Master data only fills gaps; the voyage state moves only forward
    in time and never to a blank, so a late or partial report cannot wipe what a better one stored."""
    existing = existing or {}
    v, voy = report["vessel"], report["voyage"]
    patch = {}
    for col, val in (("name", v.get("name")), ("code", v.get("code")), ("principal", v.get("principal"))):
        if val and not existing.get(col):
            patch[col] = val
    last = existing.get("last_report_at")
    if last and _ts(last) > _ts(report["at"]):
        return patch  # an older report: history only
    port, kind = voy.get("port"), report["type"]
    if kind == "Departure report" and port:
        where = f"At sea · departed {port}"
    elif port and (kind == "Arrival report" or (voy.get("location") or "").lower() == "in port"):
        where = f"In port · {port}"
    else:
        where = voy.get("location") or port
    eta_local = _DATE.search(voy.get("eta_raw") or "")  # the date as the ship wrote it, not shifted to UTC
    state = {
        "voyage_no": voy.get("number"),
        "location": where,
        "condition": voy.get("condition"),
        "voyage_from": port if kind == "Departure report" else None,
        "voyage_to": voy.get("next_port") or (port if kind == "Arrival report" else None),
        "voyage_eta": f"{eta_local[3]}-{int(eta_local[2]):02d}-{int(eta_local[1]):02d}" if eta_local and voy.get("eta") else None,
    }
    patch.update({k: val for k, val in state.items() if val})
    patch["last_report_at"] = report["at"]
    patch["last_report_id"] = report["id"]
    return patch


def _ts(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00")).timestamp()
