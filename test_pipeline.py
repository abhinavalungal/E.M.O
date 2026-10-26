"""Run: python -m unittest test_pipeline"""
import importlib.util
import unittest
from pathlib import Path
from unittest import mock

spec = importlib.util.spec_from_file_location("pipeline", Path(__file__).with_name("outlook-pipeline.py"))
pipeline = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pipeline)


class SyncOnce(unittest.TestCase):
    def test_a_failed_one_off_sync_is_recorded_for_the_app_then_raised(self):
        written = []
        with mock.patch.multiple(
            pipeline, SUPABASE_URL="https://x.supabase.co", SUPABASE_KEY="k",
            export_messages=mock.Mock(side_effect=RuntimeError("Graph 401")),
            supabase_upsert=lambda table, rows: written.append((table, rows)),
        ):
            with self.assertRaisesRegex(RuntimeError, "Graph 401"):
                pipeline.sync(every=0)
        self.assertEqual(written, [("sync_status", [{"id": "mail", "error": "Graph 401"}])])


if __name__ == "__main__":
    unittest.main()
