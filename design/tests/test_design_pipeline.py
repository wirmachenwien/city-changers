"""Incremental dependency checks, without installing Node or rendering videos."""
import importlib.util
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

DESIGN = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(DESIGN / "scripts"))
from asset_library import ROOT, asset_records, logo_source

SPEC = importlib.util.spec_from_file_location("build_design", DESIGN / "scripts/build-design.py")
BUILD = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILD)


class DesignPipelineTest(unittest.TestCase):
    def test_one_manifest_for_delivery_and_site(self):
        records = asset_records()
        self.assertEqual(len({r["file"] for r in records}), len(records))
        documents = {"LICENSE", "design/brand-guide.md", "design/docs/handoff/START-HERE.txt"}
        self.assertTrue(all(r["source"].startswith(("src/assets/", "public/")) or r["source"] in documents for r in records))
        self.assertIn("BRAND-GUIDE.md", {r["file"] for r in records})
        self.assertNotIn("BRAND-GUIDE.txt", {r["file"] for r in records})

    def test_website_lockup_matches_design_master(self):
        self.assertEqual(logo_source().read_bytes(), (ROOT / "src/assets/site/logo-lockup.svg").read_bytes())

    def test_asset_folders_have_no_readmes_or_shadow_media(self):
        for folder in ("src/assets/fonts", "src/assets/site", "src/assets/book", "src/assets/mascot", "design/assets"):
            self.assertFalse(list((ROOT / folder).rglob("README*")), folder)
        self.assertEqual({p.name for p in (DESIGN / "assets").iterdir()}, {"logo", "mascot"})

    def test_action_local_dependencies_are_isolated(self):
        groups = BUILD.groups()
        wave = DESIGN / "motion/src/mascots/WaveRig.tsx"
        dependent = {name for name, group in groups.items() if wave in group["inputs"]}
        self.assertEqual(dependent, {"lottie:wave", "video:wave"})
        exporter = DESIGN / "motion/scripts/export-lotties.mjs"
        self.assertTrue(all(exporter not in group["inputs"] for name, group in groups.items() if name.startswith("video:")))

    def test_logo_master_is_never_a_generated_product(self):
        from asset_library import logo_source
        group = BUILD.groups()["logo"]
        self.assertIn(logo_source(), group["inputs"])
        self.assertNotIn(logo_source(), group["outputs"])

    def test_hashes_detect_source_output_and_missing_file_changes(self):
        with tempfile.TemporaryDirectory(dir=DESIGN) as temporary:
            source = Path(temporary) / "source"
            output = Path(temporary) / "output"
            source.write_text("source")
            output.write_text("output")
            group = {"inputs": [source], "outputs": [output]}
            state = {"test": BUILD.snapshot(group)}
            self.assertFalse(BUILD.dirty("test", group, state))
            source.write_text("edited")
            self.assertTrue(BUILD.dirty("test", group, state))
            source.write_text("source")
            output.write_text("corrupt")
            self.assertTrue(BUILD.dirty("test", group, state))
            output.unlink()
            self.assertTrue(BUILD.dirty("test", group, state))

    def test_guide_and_photo_edits_do_not_trigger_animation_renders(self):
        for group in BUILD.groups().values():
            self.assertNotIn(DESIGN / "brand-guide.md", group["inputs"])
            self.assertFalse(any("supporting" in path.parts for path in group["inputs"]))

    def test_new_nested_motion_helpers_are_not_missed(self):
        helper = DESIGN / "motion/src/new/shared-helper.ts"
        original = BUILD.files
        def with_helper(pattern):
            return original(pattern) + ([helper] if pattern == "design/motion/src/**/*" else [])
        with patch.object(BUILD, "files", side_effect=with_helper), \
             patch.object(Path, "is_file", return_value=True):
            for name, group in BUILD.groups().items():
                if ":" in name:
                    self.assertIn(helper, group["inputs"])

    def test_logo_change_propagates_to_stills_in_plan(self):
        import contextlib
        import io
        stream = io.StringIO()
        with patch.object(BUILD, "read_state", return_value={}), \
             patch.object(BUILD, "dirty", side_effect=lambda name, group, state: name == "logo"), \
             contextlib.redirect_stdout(stream):
            BUILD.build(plan_only=True)
        self.assertEqual(json.loads(stream.getvalue()), ["logo", "stills"])


if __name__ == "__main__":
    unittest.main()
