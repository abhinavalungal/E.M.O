# Run: python -m unittest test_vessel_reports
import unittest

from vessel_reports import imo_ok, label, parse_report, parse_time, vessel_patch

NOON = """Dear all, see below.
--------------- BEGIN FORM DETAILS -----------------
Report: Noon Report v00.01.02

----------------- VESSEL DETAILS -------------------
Vessel Name: Navi Moon
IMO Number: 9385154
Vessel Code: NAMO
Principal ID: Geoserve

--------------- VOYAGE -------------------
Voyage Number: 052026
Location: At Sea
Date/Time: 09-09-2026 12:00:00 -05:00
Vessel Condition: Laden
Upcoming Ports.:
Upcoming Port: SOREL
Via: DIRECT
ETA 18-09-2026 22:00:00 -04:00
Distance to Go: 2598
Projected Speed: 11.55

--------------- DISTANCE AND VESSEL -------------------
CP / Ordered Speed (knots): 11.70
Slip %: 23.72
Main Engine KWhrs: 4982.00
Mean Draft: 8.41

--------------- WEATHER -------------------
Wind Force: 07 MODERATE GALE

--------------- BUNKERS ROB -------------------
At Sea Bunker ROB Details:
Fuel Type: HSFO (>20 CST)

Fuel Type: VLSFO (>20 CST)
ROB Start: 600.090
ROB End: 581.310
Fuel Type: LSMGO
ROB End: 147.450

------------- BEGIN GEOFORM FORM DATA ---------------
8gxZN2IDTCk1UYPJlewH+YBTazl4: not a field
"""

# How Outlook's text conversion delivers a report quoted in a reply: fields run together on one line.
QUOTED = """Dear Captain, please share the BDN.
-----Original Message-----
Subject: Geoserve Forms: Pasco Roni - Bunker Report - 12.10.2026
--------------- BEGIN FORM DETAILS -----------------
Report: Bunker Report v00.01.02
----------------- VESSEL DETAILS ------------------- Vessel Name: Pasco Roni IMO Number: 9940447 Vessel Code: PARO Principal ID: GeoserveOne
--------------- VOYAGE -------------------
Voyage Number: 6
Port: ABIDJAN
Barge Alongside: 12-10-2026 14:18:00 +00:00 Bunker Hose Connected: 12-10-2026 14:52:00 +00:00 Commenced Bunkering: 12-10-2026 15:18:00 +00:00
"""


