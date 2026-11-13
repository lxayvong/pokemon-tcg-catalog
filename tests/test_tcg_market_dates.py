#!/usr/bin/env python3
"""Regression tests for actual published TCGCSV date handling. Offline, stdlib only."""
import contextlib
import datetime as dt
import importlib.util
import io
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "update_tcgplayer_markets.py"
spec = importlib.util.spec_from_file_location("market_sync", SOURCE)
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

class MarketDateTests(unittest.TestCase):
    def run_case(self, marker, cli=None, prior=None):
        with tempfile.TemporaryDirectory() as folder:
            dest = Path(folder) / "daily.js"
            if prior:
                dest.write_text('const TCGPLAYER_DAILY_AS_OF="'+prior+'";\n', encoding="utf-8")
            argv = ["market_sync.py"] + (cli or [])
            # Force a deliberate stop immediately after validation, before groups are fetched.
            # The script must not relabel source quotes based on the runner clock.
            with patch.object(sync, "DESTINATION", dest), \
                 patch.object(sync, "fetch_text", return_value=marker), \
                 patch.object(sync, "fetch_json", side_effect=RuntimeError("Reached data fetch")), \
                 patch.object(sync, "CATALOG", Path(folder) / "missing.json"), \
                 patch("sys.argv", argv):
                out=io.StringIO()
                with contextlib.redirect_stdout(out), contextlib.redirect_stderr(out):
                    try:
                        result=sync.main()
                    except FileNotFoundError:
                        result="validated-and-continuing"
                return result,out.getvalue()

    def test_scheduled_pulls_upstream_timestamp(self):
        result, output=self.run_case("2026-11-12T20:06:19+0000")
        self.assertEqual(result,"validated-and-continuing")
        self.assertIn("2026-11-12",output)

    def test_same_snapshot_is_successful_noop(self):
        result,output=self.run_case("2026-11-12T20:06:19+0000", prior="2026-11-12")
        self.assertEqual(result,0)
        self.assertIn("SKIP:",output)

    def test_older_upstream_is_successful_noop(self):
        result,output=self.run_case("2026-11-11T20:06:19+0000", prior="2026-11-12")
        self.assertEqual(result,0)

    def test_manual_wrong_date_is_error(self):
        result,_=self.run_case("2026-11-12T20:06:19+0000",["--date","2026-11-13"])
        self.assertEqual(result,2)

    def test_invalid_source_marker_is_error(self):
        result,_=self.run_case("unknown")
        self.assertEqual(result,2)

if __name__ == "__main__":
    unittest.main()