class ParseReport(unittest.TestCase):
    def test_noon_report_fields_values_and_units(self):
        r = parse_report(NOON, "Geoserve Forms: NAVI MOON - Noon Report - 09.09.2026")
        self.assertEqual(r["type"], "Noon report")
        self.assertEqual(r["form"], "Noon Report v00.01.02")
        self.assertEqual(r["vessel"], {"name": "Navi Moon", "imo": "9385154", "imo_raw": "9385154", "code": "NAMO", "principal": "Geoserve"})
        self.assertEqual(r["at"], "2026-09-09T17:00:00+00:00")  # 12:00 at -05:00
        self.assertEqual(r["at_raw"], "09-09-2026 12:00:00 -05:00")
        v = r["voyage"]
        self.assertEqual((v["number"], v["location"], v["condition"], v["next_port"]), ("052026", "At Sea", "Laden", "SOREL"))
        self.assertEqual(v["eta"], "2026-09-19T02:00:00+00:00")
        self.assertEqual((v["distance_to_go_nm"], v["projected_speed_kn"]), (2598.0, 11.55))
        by = {x["label"]: x for x in r["readings"] if "group" not in x}
        self.assertEqual(by["CP / Ordered Speed"], {"label": "CP / Ordered Speed", "raw": "11.70", "value": 11.7, "unit": "knots", "section": "Distance And Vessel"})
        self.assertEqual((by["Slip"]["unit"], by["Main Engine KWhrs"]["unit"]), ("%", "kWh"))
        self.assertEqual(by["Wind Force"]["raw"], "07 MODERATE GALE")
        self.assertNotIn("value", by["Wind Force"])
        self.assertEqual(r["bunkers"], [{"fuel": "VLSFO (>20 CST)", "ROB End": 581.31, "unit": "MT"}, {"fuel": "LSMGO", "ROB End": 147.45, "unit": "MT"}])
        self.assertFalse(any("8gxZN" in x["label"] for x in r["readings"]))  # encrypted form data is ignored
        self.assertEqual(label(r), "Voy 052026 · At Sea · → SOREL")

    def test_same_report_forwarded_gets_the_same_id(self):
        a = parse_report(NOON, "Geoserve Forms: NAVI MOON - Noon Report - 09.09.2026")
        b = parse_report("FW: see below\n\n" + NOON.replace("\n", "\r\n"), "FW: Geoserve Forms: NAVI MOON - Noon Report - 09.09.2026")
        self.assertEqual(a["id"], b["id"])
        self.assertNotEqual(a["id"], parse_report(NOON.replace("09-09-2026 12:00", "10-09-2026 12:00"))["id"])

    def test_fields_run_together_in_a_quoted_reply(self):
        r = parse_report(QUOTED, "RE: Geoserve Forms: Pasco Roni - Bunker Report - 12.10.2026")
        self.assertEqual((r["vessel"]["name"], r["vessel"]["imo"], r["vessel"]["code"], r["vessel"]["principal"]), ("Pasco Roni", "9940447", "PARO", "GeoserveOne"))
        self.assertEqual(r["type"], "Bunker report")
        self.assertEqual((r["at"], r["at_source"]), ("2026-10-12T15:18:00+00:00", "Commenced Bunkering"))

    def test_not_a_report_or_no_vessel_identifier(self):
        self.assertIsNone(parse_report("Please send the noon report for IMO 9385154.", "Missing Noon report"))
        self.assertIsNone(parse_report("Vessel Name: X\nIMO Number: 1234567\n", "Noon Report"))  # bad check digit, no code
        self.assertIsNone(parse_report(""))

    def test_missing_time_falls_back_to_subject_then_email(self):
        text = "Vessel Name: Navi Moon\nIMO Number: 9385154\nVoyage Number: 7\nDate/Time: 31-02-2026 12:00"
        r = parse_report(text, "Geoserve Forms: NAVI MOON - Noon Report - 09.09.2026")
        self.assertEqual((r["at"], r["at_source"], r["tz_assumed"]), ("2026-09-09T00:00:00+00:00", "subject", True))
        r = parse_report(text, "Noon report", received_at="2026-09-10T04:18:00Z")
        self.assertEqual((r["at"], r["at_source"]), ("2026-09-10T04:18:00Z", "received"))
        self.assertIsNone(parse_report(text, "Noon report"))  # no usable time at all

    def test_bad_imo_with_code_still_parses_without_imo(self):
        r = parse_report(NOON.replace("9385154", "9385155"))
        self.assertEqual((r["vessel"]["imo"], r["vessel"]["imo_raw"], r["vessel"]["code"]), (None, "9385155", "NAMO"))


class Helpers(unittest.TestCase):
    def test_imo_and_time(self):
        self.assertTrue(imo_ok("9385154") and imo_ok("9074729"))
        self.assertFalse(imo_ok("9385155") or imo_ok("938515") or imo_ok(None))
        self.assertEqual(parse_time("23-09-2026 20:30:00 +07:00"), ("2026-09-23T13:30:00+00:00", False))
        self.assertEqual(parse_time("09.09.2026"), ("2026-09-09T00:00:00+00:00", True))
        self.assertEqual(parse_time("not a date"), (None, False))


class VesselPatch(unittest.TestCase):
    def setUp(self):
        self.r = parse_report(NOON, "Geoserve Forms: NAVI MOON - Noon Report - 09.09.2026")

    def test_new_vessel(self):
        p = vessel_patch(None, self.r)
        self.assertEqual(p["name"], "Navi Moon")
        self.assertEqual((p["voyage_no"], p["location"], p["condition"], p["voyage_to"]), ("052026", "At Sea", "Laden", "SOREL"))
        self.assertEqual(p["voyage_eta"], "2026-09-18")  # the ship's local date, not the UTC one
        self.assertEqual((p["last_report_at"], p["last_report_id"]), (self.r["at"], self.r["id"]))

    def test_never_overwrites_master_data_or_with_blanks(self):
        existing = {"name": "MV Navi Moon", "code": "NAMO", "voyage_no": "052026", "condition": "Laden", "last_report_at": "2026-09-08T17:00:00+00:00"}
        partial = dict(self.r, voyage={"number": "052026"})  # newer report missing most fields
        p = vessel_patch(existing, partial)
        self.assertNotIn("name", p)
        self.assertNotIn("condition", p)
        self.assertEqual(p["last_report_at"], self.r["at"])

    def test_older_report_does_not_move_current_state(self):
        p = vessel_patch({"name": "Navi Moon", "last_report_at": "2026-09-10T00:00:00+00:00", "voyage_no": "062026"}, self.r)
        self.assertEqual(p, {"code": "NAMO", "principal": "Geoserve"})


if __name__ == "__main__":
    unittest.main()
